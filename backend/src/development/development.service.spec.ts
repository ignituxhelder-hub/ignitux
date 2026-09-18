import { Test, TestingModule } from '@nestjs/testing';
import { ClaudeService } from '../claude/claude.service.js';
import { DevelopmentService } from './development.service.js';

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

    const result = await service.createDevelopmentPlan('Mon idée', 'Une description');

    expect(result).toEqual(plan);
    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        userContent: expect.stringContaining('Mon idée'),
      }),
    );
  });
});
