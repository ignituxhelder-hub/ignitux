import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CONSTITUTION_ARTICLES,
  CONSTITUTION_VERSION,
} from './constitution-articles.js';
import {
  CONSTITUTION_RULES,
  hasBlockingViolation,
  reviewAction,
  type ConstitutionAction,
  type ConstitutionViolation,
} from './constitution-rules.js';

export interface ConstitutionContext {
  userId?: string;
  projectId?: string;
}

export interface ConstitutionAuditEntry {
  slug: string;
  title: string;
  enforcement: string;
  /**
   * Ce que l'on peut affirmer sur cet article à partir des données réelles.
   * `null` quand rien dans la base ne permet de se prononcer — on écrit
   * alors « non mesurable » plutôt qu'un pourcentage rassurant.
   */
  measured: string | null;
  violationsLast30Days: number;
}

/** Les cinq tables dont le contenu est produit par un modèle. */
const GENERATED_TABLES = [
  'analyses',
  'build_plans',
  'financing_plans',
  'development_plans',
  'transmission_plans',
] as const;

type GeneratedTable = (typeof GENERATED_TABLES)[number];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * CONSTITUTION — le moteur constitutionnel d'Ignitux.
 *
 * Il fait trois choses, et uniquement trois :
 *
 * 1. Il sème et expose le corpus d'articles (voir l'avertissement de
 *    provenance en tête de constitution-articles.ts).
 * 2. `guard()` : il examine une action avant qu'elle n'aboutisse, journalise
 *    chaque violation et bloque les violations bloquantes. C'est le seul
 *    point du système qui puisse empêcher une écriture au nom d'un principe.
 * 3. `audit()` : il interroge la base réelle pour dire où en est le respect
 *    de chaque article. Il ne calcule aucun pourcentage global : agréger des
 *    articles hétérogènes en un seul chiffre « 87 % constitutionnel » serait
 *    précisément le genre de score inventé que l'article 10 interdit.
 */
