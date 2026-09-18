import { InternalServerErrorException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { z } from 'zod';
import { ClaudeService } from './claude.service.js';

const parseMock = vi.fn();

// vi.mock est hissé en haut du fichier : les classes qu'il référence doivent
// être déclarées via vi.hoisted pour être disponibles à ce moment-là, et
// réutilisables telles quelles dans les tests (new AuthenticationError(...)).
const { AnthropicError, APIError, AuthenticationError, RateLimitError, APIConnectionError, APIConnectionTimeoutError } =
  vi.hoisted(() => {
    class AnthropicError extends Error {}
    class APIError extends AnthropicError {}
    class AuthenticationError extends APIError {}
    class RateLimitError extends APIError {}
    class APIConnectionError extends AnthropicError {}
    class APIConnectionTimeoutError extends APIConnectionError {}
    return { AnthropicError, APIError, AuthenticationError, RateLimitError, APIConnectionError, APIConnectionTimeoutError };
  });

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { parse: parseMock };
  }
  Object.assign(MockAnthropic, {
    AnthropicError,
    APIError,
    AuthenticationError,
    RateLimitError,
    APIConnectionError,
    APIConnectionTimeoutError,
  });
  return { default: MockAnthropic };
});

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

  it('renvoie le message générique fourni pour une erreur non reconnue', async () => {
    parseMock.mockRejectedValue(new Error('mystère'));

    await expect(
      service.generateStructuredOutput({
        schema,
        system: 'system',
        userContent: 'user',
        logContext: 'contexte',
        userErrorMessage: 'échec générique',
      }),
    ).rejects.toMatchObject({ message: 'échec générique' });
  });

  it("signale un problème de configuration côté serveur quand aucune clé n'est configurée du tout (cas réel actuel)", async () => {
    // Le SDK Anthropic ne lève pas une AuthenticationError dans ce cas
    // précis : une simple Error, avant même de tenter l'appel réseau.
    parseMock.mockRejectedValue(
      new Error(
        'Could not resolve authentication method. Expected one of apiKey, authToken, credentials, config, or profile to be set.',
      ),
    );

    await expect(
      service.generateStructuredOutput({
        schema,
        system: 'system',
        userContent: 'user',
        logContext: 'contexte',
        userErrorMessage: 'échec générique',
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("n'est pas encore configuré"),
    });
  });

  it("signale un problème de configuration côté serveur sur une erreur d'authentification, sans exposer le détail", async () => {
    parseMock.mockRejectedValue(new AuthenticationError('invalid x-api-key'));

    await expect(
      service.generateStructuredOutput({
        schema,
        system: 'system',
        userContent: 'user',
        logContext: 'contexte',
        userErrorMessage: 'échec générique',
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("n'est pas encore configuré"),
    });
  });

  it('signale une surcharge sur une erreur de rate limit', async () => {
    parseMock.mockRejectedValue(new RateLimitError('rate limited'));

    await expect(
      service.generateStructuredOutput({
        schema,
        system: 'system',
        userContent: 'user',
        logContext: 'contexte',
        userErrorMessage: 'échec générique',
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('trop de demandes'),
    });
  });

  it('signale un problème de connexion sur une erreur réseau du SDK (y compris timeout)', async () => {
    parseMock.mockRejectedValue(new APIConnectionTimeoutError('timed out'));

    await expect(
      service.generateStructuredOutput({
        schema,
        system: 'system',
        userContent: 'user',
        logContext: 'contexte',
        userErrorMessage: 'échec générique',
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Impossible de contacter'),
    });
  });
});
