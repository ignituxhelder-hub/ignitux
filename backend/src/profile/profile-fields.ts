/**
 * LE CATALOGUE DU PROFIL — et la règle qui le gouverne.
 *
 * ## Un champ n'existe que s'il sert à quelque chose
 *
 * Chaque champ déclare **à quoi il sert** (`purpose`) et **ce qu'il ouvre**
 * (`unlocks`). Sans ces deux réponses, le champ n'entre pas dans le
 * catalogue. Ce n'est pas une élégance : un formulaire qui demande sans
 * dire pourquoi transforme une inscription en interrogatoire, et la
 * personne part avant d'avoir vu ce que le produit sait faire.
 *
 * Corollaire, et c'est le plus important : **ces champs ne sont pas demandés
 * à l'inscription**. Chacun porte le moment où il devient utile, et c'est à
 * ce moment-là qu'on le demande. Le profil se remplit en marchant.
 *
 * ## Ce qui a été demandé et n'est pas ici
 *
 * — **Niveau d'étude.** Aucun usage dans le produit, et un critère qui trie
 *   les gens. Un entrepreneur sans diplôme n'a pas à le déclarer pour être
 *   accompagné.
 * — **Nationalité.** Aucun usage. Le pays d'activité décide des obligations
 *   légales ; la nationalité, non.
 * — **Téléphone, adresse.** Aucun usage aujourd'hui : rien n'appelle, rien
 *   n'envoie de courrier. Les stocker serait garder des données personnelles
 *   pour un besoin imaginaire.
 * — **Langue.** Le produit n'existe qu'en français. Demander une préférence
 *   qu'on ne sait pas honorer est une promesse qu'on ne tient pas.
 *
 * Ils reviendront le jour où quelque chose s'en servira. Le catalogue est
 * l'endroit où cette décision se prend, une fois, visiblement.
 */

import type { RoleId } from '../roles/roles-catalogue.js';

/** Où le champ est demandé, et donc quand. */
export type FieldMoment =
  /** Juste après le choix du rôle : le strict nécessaire pour s'adresser à la personne. */
  | 'accueil'
  /** Quand la personne ouvre son premier projet. */
  | 'premier-projet'
  /** Quand un module précis en a besoin pour fonctionner correctement. */
  | 'au-besoin';

export interface ProfileField {
  id: string;
  label: string;
  /** La question, telle qu'on la pose. Pas un intitulé de base de données. */
  question: string;
  /** À quoi sert la réponse. Affiché sous le champ, toujours. */
  purpose: string;
  /** Ce que remplir ce champ change concrètement. Vide si rien encore. */
  unlocks: string | null;
  roles: readonly RoleId[];
  moment: FieldMoment;
  kind: 'texte' | 'texte-long' | 'choix' | 'liste';
  /** Pour `choix` et `liste`. */
  options?: readonly string[];
  /**
   * Compte-t-il dans la complétion ?
   *
   * Un champ facultatif utile ne doit pas faire baisser un pourcentage :
   * sinon le chiffre pousse à tout remplir, y compris ce dont personne n'a
   * besoin — exactement le travers qu'on cherche à éviter.
   */
  countsTowardCompletion: boolean;
}

export const DISPONIBILITES = [
  'Quelques heures par semaine',
  'Un jour par semaine',
  'À mi-temps',
  'À plein temps',
] as const;

export const NIVEAUX_RISQUE = ['Faible', 'Moyen', 'Élevé'] as const;

export const HORIZONS = ['Moins de 2 ans', '2 à 5 ans', 'Plus de 5 ans'] as const;

export const SECTEURS = [
  'Agriculture',
  'Artisanat',
  'Commerce',
  'Éducation',
  'Énergie',
  'Immobilier',
  'Industrie',
  'Logiciel',
  'Restauration',
  'Santé',
  'Services',
  'Transport',
] as const;

export const COMPETENCES = [
  'Management',
  'Finance',
  'Marketing',
  'Technique',
  'Vente',
  'Ressources humaines',
  'Juridique',
] as const;

/**
 * Les pays dont Ignitux connaît réellement les obligations.
 *
 * La liste est courte parce qu'elle est vraie : le référentiel de conformité
 * ne contient aujourd'hui que des démarches françaises. Proposer trente pays
 * laisserait croire à une couverture qui n'existe pas, et quelqu'un
 * choisirait la Belgique pour recevoir des obligations françaises sans le
 * savoir — une erreur pire que l'absence de choix.
 */
