import { Test, TestingModule } from '@nestjs/testing';
import { ClaudeService } from '../claude/claude.service.js';
import { TransmissionService } from './transmission.service.js';

describe('TransmissionService', () => {
  let service: TransmissionService;
  let claude: { generateStructuredOutput: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    claude = { generateStructuredOutput: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TransmissionService, { provide: ClaudeService, useValue: claude }],
    }).compile();

    service = module.get<TransmissionService>(TransmissionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('demande à ClaudeService une sortie structurée à partir du titre et de la description', async () => {
    const plan = {
      summary: 'Documenter les processus avant toute transmission.',
      transfer_options: ['Association avec un repreneur'],
      key_documentation: ['Contrats fournisseurs'],
      readiness_checklist: ['Formaliser les processus clés'],
    };
    claude.generateStructuredOutput.mockResolvedValue(plan);

    const result = await service.createTransmissionPlan('Mon idée', 'Une description');

    expect(result).toEqual(plan);
    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        userContent: expect.stringContaining('Mon idée'),
      }),
    );
  });
});
