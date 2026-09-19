import { Test, TestingModule } from '@nestjs/testing';
import { ClaudeService } from '../claude/claude.service.js';
import { AnalysisService } from './analysis.service.js';

/**
 * L'attribution que tout appel doit porter. Les identifiants importent peu
 * ici ; ce qui compte est que le champ existe, parce qu'un appel facturé
 * sans propriétaire est un appel qu'aucun plafond ne pourra décompter.
 */
const ATTRIBUTION = { userId: 'u1', projectId: 'p1' };

describe('AnalysisService', () => {
  let service: AnalysisService;
  let claude: { generateStructuredOutput: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    claude = { generateStructuredOutput: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AnalysisService, { provide: ClaudeService, useValue: claude }],
    }).compile();

    service = module.get<AnalysisService>(AnalysisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('demande à ClaudeService une sortie structurée à partir du titre et de la description', async () => {
    const analysis = {
      summary: 'Idée prometteuse.',
      feasibility_score: 7,
      strengths: ['Marché clair'],
      risks: ['Concurrence forte'],
      next_steps: ['Valider avec 10 clients'],
    };
    claude.generateStructuredOutput.mockResolvedValue(analysis);

    const result = await service.analyzeProject('Mon idée', 'Une description', ATTRIBUTION);

    expect(result).toEqual(analysis);
    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        userContent: expect.stringContaining('Mon idée'),
        // Le nom du générateur est vérifié ici et pas ailleurs : deux
        // étiquettes inversées entre générateurs produiraient un journal
        // de coûts parfaitement cohérent et parfaitement faux, qu'aucun
        // total ne trahirait.
        usage: { userId: 'u1', projectId: 'p1', generator: 'analyser' },
      }),
    );
  });
});
