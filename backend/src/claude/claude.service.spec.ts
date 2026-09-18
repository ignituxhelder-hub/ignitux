import { InternalServerErrorException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { z } from 'zod';
import { ClaudeService } from './claude.service.js';

const parseMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { parse: parseMock };
  },
}));

const schema = z.object({ answer: z.string() });

describe('ClaudeService', () => {
  let service: ClaudeService;

  beforeEach(async () => {
    parseMock.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClaudeService],
    }).compile();

    service = module.get<ClaudeService>(ClaudeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('renvoie la sortie structurée quand Claude répond correctement', async () => {
    parseMock.mockResolvedValue({ parsed_output: { answer: '42' } });

    const result = await service.generateStructuredOutput({
      schema,
      system: 'system',
      userContent: 'user',
      logContext: 'contexte',
      userErrorMessage: 'échec',
    });

    expect(result).toEqual({ answer: '42' });
  });

  it("lève une InternalServerErrorException avec le message fourni si parsed_output est manquant", async () => {
    parseMock.mockResolvedValue({ parsed_output: null });

    await expect(
      service.generateStructuredOutput({
        schema,
        system: 'system',
        userContent: 'user',
        logContext: 'contexte',
        userErrorMessage: 'échec spécifique',
      }),
    ).rejects.toMatchObject({ message: 'échec spécifique' });
  });

  it("lève une InternalServerErrorException si l'appel Claude échoue", async () => {
    parseMock.mockRejectedValue(new Error('network error'));

    await expect(
      service.generateStructuredOutput({
        schema,
        system: 'system',
        userContent: 'user',
        logContext: 'contexte',
        userErrorMessage: 'échec',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
