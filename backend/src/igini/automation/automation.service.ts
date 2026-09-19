import { Injectable } from '@nestjs/common';
import { ConstitutionService } from '../../constitution/constitution.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

interface StageDefinition {
  key: 'analysis' | 'build_plan' | 'financing_plan' | 'development_plan' | 'transmission_plan';
  taskTitle: string;
}

// Titre fixe par étape : sert de clé pour retrouver/fermer la tâche que
// l'automatisation a elle-même créée, sans dépendre d'un identifiant à part.
const STAGES: StageDefinition[] = [
  { key: 'analysis', taskTitle: "Lancer l'analyse de faisabilité (Étincelle)" },
  { key: 'build_plan', taskTitle: 'Créer le plan de construction (Construction)' },
  { key: 'financing_plan', taskTitle: 'Créer le plan de financement (Financement)' },
  { key: 'development_plan', taskTitle: 'Créer le plan de développement (Évolution)' },
  { key: 'transmission_plan', taskTitle: 'Créer le plan de transmission (Transmission)' },
];

const STOPWORDS = new Set([
  'de', 'des', 'du', 'le', 'la', 'les', 'un', 'une', 'et', 'pour', 'avec', 'dans', 'sur', 'par', 'au', 'aux', 'en',
  'ce', 'ces', 'son', 'sa', 'ses', 'qui', 'que', 'est', 'sont',
]);

// Au-delà, le coût en O(n²) de l'auto-liaison de concepts n'a plus de sens
// pour un usage interactif — garde-fou, pas une limite produit.
const MAX_CONCEPTS_FOR_AUTO_LINK = 50;

/**
 * AUTOMATION — le cinquième moteur, et le seul qui agit sans confirmation
 * humaine préalable (contrairement à mémoire/connaissance/workflow/score,
 * strictement lecture pour les collaborateurs, et à la création de tâches
 * "humaines" ailleurs dans le code, toujours validée par un clic). Deux
 * garde-fous volontaires, documentés plutôt qu'implicites :
 *
 * 1. Il n'appelle JAMAIS l'API Claude lui-même. Un automatisme sans
 *    supervision qui déclencherait des appels IA de son propre chef pourrait
 *    consommer le budget mensuel sans qu'un humain le voie venir — tout ce
 *    qu'il fait ici est déterministe et gratuit (lecture/écriture en base).
 * 2. Il n'agit que sur les données internes du projet qu'il connaît déjà
 *    (tâches, concepts) — jamais d'action externe irréversible (pas d'email
 *    envoyé à un tiers, pas de suppression).
 *
 * En échange de l'absence de confirmation préalable, chaque exécution est
 * journalisée (`automation_runs`) pour rester consultable après coup — la
 * transparence remplace la validation.
 */
