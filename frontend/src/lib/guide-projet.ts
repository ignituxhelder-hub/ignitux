/**
 * OÙ MÈNE « Y ALLER ».
 *
 * Le serveur dit quelle étape vient (`JourneyView.guide`) ; cette table dit
 * ce que l'écran projet doit ouvrir pour l'accomplir, et quel élément faire
 * pulser pour qu'on le trouve sans chercher. Dire « analyse ton idée » sans
 * montrer le bouton qui le fait renvoyait la personne fouiller seule — c'est
 * exactement ce qu'une première utilisatrice a trouvé « compliqué à suivre ».
 */
export interface DestinationGuide {
  /** L'icône à ouvrir (`etapeOuverte` de la page projet). */
  ouvre: string;
  /** true = l'outil n'existe qu'en vue avancée. */
  avancee: boolean;
  /** Sélecteur de l'élément à faire pulser, ou null. */
  cible: string | null;
}

const bouton = (section: string) => `[data-guide-cible="${section}"]`;

const DECRIRE: DestinationGuide = { ouvre: 'infos', avancee: false, cible: '#description' };
const TACHES: DestinationGuide = { ouvre: 'taches', avancee: true, cible: '#taches' };

const DESTINATIONS: Readonly<Record<string, DestinationGuide>> = {
  decrire: DECRIRE,
  analyser: { ouvre: 'analyse', avancee: false, cible: bouton('analyse') },
  construire: { ouvre: 'construction', avancee: false, cible: bouton('construction') },
  'premieres-taches': TACHES,
  'avancer-taches': TACHES,
  conformite: { ouvre: 'conformite', avancee: true, cible: bouton('conformite') },
  developper: { ouvre: 'developpement', avancee: false, cible: bouton('developpement') },
  transmettre: { ouvre: 'transmission', avancee: false, cible: bouton('transmission') },
};

/** null pour une étape inconnue : mieux vaut ne rien ouvrir qu'ouvrir au hasard. */
export function destinationDe(etapeId: string): DestinationGuide | null {
  return DESTINATIONS[etapeId] ?? null;
}
