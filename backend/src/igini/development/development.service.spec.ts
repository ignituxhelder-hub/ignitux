import { Test, TestingModule } from '@nestjs/testing';
import { ClaudeService } from '../claude/claude.service.js';
import { DevelopmentService } from './development.service.js';

/**
 * L'attribution que tout appel doit porter. Les identifiants importent peu
 * ici ; ce qui compte est que le champ existe, parce qu'un appel facturé
 * sans propriétaire est un appel qu'aucun plafond ne pourra décompter.
 */
const ATTRIBUTION = { userId: 'u1', projectId: 'p1' };

describe('DevelopmentService', () => {
  let service: DevelopmentService;
  let claude: { generateStructuredOutput: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    claude = { generateStructuredOutput: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DevelopmentService, { provide: ClaudeService, useValue: claude }],
    }).compile();

    service = module.get<DevelopmentService>(DevelopmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('demande à ClaudeService une sortie structurée à partir du titre et de la description', async () => {
    const plan = {
      summary: 'Se concentrer sur la rétention avant l\'acquisition.',
      growth_levers: ['Bouche-à-oreille', 'Partenariats locaux'],
      key_metrics: ['Taux de rétention à 30 jours'],
      scaling_risks: ['Support client non préparé au volume'],
    };
    claude.generateStructuredOutput.mockResolvedValue(plan);

    const result = await service.createDevelopmentPlan('Mon idée', 'Une description', ATTRIBUTION);

    expect(result).toEqual(plan);
    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        userContent: expect.stringContaining('Mon idée'),
        // Le nom du générateur est vérifié ici et pas ailleurs : deux
        // étiquettes inversées entre générateurs produiraient un journal
        // de coûts parfaitement cohérent et parfaitement faux, qu'aucun
        // total ne trahirait.
        usage: { userId: 'u1', projectId: 'p1', generator: 'developper' },
      }),
    );
  });
});
