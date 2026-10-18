/**
 * LE QUESTIONNAIRE DU PROJET — ce qu'IGINI supposait jusqu'ici.
 *
 * Module pur : aucune base, aucun Nest. Un catalogue, une validation, et
 * rien d'autre — c'est ce qui permet au frontend de l'afficher sans le
 * recopier, et aux tests de le vérifier sans base.
 *
 * ## Pourquoi ces questions-là
 *
 * Chacune est lue par au moins un générateur. La consigne de Former dit
 * « base-toi sur : seul ou à plusieurs, ambition de chiffre d'affaires,
 * patrimoine à protéger, nature de l'activité » ; celle de Financer parle de
 * montants et de sources ; la conformité trie par secteur. Jusqu'ici IGINI
 * devinait tout cela à partir de trois phrases. Une question qui ne sert à
 * aucun générateur n'a rien à faire ici — même règle que le profil.
 *
 * ## Ce qui n'est pas ici
 *
 * Ce qui décrit la PERSONNE (parcours, situation, compétences, temps
 * disponible) vit dans le profil : cela la suit d'un projet à l'autre, et
 * le redemander à chaque projet serait l'interroger deux fois.
 *
 * ## « Je ne sais pas encore »
 *
 * Presque chaque choix l'offre. Ce n'est pas une politesse : sans elle, la
 * personne choisit au hasard pour avancer, et IGINI lit une réponse fausse
 * comme un fait. Une incertitude dite est une information ; une réponse
 * inventée en est le contraire.
 */

import { SECTEURS } from '../../profile/profile-fields.js';

export const JE_NE_SAIS_PAS = 'Je ne sais pas encore';

export type EtapeId = 'idee' | 'projet' | 'activite' | 'equipe' | 'argent';

export interface EtapeQuestionnaire {
  id: EtapeId;
  titre: string;
  intro: string;
}

export interface QuestionProjet {
  id: string;
  etape: EtapeId;
  /** Court : c'est ce qu'IGINI lit devant la réponse. */
  label: string;
  question: string;
  /** À quoi sert la réponse — affiché sous la question, toujours. */
  purpose: string;
  /** `texte-long` : quelques phrases, dans une zone sur plusieurs lignes. */
  kind: 'choix' | 'liste' | 'texte' | 'texte-long';
  options?: readonly string[];
  /** Pour `texte` et `texte-long`. */
  longueurMax?: number;
  /** Affichée seulement si une autre réponse vaut l'une de ces valeurs. */
  visibleSi?: { question: string; parmi: readonly string[] };
}

export const ETAPES: readonly EtapeQuestionnaire[] = [
  {
    id: 'idee',
    titre: 'Ton idée',
    intro: 'Quelques phrases suffisent : c’est ce qu’IGINI lit en premier pour l’analyser.',
  },
  {
    id: 'projet',
    titre: 'Le projet',
    intro: 'Une entreprise à créer ne se prépare pas comme une entreprise qui existe déjà.',
  },
  {
    id: 'activite',
    titre: 'L’activité',
    intro: 'Ce que tu vends, à qui et comment : c’est ce qui décide des obligations légales.',
  },
  {
    id: 'equipe',
    titre: 'L’équipe et la protection',
    intro: 'Ce qui pèse le plus sur le choix de la forme juridique.',
  },
  {
    id: 'argent',
    titre: 'L’argent et le calendrier',
    intro: 'Des fourchettes suffisent : personne n’a le chiffre exact à ce stade.',
  },
];

const STRUCTURE_EXISTE = 'Une structure existe déjà';
const REPRISE = 'Reprise d’une entreprise existante';
const JUSTE_UNE_IDEE = 'Juste une idée';
const PREPARE_LANCEMENT = 'Je prépare le lancement';

