import { Test, TestingModule } from '@nestjs/testing';
import { ClaudeService } from '../claude/claude.service.js';
import { AnalysisService } from './analysis.service.js';

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

    const result = await service.analyzeProject('Mon idée', 'Une description');

    expect(result).toEqual(analysis);
    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        userContent: expect.stringContaining('Mon idée'),
      }),
    );
  });
});