@Injectable()
export class ConstitutionService implements OnModuleInit {
  private readonly logger = new Logger(ConstitutionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Semis idempotent au démarrage, même convention que ComplianceService :
   * upsert sur le slug, pour que corriger le texte d'un article dans le code
   * le corrige en base au prochain lancement sans créer de doublon.
   */
  async onModuleInit(): Promise<void> {
    for (const article of CONSTITUTION_ARTICLES) {
      await this.prisma.constitution_articles.upsert({
        where: { slug: article.slug },
        create: { ...article, version: CONSTITUTION_VERSION },
        update: { ...article, version: CONSTITUTION_VERSION },
      });
    }
  }

  listArticles(version?: string) {
    return this.prisma.constitution_articles.findMany({
      where: version ? { version } : undefined,
      orderBy: { number: 'asc' },
    });
  }

  /** Les règles réellement exécutables, telles que le moteur les connaît. */
  listRules() {
    return CONSTITUTION_RULES.map((rule) => ({
      id: rule.id,
      articleSlug: rule.articleSlug,
      severity: rule.severity,
      description: rule.description,
    }));
  }

  /**
   * Point d'entrée des autres moteurs. Journalise toute violation relevée,
   * puis lève une exception si l'une d'elles est bloquante.
   *
   * La journalisation ne doit jamais faire échouer l'action légitime qu'elle
   * observe : si l'écriture du journal échoue (base indisponible…), on logge
   * l'incident côté serveur et on laisse le verdict s'appliquer. Perdre une
   * ligne d'audit est regrettable ; refuser à l'utilisateur une action
   * conforme parce que l'audit est en panne le serait davantage.
   */
  async guard(action: ConstitutionAction, context: ConstitutionContext = {}): Promise<void> {
    const violations = reviewAction(action);
    if (violations.length === 0) {
      return;
    }

    await this.journal(action, violations, context);

    if (hasBlockingViolation(violations)) {
      const blocking = violations.filter((violation) => violation.severity === 'blocking');
      throw new UnprocessableEntityException(
        `Action refusée par la Constitution IGNITUX : ${blocking
          .map((violation) => violation.detail)
          .join(' ')}`,
      );
    }
  }

  private async journal(
    action: ConstitutionAction,
    violations: readonly ConstitutionViolation[],
    context: ConstitutionContext,
  ): Promise<void> {
    try {
      await this.prisma.constitution_violations.createMany({
        data: violations.map((violation) => ({
          article_slug: violation.articleSlug,
          rule_id: violation.ruleId,
          severity: violation.severity,
          action: action.kind,
          detail: violation.detail,
          user_id: context.userId ?? null,
          project_id: context.projectId ?? null,
        })),
      });
    } catch (error) {
      this.logger.error(
        "Impossible de journaliser une violation constitutionnelle — l'action est tout de même évaluée.",
        error as Error,
      );
    }
  }

  listViolations(limit = 50) {
    return this.prisma.constitution_violations.findMany({
      orderBy: { created_at: 'desc' },
      take: limit,
    });
  }

  /**
   * Audit de l'état réel, article par article. Chaque ligne `measured` est
   * construite à partir d'un comptage effectif en base : aucune ligne n'est
   * renvoyée sur la foi d'une intention du code.
   */
  async audit(): Promise<ConstitutionAuditEntry[]> {
    const since = new Date(Date.now() - THIRTY_DAYS_MS);

    const [articles, recentViolations, provenance, automationRuns, analysisProjects] =
      await Promise.all([
        this.listArticles(CONSTITUTION_VERSION),
        this.prisma.constitution_violations.groupBy({
          by: ['article_slug'],
          where: { created_at: { gte: since } },
          _count: { _all: true },
        }),
        this.countGeneratedWithoutModel(),
        this.prisma.automation_runs.count(),
        this.prisma.analyses.groupBy({ by: ['project_id'], _count: { _all: true } }),
      ]);

    const violationsBySlug = new Map(
      recentViolations.map((row) => [row.article_slug, row._count._all]),
    );

    // Une analyse conservée par projet ne prouve rien ; plusieurs analyses
    // sur un même projet prouvent que les versions s'empilent au lieu de
    // s'écraser — c'est la seule observation honnête disponible ici.
    const projectsWithHistory = analysisProjects.filter((row) => row._count._all > 1).length;

    return articles.map((article) => ({
      slug: article.slug,
      title: article.title,
      enforcement: article.enforcement,
      measured: this.measureArticle(article.slug, {
        provenance,
        automationRuns,
        projectsWithHistory,
        analysedProjects: analysisProjects.length,
      }),
      violationsLast30Days: violationsBySlug.get(article.slug) ?? 0,
    }));
  }

  private measureArticle(
    slug: string,
    facts: {
      provenance: { total: number; withoutModel: number };
      automationRuns: number;
      projectsWithHistory: number;
      analysedProjects: number;
    },
  ): string | null {
    switch (slug) {
      case 'pas-de-simulation-presentee-comme-reelle': {
        const { total, withoutModel } = facts.provenance;
        if (total === 0) return 'Aucun contenu généré en base.';
        return `${total - withoutModel}/${total} contenus générés nomment le modèle qui les a produits (${withoutModel} antérieurs à la traçabilité).`;
      }
      case 'autonomie-supervisee':
        return `${facts.automationRuns} exécution(s) automatique(s) journalisée(s).`;
      case 'protection-de-l-etincelle':
        if (facts.analysedProjects === 0) return 'Aucun projet analysé.';
        return `${facts.projectsWithHistory}/${facts.analysedProjects} projets conservent plusieurs analyses successives (aucune analyse n'est jamais écrasée).`;
      default:
        // Pas de mesure inventée pour les articles qu'aucune donnée
        // n'éclaire : `null` se lit « non mesurable », ce qui est exact.
        return null;
    }
  }

  private async countGeneratedWithoutModel(): Promise<{ total: number; withoutModel: number }> {
    // Les cinq délégués Prisma sont listés explicitement plutôt qu'indexés
    // dynamiquement : `this.prisma[table].count()` produit une union de
    // signatures que TypeScript refuse d'appeler, et la contourner par un
    // cast ferait perdre la vérification qui garantit que ces cinq tables
    // portent bien une colonne generated_model.
    const counts = await Promise.all(
      GENERATED_TABLES.map(async (table) => {
        const [total, withoutModel] = await Promise.all([
          this.countAll(table),
          this.countWithoutModel(table),
        ]);
        return { total, withoutModel };
      }),
    );

    return counts.reduce(
      (accumulator, current) => ({
        total: accumulator.total + current.total,
        withoutModel: accumulator.withoutModel + current.withoutModel,
      }),
      { total: 0, withoutModel: 0 },
    );
  }

  private countAll(table: GeneratedTable): Promise<number> {
    switch (table) {
      case 'analyses':
        return this.prisma.analyses.count();
      case 'build_plans':
        return this.prisma.build_plans.count();
      case 'financing_plans':
        return this.prisma.financing_plans.count();
      case 'development_plans':
        return this.prisma.development_plans.count();
      case 'transmission_plans':
        return this.prisma.transmission_plans.count();
    }
  }

  private countWithoutModel(table: GeneratedTable): Promise<number> {
    const where = { generated_model: null };
    switch (table) {
      case 'analyses':
        return this.prisma.analyses.count({ where });
      case 'build_plans':
        return this.prisma.build_plans.count({ where });
      case 'financing_plans':
        return this.prisma.financing_plans.count({ where });
      case 'development_plans':
        return this.prisma.development_plans.count({ where });
      case 'transmission_plans':
        return this.prisma.transmission_plans.count({ where });
    }
  }
}