export const QUESTIONS_PROJET: readonly QuestionProjet[] = [
  // ── L'idée ───────────────────────────────────────────────────────────────
  // Ce qu'Analyser devinait à partir de la description de l'écran de
  // création. Sans ces réponses, il juge un marché et une concurrence qu'il
  // a imaginés.
  {
    id: 'probleme',
    etape: 'idee',
    label: 'Problème réglé',
    question: 'Quel problème règles-tu ?',
    purpose: 'Une idée qui règle un vrai problème se vend plus facilement : IGINI part de là.',
    kind: 'texte-long',
    longueurMax: 500,
  },
  {
    id: 'cible',
    etape: 'idee',
    label: 'Pour qui',
    question: 'Pour qui, précisément ? (ex. « les restaurateurs indépendants de Lyon »)',
    purpose: 'Plus la cible est précise, plus l’analyse du marché l’est aussi.',
    kind: 'texte-long',
    longueurMax: 300,
  },
  {
    id: 'alternatives',
    etape: 'idee',
    label: 'Comment ils font aujourd’hui',
    question: 'Comment font ces gens aujourd’hui, sans toi ? (concurrents, solutions actuelles)',
    purpose: 'Ta vraie concurrence, c’est souvent ce que les gens font déjà, même mal.',
    kind: 'texte-long',
    longueurMax: 500,
  },
  {
    id: 'difference',
    etape: 'idee',
    label: 'Ce qui le distingue',
    question: 'Qu’est-ce qui fera qu’on te choisira toi ?',
    purpose: 'C’est ce qui fera la différence face aux autres : IGINI vérifie qu’elle tient.',
    kind: 'texte-long',
    longueurMax: 500,
  },
  {
    id: 'revenus',
    etape: 'idee',
    label: 'Façon de gagner de l’argent',
    question: 'Comment vas-tu gagner de l’argent ?',
    purpose: 'Le prévisionnel et le financement ne se construisent pas pareil selon la réponse.',
    kind: 'choix',
    options: [
      'Vente à l’unité',
      'Abonnement',
      'Prestation (à l’heure ou au forfait)',
      'Commission sur des ventes',
      'Publicité',
      JE_NE_SAIS_PAS,
    ],
  },

  // ── Le projet ────────────────────────────────────────────────────────────
  {
    id: 'nature',
    etape: 'projet',
    label: 'Nature du projet',
    question: 'S’agit-il d’une nouvelle entreprise ?',
    purpose:
      'Créer, développer une structure existante ou reprendre une entreprise : trois parcours ' +
      'différents, avec des démarches différentes.',
    kind: 'choix',
    options: ['Nouvelle entreprise à créer', STRUCTURE_EXISTE, REPRISE, JE_NE_SAIS_PAS],
  },
  {
    id: 'forme_existante',
    etape: 'projet',
    label: 'Forme juridique actuelle',
    question: 'Quelle est sa forme juridique aujourd’hui ?',
    purpose: 'Pour ne pas te recommander de créer ce qui existe déjà.',
    kind: 'choix',
    options: [
      'Micro-entreprise',
      'EI',
      'EURL',
      'SASU',
      'SARL',
      'SAS',
      'Association',
      'Autre',
      'Je ne sais pas',
    ],
    visibleSi: { question: 'nature', parmi: [STRUCTURE_EXISTE, REPRISE] },
  },
  {
    id: 'anciennete',
    etape: 'projet',
    label: 'Ancienneté de la structure',
    question: 'Depuis quand existe-t-elle ?',
    purpose: 'Une structure de dix ans a un historique que les financeurs regardent.',
    kind: 'choix',
    options: ['Moins d’un an', '1 à 3 ans', '3 à 10 ans', 'Plus de 10 ans'],
    visibleSi: { question: 'nature', parmi: [STRUCTURE_EXISTE, REPRISE] },
  },
  {
    id: 'ca_existant',
    etape: 'projet',
    label: 'Chiffre d’affaires actuel',
    question: 'Quel est son chiffre d’affaires annuel, à peu près ?',
    purpose: 'Il situe la structure et change les seuils qui s’appliquent à elle.',
    kind: 'choix',
    options: [
      'Pas encore de chiffre d’affaires',
      'Moins de 50 000 €',
      '50 000 à 200 000 €',
      '200 000 € à 1 million €',
      'Plus de 1 million €',
      'Je préfère ne pas répondre',
    ],
    visibleSi: { question: 'nature', parmi: [STRUCTURE_EXISTE, REPRISE] },
  },
  {
    id: 'stade',
    etape: 'projet',
    label: 'Stade',
    question: 'Où en es-tu ?',
    purpose:
      'Une idée ne se juge pas comme une activité qui vend déjà : IGINI adapte son niveau ' +
      'd’exigence au stade réel.',
    kind: 'choix',
    options: [
      JUSTE_UNE_IDEE,
      PREPARE_LANCEMENT,
      'J’ai mes premiers clients',
      'J’ai déjà des ventes régulières',
    ],
  },
  {
    id: 'validation',
    etape: 'projet',
    label: 'Idée confrontée à des clients',
    question: 'En as-tu déjà parlé à des clients potentiels ?',
    purpose:
      'Une idée testée auprès de vrais clients pèse plus qu’une intuition, pour IGINI comme ' +
      'pour un financeur.',
    kind: 'choix',
    options: ['Pas encore', 'À mon entourage', 'À des clients potentiels', 'J’ai des précommandes'],
    visibleSi: { question: 'stade', parmi: [JUSTE_UNE_IDEE, PREPARE_LANCEMENT] },
  },

  // ── L'activité ───────────────────────────────────────────────────────────
  {
    // Rangée dans `projects.sector`, pas dans les réponses : la conformité la
    // lit déjà là, et deux copies finiraient par diverger.
    id: 'secteur',
    etape: 'activite',
    label: 'Secteur',
    question: 'Dans quel secteur ?',
    purpose: 'Les obligations propres à ton secteur remontent en tête de la conformité.',
    kind: 'choix',
    options: [...SECTEURS, JE_NE_SAIS_PAS],
  },
  {
    id: 'offre',
    etape: 'activite',
    label: 'Ce qui est vendu',
    question: 'Tu vends des produits, des services, ou les deux ?',
    purpose: 'Stock, TVA, plafonds de la micro-entreprise : tout change selon la réponse.',
    kind: 'choix',
    options: ['Des produits', 'Des services', 'Les deux', JE_NE_SAIS_PAS],
  },
  {
    id: 'clients',
    etape: 'activite',
    label: 'Clients',
    question: 'Qui sont tes clients ?',
    purpose: 'Vendre à des particuliers ou à des entreprises n’impose pas les mêmes règles.',
    kind: 'liste',
    options: ['Des particuliers', 'Des entreprises', 'Des administrations'],
  },
  {
    id: 'vente',
    etape: 'activite',
    label: 'Façon de vendre',
    question: 'Comment vas-tu vendre ?',
    purpose:
      'Vendre en ligne ajoute une boutique et des mentions obligatoires ; un local ajoute un ' +
      'bail et des normes d’accueil.',
    kind: 'liste',
    options: [
      'En ligne',
      'En boutique ou dans un local',
      'Chez le client',
      'Sur les marchés ou les salons',
      'Par des revendeurs',
    ],
  },
  {
    id: 'reglementee',
    etape: 'activite',
    label: 'Activité réglementée',
    question:
      'Ton activité demande-t-elle un diplôme, une licence ou une autorisation ? (restauration, ' +
      'santé, transport, bâtiment, coiffure…)',
    purpose:
      'Certaines activités ne peuvent pas s’exercer sans qualification : mieux vaut le savoir ' +
      'avant de louer un local.',
    kind: 'choix',
    options: ['Oui', 'Non', 'Je ne sais pas'],
  },
  {
    id: 'lieu',
    etape: 'activite',
    label: 'Lieu',
    question: 'Dans quelle ville ou quel département ?',
    purpose: 'Les aides locales et le marché autour de toi dépendent de l’endroit.',
    kind: 'texte',
    longueurMax: 100,
  },

  // ── L'équipe et la protection ────────────────────────────────────────────
  {
    id: 'associes',
    etape: 'equipe',
    label: 'Associés',
    question: 'Tu te lances seul ou à plusieurs ?',
    purpose: 'C’est le premier critère de la forme juridique : EURL ou SARL, SASU ou SAS.',
    kind: 'choix',
    options: ['Seul', 'Avec 1 associé', 'Avec 2 associés ou plus', JE_NE_SAIS_PAS],
  },
  {
    id: 'salaries',
    etape: 'equipe',
    label: 'Salariés la première année',
    question: 'Prévois-tu d’embaucher la première année ?',
    purpose: 'Un premier salarié déclenche des obligations : déclaration, mutuelle, registre.',
    kind: 'choix',
    options: ['Aucun', '1 ou 2', '3 à 10', 'Plus de 10', JE_NE_SAIS_PAS],
  },
  {
    id: 'patrimoine',
    etape: 'equipe',
    label: 'Patrimoine personnel à protéger',
    question: 'As-tu un patrimoine personnel à protéger (maison, épargne) ?',
    purpose: 'Certaines formes séparent mieux que d’autres ton argent de celui de l’entreprise.',
    kind: 'choix',
    options: ['Oui', 'Non', 'Je préfère ne pas répondre'],
  },
  {
    id: 'ca_vise',
    etape: 'equipe',
    label: 'Chiffre d’affaires visé la première année',
    question: 'Quel chiffre d’affaires vises-tu la première année ?',
    purpose: 'Au-delà de certains plafonds, la micro-entreprise ne convient plus.',
    kind: 'choix',
    options: [
      'Moins de 30 000 €',
      '30 000 à 80 000 €',
      '80 000 à 250 000 €',
      'Plus de 250 000 €',
      JE_NE_SAIS_PAS,
    ],
  },

  // ── L'argent et le calendrier ────────────────────────────────────────────
  {
    id: 'budget',
    etape: 'argent',
    label: 'Budget de démarrage',
    question: 'De combien as-tu besoin pour démarrer ?',
    purpose: 'Il décide des sources de financement réalistes : apport, prêt d’honneur, banque.',
    kind: 'choix',
    options: [
      'Moins de 5 000 €',
      '5 000 à 20 000 €',
      '20 000 à 100 000 €',
      'Plus de 100 000 €',
      JE_NE_SAIS_PAS,
    ],
  },
  {
    id: 'apport',
    etape: 'argent',
    label: 'Apport personnel',
    question: 'Combien peux-tu apporter toi-même ?',
    purpose: 'Les banques prêtent rarement sans apport : c’est le levier de tout le reste.',
    kind: 'choix',
    options: [
      'Rien pour l’instant',
      'Moins de 5 000 €',
      '5 000 à 20 000 €',
      'Plus de 20 000 €',
      'Je préfère ne pas répondre',
    ],
  },
  {
    id: 'lancement',
    etape: 'argent',
    label: 'Lancement prévu',
    question: 'Quand veux-tu te lancer ?',
    purpose: 'Le calendrier des démarches se cale sur cette date.',
    kind: 'choix',
    options: [
      'Dans moins de 3 mois',
      'Dans 3 à 6 mois',
      'Dans 6 à 12 mois',
      'Plus tard',
      'C’est déjà lancé',
    ],
  },
];

