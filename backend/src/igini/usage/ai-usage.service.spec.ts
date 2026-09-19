import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  AiUsageService,
  GENERATOR_NAMES,
  monthRange,
  summarise,
  type UsageEventRow,
} from './ai-usage.service.js';

type Mock = ReturnType<typeof vi.fn>;

/**
 * Table mockée typée à la main, pour les mêmes raisons que dans
 * user-data.service.spec.ts : dériver du client Prisma ferait croire à
 * TypeScript que `create` est la vraie méthode, qui n'a ni `mockResolvedValue`
 * ni `mock`, et déclenche `unbound-method` dès qu'on la passe à `expect`.
 */
interface TableMock {
  create: Mock;
  findMany: Mock;
}

const ATTRIBUTION = { userId: 'u1', projectId: 'p1', generator: 'analyser' } as const;

/** Un bloc `usage` du SDK, avec sa décomposition de sortie. */
const UTILISATION = {
  input_tokens: 1200,
  output_tokens: 900,
  output_tokens_details: { thinking_tokens: 300 },
  cache_creation_input_tokens: null,
  cache_read_input_tokens: null,
};

function ligne(partiel: Partial<UsageEventRow> = {}): UsageEventRow {
  return {
    generator: 'analyser',
    model: 'claude-opus-5',
    input_tokens: 1200,
    output_tokens: 900,
    thinking_tokens: 300,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    ...partiel,
  };
}

