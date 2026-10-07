import { chargerContexteParticipation, contexteParticipation } from './participation-context.js';

describe('contexteParticipation', () => {
  const base = {
    founderBasisPoints: 5100,
    ignituxBasisPoints: 4900,
    status: 'actif',
    dividendRightBasisPoints: 500,
    nextMilestone: null,
  };

  it('dit la répartition actuelle, quelle qu’elle soit', () => {
    const texte = contexteParticipation({ ...base, founderBasisPoints: 6400, ignituxBasisPoints: 3600 })!;

    expect(texte).toContain('64 % porteur / 36 % IGNITUX');
  });

  it('écrit les décimales à la française', () => {
    const texte = contexteParticipation({ ...base, founderBasisPoints: 8750, ignituxBasisPoints: 1250 })!;

    expect(texte).toContain('87,5 % porteur / 12,5 % IGNITUX');
  });

  it('donne le prochain palier et ses conditions écrites pour le projet', () => {
    const texte = contexteParticipation({
      ...base,
      nextMilestone: {
        position: 1,
        label: null,
        targetIgnituxBasisPoints: 3000,
        status: 'prevu',
        conditions: ['Trois mois de trésorerie positive', 'Contrat signé avec le premier client'],
      },
    })!;

    expect(texte).toContain('30 %');
    expect(texte).toContain('Trois mois de trésorerie positive');
    expect(texte).toContain('Contrat signé avec le premier client');
  });

  it('dit « à définir » plutôt que d’inventer des conditions', () => {
    const texte = contexteParticipation({
      ...base,
      nextMilestone: { position: 1, label: null, targetIgnituxBasisPoints: 3000, status: 'prevu', conditions: [] },
    })!;

    expect(texte).toMatch(/à définir/i);
  });

  it('interdit à IGINI de promettre une date : un palier ne dépend jamais du temps', () => {
    const texte = contexteParticipation(base)!;

    expect(texte).toMatch(/aucune date|aucune durée/i);
    expect(texte).toMatch(/seul IGNITUX/i);
  });

  it('après transmission : capital 100/0, droit sur les dividendes séparé, accès conservé', () => {
    const texte = contexteParticipation({
      ...base,
      founderBasisPoints: 10000,
      ignituxBasisPoints: 0,
      status: 'transmis',
      dividendRightBasisPoints: 500,
    })!;

    expect(texte).toContain('100 % porteur / 0 % IGNITUX');
    expect(texte).toMatch(/5 % des dividendes effectivement distribués/);
    expect(texte).toMatch(/pas une part de capital/i);
    expect(texte).toMatch(/écosystème/i);
  });

  it('utilise le taux de l’accord pour le droit sur les dividendes', () => {
    const texte = contexteParticipation({
      ...base,
      founderBasisPoints: 10000,
      ignituxBasisPoints: 0,
      status: 'transmis',
      dividendRightBasisPoints: 300,
    })!;

    expect(texte).toMatch(/3 % des dividendes effectivement distribués/);
  });

  it('avant transmission, ne parle d’aucun droit supplémentaire sur les dividendes', () => {
    const texte = contexteParticipation(base)!;

    expect(texte).not.toMatch(/des dividendes effectivement distribués/);
  });

  it('se tait quand le capital n’est pas connu', () => {
    expect(contexteParticipation({ ...base, ignituxBasisPoints: null })).toBeUndefined();
  });
});

describe('chargerContexteParticipation', () => {
  const agreement = {
    id: 'a1',
    project_id: 'p1',
    founder_holder_id: 'hf',
    ignitux_holder_id: 'hi',
    status: 'actif',
    dividend_right_bps: 500,
  };

  function prismaAvec(overrides: Record<string, unknown> = {}) {
    return {
      participation_agreements: { findFirst: vi.fn().mockResolvedValue(agreement) },
      equity_events: {
        findMany: vi.fn().mockResolvedValue([
          { holder_id: 'hf', share_basis_points: 5100, occurred_at: new Date('2026-10-01') },
          { holder_id: 'hi', share_basis_points: 4900, occurred_at: new Date('2026-10-01') },
        ]),
      },
      participation_milestones: {
        findMany: vi.fn().mockResolvedValue([
          { position: 1, label: 'P1', target_ignitux_bps: 3000, status: 'prevu', conditions: ['A'] },
        ]),
      },
      ...overrides,
    };
  }

  it('assemble le contexte depuis l’accord, le capital et le prochain palier', async () => {
    const texte = await chargerContexteParticipation(prismaAvec() as never, 'p1');

    expect(texte).toContain('51 % porteur / 49 % IGNITUX');
    expect(texte).toContain('30 %');
  });

  it('ne retient comme « prochain » que le premier palier non exécuté', async () => {
    const prisma = prismaAvec({
      participation_milestones: {
        findMany: vi.fn().mockResolvedValue([
          { position: 1, label: null, target_ignitux_bps: 3000, status: 'execute', conditions: ['A'] },
          { position: 2, label: null, target_ignitux_bps: 1000, status: 'prevu', conditions: ['B'] },
        ]),
      },
    });

    const texte = await chargerContexteParticipation(prisma as never, 'p1');

    expect(texte).toContain('10 %');
    expect(texte).toContain('B');
    expect(texte).not.toContain('30 %');
  });

  it('renvoie undefined quand le projet n’a pas d’accord', async () => {
    const prisma = prismaAvec({ participation_agreements: { findFirst: vi.fn().mockResolvedValue(null) } });

    await expect(chargerContexteParticipation(prisma as never, 'p1')).resolves.toBeUndefined();
  });

  it('avale une erreur de lecture : une génération ne doit pas échouer pour ça', async () => {
    const prisma = prismaAvec({
      participation_agreements: { findFirst: vi.fn().mockRejectedValue(new Error('base injoignable')) },
    });

    await expect(chargerContexteParticipation(prisma as never, 'p1')).resolves.toBeUndefined();
  });
});
