/**
 * Conditions de transition du moteur de workflow.
 *
 * Choix de conception assumé : pas de mini-langage d'expressions. Une
 * condition est un couple (type, valeur) pris dans une liste fermée, et
 * chaque type sait s'expliquer en français à l'utilisateur. Un moteur
 * d'expressions serait plus expressif, mais une transition qu'on ne sait
 * pas expliquer à la personne qui la subit n'a pas sa place dans un produit
 * dont la devise est « la vérité avant tout » — elle transformerait
 * l'autonomie supervisée en boîte noire.
 *
 * Ce module est pur : il reçoit un instantané de l'état réel du projet et
 * répond oui/non. Aucun accès base, donc testable exhaustivement.
 */

export const CONDITION_TYPES = ['always', 'stage_exists', 'tasks_done', 'manual'] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

export const PROJECT_STAGES = [
  'analysis',
  'build_plan',
  'financing_plan',
  'development_plan',
  'transmission_plan',
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const ACTION_TYPES = ['none', 'create_task'] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/**
 * Instantané de l'état réel du projet au moment de l'évaluation. Tout ce
 * dont les conditions ont besoin, et rien de plus : passer l'objet Prisma
 * entier laisserait les conditions dépendre silencieusement de n'importe
 * quel champ.
 */
export interface ProjectSnapshot {
  /** Étapes de la méthode pour lesquelles au moins un contenu existe. */
  existingStages: ReadonlySet<ProjectStage>;
  /** Tâches du projet, réduites à ce qui sert à décider. */
  tasks: ReadonlyArray<{ source: string; status: string }>;
  /** Positions que l'utilisateur a explicitement validées à la main. */
  manuallyConfirmedPositions: ReadonlySet<number>;
}

export interface StepCondition {
  position: number;
  type: ConditionType;
  value: string | null;
}

export interface ConditionVerdict {
  satisfied: boolean;
  /** Pourquoi, en français, affichable tel quel dans l'interface. */
  reason: string;
}

export function evaluateCondition(
  condition: StepCondition,
  snapshot: ProjectSnapshot,
): ConditionVerdict {
  switch (condition.type) {
    case 'always':
      return { satisfied: true, reason: 'Aucune condition : étape franchie directement.' };

    case 'stage_exists': {
      const stage = condition.value;
      if (!isProjectStage(stage)) {
        // Une définition invalide bloque au lieu de passer : laisser
        // avancer une étape dont on ne sait pas évaluer la condition
        // reviendrait à déclarer satisfaite une condition non vérifiée.
        return {
          satisfied: false,
          reason: `Condition mal définie : « ${stage ?? 'aucune étape'} » n'est pas une étape connue.`,
        };
      }
      const exists = snapshot.existingStages.has(stage);
      return {
        satisfied: exists,
        reason: exists
          ? `L'étape « ${STAGE_LABELS[stage]} » existe pour ce projet.`
          : `En attente : l'étape « ${STAGE_LABELS[stage]} » n'a pas encore été produite.`,
      };
    }

    case 'tasks_done': {
      const source = condition.value;
      if (!source) {
        return { satisfied: false, reason: 'Condition mal définie : aucune origine de tâche précisée.' };
      }
      const concerned = snapshot.tasks.filter((task) => task.source === source);
      if (concerned.length === 0) {
        // Zéro tâche ne vaut pas « toutes terminées » : sans tâche, il n'y
        // a rien à avoir terminé, et franchir l'étape laisserait croire
        // qu'un travail a été fait.
        return {
          satisfied: false,
          reason: `En attente : aucune tâche issue de « ${source} » n'existe encore.`,
        };
      }
      const remaining = concerned.filter((task) => task.status !== 'done').length;
      return {
        satisfied: remaining === 0,
        reason:
          remaining === 0
            ? `Les ${concerned.length} tâche(s) issues de « ${source} » sont terminées.`
            : `En attente : ${remaining} tâche(s) sur ${concerned.length} issues de « ${source} » ne sont pas terminées.`,
      };
    }

    case 'manual': {
      const confirmed = snapshot.manuallyConfirmedPositions.has(condition.position);
      return {
        satisfied: confirmed,
        reason: confirmed
          ? 'Étape validée manuellement.'
          : 'En attente de ta validation : cette étape ne se franchit pas toute seule.',
      };
    }
  }
}

const STAGE_LABELS: Record<ProjectStage, string> = {
  analysis: 'Analyse',
  build_plan: 'Plan de construction',
  financing_plan: 'Plan de financement',
  development_plan: 'Plan de développement',
  transmission_plan: 'Plan de transmission',
};

export function isProjectStage(value: string | null | undefined): value is ProjectStage {
  return PROJECT_STAGES.includes(value as ProjectStage);
}

export function isConditionType(value: string): value is ConditionType {
  return CONDITION_TYPES.includes(value as ConditionType);
}

export function isActionType(value: string): value is ActionType {
  return ACTION_TYPES.includes(value as ActionType);
}
