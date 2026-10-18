/**
 * CE QU'IGINI SAIT DU PROJET — par le questionnaire.
 *
 * Même règle que `contexte-personne.ts`, pour la même raison : **des faits,
 * jamais ce qu'ils impliquent**. Le bloc écrit « Associés : Avec 1
 * associé ». Il n'écrit pas « une SARL est donc adaptée » — ce jugement
 * appartient au générateur, qui doit pouvoir conclure autre chose. Un test
 * refuse « donc », « réduit », « augmente », « favorise ».
 *
 * Et le même silence : rien répondu, rien écrit — pas de « le questionnaire
 * n'a pas été rempli », qui coûterait des tokens pour inviter le modèle à
 * commenter une absence.
 */

import {
  estVisible,
  QUESTIONS_PROJET,
  type ReponsesProjet,
} from './questionnaire-catalogue.js';

export interface QuestionIginiLue {
  question: string;
  reponse: string | null;
}

export function contexteProjet(entree: {
  reponses: ReponsesProjet;
  secteur?: string | null;
  questionsIgini?: readonly QuestionIginiLue[];
}): string | null {
  const reponses = entree.reponses;
  const lignes: string[] = [];

  for (const question of QUESTIONS_PROJET) {
    // Une réponse à une question devenue invisible (la personne a changé
    // d'avis sur « structure existante ») décrirait un projet qui n'est pas
    // le sien. On ne la lit pas.
    if (!estVisible(question, reponses)) continue;

    const valeur = question.id === 'secteur' ? entree.secteur : reponses[question.id];
    if (valeur === null || valeur === undefined) continue;
    const texte = Array.isArray(valeur) ? valeur.join(', ') : valeur.trim();
    if (!texte) continue;
    // Un texte libre finit souvent déjà sa phrase : pas de « Lyon.. ».
    const fin = /[.!?…]$/.test(texte) ? '' : '.';
    lignes.push(`${question.label} : ${texte}${fin}`);
  }

  for (const q of entree.questionsIgini ?? []) {
    const reponse = q.reponse?.trim();
    if (!reponse) continue;
    lignes.push(`À ta question « ${q.question} », elle a répondu : ${reponse}`);
  }

  if (lignes.length === 0) return null;

  return [
    'Ce que la personne a répondu sur son projet (des faits déclarés, pas des conclusions — ' +
      "« je ne sais pas encore » est une réponse, pas un manque à combler par une supposition) :",
    ...lignes.map((l) => `- ${l}`),
  ].join('\n');
}
