import { Test, TestingModule } from '@nestjs/testing';
import { ClaudeService } from '../claude/claude.service.js';
import { FinancingService } from './financing.service.js';

describe('FinancingService', () => {
  let service: FinancingService;
  let claude: { generateStructuredOutput: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    claude = { generateStructuredOutput: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [FinancingService, { provide: ClaudeService, useValue: claude }],
    }).compile();

    service = module.get<FinancingService>(FinancingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('demande à ClaudeService une sortie structurée à partir du titre et de la description', async () => {
    const plan = {
      summary: 'Commencer en autofinancement.',
      estimated_budget: '5 000 € à 15 000 €',
      funding_sources: ['Autofinancement', 'Subvention locale'],
      budget_breakdown: ['Développement', 'Marketing initial'],
    };
    claude.generateStructuredOutput.mockResolvedValue(plan);

    const result = await service.createFinancingPlan('Mon idée', 'Une description');

    expect(result).toEqual(plan);
    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        userContent: expect.stringContaining('Mon idée'),
      }),
    );
  });
});
