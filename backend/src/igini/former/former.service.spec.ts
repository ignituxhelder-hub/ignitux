import { Test, TestingModule } from '@nestjs/testing';
import { ClaudeService } from '../claude/claude.service.js';
import { FormerService } from './former.service.js';

const ATTRIBUTION = { userId: 'u1', projectId: 'p1' };

describe('FormerService', () => {
  let service: FormerService;
  let claude: { generateStructuredOutput: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    claude = { generateStructuredOutput: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [FormerService, { provide: ClaudeService, useValue: claude }],
    }).compile();

    service = module.get<FormerService>(FormerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('demande à ClaudeService une recommandation, avec recherche web activée', async () => {
    const recommandation = {
      recommended_form: 'SASU',
      rationale: "Porté seul, avec une ambition de chiffre d'affaires au-delà des plafonds de la micro-entreprise.",
      assumptions: [],
      alternatives: [
        { form: 'EURL', why_not_chosen: 'Régime social moins souple pour lever des fonds plus tard.' },
      ],
      points_to_check: [],
      sources: [],
    };
    claude.generateStructuredOutput.mockResolvedValue(recommandation);

    const result = await service.recommendLegalForm('Mon idée', 'Une description', ATTRIBUTION);

    expect(result).toEqual(recommandation);
    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        userContent: expect.stringContaining('Mon idée'),
        // Le générateur est vérifié ici pour la même raison que pour les
        // cinq autres : une étiquette inversée produirait un journal de
        // coûts cohérent et parfaitement faux.
        usage: { userId: 'u1', projectId: 'p1', generator: 'former' },
        webSearch: { maxUses: 5 },
      }),
    );
  });

  it('transmet le contexte (mémoire IGINI, étapes précédentes) quand il est fourni', async () => {
    claude.generateStructuredOutput.mockResolvedValue({
      recommended_form: 'micro-entreprise',
      rationale: 'r',
      assumptions: [],
      alternatives: [],
      points_to_check: [],
      sources: [],
    });

    await service.recommendLegalForm('Titre', 'Description', ATTRIBUTION, 'Contexte : freelance déjà déclaré.');

    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        userContent: expect.stringContaining('freelance déjà déclaré'),
      }),
    );
  });
});
