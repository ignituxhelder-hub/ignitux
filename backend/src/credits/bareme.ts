import type { GeneratorName } from '../igini/usage/generator-names.js';

/**
 * LE BARÈME DES CRÉDITS IGINI — une seule table, lue par le serveur et
 * exposée au frontend (`GET /credits/bareme`).
 *
 * Spec : docs/superpowers/specs/2026-10-25-credits-design.md.
 *
 * Module pur : aucune base, aucun Nest. La règle et ses valeurs s'éprouvent
 * sans rien démarrer.
 *
 * ## La règle
 *
 * 1 crédit = 0,10 € TTC. Le prix d'une action = son coût IA réel moyen × 5,
 * converti en crédits et **arrondi au crédit supérieur**, jamais moins d'un
 * crédit. La marge couvre la TVA, les frais de paiement, l'hébergement, les
 * échecs (une génération ratée est remboursée, mais Anthropic l'a facturée)
 * et la marge d'Ignitux. Les frais de paiement ne sont jamais ajoutés au
 * moment de payer : ils sont compris dans la valeur du crédit.
 *
 * Chaque ligne porte le coût de référence d'où son prix est tiré, et un test
 * impose que `credits` soit exactement ce que la règle donne pour ce coût :
 * changer un prix, c'est changer le coût de référence (avec sa source), pas
 * écrire un autre chiffre à côté.
 *
 * ## D'où viennent les coûts de référence (2026-10-25)
 *
 * La base de production n'était pas lisible au moment d'écrire ce fichier.
 * Les valeurs viennent donc de PRICING.md (mesures tirées
 * d'`ai_usage_events` le 20/09/2026) quand elles existent, sinon d'une
 * estimation en tokens au tarif de `ai-pricing.ts` (claude-opus-5 : 5 $/M en
 * entrée, 25 $/M en sortie ; claude-haiku-4-5 : 1 $ / 5 $ ; 0,92 €/$ ;
 * recherche web 0,01 $). `scripts/bareme-credits.mjs` recalcule le barème à
 * partir des appels réellement journalisés et montre l'écart : c'est lui qui
 * doit corriger ces valeurs dès que la production en a assez.
 */

/** 1 crédit = 0,10 € TTC. */
export const VALEUR_CREDIT_CENTIMES = 10;
/** La même valeur en micro-euros, l'unité des coûts IA (voir ai-pricing.ts). */
export const VALEUR_CREDIT_MICRO_EUR = VALEUR_CREDIT_CENTIMES * 10_000;
/** Le prix d'une action = coût IA réel moyen × 5. */
export const MULTIPLICATEUR_COUT = 5;
/** Le cadeau de bienvenue, une seule fois par compte. */
export const CREDITS_BIENVENUE = 30;

/** Les recharges proposées. Minimum 10 €, et toujours 0,10 € le crédit. */
export const RECHARGES: ReadonlyArray<{ prixCentimes: number; credits: number }> = [
  { prixCentimes: 1000, credits: 100 },
  { prixCentimes: 2000, credits: 200 },
  { prixCentimes: 5000, credits: 500 },
];

/** Le paiement par carte est le lot 2 : tant qu'il n'existe pas, on le dit. */
export const RECHARGE_DISPONIBLE = false;
export const RECHARGE_MESSAGE =
  'Bientôt disponible — le paiement par carte arrive dès que l’entreprise Ignitux sera immatriculée.';

/**
 * Le prix en crédits d'un appel dont le coût IA moyen vaut `coutMicroEur`.
 *
 * Calcul entier : 5 × coût est un entier de micro-euros, divisé une seule
 * fois par la valeur d'un crédit (100 000 µ€) puis arrondi au supérieur. Un
 * coût qui tombe juste (0,02 € → 1 crédit) ne prend pas un crédit de plus.
 */
export function creditsPourCout(coutMicroEur: number): number {
  if (!Number.isSafeInteger(coutMicroEur) || coutMicroEur < 0) {
    throw new Error(`Coût de référence invalide : ${coutMicroEur} (micro-euros entiers, positifs).`);
  }
  return Math.max(1, Math.ceil((MULTIPLICATEUR_COUT * coutMicroEur) / VALEUR_CREDIT_MICRO_EUR));
}

export interface LigneBareme {
  /** Ce que la personne lit à côté du prix. Court. */
  libelle: string;
  /** Le prix, en crédits. Toujours `creditsPourCout(coutReferenceMicroEur)` (un test l'impose). */
  credits: number;
  /** Le coût IA moyen de référence d'un appel, en micro-euros. Interne : jamais exposé. */
  coutReferenceMicroEur: number;
  /** Le chat se paie au message ; tout le reste à l'action lancée. */
  par: 'action' | 'message';
  /** D'où vient le coût de référence : mesuré (et quand) ou estimé (et comment). */
  source: string;
}

/**
 * Indexé par `GeneratorName` : un appel IA ajouté à la liste des générateurs
 * sans prix ici ne compile pas. Le test de couverture vérifie en plus que
 * tout nom de générateur écrit en dur dans le code est dans cette table.
 */
