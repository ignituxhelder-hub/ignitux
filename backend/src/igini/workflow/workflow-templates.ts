import type { ActionType, ConditionType } from './workflow-conditions.js';

export interface WorkflowStepTemplate {
  title: string;
  description: string;
  conditionType: ConditionType;
  conditionValue: string | null;
  actionType: ActionType;
  actionValue: string | null;
}

export interface WorkflowTemplate {
  slug: string;
  name: string;
  description: string;
  steps: readonly WorkflowStepTemplate[];
}

/**
 * Modèles de processus proposés à la création.
 *
 * Ils ne sont pas semés en base au démarrage, contrairement aux articles de
 * la Constitution ou aux démarches de conformité : un processus appartient
 * à un projet et à la personne qui le pilote. Imposer un workflow à chaque
 * projet dès sa création reviendrait à décider de la méthode à sa place —
 * exactement ce que « conseillère, jamais maîtresse » interdit. L'utilisateur
 * choisit d'en instancier un, ou construit le sien étape par étape.
 */
export const WORKFLOW_TEMPLATES: readonly WorkflowTemplate[] = [
  {
    slug: 'methode-ignitux',
    name: 'Méthode Ignitux en 5 étapes',
    description:
      "Le parcours complet : Analyser, Construire, Financer, Développer, Transmettre. " +
      "Chaque étape attend que la précédente ait réellement produit quelque chose.",
    steps: [
      {
        title: 'Analyser',
        description: "Produire une première analyse de l'idée.",
        conditionType: 'stage_exists',
        conditionValue: 'analysis',
        actionType: 'none',
        actionValue: null,
      },
      {
        title: 'Construire',
        description: 'Produire un plan de construction.',
        conditionType: 'stage_exists',
        conditionValue: 'build_plan',
        actionType: 'none',
        actionValue: null,
      },
      {
        title: 'Financer',
        description: 'Produire un plan de financement.',
        conditionType: 'stage_exists',
        conditionValue: 'financing_plan',
        actionType: 'none',
        actionValue: null,
      },
      {
        title: 'Développer',
        description: 'Produire un plan de développement.',
        conditionType: 'stage_exists',
        conditionValue: 'development_plan',
        actionType: 'none',
        actionValue: null,
      },
      {
        title: 'Transmettre',
        description: 'Produire un plan de transmission.',
        conditionType: 'stage_exists',
        conditionValue: 'transmission_plan',
        actionType: 'none',
        actionValue: null,
      },
    ],
  },
  {
    slug: 'lancement-operationnel',
    name: 'Lancement opérationnel',
    description:
      "Enchaîner l'analyse, la réalisation effective des actions qu'elle recommande, puis " +
      'une validation humaine explicite avant de passer à la construction.',
    steps: [
      {
        title: "Disposer d'une analyse",
        description: "L'analyse doit exister avant qu'on parle de faire quoi que ce soit.",
        conditionType: 'stage_exists',
        conditionValue: 'analysis',
        actionType: 'create_task',
        actionValue: "Relire l'analyse et écarter ce qui ne s'applique pas",
      },
      {
        title: 'Terminer les actions issues de l\'analyse',
        description: "Toutes les tâches créées à partir de l'analyse doivent être terminées.",
        conditionType: 'tasks_done',
        conditionValue: 'analysis',
        actionType: 'none',
        actionValue: null,
      },
      {
        title: 'Valider le passage à la construction',
        description:
          'Décision humaine : rien ne remplace un « oui » explicite avant de changer de phase.',
        conditionType: 'manual',
        conditionValue: null,
        actionType: 'create_task',
        actionValue: 'Préparer le plan de construction',
      },
    ],
  },
];

export function findTemplate(slug: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((template) => template.slug === slug);
}
