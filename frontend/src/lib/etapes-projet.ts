/**
 * LES ÉTAPES D'UN PROJET, POUR LA GRILLE D'ICÔNES.
 *
 * Avant : les six sorties des générateurs IGINI (Analyse, Forme juridique,
 * Construction, Financement, Développement, Transmission) s'empilaient sur
 * une seule page, chacune avec son texte complet visible en même temps —
 * exactement la surcharge d'information que la grille d'icônes du Bureau
 * (voir systeme.ts) évite déjà pour les applications. Même principe ici :
 * une icône par étape, on choisit laquelle ouvrir, une seule à la fois.
 *
 * `section` est la clé que `montrer()` (projects/[id]/page.tsx) connaît déjà
 * côté parcours — Analyse et Forme juridique partagent la même, parce que le
 * parcours les ouvre ensemble.
 */
export interface EtapeProjet {
  id: string;
  label: string;
  section: string;
}

export const ETAPES_PROJET: readonly EtapeProjet[] = [
  { id: 'analyse', label: 'Analyser', section: 'analyse' },
  { id: 'forme-juridique', label: 'Forme juridique', section: 'analyse' },
  { id: 'construction', label: 'Construction', section: 'construction' },
  // « Plan de financement », pas juste « Financement » : OUTILS_PROJET a sa
  // propre icône « Financements reçus » pour l'argent réellement perçu
  // (FinancingSection) — même clé `montrer()`, deux choses différentes.
  { id: 'financement', label: 'Plan de financement', section: 'financement' },
  { id: 'developpement', label: 'Développement', section: 'developpement' },
  { id: 'transmission', label: 'Transmission', section: 'transmission' },
];

/**
 * Les outils transverses du projet — score, tâches, mémoire, conformité… —
 * même traitement que les étapes ci-dessus : une icône, un seul contenu
 * ouvert à la fois (même état `etapeOuverte` côté page), plutôt que
 * d'empiler ces dix sections en permanence.
 */
export interface OutilProjet {
  id: string;
  label: string;
  section: string;
}

export const OUTILS_PROJET: readonly OutilProjet[] = [
  { id: 'score', label: 'Score', section: 'score' },
  { id: 'taches', label: 'Tâches', section: 'taches' },
  { id: 'memoire', label: 'Mémoire', section: 'memoire' },
  { id: 'connaissances', label: 'Connaissances', section: 'connaissances' },
  { id: 'conformite', label: 'Conformité', section: 'conformite' },
  { id: 'automatisation', label: 'Automatisation', section: 'automatisation' },
  { id: 'processus', label: 'Processus', section: 'processus' },
  { id: 'financement-recu', label: 'Financements reçus', section: 'financement' },
  { id: 'capital', label: 'Rachat de parts', section: 'capital' },
  { id: 'collaborateurs', label: 'Collaborateurs', section: 'collaborateurs' },
];
