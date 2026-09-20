import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { assertHasProjectAccess } from '../prisma/assert-has-project-access.js';
import { assertOwnsProject } from '../prisma/assert-owns-project.js';
import { ConstitutionService } from '../constitution/constitution.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { COMPLIANCE_REQUIREMENTS_FR } from './compliance-requirements.js';
import { countryCode } from '../profile/profile-fields.js';

export const COMPLIANCE_DISCLAIMER =
  "Ces informations sont générales, non exhaustives et rédigées à partir de sources publiques citées pour chaque point. " +
  "Elles ne remplacent pas un avis d'expert-comptable, d'avocat ou des organismes officiels — à vérifier avant toute décision réelle.";

/**
 * COMPLIANCE — première brique du chantier réglementaire, volontairement
 * limitée à la France et à des points génériques (voir
 * compliance-requirements.ts pour le détail des sources). Rien n'est
 * spécifique à un secteur d'activité précis pour l'instant : c'est un
 * point de départ à vérifier, pas un module de conformité complet par pays.
 */
@Injectable()
export class ComplianceService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly constitutionService: ConstitutionService,
  ) {}

  // Upsert idempotent sur `slug` : ne duplique rien au redémarrage, et une
  // modification du contenu dans compliance-requirements.ts se reflète au
  // prochain démarrage sans script de migration séparé.
  async onModuleInit(): Promise<void> {
    for (const requirement of COMPLIANCE_REQUIREMENTS_FR) {
      // Article 15 (One Brain Multiple Regulations) : une règle propre à un
      // pays doit citer sa source officielle, sinon elle n'est ni
      // vérifiable ni maintenable quand la réglementation bouge.
      await this.constitutionService.guard({
        kind: 'publish_local_rule',
        country: requirement.country,
        slug: requirement.slug,
        sourceUrl: requirement.sourceUrl,
      });

      await this.prisma.compliance_requirements.upsert({
        where: { slug: requirement.slug },
        update: {
          category: requirement.category,
          title: requirement.title,
          description: requirement.description,
          source_name: requirement.sourceName,
          source_url: requirement.sourceUrl,
        },
        create: {
          slug: requirement.slug,
          country: requirement.country,
          category: requirement.category,
          title: requirement.title,
          description: requirement.description,
          source_name: requirement.sourceName,
          source_url: requirement.sourceUrl,
        },
      });
    }
  }

  /**
   * Pays pour lesquels une liste de démarches existe réellement en base.
   *
   * Exposé plutôt que déduit côté interface : « One Brain, Multiple
   * Regulations » veut dire que le raisonnement est unique mais que les
   * règles dépendent du pays. Laisser croire qu'un autre pays est couvert
   * — ou laisser l'utilisateur le découvrir devant une liste vide —
   * présenterait une lacune comme une absence d'obligations.
   */
  async listCoveredCountries(): Promise<string[]> {
    const rows = await this.prisma.compliance_requirements.groupBy({ by: ['country'] });
    return rows.map((row) => row.country).sort();
  }

  async listRequirements(country = 'FR') {
    const requirements = await this.prisma.compliance_requirements.findMany({
      where: { country },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
    });
    // Article 7 : on ne rend pas une indication sans dire ce qu'Ignitux
    // ne décide pas. Retirer l'avertissement fait échouer l'appel.
    await this.constitutionService.guard({
      kind: 'publish_guidance',
      module: 'conformité',
      notice: COMPLIANCE_DISCLAIMER,
    });

    return { disclaimer: COMPLIANCE_DISCLAIMER, requirements };
  }

  /**
   * Le pays déclaré au profil, ou null s'il ne l'est pas.
   *
   * Lu directement plutôt qu'à travers ProfileService : une seule colonne,
   * et cela évite une arête de module entre conformité et profil pour un
   * besoin qui restera toujours cette lecture-là.
   */
  private async paysDeclare(userId: string): Promise<string | null> {
    const profil = await this.prisma.user_profiles.findUnique({
      where: { user_id: userId },
      select: { activity_country: true },
    });
    return countryCode(profil?.activity_country);
  }

  // Lecture seule : accessible au propriétaire et aux collaborateurs, comme
  // les 4 moteurs transverses (voir assertHasProjectAccess).
  /**
   * Les démarches du projet, pour le pays qui le concerne.
   *
   * Trois sources, dans cet ordre : le pays demandé explicitement, le pays
   * déclaré au profil, puis la France par défaut. Le dernier cas est le seul
   * qui puisse tromper — quelqu'un dont l'activité se monte ailleurs voyait
   * jusqu'ici des démarches françaises sans que rien ne l'indique. On ne
   * peut pas afficher mieux (le référentiel ne connaît que la France), donc
   * on le dit : `countryDeclared` à false signifie « supposé », et
   * l'interface doit le présenter comme tel.
   */
  async listForProject(userId: string, projectId: string, country?: string) {
    await assertHasProjectAccess(this.prisma, userId, projectId);

    const declare = country ?? (await this.paysDeclare(userId));
    const pays = declare ?? 'FR';

    const [requirements, checks] = await Promise.all([
      this.prisma.compliance_requirements.findMany({
        where: { country: pays },
        orderBy: [{ category: 'asc' }, { title: 'asc' }],
      }),
      this.prisma.project_compliance_checks.findMany({ where: { project_id: projectId } }),
    ]);

    const completedRequirementIds = new Set(checks.map((check) => check.requirement_id));

    // Article 7 : on ne rend pas une indication sans dire ce qu'Ignitux
    // ne décide pas. Retirer l'avertissement fait échouer l'appel.
    await this.constitutionService.guard({
      kind: 'publish_guidance',
      module: 'conformité',
      notice: COMPLIANCE_DISCLAIMER,
    });

    return {
      disclaimer: COMPLIANCE_DISCLAIMER,
      country: pays,
      countryDeclared: declare !== null,
      requirements: requirements.map((requirement) => ({
        ...requirement,
        completed: completedRequirementIds.has(requirement.id),
      })),
    };
  }

  // Écriture réservée au propriétaire, comme partout ailleurs dans les
  // moteurs transverses.
  async markChecked(userId: string, projectId: string, requirementId: string) {
    await assertOwnsProject(this.prisma, userId, projectId);

    const requirement = await this.prisma.compliance_requirements.findUnique({ where: { id: requirementId } });
    if (!requirement) {
      throw new NotFoundException('Exigence de conformité introuvable.');
    }

    return this.prisma.project_compliance_checks.upsert({
      where: { project_id_requirement_id: { project_id: projectId, requirement_id: requirementId } },
      update: {},
      create: { project_id: projectId, requirement_id: requirementId },
    });
  }

  async unmarkChecked(userId: string, projectId: string, requirementId: string) {
    await assertOwnsProject(this.prisma, userId, projectId);
    await this.prisma.project_compliance_checks.deleteMany({
      where: { project_id: projectId, requirement_id: requirementId },
    });
  }
}
