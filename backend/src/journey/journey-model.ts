/**
 * LE PARCOURS — ce qu'Ignitux montre, et quelle est la prochaine étape.
 *
 * ## Le problème que ce module résout
 *
 * La fiche projet affichait quinze sections d'emblée : mémoire,
 * connaissances, tâches, automatisation, processus, financement, conformité,
 * scores, capital. Sept mille pixels, avant même que la personne ait
 * expliqué son idée. Ce n'est pas un accompagnateur, c'est un ERP — et un
 * ERP demande « que veux-tu faire ? » à quelqu'un qui est précisément venu
 * parce qu'il ne le sait pas encore.
 *
 * ## La règle de déblocage, et pourquoi elle est ce qu'elle est
 *
 * Une section s'ouvre quand **la donnée qu'elle montre existe réellement**,
 * jamais quand « une analyse a été lancée ».
 *
 * La nuance décide de la solidité du dispositif. Adosser le déblocage à
 * l'IA reviendrait à tout verrouiller le jour où les générateurs sont
 * éteints — le produit deviendrait alors moins utilisable qu'avant, et
 * c'est l'inverse du but. Adossé aux données, le parcours fonctionne IA
 * allumée ou éteinte : l'IA remplit plus vite, elle n'est pas la clé.
 *
 * Corollaire : une section ouverte a forcément quelque chose à montrer. Une
 * section vide qui s'affiche quand même est exactement le bruit qu'on
 * cherche à retirer.
 *
 * ## Ce que ce module ne fait pas
 *
 * Il n'invente jamais d'étape. Quand aucune suite logique ne se déduit des
 * données, il rend `null` et le dit. Fabriquer une recommandation pour
 * éviter un écran vide serait un conseil sans fondement — exactement ce que
 * l'article 10 interdit, appliqué non à un score mais à une direction.
 *
 * Module pur : aucune dépendance Nest, aucun accès base.
 */

/**
 * Le seuil au-delà duquel l'idée est jugée assez solide pour passer à la
 * construction, sur 100.
 *
 * Ce n'est pas une barrière : en dessous, Ignitux propose d'améliorer, il
 * n'interdit rien. Verrouiller sur un chiffre reviendrait à dire à quelqu'un
 * que son idée n'a pas le droit d'exister — ce n'est pas le rôle d'un
 * accompagnateur, et c'est une décision qui lui appartient.
 */
export const SEUIL_ETINCELLE = 75;

/** Ce qu'on sait d'un projet, en quantités. Rien d'autre n'entre ici. */
export interface ProjectFacts {
  hasDescription: boolean;
  analyses: number;
  /**
   * La faisabilité de la dernière analyse, ramenée sur 100.
   *
   * La source la note de 1 à 10 : la conversion multiplie par dix et ne
   * produit donc que des dizaines. Un projet obtient 70 ou 80, jamais 73 —
   * l'écran doit le dire plutôt que de laisser croire à une précision au
   * point près. null quand aucune analyse n'existe.
   */
  etincelle: number | null;
  buildPlans: number;
  financingPlans: number;
  developmentPlans: number;
  transmissionPlans: number;
  tasks: number;
  openTasks: number;
  memories: number;
  concepts: number;
  complianceChecks: number;
  completedComplianceChecks: number;
  automationRuns: number;
  workflows: number;
  financingRounds: number;
  equityHolders: number;
  collaborators: number;
  /** Le projet est-il ouvert au financement ? */
  financingOpened: boolean;
}

export const PHASES = ['decouvrir', 'construire', 'transmettre'] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
  decouvrir: 'Découvrir',
  construire: 'Construire',
  transmettre: 'Transmettre',
};

/** Les sections que la fiche projet sait afficher. */
export const SECTIONS = [
  'analyse',
  'construction',
  'taches',
  'memoire',
  'connaissances',
  'score',
  'conformite',
  'developpement',
  'financement',
  'processus',
  'automatisation',
  'capital',
  'transmission',
  'collaborateurs',
] as const;

export type Section = (typeof SECTIONS)[number];

export interface SectionRule {
  section: Section;
  label: string;
  /** La phase où cette section prend son sens. */
  phase: Phase;
  /** Ouverte ? */
  unlocked: (f: ProjectFacts) => boolean;
  /** Ce qui l'ouvrira, dit à la personne. Jamais « bientôt ». */
  condition: string;
}

/**
 * L'ordre compte : c'est celui d'affichage, et il suit le parcours plutôt
 * que l'ordre dans lequel les modules ont été construits.
 */
