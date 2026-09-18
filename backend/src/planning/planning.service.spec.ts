import { Test, TestingModule } from '@nestjs/testing';
import { ClaudeService } from '../claude/claude.service.js';
import { PlanningService } from './planning.service.js';

describe('PlanningService', () => {
  let service: PlanningService;
  let claude: { generateStructuredOutput: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    claude = { generateStructuredOutput: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PlanningService, { provide: ClaudeService, useValue: claude }],
    }).compile();

    service = module.get<PlanningService>(PlanningService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('demande à ClaudeService une sortie structurée à partir du titre et de la description', async () => {
    const plan = {
      summary: 'Commencer par un MVP minimal.',
      estimated_timeline: '3 à 6 mois',
      milestones: ['Valider le besoin', 'Construire un MVP'],
      key_resources: ['Un développeur', 'Un budget de test'],
    };
    claude.generateStructuredOutput.mockResolvedValue(plan);

    const result = await service.createBuildPlan('Mon idée', 'Une description');

    expect(result).toEqual(plan);
    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        userContent: expect.stringContaining('Mon idée'),
      }),
    );
  });
});