@Injectable()
export class AutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly constitutionService: ConstitutionService,
  ) {}

  async run(projectId: string) {
    const [analysis, buildPlan, financingPlan, developmentPlan, transmissionPlan, openAutomationTasks, concepts] =
      await Promise.all([
        this.prisma.analyses.findFirst({ where: { project_id: projectId } }),
        this.prisma.build_plans.findFirst({ where: { project_id: projectId } }),
        this.prisma.financing_plans.findFirst({ where: { project_id: projectId } }),
        this.prisma.development_plans.findFirst({ where: { project_id: projectId } }),
        this.prisma.transmission_plans.findFirst({ where: { project_id: projectId } }),
        this.prisma.tasks.findMany({
          where: { project_id: projectId, source: 'automation', status: { not: 'done' } },
        }),
        this.prisma.concepts.findMany({ where: { project_id: projectId } }),
      ]);

    const stageDone: Record<StageDefinition['key'], boolean> = {
      analysis: Boolean(analysis),
      build_plan: Boolean(buildPlan),
      financing_plan: Boolean(financingPlan),
      development_plan: Boolean(developmentPlan),
      transmission_plan: Boolean(transmissionPlan),
    };

    const tasksCreated = [];
    const tasksClosed = [];

    for (const stage of STAGES) {
      const existingOpenTask = openAutomationTasks.find((task) => task.title === stage.taskTitle);
      if (stageDone[stage.key]) {
        if (existingOpenTask) {
          tasksClosed.push(
            await this.prisma.tasks.update({ where: { id: existingOpenTask.id }, data: { status: 'done' } }),
          );
        }
      } else if (!existingOpenTask) {
        tasksCreated.push(
          await this.prisma.tasks.create({
            data: { project_id: projectId, title: stage.taskTitle, assignee: 'igini', source: 'automation' },
          }),
        );
      }
    }

    const conceptLinksCreated = await this.autoLinkConcepts(concepts);

    const run = await this.prisma.automation_runs.create({
      data: {
        project_id: projectId,
        tasks_created_count: tasksCreated.length,
        tasks_closed_count: tasksClosed.length,
        concept_links_created_count: conceptLinksCreated.length,
      },
    });

    // Article 5 (autonomie supervisée) : ce moteur est le seul à agir sans
    // confirmation, donc le seul dont le journal soit la contrepartie du
    // pouvoir. On soumet l'exécution au moteur constitutionnel APRÈS avoir
    // écrit le journal, avec le résultat réel de cette écriture — la
    // vérifier avant reviendrait à contrôler une intention plutôt qu'un fait.
    await this.constitutionService.guard(
      { kind: 'autonomous_act', engine: 'automation', journalled: run !== null },
      { projectId },
    );

    return { run, tasksCreated, tasksClosed, conceptLinksCreated };
  }

  listRuns(projectId: string) {
    return this.prisma.automation_runs.findMany({
      where: { project_id: projectId },
      orderBy: { created_at: 'desc' },
    });
  }

  // Relie automatiquement deux concepts du même projet dès qu'ils partagent
  // un mot significatif dans leur nom/description, s'ils ne sont pas déjà
  // reliés (dans un sens ou dans l'autre). Heuristique volontairement simple
  // et déterministe — pas d'appel IA, voir le commentaire de classe.
  private async autoLinkConcepts(
    concepts: Array<{ id: string; name: string; description: string | null }>,
  ) {
    if (concepts.length < 2 || concepts.length > MAX_CONCEPTS_FOR_AUTO_LINK) {
      return [];
    }

    const conceptIds = concepts.map((concept) => concept.id);
    const existingLinks = await this.prisma.concept_links.findMany({
      where: { from_concept_id: { in: conceptIds }, to_concept_id: { in: conceptIds } },
    });
    const linkedPairs = new Set(existingLinks.map((link) => this.pairKey(link.from_concept_id, link.to_concept_id)));

    const created = [];
    for (let i = 0; i < concepts.length; i += 1) {
      for (let j = i + 1; j < concepts.length; j += 1) {
        const a = concepts[i];
        const b = concepts[j];
        if (linkedPairs.has(this.pairKey(a.id, b.id))) {
          continue;
        }
        if (this.shareSignificantWord(a, b)) {
          const link = await this.prisma.concept_links.create({
            data: {
              from_concept_id: a.id,
              to_concept_id: b.id,
              relation_type: 'lié automatiquement (mot commun)',
            },
          });
          created.push(link);
          linkedPairs.add(this.pairKey(a.id, b.id));
        }
      }
    }
    return created;
  }

  private pairKey(a: string, b: string): string {
    return [a, b].sort().join('|');
  }

  private significantWords(concept: { name: string; description: string | null }): Set<string> {
    const text = `${concept.name} ${concept.description ?? ''}`.toLowerCase();
    const words = text.match(/[a-zà-ÿ0-9]+/g) ?? [];
    return new Set(words.filter((word) => word.length > 3 && !STOPWORDS.has(word)));
  }

  private shareSignificantWord(
    a: { name: string; description: string | null },
    b: { name: string; description: string | null },
  ): boolean {
    const wordsA = this.significantWords(a);
    const wordsB = this.significantWords(b);
    for (const word of wordsA) {
      if (wordsB.has(word)) {
        return true;
      }
    }
    return false;
  }
}
