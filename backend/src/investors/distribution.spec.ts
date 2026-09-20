import { PERPETUAL_DIVIDEND_BASIS_POINTS } from '../financing/financing-model.js';
import {
  allocatePro,
  portfolioTotals,
  signIsCoherent,
  splitDividend,
  validateDistribution,
  type DistributionShare,
  type MovementRow,
} from './distribution.js';

const part = (id: string, weightCents: number): DistributionShare => ({
  participationId: `p-${id}`,
  investorId: `i-${id}`,
  weightCents,
});

const somme = (allocations: ReadonlyArray<{ amountCents: number }>) =>
  allocations.reduce((total, a) => total + a.amountCents, 0);

describe('allocatePro', () => {
  it('répartit au prorata quand ça tombe juste', () => {
    // 1 000 € entre 1 000 € et 500 € investis : deux tiers, un tiers.
    const allocations = allocatePro(150000, [part('a', 100000), part('b', 50000)]);
    expect(allocations.map((a) => a.amountCents)).toEqual([100000, 50000]);
  });

  describe("le centime qui disparaît", () => {
    it('ne perd rien sur trois parts égales', () => {
      // Le cas d'école : 100 000 / 3 = 33 333,33. Trois parts entières font
      // 99 999 et un centime s'évapore. Il doit être attribué, pas perdu.
      const allocations = allocatePro(100000, [part('a', 1), part('b', 1), part('c', 1)]);
      expect(somme(allocations)).toBe(100000);
      expect(allocations.map((a) => a.amountCents)).toEqual([33334, 33333, 33333]);
    });

    it("n'en invente pas non plus", () => {
      // Arrondir chacun au supérieur donnerait 33 334 × 3 = 100 002.
      const allocations = allocatePro(100000, [part('a', 1), part('b', 1), part('c', 1)]);
      expect(somme(allocations)).not.toBeGreaterThan(100000);
    });

    it('donne le reste au plus fort reste, pas au premier venu', () => {
      // Poids 1 / 1 / 4 sur 10 centimes : 1,66 / 1,66 / 6,66. Les trois
      // restes sont égaux ; à égalité l'ordre départage, de façon
      // déterministe — un partage qu'on ne sait pas rejouer ne s'explique
      // jamais.
      const allocations = allocatePro(10, [part('a', 1), part('b', 1), part('c', 4)]);
      expect(somme(allocations)).toBe(10);
      expect(allocations.map((a) => a.amountCents)).toEqual([2, 2, 6]);
    });

    it('reste exact sur des poids très déséquilibrés', () => {
      // Un gros investisseur et beaucoup de petits : le cas où un arrondi
      // naïf fait le plus de dégâts.
      const shares = [part('gros', 9_000_000), ...Array.from({ length: 37 }, (_, i) => part(`p${i}`, 271))];
      const allocations = allocatePro(1_234_567, shares);
      expect(somme(allocations)).toBe(1_234_567);
    });
  });

  it("la somme est exacte, toujours — vérifié sur 20 000 tirages", () => {
    // La propriété qui justifie ce module. Un centime par versement, sur
    // des milliers de projets et des années, devient un écart permanent
    // entre ce que le projet a versé et ce que les investisseurs ont reçu.
    let graine = 987654321;
    const alea = (max: number) => {
      graine = (graine * 1103515245 + 12345) % 2147483648;
      return (graine >>> 0) % max;
    };

    for (let tirage = 0; tirage < 20000; tirage += 1) {
      const nombre = 1 + alea(12);
      const shares = Array.from({ length: nombre }, (_, i) => part(`x${i}`, 1 + alea(5_000_000)));
      const montant = 1 + alea(50_000_000);

      const allocations = allocatePro(montant, shares);

      expect(somme(allocations)).toBe(montant);
      expect(allocations.every((a) => a.amountCents >= 0)).toBe(true);
      expect(allocations).toHaveLength(nombre);
    }
    // 20 000 tirages tiennent en 2,5 s seuls, mais dépassaient les 5 s par
    // défaut quand la suite complète tourne en parallèle. Le test échouait
    // alors sans qu une seule propriété soit violée : une fausse alerte use
    // la confiance dans la suite plus vite qu un vrai échec.
  }, 30000);

  it('donne tout à un investisseur unique', () => {
    expect(allocatePro(777, [part('seul', 42)])).toEqual([
      { participationId: 'p-seul', investorId: 'i-seul', amountCents: 777 },
    ]);
  });

  it('ne rend rien quand les poids totalisent zéro', () => {
    // Le refus se fait en amont, dans validateDistribution : ici on vérifie
    // seulement qu'on ne partage pas arbitrairement.
    expect(allocatePro(1000, [part('a', 0), part('b', 0)])).toEqual([]);
  });
});

describe('validateDistribution', () => {
  const codes = (montant: number, shares: DistributionShare[]) =>
    validateDistribution(montant, shares).map((p) => p.code);

  it('accepte un versement ordinaire', () => {
    expect(codes(100000, [part('a', 1000)])).toEqual([]);
  });

  it('refuse un projet sans aucun investisseur', () => {
    expect(codes(100000, [])).toEqual(['aucun-investisseur']);
  });

  it('refuse de répartir quand les participations totalisent zéro', () => {
    // Partager en parts égales serait une décision, pas un calcul. On ne la
    // prend pas à la place des personnes concernées.
    expect(codes(100000, [part('a', 0), part('b', 0)])).toEqual(['poids-nul']);
  });

  it('refuse un montant nul ou négatif', () => {
    expect(codes(0, [part('a', 1)])).toEqual(['montant-non-positif']);
    expect(codes(-500, [part('a', 1)])).toEqual(['montant-non-positif']);
  });

  it('refuse des centimes fractionnaires', () => {
    expect(codes(100.5, [part('a', 1)])).toEqual(['montant-non-entier']);
  });

  it('refuse un montant investi négatif', () => {
    expect(codes(1000, [part('a', -1)])).toContain('poids-negatif');
  });
});

