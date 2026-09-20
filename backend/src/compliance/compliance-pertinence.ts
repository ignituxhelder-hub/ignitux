/**
 * TRIER LES DÉMARCHES, SANS JAMAIS EN CACHER.
 *
 * ## Pourquoi un tri et pas un filtre
 *
 * Filtrer la conformité par secteur revient à masquer des obligations
 * légales. Un faux négatif y coûte bien plus cher que du bruit : quelqu'un
 * qui ne voit pas une démarche en conclut qu'elle ne le concerne pas, et
 * c'est Ignitux qui aura produit ce silence. Une démarche de trop se lit et
 * s'écarte ; une démarche manquante ne se remarque qu'au contrôle.
 *
 * Donc : les démarches du secteur remontent, les autres descendent, aucune
 * ne disparaît. Et chaque groupe dit ce qu'il est, pour que « en bas de la
 * liste » ne se lise jamais comme « pas pour toi ».
 *
 * ## Le secteur du projet, pas celui de la personne
 *
 * `user_profiles.sectors` répond à « où as-tu déjà travaillé ». C'est une
 * expérience, pas une activité. Quelqu'un venu du logiciel peut ouvrir une
 * friterie : trier sur son passé lui cacherait l'hygiène alimentaire. Le
 * secteur utilisé ici est donc celui porté par le projet.
 */

/** Le rang d'une démarche vis-à-vis d'un secteur donné. */
export type Pertinence = 'secteur' | 'toute-activite' | 'autres-secteurs';

export interface PertinenceGroupe {
  cle: Pertinence;
  titre: string;
  /**
   * Ce que le groupe est, et surtout ce qu'il n'est pas.
   *
   * La phrase du groupe « autres-secteurs » est la plus importante du
   * module : c'est elle qui empêche le tri de se lire comme un verdict.
   */
  precision: string;
}

export const GROUPES: Record<Pertinence, PertinenceGroupe> = {
  secteur: {
    cle: 'secteur',
    titre: 'Propre à ton secteur',
    precision: 'Ces démarches visent explicitement ton activité.',
  },
  'toute-activite': {
    cle: 'toute-activite',
    titre: 'Pour toute activité',
    precision: 'Quel que soit le secteur, ces points se posent.',
  },
  'autres-secteurs': {
    cle: 'autres-secteurs',
    titre: 'Rattachées à d’autres secteurs',
    precision:
      'Rangées ici parce qu’elles visent d’autres activités — ce n’est pas un avis ' +
      'juridique sur ton cas. Une activité en recouvre souvent plusieurs : à lire quand même.',
  },
};

/** Ce dont le tri a besoin. Volontairement minimal : il reste pur. */
export interface ADeclarerUnSecteur {
  /**
   * Les secteurs visés. Vide, `null` ou absent = toute activité.
   *
   * Les trois, parce que les trois arrivent : le fichier de référence
   * écrit `[]`, la colonne Postgres rend `[]`, un appelant à la main
   * écrira `null`, et une ligne plus ancienne que la colonne ne portera
   * rien du tout. Traiter `[]` comme « aucun secteur concerné »
   * reléguerait tout le socle commun ; lever sur `undefined` emporterait
   * la section entière, et une conformité qui ne s'affiche pas est le
   * pire résultat possible ici.
   */
  sectors?: readonly string[] | null;
}

export function pertinenceDe(
  exigence: ADeclarerUnSecteur,
  secteurDuProjet: string | null,
): Pertinence {
  if (!exigence.sectors || exigence.sectors.length === 0) return 'toute-activite';
  // Sans secteur déclaré, une démarche sectorielle n'est ni pertinente ni
  // écartée : on ne sait pas. La ranger dans « autres » serait la
  // reléguer sur une ignorance, alors on la laisse au milieu.
  if (secteurDuProjet === null) return 'toute-activite';
  return exigence.sectors.includes(secteurDuProjet) ? 'secteur' : 'autres-secteurs';
}

const ORDRE: Pertinence[] = ['secteur', 'toute-activite', 'autres-secteurs'];

/**
 * Range les démarches par pertinence, en conservant l'ordre d'entrée à
 * l'intérieur de chaque groupe.
 *
 * Rend toujours autant d'éléments qu'il en reçoit : c'est la propriété que
 * le test vérifie, et la seule qui compte vraiment ici.
 */
export function grouperParPertinence<T extends ADeclarerUnSecteur>(
  exigences: readonly T[],
  secteurDuProjet: string | null,
): Array<{ groupe: PertinenceGroupe; exigences: T[] }> {
  const paquets = new Map<Pertinence, T[]>();
  for (const exigence of exigences) {
    const cle = pertinenceDe(exigence, secteurDuProjet);
    const paquet = paquets.get(cle);
    if (paquet) paquet.push(exigence);
    else paquets.set(cle, [exigence]);
  }

  return ORDRE.filter((cle) => paquets.has(cle)).map((cle) => ({
    groupe: GROUPES[cle],
    exigences: paquets.get(cle) as T[],
  }));
}