export type ReponsesProjet = Record<string, string | string[]>;

/** La question est-elle posée, compte tenu des autres réponses ? */
export function estVisible(question: QuestionProjet, reponses: ReponsesProjet): boolean {
  if (!question.visibleSi) return true;
  const valeur = reponses[question.visibleSi.question];
  return typeof valeur === 'string' && question.visibleSi.parmi.includes(valeur);
}

export class ReponseInvalide extends Error {}

/**
 * Valide ce que l'écran envoie et le fusionne avec l'existant.
 *
 * Une clé inconnue est ignorée (un client d'une version antérieure, pas une
 * attaque — même règle que le profil). Une valeur hors des options, elle,
 * est refusée : l'accepter ferait lire à IGINI une réponse que personne
 * n'a pu cliquer. `null` ou une chaîne vide retire la réponse.
 *
 * Le secteur n'est jamais rangé ici : l'appelant le lit à part.
 */
export function fusionnerReponses(
  existantes: ReponsesProjet,
  entrees: Record<string, unknown>,
): ReponsesProjet {
  const resultat: ReponsesProjet = { ...existantes };

  for (const question of QUESTIONS_PROJET) {
    if (question.id === 'secteur' || !(question.id in entrees)) continue;
    const brut = entrees[question.id];

    if (brut === null || brut === undefined || brut === '') {
      delete resultat[question.id];
      continue;
    }

    if (question.kind === 'liste') {
      if (!Array.isArray(brut)) {
        throw new ReponseInvalide(`« ${question.label} » attend une liste.`);
      }
      const choisis = brut.filter((v): v is string => typeof v === 'string');
      const inconnu = choisis.find((v) => !(question.options ?? []).includes(v));
      if (inconnu !== undefined) {
        throw new ReponseInvalide(`« ${inconnu} » n’est pas une réponse possible ici.`);
      }
      if (choisis.length === 0) delete resultat[question.id];
      else resultat[question.id] = [...new Set(choisis)];
      continue;
    }

    if (typeof brut !== 'string') {
      throw new ReponseInvalide(`« ${question.label} » attend du texte.`);
    }

    if (question.kind === 'choix') {
      if (!(question.options ?? []).includes(brut)) {
        throw new ReponseInvalide(`« ${brut} » n’est pas une réponse possible ici.`);
      }
      resultat[question.id] = brut;
      continue;
    }

    const texte = brut.trim();
    if (texte === '') {
      delete resultat[question.id];
      continue;
    }
    resultat[question.id] = texte.slice(0, question.longueurMax ?? 200);
  }

  return resultat;
}

/**
 * Relit ce qui est en base. Tolérant : une ligne écrite par une version
 * antérieure du catalogue ne doit pas faire échouer la lecture.
 */
export function lireReponses(brut: unknown): ReponsesProjet {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return {};
  const resultat: ReponsesProjet = {};
  for (const [cle, valeur] of Object.entries(brut as Record<string, unknown>)) {
    if (typeof valeur === 'string') resultat[cle] = valeur;
    else if (Array.isArray(valeur)) {
      resultat[cle] = valeur.filter((v): v is string => typeof v === 'string');
    }
  }
  return resultat;
}