export const SECTION_RULES: readonly SectionRule[] = [
  {
    section: 'analyse',
    label: 'Analyse',
    phase: 'decouvrir',
    // Toujours ouverte : c'est la porte d'entrée, et une porte fermée
    // n'aurait rien derrière pour justifier son existence.
    unlocked: () => true,
    condition: 'Toujours disponible.',
  },
  {
    section: 'memoire',
    label: 'Mémoire',
    phase: 'decouvrir',
    unlocked: (f) => f.memories > 0,
    condition: "S'ouvre dès qu'un premier souvenir est enregistré.",
  },
  {
    section: 'connaissances',
    label: 'Connaissances',
    phase: 'decouvrir',
    unlocked: (f) => f.concepts > 0,
    condition: "S'ouvre dès qu'un premier concept est identifié.",
  },
  {
    section: 'construction',
    label: 'Plan de construction',
    phase: 'construire',
    unlocked: (f) => f.analyses > 0,
    condition: "S'ouvre après la première analyse : construire sans avoir regardé l'idée reviendrait à bâtir sans plan.",
  },
  {
    section: 'taches',
    label: 'Tâches',
    phase: 'construire',
    unlocked: (f) => f.tasks > 0 || f.buildPlans > 0,
    condition: "S'ouvre dès qu'un plan de construction ou une première tâche existe.",
  },
  {
    section: 'score',
    label: 'Score',
    phase: 'construire',
    // Un score n'a de sens qu'avec de la matière à mesurer. Affiché plus
    // tôt, il vaudrait zéro partout et découragerait sans rien dire.
    unlocked: (f) => f.analyses > 0 && f.tasks > 0,
    condition: "S'ouvre quand il y a de la matière à mesurer : une analyse et des tâches.",
  },
  {
    section: 'processus',
    label: 'Processus',
    phase: 'construire',
    unlocked: (f) => f.workflows > 0,
    condition: "S'ouvre dès qu'un processus est défini.",
  },
  {
    section: 'automatisation',
    label: 'Automatisation',
    phase: 'construire',
    unlocked: (f) => f.tasks > 0 && f.concepts > 0,
    condition:
      "S'ouvre quand le projet contient de quoi automatiser : des tâches et des concepts.",
  },
  {
    section: 'conformite',
    label: 'Conformité',
    phase: 'construire',
    unlocked: (f) => f.buildPlans > 0,
    condition:
      "S'ouvre à l'approche d'une création réelle, c'est-à-dire une fois le plan de construction posé.",
  },
  {
    section: 'developpement',
    label: 'Développement',
    phase: 'construire',
    unlocked: (f) => f.buildPlans > 0,
    condition: "S'ouvre une fois le plan de construction posé.",
  },
  {
    section: 'financement',
    label: 'Financement',
    phase: 'construire',
    unlocked: (f) => f.financingPlans > 0 || f.financingOpened || f.financingRounds > 0,
    condition:
      "S'ouvre avec un plan de financement, ou dès qu'un premier apport est enregistré.",
  },
  {
    section: 'capital',
    label: 'Capital',
    phase: 'construire',
    unlocked: (f) => f.equityHolders > 0 || f.financingRounds > 0,
    condition: "S'ouvre dès qu'un détenteur de parts ou un apport existe.",
  },
  {
    section: 'collaborateurs',
    label: 'Collaborateurs',
    phase: 'construire',
    unlocked: (f) => f.collaborators > 0 || f.buildPlans > 0,
    condition: "S'ouvre une fois le projet assez avancé pour qu'on le partage.",
  },
  {
    section: 'transmission',
    label: 'Transmission',
    phase: 'transmettre',
    unlocked: (f) => f.transmissionPlans > 0 || f.developmentPlans > 0,
    condition:
      "S'ouvre quand le projet tourne : un plan de développement, ou un plan de transmission déjà rédigé.",
  },
];

/**
 * Où en est ce projet ?
 *
 * On lit la phase depuis ce qui existe, pas depuis un champ qu'il faudrait
 * tenir à jour : un état stocké finit toujours par mentir, parce que
 * personne ne pense à le corriger quand les données changent.
 */
export function phaseOf(f: ProjectFacts): Phase {
  if (f.transmissionPlans > 0) return 'transmettre';
  if (f.analyses > 0) return 'construire';
  return 'decouvrir';
}

export interface NextStep {
  id: string;
  /** L'action, à l'impératif. Ce que la personne doit faire maintenant. */
  titre: string;
  /** Pourquoi maintenant, et pas autre chose. */
  pourquoi: string;
  /** La section à ouvrir pour l'accomplir. */
  section: Section;
}