export const PAYS_COUVERTS = [{ code: 'FR', label: 'France' }] as const;

export const PROFILE_FIELDS: readonly ProfileField[] = [
  {
    id: 'display_name',
    label: 'Nom',
    question: 'Comment veux-tu qu’on t’appelle ?',
    purpose:
      "Pour s'adresser à toi par ton nom. Ignitux ne le devine pas depuis ton adresse email : " +
      'se tromper de nom est pire que ne pas nommer.',
    unlocks: 'Ton nom remplace « Bienvenue sur Ignitux » partout.',
    roles: ['entrepreneur', 'investisseur'],
    moment: 'accueil',
    kind: 'texte',
    countsTowardCompletion: true,
  },
  {
    id: 'activity_country',
    label: "Pays d'activité",
    question: 'Dans quel pays ton activité se déroulera-t-elle ?',
    purpose:
      'Les obligations légales dépendent du pays, pas de ta nationalité ni de ton lieu de vie.',
    unlocks:
      "La section Conformité, qui affiche aujourd'hui des démarches françaises à tout le " +
      'monde sans le demander.',
    roles: ['entrepreneur'],
    moment: 'premier-projet',
    kind: 'choix',
    options: PAYS_COUVERTS.map((p) => p.label),
    countsTowardCompletion: true,
  },
  {
    id: 'sectors',
    label: 'Secteurs que tu connais',
    question: 'Dans quels secteurs as-tu déjà travaillé ?',
    purpose:
      "IGINI en tient compte pour calibrer son analyse : une idée portée par quelqu'un du " +
      'métier ne présente pas les mêmes risques que la même idée portée de l’extérieur.',
    unlocks: 'Des analyses qui cessent de te réexpliquer ton propre métier.',
    roles: ['entrepreneur'],
    moment: 'premier-projet',
    kind: 'liste',
    options: SECTEURS,
    countsTowardCompletion: true,
  },
  {
    id: 'experience',
    label: 'Ton parcours',
    question: 'Raconte en quelques lignes ce que tu as fait jusqu’ici.',
    purpose:
      'Ce que tu sais déjà faire change ce qu’il te reste à apprendre — et donc les étapes ' +
      'qu’Ignitux te propose.',
    unlocks: 'Des recommandations qui partent de là où tu es, pas de zéro.',
    roles: ['entrepreneur'],
    moment: 'premier-projet',
    kind: 'texte-long',
    countsTowardCompletion: true,
  },
  {
    id: 'availability',
    label: 'Ta disponibilité',
    question: 'Combien de temps peux-tu consacrer à ce projet ?',
    purpose:
      'Un plan taillé pour un plein temps est intenable à raison de trois heures par semaine, ' +
      'et le découragement vient de là bien plus souvent que de l’idée elle-même.',
    unlocks: 'Des jalons dimensionnés à ton temps réel.',
    roles: ['entrepreneur'],
    moment: 'premier-projet',
    kind: 'choix',
    options: DISPONIBILITES,
    countsTowardCompletion: true,
  },
  {
    id: 'has_founded_before',
    label: 'Déjà entrepris',
    question: 'As-tu déjà créé une entreprise ?',
    purpose:
      'Une deuxième création ne se prépare pas comme une première : ce qui fait trébucher ' +
      'n’est pas au même endroit.',
    unlocks: 'Un parcours qui saute ce que tu as déjà traversé.',
    roles: ['entrepreneur'],
    moment: 'au-besoin',
    kind: 'choix',
    options: ['Oui', 'Non'],
    countsTowardCompletion: false,
  },
  {
    id: 'motivation',
    label: 'Ta motivation',
    question: 'Pourquoi veux-tu créer ce projet ?',
    purpose:
      "Ignitux te le rappellera les jours où ce sera difficile. C'est aussi ce qui distingue " +
      'un projet qu’on mène d’un projet qu’on abandonne.',
    unlocks: null,
    roles: ['entrepreneur'],
    moment: 'au-besoin',
    kind: 'texte-long',
    countsTowardCompletion: false,
  },
  {
    id: 'skills',
    label: 'Tes compétences',
    question: 'Sur quoi es-tu à l’aise ?',
    purpose:
      'Pour distinguer ce que tu feras toi-même de ce qu’il faudra déléguer ou apprendre.',
    unlocks: null,
    roles: ['entrepreneur', 'investisseur'],
    moment: 'au-besoin',
    kind: 'liste',
    options: COMPETENCES,
    countsTowardCompletion: false,
  },

  // ── Investisseur ─────────────────────────────────────────────────────────
  {
    id: 'investor_kind',
    label: 'Type d’investisseur',
    question: 'Tu investis à titre personnel ou professionnel ?',
    purpose:
      'Les obligations d’information ne sont pas les mêmes pour un particulier et pour un ' +
      'professionnel.',
    unlocks: null,
    roles: ['investisseur'],
    moment: 'accueil',
    kind: 'choix',
    options: ['Particulier', 'Professionnel'],
    countsTowardCompletion: true,
  },
  {
    id: 'investment_horizon',
    label: 'Horizon',
    question: 'À quelle échéance envisages-tu de récupérer ton argent ?',
    purpose:
      'Un projet qui rembourse en sept ans ne convient pas à quelqu’un qui a besoin de son ' +
      'argent dans deux.',
    unlocks: null,
    roles: ['investisseur'],
    moment: 'au-besoin',
    kind: 'choix',
    options: HORIZONS,
    countsTowardCompletion: true,
  },
  {
    id: 'risk_level',
    label: 'Niveau de risque',
    question: 'Quel niveau de risque acceptes-tu ?',
    purpose:
      'Pour ne pas te montrer des projets que tu ne prendrais de toute façon pas. Ignitux ne ' +
      'garantit aucun rendement et n’en promettra jamais.',
    unlocks: null,
    roles: ['investisseur'],
    moment: 'au-besoin',
    kind: 'choix',
    options: NIVEAUX_RISQUE,
    countsTowardCompletion: true,
  },
  {
    id: 'preferred_sectors',
    label: 'Secteurs préférés',
    question: 'Quels secteurs t’intéressent ?',
    purpose: 'Pour trier ce qu’on te montre plutôt que de tout te montrer.',
    unlocks: null,
    roles: ['investisseur'],
    moment: 'au-besoin',
    kind: 'liste',
    options: SECTEURS,
    countsTowardCompletion: false,
  },
];

