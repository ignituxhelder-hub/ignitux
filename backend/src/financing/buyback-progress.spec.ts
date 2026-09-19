import {
  BUYBACK_CONDITIONS,
  BUYBACK_SCOPE_NOTICE,
  buybackProgress,
  isBuybackCondition,
} from './buyback-progress.js';

function objective(kind: string, definition: string, reachedAt: Date | null = null) {
  return { kind, definition, reached_at: reachedAt };
}

const ALL_THREE = [
  objective('rentabilite', 'Trois mois consécutifs de résultat positif.'),
  objective('autonomie', 'Je ne dépends plus du financement Ignitux pour payer les salaires.'),
  objective('stabilite', 'Le chiffre ne varie pas de plus de 20 % sur deux trimestres.'),
];

describe('progression du rachat', () => {
  it('rend toujours les trois conditions du modèle, même sans rien de saisi', () => {
    // L'écran doit pouvoir montrer ce qui reste à écrire : une liste vide
    // laisserait croire qu'il n'y a rien à faire.
    const progress = buybackProgress([]);

    expect(progress.conditions.map((condition) => condition.kind)).toEqual([
      'rentabilite',
      'autonomie',
      'stabilite',
    ]);
    expect(progress.definedCount).toBe(0);
    expect(progress.missingDefinitions).toHaveLength(3);
  });

  it('ne se prononce pas tant que les trois conditions ne sont pas écrites', () => {
    // Répondre « non, le rachat n'est pas possible » sur des conditions
    // que personne n'a encore définies serait une affirmation infondée.
    const progress = buybackProgress([objective('rentabilite', 'Résultat positif.', new Date())]);

    expect(progress.allReached).toBeNull();
    expect(progress.reachedCount).toBe(1);
  });

  it('dit non quand les trois sont écrites mais pas toutes atteintes', () => {
    const progress = buybackProgress([
      { ...ALL_THREE[0], reached_at: new Date('2026-03-01') },
      ALL_THREE[1],
      ALL_THREE[2],
    ]);

    expect(progress.allReached).toBe(false);
    expect(progress.reachedCount).toBe(1);
  });

  it('dit oui quand le porteur a déclaré les trois atteintes', () => {
    const progress = buybackProgress(
      ALL_THREE.map((item) => ({ ...item, reached_at: new Date('2026-06-01') })),
    );

    expect(progress.allReached).toBe(true);
    expect(progress.reachedCount).toBe(3);
    expect(progress.missingDefinitions).toEqual([]);
  });

  it("refuse qu'une condition soit atteinte sans avoir été définie", () => {
    // Sinon on pourrait cocher « rentabilité atteinte » sans avoir jamais
    // dit ce que « rentable » veut dire pour ce projet — et la condition
    // deviendrait réinterprétable après coup, ce qu'elle existe justement
    // pour empêcher.
    const progress = buybackProgress([objective('rentabilite', '   ', new Date())]);

    expect(progress.conditions[0].definition).toBeNull();
    expect(progress.conditions[0].reachedAt).toBeNull();
    expect(progress.reachedCount).toBe(0);
  });

  it('ignore une condition inconnue au lieu de la compter', () => {
    // Une valeur hors modèle ne doit pas gonfler le compteur ni apparaître
    // comme une quatrième condition.
    const progress = buybackProgress([
      ...ALL_THREE,
      objective('croissance', 'Condition inventée par un appel malformé.', new Date()),
    ]);

    expect(progress.conditions).toHaveLength(3);
    expect(progress.totalCount).toBe(3);
  });

  it("garde l'ordre du modèle économique", () => {
    // Saisies dans le désordre, les conditions doivent se lire dans
    // l'ordre du document : rentabilité, autonomie, stabilité.
    const progress = buybackProgress([ALL_THREE[2], ALL_THREE[0], ALL_THREE[1]]);

    expect(progress.conditions.map((condition) => condition.label)).toEqual([
      'Rentabilité',
      'Autonomie',
      'Stabilité',
    ]);
  });

  it('reconnaît les trois conditions du modèle et rien d\'autre', () => {
    expect(BUYBACK_CONDITIONS).toHaveLength(3);
    expect(isBuybackCondition('rentabilite')).toBe(true);
    expect(isBuybackCondition('rentabilité')).toBe(false);
    expect(isBuybackCondition('croissance')).toBe(false);
  });

  describe('avertissement de périmètre', () => {
    it("dit que c'est le porteur qui définit et qui déclare", () => {
      expect(BUYBACK_SCOPE_NOTICE).toContain("est donc toi qui écris");
      expect(BUYBACK_SCOPE_NOTICE).toContain('toi qui déclares');
    });

    it('continue de refuser de calculer un prix de rachat', () => {
      // Garde volontaire, comme pour FINANCING_SCOPE_NOTICE : si quelqu'un
      // ajoute un calcul de valorisation, cette phrase deviendra fausse et
      // ce test rappellera pourquoi elle était là.
      expect(BUYBACK_SCOPE_NOTICE).toContain('ni la valorisation');
      expect(BUYBACK_SCOPE_NOTICE).toContain('ni le prix de rachat');
    });
  });
});