export const BAREME: Readonly<Record<GeneratorName, LigneBareme>> = {
  analyser: {
    libelle: 'Analyser une idée',
    credits: 4,
    coutReferenceMicroEur: 79_500,
    par: 'action',
    source:
      'Mesuré 0,0565 € (PRICING.md §2, ai_usage_events du 20/09/2026, avant la recherche web) ' +
      '+ 2,5 recherches web en moyenne × 0,01 $ (PRICING.md §13 : 0 à 5 par appel) = 0,0795 €. ' +
      'Les tokens des pages trouvées ne sont pas comptés : à recalculer en priorité.',
  },
  former: {
    libelle: 'Choisir la forme juridique',
    credits: 4,
    coutReferenceMicroEur: 79_500,
    par: 'action',
    source:
      'Estimé : même profil qu’Analyser (même modèle, recherche web plafonnée à 5, sortie de ' +
      'taille comparable) — 0,0565 € mesuré + 2,5 recherches = 0,0795 €. Jamais mesuré seul.',
  },
  construire: {
    libelle: 'Plan de construction',
    credits: 5,
    coutReferenceMicroEur: 91_400,
    par: 'action',
    source: 'Mesuré 0,0914 € (PRICING.md §2, ai_usage_events du 20/09/2026).',
  },
  financer: {
    libelle: 'Plan de financement',
    credits: 4,
    coutReferenceMicroEur: 65_300,
    par: 'action',
    source: 'Mesuré 0,0653 € (PRICING.md §2, ai_usage_events du 20/09/2026).',
  },
  developper: {
    libelle: 'Plan de développement',
    credits: 4,
    coutReferenceMicroEur: 72_800,
    par: 'action',
    source: 'Mesuré 0,0728 € (PRICING.md §2, ai_usage_events du 20/09/2026).',
  },
  transmettre: {
    libelle: 'Plan de transmission',
    credits: 4,
    coutReferenceMicroEur: 67_000,
    par: 'action',
    source: 'Mesuré 0,0670 € (PRICING.md §2, ai_usage_events du 20/09/2026).',
  },
  executer: {
    libelle: 'Faire faire une tâche par IGINI',
    credits: 4,
    coutReferenceMicroEur: 64_400,
    par: 'action',
    source:
      'Estimé : claude-opus-5, 1 500 tokens en entrée (projet + tâche) et 2 500 en sortie ' +
      '(un livrable rédigé) = 0,0644 €. Du même ordre que Développer, mesuré à 0,0728 €.',
  },
  conformite: {
    libelle: 'Préparer une démarche de conformité',
    credits: 7,
    coutReferenceMicroEur: 121_900,
    par: 'action',
    source:
      'Estimé : claude-opus-5 avec lecture de la fiche officielle — 2 000 tokens de consigne + ' +
      '12 000 lus (1,5 page de 8 000 en moyenne, 2 pages de 20 000 au plus) en entrée, 2 500 ' +
      'en sortie = 0,1219 €.',
  },
  statuts: {
    libelle: 'Rédiger les statuts',
    credits: 7,
    coutReferenceMicroEur: 121_900,
    par: 'action',
    source:
      'Estimé : claude-opus-5, 1 500 tokens en entrée et 5 000 en sortie (une dizaine ' +
      'd’articles numérotés) = 0,1219 €.',
  },
  evaluer: {
    libelle: 'Évaluation de financement',
    credits: 6,
    coutReferenceMicroEur: 110_400,
    par: 'action',
    source:
      'Estimé : claude-opus-5, 4 000 tokens en entrée (projet, audit financier, conformité) et ' +
      '4 000 en sortie (rapport complet) = 0,1104 €.',
  },
  questionner: {
    libelle: 'Questions d’IGINI sur ton projet',
    credits: 1,
    coutReferenceMicroEur: 18_400,
    par: 'action',
    source:
      'Estimé : claude-opus-5, 1 500 tokens en entrée et 500 en sortie (trois questions) = 0,0184 €.',
  },
  publier_reseaux: {
    libelle: 'Légende d’une publication (réseaux sociaux)',
    credits: 1,
    coutReferenceMicroEur: 18_400,
    par: 'action',
    source:
      'Estimé : claude-opus-5, 1 500 tokens en entrée (consigne IGINI + idée de 1 000 caractères au plus) ' +
      'et 500 en sortie (une légende de 2 200 caractères au plus, hashtags compris) = 0,0184 €, le profil ' +
      'de « questionner ». Jamais mesuré : à recalculer par scripts/bareme-credits.mjs.',
  },
  discuter: {
    libelle: 'Message à IGINI',
    credits: 1,
    coutReferenceMicroEur: 7_590,
    par: 'message',
    source:
      'Estimé : claude-haiku-4-5, 1,5 tour par message × (4 000 tokens en entrée — consigne, ' +
      'outils, 20 derniers messages — et 300 en sortie) = 0,0076 €. Un générateur lancé depuis ' +
      'le chat se paie en plus, à son propre prix.',
  },
};

/** Le prix d'un appel, en crédits. */
export function prixEnCredits(generateur: GeneratorName): number {
  return BAREME[generateur].credits;
}

/** Une ligne du barème telle que le frontend la reçoit. */
export interface ActionBareme {
  generateur: GeneratorName;
  libelle: string;
  credits: number;
  par: 'action' | 'message';
}

export interface BaremeVu {
  valeurCreditCentimes: number;
  bienvenue: number;
  recharges: ReadonlyArray<{ prixCentimes: number; credits: number }>;
  rechargeDisponible: boolean;
  rechargeMessage: string;
  actions: ActionBareme[];
}

/**
 * Le barème tel qu'il sort du serveur. Sans le coût de référence : la règle
 * (× 5) est publique, le coût interne d'un appel n'a pas à l'être.
 */
export function presenterBareme(): BaremeVu {
  return {
    valeurCreditCentimes: VALEUR_CREDIT_CENTIMES,
    bienvenue: CREDITS_BIENVENUE,
    recharges: RECHARGES,
    rechargeDisponible: RECHARGE_DISPONIBLE,
    rechargeMessage: RECHARGE_MESSAGE,
    actions: (Object.entries(BAREME) as Array<[GeneratorName, LigneBareme]>).map(([generateur, ligne]) => ({
      generateur,
      libelle: ligne.libelle,
      credits: ligne.credits,
      par: ligne.par,
    })),
  };
}
