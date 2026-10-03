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
  { id: 'financement', label: 'Financement', section: 'financement' },
  { id: 'developpement', label: 'Développement', section: 'developpement' },
  { id: 'transmission', label: 'Transmission', section: 'transmission' },
];
