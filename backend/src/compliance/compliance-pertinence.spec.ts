import {
  GROUPES,
  grouperParPertinence,
  pertinenceDe,
  type ADeclarerUnSecteur,
} from './compliance-pertinence.js';

const universelle: ADeclarerUnSecteur = { sectors: null };
const restauration: ADeclarerUnSecteur = { sectors: ['Restauration'] };
const commerce: ADeclarerUnSecteur = { sectors: ['Commerce', 'Restauration'] };

describe('pertinence d’une démarche', () => {
  it('classe une démarche sans secteur comme valant pour toute activité', () => {
    expect(pertinenceDe(universelle, 'Logiciel')).toBe('toute-activite');
    expect(pertinenceDe(universelle, null)).toBe('toute-activite');
  });

  // Le fichier de référence écrit [] et Postgres rend [] : confondre
  // « aucun secteur déclaré » avec « aucun secteur concerné » reléguerait
  // tout le socle commun en bas de liste. Le défaut est passé une fois.
  it('traite une liste vide exactement comme une absence de secteur', () => {
    expect(pertinenceDe({ sectors: [] }, 'Logiciel')).toBe('toute-activite');
    expect(pertinenceDe({ sectors: [] }, null)).toBe('toute-activite');
  });

  // Une ligne plus ancienne que la colonne ne porte rien. Lever ici
  // emporterait toute la section Conformité, et une conformité qui ne
  // s'affiche pas est le pire résultat possible.
  it('ne lève pas quand le champ est absent', () => {
    expect(pertinenceDe({}, 'Logiciel')).toBe('toute-activite');
    expect(pertinenceDe({ sectors: null }, 'Logiciel')).toBe('toute-activite');
  });

  it('remonte une démarche du secteur du projet', () => {
    expect(pertinenceDe(restauration, 'Restauration')).toBe('secteur');
    expect(pertinenceDe(commerce, 'Commerce')).toBe('secteur');
  });

  it('descend une démarche rattachée à un autre secteur', () => {
    expect(pertinenceDe(restauration, 'Logiciel')).toBe('autres-secteurs');
  });

  // Sans secteur déclaré, on ne sait pas. Reléguer sur une ignorance
  // reviendrait à répondre « pas pour toi » à une question jamais posée.
  it('ne relègue rien tant que le secteur du projet est inconnu', () => {
    expect(pertinenceDe(restauration, null)).toBe('toute-activite');
  });
});

describe('groupement', () => {
  const toutes = [universelle, restauration, commerce];

  // LA propriété du module. Un tri qui perd une ligne devient un filtre,
  // et un filtre sur des obligations légales produit des faux négatifs.
  it('ne perd jamais une démarche, quel que soit le secteur', () => {
    for (const secteur of [null, 'Restauration', 'Logiciel', 'Secteur inconnu']) {
      const groupes = grouperParPertinence(toutes, secteur);
      const total = groupes.reduce((n, g) => n + g.exigences.length, 0);
      expect(total, `secteur ${secteur}`).toBe(toutes.length);
    }
  });

  it('place le secteur en premier et les autres en dernier', () => {
    const cles = grouperParPertinence(toutes, 'Restauration').map((g) => g.groupe.cle);

    expect(cles).toEqual(['secteur', 'toute-activite']);
  });

  it('ordonne secteur, puis toute activité, puis autres secteurs', () => {
    const cles = grouperParPertinence(
      [restauration, universelle, { sectors: ['Transport'] }],
      'Restauration',
    ).map((g) => g.groupe.cle);

    expect(cles).toEqual(['secteur', 'toute-activite', 'autres-secteurs']);
  });

  it('ne rend pas de groupe vide', () => {
    const groupes = grouperParPertinence([universelle], 'Restauration');

    expect(groupes).toHaveLength(1);
    expect(groupes[0].exigences).toHaveLength(1);
  });

  it('conserve l’ordre d’entrée dans un groupe', () => {
    const a = { sectors: null, id: 'a' };
    const b = { sectors: null, id: 'b' };

    expect(grouperParPertinence([a, b], null)[0].exigences.map((e) => e.id)).toEqual(['a', 'b']);
  });

  // Le tri ne doit jamais pouvoir se lire comme « ça ne te concerne pas ».
  it('dit explicitement que le dernier groupe n’est pas un avis juridique', () => {
    expect(GROUPES['autres-secteurs'].precision).toMatch(/pas un avis juridique/i);
    expect(GROUPES['autres-secteurs'].precision).toMatch(/à lire quand même/i);
  });
});