export type ProfileValues = Record<string, string | string[] | null>;

export function fieldsForRoles(roles: readonly string[]): ProfileField[] {
  return PROFILE_FIELDS.filter((f) => f.roles.some((r) => roles.includes(r)));
}

function estRempli(valeur: string | string[] | null | undefined): boolean {
  if (valeur === null || valeur === undefined) return false;
  if (Array.isArray(valeur)) return valeur.length > 0;
  return valeur.trim() !== '';
}

export interface Completion {
  /** Sur 100, calculé sur les seuls champs qui comptent. */
  percent: number;
  filled: number;
  total: number;
  /** Ce qui manque, avec ce que chacun ouvrirait. */
  missing: Array<{ id: string; label: string; question: string; unlocks: string | null }>;
}

/**
 * La complétion du profil.
 *
 * Un pourcentage sur les seuls champs marqués `countsTowardCompletion` : les
 * champs utiles mais facultatifs n'entrent pas au dénominateur, sinon le
 * chiffre pousserait à tout remplir — y compris ce dont personne n'a besoin,
 * ce qui est le travers que ce module existe pour éviter.
 *
 * Et il n'est jamais rendu seul : chaque manque nomme ce qu'il ouvrirait. Un
 * pourcentage sans cela n'est qu'une barre à remplir pour la remplir.
 */
export function completionFor(roles: readonly string[], values: ProfileValues): Completion {
  const comptes = fieldsForRoles(roles).filter((f) => f.countsTowardCompletion);
  const manquants = comptes.filter((f) => !estRempli(values[f.id]));
  const remplis = comptes.length - manquants.length;

  return {
    percent: comptes.length === 0 ? 100 : Math.round((remplis / comptes.length) * 100),
    filled: remplis,
    total: comptes.length,
    missing: manquants.map((f) => ({
      id: f.id,
      label: f.label,
      question: f.question,
      unlocks: f.unlocks,
    })),
  };
}

/** Les champs à demander à un moment donné, et pas encore renseignés. */
export function toAskAt(
  moment: FieldMoment,
  roles: readonly string[],
  values: ProfileValues,
): ProfileField[] {
  return fieldsForRoles(roles).filter((f) => f.moment === moment && !estRempli(values[f.id]));
}
