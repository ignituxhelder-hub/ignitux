import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { ScoringController } from './scoring.controller.js';
import { ScoringService } from './scoring.service.js';

describe('ScoringController', () => {
  let controller: ScoringController;
  let scoringService: { getScoreCard: ReturnType<typeof vi.fn> };
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    scoringService = { getScoreCard: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScoringController],
      providers: [{ provide: ScoringService, useValue: scoringService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ScoringController>(ScoringController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getScoreCard délègue au service', async () => {
    const scoreCard = {
      etincelle: 7,
      construction: null,
      evolution: null,
      transmission: null,
      confiance: 2,
    };
    scoringService.getScoreCard.mockResolvedValue(scoreCard);

    const result = await controller.getScoreCard(currentUser, 'p1');

    expect(scoringService.getScoreCard).toHaveBeenCalledWith('u1', 'p1');
    expect(result).toEqual(scoreCard);
  });
});
