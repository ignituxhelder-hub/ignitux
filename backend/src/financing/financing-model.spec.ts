import {
  buildCapTable,
  FINANCING_SCOPE_NOTICE,
  FOUNDER_ENTRY_BASIS_POINTS,
  founderTrajectory,
  IGNITUX_ENTRY_BASIS_POINTS,
  isFinancingSource,
  perpetualShareCents,
  TOTAL_BASIS_POINTS,
} from './financing-model.js';

const PORTEUR = { id: 'h1', name: 'Porteur', is_founder: true };
const IGNITUX = { id: 'h2', name: 'Ignitux', is_founder: false };

function event(holderId: string, share: number, date: string) {
  return { holder_id: holderId, share_basis_points: share, occurred_at: new Date(date) };
}

describe('répartition du capital', () => {
  it('retient le dernier événement dans le temps pour chaque détenteur', () => {
    const table = buildCapTable(
      [PORTEUR],
      [event('h1', 6000, '2026-01-01'), event('h1', 8000, '2026-06-01')],
    );

    expect(table.holders[0].shareBasisPoints).toBe(8000);
  });

  describe('deux événements le même jour', () => {
    // `occurred_at` est saisi par la personne, et une interface qui propose
    // un champ « date » y met minuit. Deux changements enregistrés le même
    // jour portent donc exactement la même valeur — et c'est très courant :
    // un investisseur entre et le porteur est dilué, ou l'on corrige une
    // saisie dans la foulée.
    //
    // La première version gardait le dernier élément *itéré*, c'est-à-dire
    // l'ordre que la base voulait bien rendre. Constaté sur la vraie base :
    // 4 000 puis 10 000 points de base le même jour, et la lecture retenait
    // 4 000 — la valeur périmée.
    const memeJour = (share: number, saisiA: string) => ({
      holder_id: 'h1',
      share_basis_points: share,
      occurred_at: new Date('2026-03-01'),
      created_at: new Date(saisiA),
    });

    it('retient celui qui a été enregistré en dernier', () => {
      // L'ordre du tableau met volontairement la valeur PÉRIMÉE en dernier.
      // Écrit dans l'autre sens, ce test passait même sans départage — la
      // bonne réponse tombait par chance, ce qui est la pire façon de
      // passer. C'est aussi ce que fait la base : elle rend les lignes dans
      // l'ordre qu'elle veut.
      const table = buildCapTable(
        [PORTEUR],
        [memeJour(10000, '2026-03-01T14:00:00Z'), memeJour(4000, '2026-03-01T10:00:00Z')],
      );

      expect(table.holders[0].shareBasisPoints).toBe(10000);
    });

    it('donne la même réponse quel que soit l’ordre de lecture', () => {
      // Le cœur du défaut : Postgres ne promet rien sur l'ordre des
      // égalités. Un autre plan d'exécution, un index, un VACUUM, et les
      // lignes arrivent dans l'autre sens. La réponse ne doit pas en
      // dépendre.
      const tot = [memeJour(4000, '2026-03-01T10:00:00Z'), memeJour(10000, '2026-03-01T14:00:00Z')];
      const tard = [...tot].reverse();

      expect(buildCapTable([PORTEUR], tot).holders[0].shareBasisPoints).toBe(
        buildCapTable([PORTEUR], tard).holders[0].shareBasisPoints,
      );
      expect(buildCapTable([PORTEUR], tard).holders[0].shareBasisPoints).toBe(10000);
    });

    it('la date de l’événement l’emporte toujours sur la date de saisie', () => {
      // Une correction saisie aujourd'hui pour une date ancienne ne doit pas
      // écraser un changement plus récent : c'est `occurred_at` qui dit
      // quand la part a changé, `created_at` ne sert qu'à départager.
      const table = buildCapTable(
        [PORTEUR],
        [
          {
            holder_id: 'h1',
            share_basis_points: 9000,
            occurred_at: new Date('2026-06-01'),
            created_at: new Date('2026-06-01T08:00:00Z'),
          },
          {
            holder_id: 'h1',
            share_basis_points: 3000,
            occurred_at: new Date('2026-01-01'),
            created_at: new Date('2026-12-31T23:00:00Z'),
          },
        ],
      );

      expect(table.holders[0].shareBasisPoints).toBe(9000);
    });

    it('tient encore quand created_at est absent', () => {
      // Les anciens appels et les jeux de test minimaux n'en fournissent
      // pas : on ne doit pas s'effondrer, seulement retomber sur l'ancien
      // comportement pour ces cas-là.
      const table = buildCapTable(
        [PORTEUR],
        [
          { holder_id: 'h1', share_basis_points: 4000, occurred_at: new Date('2026-01-01') },
          { holder_id: 'h1', share_basis_points: 7000, occurred_at: new Date('2026-06-01') },
        ],
      );

      expect(table.holders[0].shareBasisPoints).toBe(7000);
    });
  });

  it("ne se laisse pas tromper par un historique donné dans le désordre", () => {
    const table = buildCapTable(
      [PORTEUR],
      [event('h1', 8000, '2026-06-01'), event('h1', 6000, '2026-01-01')],
    );

    expect(table.holders[0].shareBasisPoints).toBe(8000);
  });

  it('laisse la part à null pour un détenteur sans aucun événement', () => {
    // Zéro dirait « il ne détient rien », null dit « on ne sait pas ».
    const table = buildCapTable([PORTEUR], []);

    expect(table.holders[0].shareBasisPoints).toBeNull();
  });

  it('signale un écart à 100 % au lieu de normaliser en silence', () => {
    // Redistribuer automatiquement l'écart reviendrait à décider à la
    // place des personnes qui détiennent ces parts.
    const table = buildCapTable(
      [PORTEUR, IGNITUX],
      [event('h1', 6000, '2026-01-01'), event('h2', 3000, '2026-01-01')],
    );

    expect(table.totalBasisPoints).toBe(9000);
    expect(table.discrepancyBasisPoints).toBe(1000);
  });

  it('ne signale aucun écart quand la répartition boucle', () => {
    const table = buildCapTable(
      [PORTEUR, IGNITUX],
      [event('h1', 7000, '2026-01-01'), event('h2', 3000, '2026-01-01')],
    );

    expect(table.discrepancyBasisPoints).toBe(0);
  });

  describe('majorité du porteur', () => {
    it('la reconnaît quand la répartition est complète', () => {
      const table = buildCapTable(
        [PORTEUR, IGNITUX],
        [event('h1', 7000, '2026-01-01'), event('h2', 3000, '2026-01-01')],
      );

      expect(table.founderHasMajority).toBe(true);
    });

    it("dit non quand le porteur est minoritaire", () => {
      const table = buildCapTable(
        [PORTEUR, IGNITUX],
        [event('h1', 4000, '2026-01-01'), event('h2', 6000, '2026-01-01')],
      );

      expect(table.founderHasMajority).toBe(false);
    });

    it('refuse de trancher sur exactement 50 %', () => {
      const table = buildCapTable(
        [PORTEUR, IGNITUX],
        [event('h1', 5000, '2026-01-01'), event('h2', 5000, '2026-01-01')],
      );

      expect(table.founderHasMajority).toBe(false);
    });

    it("ne se prononce pas sur une répartition incomplète", () => {
      // « Oui » comme « non » serait une affirmation infondée.
      const table = buildCapTable([PORTEUR, IGNITUX], [event('h1', 6000, '2026-01-01')]);

      expect(table.founderHasMajority).toBeNull();
    });
  });

  it('additionne les parts de plusieurs fondateurs', () => {
    const table = buildCapTable(
      [PORTEUR, { id: 'h3', name: 'Associé', is_founder: true }, IGNITUX],
      [
        event('h1', 3000, '2026-01-01'),
        event('h3', 3000, '2026-01-01'),
        event('h2', 4000, '2026-01-01'),
      ],
    );

    expect(table.founderHasMajority).toBe(true);
  });
});