describe('splitDividend', () => {
  it("prélève les 5 % d'Ignitux avant le prorata", () => {
    // Le modèle dit « 5 % des dividendes réellement versés ». Les 5 %
    // sortent donc du montant versé, avant partage.
    const split = splitDividend(100000, [part('a', 1), part('b', 1)], true);

    expect(split.ignituxCents).toBe(5000);
    expect(split.investorsCents).toBe(95000);
    expect(somme(split.allocations)).toBe(95000);
    // Et rien ne s'est perdu entre les deux étapes.
    expect(split.ignituxCents + somme(split.allocations)).toBe(100000);
  });

  it('ne prélève rien quand la règle ne s\'applique pas', () => {
    // Un projet financé sans qu'Ignitux entre au capital. Le produit ne
    // devine pas : l'appelant dit.
    const split = splitDividend(100000, [part('a', 1)], false);
    expect(split.ignituxCents).toBe(0);
    expect(split.investorsCents).toBe(100000);
  });

  it('reste exact au centime, prélèvement compris', () => {
    // 3 333 centimes : 5 % = 166,65 → 167. Reste 3 166 entre trois.
    const split = splitDividend(3333, [part('a', 1), part('b', 1), part('c', 1)], true);
    expect(split.ignituxCents + somme(split.allocations)).toBe(3333);
  });

  it('utilise la règle du modèle, pas une copie', () => {
    // Si quelqu'un changeait le taux dans financing-model.ts, ce test
    // suivrait au lieu de figer 5 % une seconde fois.
    const split = splitDividend(1_000_000, [part('a', 1)], true);
    expect(split.ignituxCents).toBe((1_000_000 * PERPETUAL_DIVIDEND_BASIS_POINTS) / 10000);
  });
});

describe('signIsCoherent', () => {
  it("un investissement sort de la poche de l'investisseur", () => {
    expect(signIsCoherent('investissement', -100000)).toBe(true);
    expect(signIsCoherent('investissement', 100000)).toBe(false);
  });

  it('un remboursement, un dividende et un gain y entrent', () => {
    for (const kind of ['remboursement_capital', 'dividende', 'gain'] as const) {
      expect(signIsCoherent(kind, 100000)).toBe(true);
      expect(signIsCoherent(kind, -100000)).toBe(false);
    }
  });

  it('seule une correction peut aller dans les deux sens', () => {
    expect(signIsCoherent('correction', 500)).toBe(true);
    expect(signIsCoherent('correction', -500)).toBe(true);
    // Mais pas de correction à zéro : elle ne corrigerait rien.
    expect(signIsCoherent('correction', 0)).toBe(false);
  });
});

describe('portfolioTotals', () => {
  const mvt = (id: string, kind: string, amount: number, corrige: string | null = null): MovementRow => ({
    id,
    kind,
    amount_cents: amount,
    corrects_movement_id: corrige,
  });

  it('sépare les postes et calcule le net', () => {
    const totals = portfolioTotals([
      mvt('1', 'investissement', -100000),
      mvt('2', 'remboursement_capital', 40000),
      mvt('3', 'dividende', 7500),
      mvt('4', 'gain', 2500),
    ]);

    expect(totals.investedCents).toBe(100000);
    expect(totals.repaidCents).toBe(40000);
    expect(totals.dividendsCents).toBe(7500);
    expect(totals.gainsCents).toBe(2500);
    // Ce qui est revenu moins ce qui a été mis : encore négatif.
    expect(totals.netCents).toBe(-50000);
  });

  it('rattache une correction au poste qu\'elle rectifie', () => {
    // Le point qui compte : une correction rangée dans une catégorie « à
    // part » laisserait le montant erroné visible dans son poste d'origine,
    // et le total cesserait de décrire la réalité.
    const totals = portfolioTotals([
      mvt('1', 'dividende', 10000),
      mvt('2', 'correction', -3000, '1'),
    ]);

    expect(totals.dividendsCents).toBe(7000);
    expect(totals.netCents).toBe(7000);
  });

  it('corrige aussi un investissement mal saisi', () => {
    const totals = portfolioTotals([
      mvt('1', 'investissement', -100000),
      // On avait saisi 1 000 € au lieu de 800 € : on rend 200 €.
      mvt('2', 'correction', 20000, '1'),
    ]);

    expect(totals.investedCents).toBe(80000);
  });

  it('ne se perd pas sur une correction orpheline', () => {
    // Elle ne devrait pas exister — le service l'interdit — mais un total
    // ne doit pas se tromper pour autant : elle compte au net, sans poste.
    const totals = portfolioTotals([mvt('1', 'correction', 500, null)]);
    expect(totals.netCents).toBe(500);
    expect(totals.dividendsCents).toBe(0);
  });

  it('rend des zéros sur un portefeuille vide', () => {
    expect(portfolioTotals([])).toEqual({
      investedCents: 0,
      repaidCents: 0,
      dividendsCents: 0,
      gainsCents: 0,
      netCents: 0,
    });
  });
});
