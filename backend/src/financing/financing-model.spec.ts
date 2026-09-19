import {
  buildCapTable,
  FINANCING_SCOPE_NOTICE,
  founderTrajectory,
  isFinancingSource,
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

describe('périmètre annoncé', () => {
  it('dit explicitement que le modèle chiffré n\'existe pas', () => {
    // Garde volontaire : si quelqu'un ajoute un calcul de valorisation,
    // cette phrase deviendra fausse et ce test rappellera pourquoi elle
    // était là.
    expect(FINANCING_SCOPE_NOTICE).toContain("n'est pas défini à ce jour");
    expect(FINANCING_SCOPE_NOTICE).toContain('aucune valorisation');
  });

  it('reconnaît les sources de financement valides', () => {
    expect(isFinancingSource('ignitux')).toBe(true);
    expect(isFinancingSource('crowdfunding-lunaire')).toBe(false);
  });

  it('exprime 100 % en 10000 points de base', () => {
    expect(TOTAL_BASIS_POINTS).toBe(10000);
  });
});
