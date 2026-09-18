import { InternalServerErrorException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AnalysisService } from './analysis.service.js';

const parseMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { parse: parseMock };
  },
}));

describe('AnalysisService', () => {
  let service: AnalysisService;

  beforeEach(async () => {
    parseMock.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnalysisService],
    }).compile();

    service = module.get<AnalysisService>(AnalysisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('renvoie l\'analyse structurée quand Claude répond correctement', async () => {
    const analysis = {
      summary: 'Idée prometteuse.',
      feasibility_score: 7,
      strengths: ['Marché clair'],
      risks: ['Concurrence forte'],
      next_steps: ['Valider avec 10 clients'],
    };
    parseMock.mockResolvedValue({ parsed_output: analysis });

    const result = await service.analyzeProject('Mon idée', 'Une description');

    expect(result).toEqual(analysis);
  });

  it("lève une InternalServerErrorException si Claude ne renvoie pas de sortie exploitable", async () => {
    parseMock.mockResolvedValue({ parsed_output: null });

    await expect(service.analyzeProject('Mon idée', null)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it("lève une InternalServerErrorException si l'appel Claude échoue", async () => {
    parseMock.mockRejectedValue(new Error('network error'));

    await expect(service.analyzeProject('Mon idée', null)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