describe('AiUsageService', () => {
  let service: AiUsageService;
  let table: TableMock;

  beforeEach(async () => {
    table = {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AiUsageService, { provide: PrismaService, useValue: { ai_usage_events: table } }],
    }).compile();

    service = module.get<AiUsageService>(AiUsageService);
  });

  describe('enregistrement', () => {
    it("écrit tout ce qu'il faut pour rendre une dépense vérifiable", async () => {
      await service.record({
        context: ATTRIBUTION,
        model: 'claude-opus-5',
        usage: UTILISATION,
        durationMs: 41000,
      });

      expect(table.create).toHaveBeenCalledWith({
        data: {
          user_id: 'u1',
          project_id: 'p1',
          generator: 'analyser',
          model: 'claude-opus-5',
          input_tokens: 1200,
          output_tokens: 900,
          thinking_tokens: 300,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
          duration_ms: 41000,
        },
      });
    });

    it('extrait la réflexion interne de la décomposition de sortie', async () => {
      // C'est le chiffre que PRICING.md ne pouvait pas connaître : la
      // réflexion est facturée au tarif de sortie et n'apparaît nulle part
      // dans le résultat stocké. Sans cette extraction, le journal aurait
      // reproduit exactement l'angle mort qu'il est censé supprimer.
      await service.record({
        context: ATTRIBUTION,
        model: 'claude-opus-5',
        usage: { ...UTILISATION, output_tokens_details: { thinking_tokens: 7400 } },
        durationMs: 1,
      });

      expect(table.create.mock.calls[0][0].data.thinking_tokens).toBe(7400);
    });

    it("inscrit null, et non zéro, quand le modèle n'expose pas sa réflexion", async () => {
      // Zéro affirmerait « ce modèle n'a pas réfléchi ». null dit « on ne
      // sait pas ». Sur un chiffre qui sert à décider d'un budget, les deux
      // ne se valent pas.
      await service.record({
        context: ATTRIBUTION,
        model: 'claude-opus-5',
        usage: { input_tokens: 10, output_tokens: 20 },
        durationMs: 1,
      });

      expect(table.create.mock.calls[0][0].data.thinking_tokens).toBeNull();
    });

    it("n'échoue jamais vers son appelant quand la base refuse", async () => {
      // Le contrat sur lequel s'appuie ClaudeService. Au moment où cette
      // méthode est appelée, les tokens sont consommés et le résultat est
      // produit : propager l'échec ferait perdre à la personne une
      // génération qu'elle a payée, pour un problème qui ne la concerne pas.
      table.create.mockRejectedValue(new Error('base injoignable'));

      await expect(
        service.record({
          context: ATTRIBUTION,
          model: 'claude-opus-5',
          usage: UTILISATION,
          durationMs: 1,
        }),
      ).resolves.toBeUndefined();
    });

    it("n'échoue pas non plus si le bloc usage est malformé", async () => {
      // Le type du SDK promet un bloc complet. Si cette promesse changeait,
      // la lecture des champs se ferait quand même à l'intérieur du try, et
      // la génération survivrait.
      await expect(
        service.record({
          context: ATTRIBUTION,
          model: 'claude-opus-5',
          usage: undefined as unknown as typeof UTILISATION,
          durationMs: 1,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('lecture mensuelle', () => {
    it("borne la requête au mois civil de la personne", async () => {
      await service.monthlySummary('u1', new Date('2026-09-20T14:00:00Z'));

      const where = table.findMany.mock.calls[0][0].where;
      expect(where.user_id).toBe('u1');
      expect(where.created_at.gte).toEqual(new Date('2026-09-01T00:00:00Z'));
      expect(where.created_at.lt).toEqual(new Date('2026-10-01T00:00:00Z'));
    });

    it("ne filtre sur personne pour la vue de l'exploitant", async () => {
      await service.monthlyTotal(new Date('2026-09-20T14:00:00Z'));

      expect(table.findMany.mock.calls[0][0].where.user_id).toBeUndefined();
    });
  });
});

describe('monthRange', () => {
  it('encadre le mois en UTC', () => {
    const { depuis, jusqua } = monthRange(new Date('2026-09-20T23:59:59Z'));
    expect(depuis.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(jusqua.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it("passe correctement l'année en décembre", () => {
    const { depuis, jusqua } = monthRange(new Date('2026-12-15T10:00:00Z'));
    expect(depuis.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(jusqua.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('summarise', () => {
  const depuis = new Date('2026-09-01T00:00:00Z');
  const jusqua = new Date('2026-10-01T00:00:00Z');

  it('totalise les tokens et le coût', () => {
    const resume = summarise([ligne(), ligne()], depuis, jusqua);

    expect(resume.appels).toBe(2);
    expect(resume.tokensEntree).toBe(2400);
    expect(resume.tokensSortie).toBe(1800);
    expect(resume.tokensReflexion).toBe(600);
    expect(resume.coutMicroEur).toBe(52440);
    expect(resume.coutEur).toBeCloseTo(0.05244, 10);
  });

  it('ventile par générateur', () => {
    const resume = summarise(
      [ligne({ generator: 'analyser' }), ligne({ generator: 'financer' }), ligne({ generator: 'financer' })],
      depuis,
      jusqua,
    );

    expect(resume.parGenerateur).toHaveLength(2);
    expect(resume.parGenerateur[0]).toMatchObject({ generateur: 'analyser', appels: 1 });
    expect(resume.parGenerateur[1]).toMatchObject({ generateur: 'financer', appels: 2 });
  });

  it("garde l'ordre de la méthode IGINI plutôt que celui des données", () => {
    // Un affichage qui change d'ordre d'un mois à l'autre est illisible, et
    // l'ordre des cinq étapes porte un sens : c'est le parcours du porteur.
    const desordre = ['transmettre', 'analyser', 'developper', 'construire', 'financer'];
    const resume = summarise(
      desordre.map((generator) => ligne({ generator })),
      depuis,
      jusqua,
    );

    expect(resume.parGenerateur.map((l) => l.generateur)).toEqual([...GENERATOR_NAMES]);
  });

  it('refuse de donner un total quand un modèle échappe à la grille', () => {
    // Le cas qui compte : additionner ce qu'on sait tarifer et présenter le
    // résultat comme un total serait faux, et faux dans le sens rassurant.
    const resume = summarise([ligne(), ligne({ model: 'claude-inconnu' })], depuis, jusqua);

    expect(resume.coutMicroEur).toBeNull();
    expect(resume.coutEur).toBeNull();
    expect(resume.modelesNonTarifes).toEqual(['claude-inconnu']);
    // Les tokens, eux, restent comptés : ce sont des faits mesurés, et le
    // fait qu'on ne sache pas les valoriser ne les efface pas.
    expect(resume.tokensEntree).toBe(2400);
  });

  it('marque aussi le sous-total du générateur concerné', () => {
    const resume = summarise(
      [ligne({ generator: 'analyser' }), ligne({ generator: 'analyser', model: 'claude-inconnu' })],
      depuis,
      jusqua,
    );

    expect(resume.parGenerateur[0].coutMicroEur).toBeNull();
    expect(resume.parGenerateur[0].appels).toBe(2);
  });

  it('rend un résumé honnête sur un mois sans aucun appel', () => {
    const resume = summarise([], depuis, jusqua);

    expect(resume.appels).toBe(0);
    // Zéro appel coûte zéro : c'est un vrai total, pas une absence de total.
    expect(resume.coutMicroEur).toBe(0);
    expect(resume.coutEur).toBe(0);
    expect(resume.parGenerateur).toEqual([]);
  });
});