describe('trajectoire du porteur', () => {
  it('rend les points réellement enregistrés, du plus ancien au plus récent', () => {
    const trajectory = founderTrajectory(
      new Set(['h1']),
      [event('h1', 8000, '2026-06-01'), event('h1', 6000, '2026-01-01'), event('h2', 4000, '2026-01-01')],
    );

    expect(trajectory.map((point) => point.shareBasisPoints)).toEqual([6000, 8000]);
  });

  it("ne projette rien au-delà du dernier point connu", () => {
    // Prolonger la courbe reviendrait à promettre une évolution.
    const trajectory = founderTrajectory(new Set(['h1']), [event('h1', 6000, '2026-01-01')]);

    expect(trajectory).toHaveLength(1);
  });

  it('renvoie une liste vide sans fondateur identifié', () => {
    expect(founderTrajectory(new Set(), [event('h1', 6000, '2026-01-01')])).toEqual([]);
  });
});

describe('modèle économique IGNITUX', () => {
  it("annonce la répartition d'entrée et la part perpétuelle", () => {
    expect(FINANCING_SCOPE_NOTICE).toContain('51 %');
    expect(FINANCING_SCOPE_NOTICE).toContain('49 %');
    expect(FINANCING_SCOPE_NOTICE).toContain('5 %');
  });

  it('continue de dire ce qui reste non calculé', () => {
    // Garde volontaire : si quelqu'un ajoute un calcul de valorisation ou
    // de prix de rachat, cette phrase deviendra fausse et ce test
    // rappellera pourquoi elle était là.
    expect(FINANCING_SCOPE_NOTICE).toContain('ni valorisation du projet');
    expect(FINANCING_SCOPE_NOTICE).toContain('ni dividende prévisionnel');
  });

  it("fixe la répartition d'entrée à 51/49", () => {
    expect(FOUNDER_ENTRY_BASIS_POINTS).toBe(5100);
    expect(IGNITUX_ENTRY_BASIS_POINTS).toBe(4900);
    expect(FOUNDER_ENTRY_BASIS_POINTS + IGNITUX_ENTRY_BASIS_POINTS).toBe(TOTAL_BASIS_POINTS);
  });

  it("laisse le porteur majoritaire dès l'entrée", () => {
    // 51 % n'est pas un chiffre décoratif : c'est ce qui rend la règle
    // `majorite-du-porteur` satisfaite dès le premier jour.
    expect(FOUNDER_ENTRY_BASIS_POINTS * 2).toBeGreaterThan(TOTAL_BASIS_POINTS);
  });

  describe('part perpétuelle de 5 %', () => {
    it("calcule 5 % d'un dividende versé", () => {
      expect(perpetualShareCents(100000)).toBe(5000);
    });

    it('arrondit au centime le plus proche', () => {
      // 5 % de 1,23 € = 0,0615 € → 0,06 €.
      expect(perpetualShareCents(123)).toBe(6);
    });

    it('vaut zéro sur un dividende nul', () => {
      expect(perpetualShareCents(0)).toBe(0);
    });
  });

  it('reconnaît les sources de financement valides', () => {
    expect(isFinancingSource('ignitux')).toBe(true);
    expect(isFinancingSource('crowdfunding-lunaire')).toBe(false);
  });

  it('exprime 100 % en 10000 points de base', () => {
    expect(TOTAL_BASIS_POINTS).toBe(10000);
  });
});