/**
 * La prochaine étape logique.
 *
 * L'ordre des règles EST la méthode Ignitux : la première qui s'applique
 * gagne. Décrire son idée précède l'analyse, l'analyse précède le plan, le
 * plan précède les tâches, et ainsi de suite.
 *
 * Rend `null` quand rien ne se déduit — cas volontairement possible. Le
 * produit préfère dire « à toi de voir » plutôt que d'inventer une
 * direction pour remplir un écran.
 */
export function nextStep(f: ProjectFacts): NextStep | null {
  if (!f.hasDescription) {
    return {
      id: 'decrire',
      titre: 'Décris ton idée en quelques phrases',
      pourquoi:
        "IGINI n'a rien à analyser tant que l'idée n'est pas écrite. Quelques phrases suffisent : ce que tu veux faire, pour qui.",
      section: 'analyse',
    };
  }

  if (f.analyses === 0) {
    return {
      id: 'analyser',
      titre: 'Analyser ton idée',
      pourquoi:
        "C'est le point de départ : IGINI lit ton projet, en dégage les forces, les risques et les premiers concepts. Tout le reste s'appuie dessus.",
      section: 'analyse',
    };
  }

  // En dessous du seuil, on propose d'améliorer plutôt que de construire.
  // Bâtir sur une idée que l'analyse juge fragile coûte plus cher que de la
  // retravailler d'abord — mais rien n'empêche de passer outre : la section
  // Construction reste ouverte, c'est le conseil qui change.
  if (f.buildPlans === 0 && f.etincelle !== null && f.etincelle < SEUIL_ETINCELLE) {
    return {
      id: 'ameliorer',
      titre: 'Reprendre ton idée avant de construire',
      pourquoi:
        `L'analyse situe la faisabilité à ${f.etincelle}/100, en dessous de ${SEUIL_ETINCELLE}. ` +
        'Les risques relevés valent la peine d’être traités maintenant : les reprendre plus ' +
        'tard coûtera davantage. Tu peux passer outre — c’est ton projet, pas le nôtre.',
      section: 'analyse',
    };
  }

  if (f.buildPlans === 0) {
    return {
      id: 'construire',
      titre: 'Établir ton plan de construction',
      pourquoi:
        "L'analyse dit où tu en es ; le plan dit par quoi commencer. Statut juridique, modèle économique, premiers clients.",
      section: 'construction',
    };
  }

  if (f.tasks === 0) {
    return {
      id: 'premieres-taches',
      titre: 'Transformer le plan en premières tâches',
      pourquoi:
        "Un plan qui ne descend pas en tâches reste une intention. Commence par celles de cette semaine.",
      section: 'taches',
    };
  }

  if (f.complianceChecks > 0 && f.completedComplianceChecks === 0) {
    return {
      id: 'conformite',
      titre: 'Regarder les démarches qui te concernent',
      pourquoi:
        "Tu approches d'une création réelle. Mieux vaut découvrir les obligations maintenant qu'après coup.",
      section: 'conformite',
    };
  }

  if (f.openTasks > 0) {
    return {
      id: 'avancer-taches',
      titre: `Avancer tes ${f.openTasks} tâche(s) en cours`,
      pourquoi:
        "Rien de neuf à ouvrir tant que ce qui est commencé n'avance pas. Le reste attendra.",
      section: 'taches',
    };
  }

  if (f.developmentPlans === 0) {
    return {
      id: 'developper',
      titre: 'Préparer le développement',
      pourquoi:
        'Les tâches du départ sont faites. La question suivante est celle de la croissance : par quels leviers, et à quel coût.',
      section: 'developpement',
    };
  }

  if (f.transmissionPlans === 0) {
    return {
      id: 'transmettre',
      titre: 'Penser la transmission',
      pourquoi:
        "Un projet qui tourne doit pouvoir continuer sans toi. C'est le moment d'écrire ce que toi seul sais.",
      section: 'transmission',
    };
  }

  return null;
}

export interface JourneyView {
  phase: Phase;
  phaseLabel: string;
  nextStep: NextStep | null;
  /** Les sections à afficher, dans l'ordre du parcours. */
  visible: Array<{ section: Section; label: string; phase: Phase }>;
  /** Celles qui restent fermées, avec ce qui les ouvrira. */
  locked: Array<{ section: Section; label: string; phase: Phase; condition: string }>;
}

export function journeyView(f: ProjectFacts): JourneyView {
  const visible: JourneyView['visible'] = [];
  const locked: JourneyView['locked'] = [];

  for (const regle of SECTION_RULES) {
    const entree = { section: regle.section, label: regle.label, phase: regle.phase };
    if (regle.unlocked(f)) visible.push(entree);
    else locked.push({ ...entree, condition: regle.condition });
  }

  const phase = phaseOf(f);
  return { phase, phaseLabel: PHASE_LABELS[phase], nextStep: nextStep(f), visible, locked };
}
