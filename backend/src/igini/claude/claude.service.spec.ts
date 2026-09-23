import {
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { z } from 'zod';
import { OffresService } from '../../offres/offres.service.js';
import { AiUsageService } from '../usage/ai-usage.service.js';
import { ClaudeService } from './claude.service.js';
import { GENERATORS_DISABLED_MESSAGE } from './generators-availability.js';

const parseMock = vi.fn();

// getEnv() valide process.env avec Zod et appelle process.exit(1) si la
// configuration est incomplète : inutilisable tel quel dans un test.
const env = vi.hoisted(() => ({ current: {} as Record<string, string | undefined> }));
vi.mock('../../config/env.js', () => ({ getEnv: () => env.current }));

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

/** L'attribution que toute requête doit désormais porter. */
const ATTRIBUTION = { userId: 'u1', projectId: 'p1', generator: 'analyser' } as const;

/**
 * Un bloc `usage` tel que le SDK le renvoie. Les vrais appels en produisent
 * toujours un ; les anciens mocks n'en avaient aucun, ce qui laissait croire
 * que le code tenait alors qu'il ne lisait rien.
 */
const UTILISATION = {
  input_tokens: 1200,
  output_tokens: 900,
  output_tokens_details: { thinking_tokens: 300 },
  cache_creation_input_tokens: null,
  cache_read_input_tokens: null,
};

describe('ClaudeService', () => {
  let service: ClaudeService;
  let aiUsage: {
    record: ReturnType<typeof vi.fn>;
    assertWithinQuota: ReturnType<typeof vi.fn>;
    callsThisMonth: ReturnType<typeof vi.fn>;
  };
  let offres: { exiger: ReturnType<typeof vi.fn> };

  /** Une generation ordinaire, pour les tests qui n eprouvent pas la requete. */
  const genererQuelqueChose = () =>
    service.generateStructuredOutput({
      schema,
      system: 'system',
      userContent: 'user',
      logContext: 'contexte',
      userErrorMessage: 'échec',
      usage: ATTRIBUTION,
    });

  beforeEach(async () => {
    parseMock.mockReset();
    env.current = {};
    aiUsage = {
      record: vi.fn().mockResolvedValue(undefined),
      assertWithinQuota: vi.fn().mockResolvedValue(undefined),
      callsThisMonth: vi.fn().mockResolvedValue(0),
    };
    // Ce que l offre couvre est verifie au meme endroit que le plafond.
    // Un faux permissif ici : ces tests eprouvent l appel, pas les droits,
    // qui ont leur propre suite.
    offres = { exiger: vi.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaudeService,
        { provide: AiUsageService, useValue: aiUsage },
        { provide: OffresService, useValue: offres },
      ],
    }).compile();

    service = module.get<ClaudeService>(ClaudeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('interrupteur des générateurs', () => {
    it("n'envoie AUCUNE requête quand les générateurs sont éteints", async () => {
      // Le test central du dispositif : ce qui compte n'est pas le message
      // renvoyé, c'est que l'appel réseau n'ait pas lieu. Tant que cette
      // assertion tient, un environnement éteint ne peut pas dépenser un
      // centime de budget IA.
      env.current = { IGINI_AI_ENABLED: 'false' };

      await expect(
        service.generateStructuredOutput({
          schema,
          system: 'system',
          userContent: 'user',
          logContext: 'contexte',
          userErrorMessage: 'échec',
          usage: ATTRIBUTION,
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(parseMock).not.toHaveBeenCalled();
    });

    it("explique que c'est éteint volontairement, pas en panne", async () => {
      env.current = { IGINI_AI_ENABLED: 'false' };

      await expect(
        service.generateStructuredOutput({
          schema,
          system: 'system',
          userContent: 'user',
          logContext: 'contexte',
          userErrorMessage: 'échec',
          usage: ATTRIBUTION,
        }),
      ).rejects.toMatchObject({ message: GENERATORS_DISABLED_MESSAGE });
    });

    it('expose son état pour que le frontend sache avant de proposer', () => {
      env.current = { IGINI_AI_ENABLED: 'false' };
      expect(service.availability()).toEqual({
        enabled: false,
        reason: GENERATORS_DISABLED_MESSAGE,
      });

      env.current = {};
      expect(service.availability()).toEqual({ enabled: true, reason: null });
    });

    it("relit l'interrupteur à chaque appel plutôt que de le figer", async () => {
      // Une valeur mémorisée au démarrage survivrait à un changement de
      // configuration : on croirait le budget coupé alors qu'il ne l'est
      // plus, ou l'inverse.
      expect(service.availability().enabled).toBe(true);

      env.current = { IGINI_AI_ENABLED: 'false' };

      expect(service.availability().enabled).toBe(false);
      await expect(
        service.generateStructuredOutput({
          schema,
          system: 'system',
          userContent: 'user',
          logContext: 'contexte',
          userErrorMessage: 'échec',
          usage: ATTRIBUTION,
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('laisse passer les appels quand rien ne les éteint', async () => {
      parseMock.mockResolvedValue({ parsed_output: { answer: 'ok' }, usage: UTILISATION });

      await service.generateStructuredOutput({
        schema,
        system: 'system',
        userContent: 'user',
        logContext: 'contexte',
        userErrorMessage: 'échec',
        usage: ATTRIBUTION,
      });

      expect(parseMock).toHaveBeenCalledTimes(1);
    });
  });

  it('renvoie la sortie structurée quand Claude répond correctement', async () => {
    parseMock.mockResolvedValue({ parsed_output: { answer: '42' }, usage: UTILISATION });

    const result = await service.generateStructuredOutput({
      schema,
      system: 'system',
      userContent: 'user',
      logContext: 'contexte',
      userErrorMessage: 'échec',
      usage: ATTRIBUTION,
    });

    expect(result).toEqual({ answer: '42' });
  });

  it("lève une InternalServerErrorException avec le message fourni si parsed_output est manquant", async () => {
    parseMock.mockResolvedValue({ parsed_output: null, usage: UTILISATION });

    await expect(
      service.generateStructuredOutput({
        schema,
        system: 'system',
        userContent: 'user',
        logContext: 'contexte',
        userErrorMessage: 'échec spécifique',
        usage: ATTRIBUTION,
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
        usage: ATTRIBUTION,
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
        usage: ATTRIBUTION,
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
        usage: ATTRIBUTION,
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
        usage: ATTRIBUTION,
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
        usage: ATTRIBUTION,
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
        usage: ATTRIBUTION,
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Impossible de contacter'),
    });
  });

    describe('plafond mensuel', () => {
    it('refuse AVANT tout appel réseau quand le plafond est atteint', async () => {
      // Le point entier du dispositif : un plafond vérifié après la dépense
      // ne borne rien. Ce qui compte n'est pas le code renvoyé, c'est que
      // `parse` n'ait pas été appelé.
      const refus = new HttpException('Tes 5 analyses sont consommées.', HttpStatus.PAYMENT_REQUIRED);
      aiUsage.assertWithinQuota.mockRejectedValue(refus);

      await expect(
        service.generateStructuredOutput({
          schema,
          system: 'system',
          userContent: 'user',
          logContext: 'contexte',
          userErrorMessage: 'échec',
          usage: ATTRIBUTION,
        }),
      ).rejects.toBe(refus);

      expect(parseMock).not.toHaveBeenCalled();
      expect(aiUsage.record).not.toHaveBeenCalled();
    });

    it('laisse le 402 ressortir tel quel, sans le changer en 500', async () => {
      // Le refus est vérifié HORS du try : le catch traduit toute exception
      // en InternalServerErrorException, et un plafond avalé là ressortirait
      // en « erreur interne ». La personne ne saurait pas que son forfait est
      // consommé — elle croirait le produit cassé.
      aiUsage.assertWithinQuota.mockRejectedValue(
        new HttpException('Plafond atteint.', HttpStatus.PAYMENT_REQUIRED),
      );

      await expect(
        service.generateStructuredOutput({
          schema,
          system: 'system',
          userContent: 'user',
          logContext: 'contexte',
          userErrorMessage: 'échec',
          usage: ATTRIBUTION,
        }),
      ).rejects.toMatchObject({ status: HttpStatus.PAYMENT_REQUIRED });
    });

    it("ne consulte même pas le plafond quand l'interrupteur est éteint", async () => {
      // L'ordre compte : inutile d'aller lire une consommation pour une
      // fonctionnalité coupée. Et le message doit rester « éteint
      // volontairement », pas « forfait consommé ».
      env.current = { IGINI_AI_ENABLED: 'false' };

      await expect(
        service.generateStructuredOutput({
          schema,
          system: 'system',
          userContent: 'user',
          logContext: 'contexte',
          userErrorMessage: 'échec',
          usage: ATTRIBUTION,
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(aiUsage.assertWithinQuota).not.toHaveBeenCalled();
    });

    it('vérifie le plafond de la personne qui appelle, pas d’une autre', async () => {
      parseMock.mockResolvedValue({ parsed_output: { answer: 'ok' }, usage: UTILISATION });

      await service.generateStructuredOutput({
        schema,
        system: 'system',
        userContent: 'user',
        logContext: 'contexte',
        userErrorMessage: 'échec',
        usage: ATTRIBUTION,
      });

      expect(aiUsage.assertWithinQuota).toHaveBeenCalledWith(ATTRIBUTION.userId);
    });
  });

  describe('journal des coûts', () => {
    it("enregistre ce que l'appel a réellement coûté", async () => {
      // Avant ce dispositif, response.usage était lu par le SDK puis jeté.
      // Cette seule omission rendait le coût réel inconnaissable, le plafond
      // impossible et toute statistique invérifiable.
      parseMock.mockResolvedValue({ parsed_output: { answer: 'ok' }, usage: UTILISATION });

      await service.generateStructuredOutput({
        schema,
        system: 'system',
        userContent: 'user',
        logContext: 'contexte',
        userErrorMessage: 'échec',
        usage: ATTRIBUTION,
      });

      expect(aiUsage.record).toHaveBeenCalledTimes(1);
      expect(aiUsage.record).toHaveBeenCalledWith({
        context: ATTRIBUTION,
        model: 'claude-opus-5',
        usage: UTILISATION,
        durationMs: expect.any(Number),
      });
    });

    it('enregistre aussi les appels dont la réponse est inexploitable', async () => {
      // Le cas le plus facile à oublier, et le plus cher à oublier : une
      // réponse que le schéma refuse a quand même consommé ses tokens. Ne pas
      // la compter reviendrait à faire disparaître des totaux précisément les
      // appels payés sans rien rendre.
      parseMock.mockResolvedValue({ parsed_output: null, usage: UTILISATION });

      await expect(
        service.generateStructuredOutput({
          schema,
          system: 'system',
          userContent: 'user',
          logContext: 'contexte',
          userErrorMessage: 'échec',
          usage: ATTRIBUTION,
        }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(aiUsage.record).toHaveBeenCalledTimes(1);
    });

    it("n'enregistre rien quand l'interrupteur est éteint", async () => {
      env.current = { IGINI_AI_ENABLED: 'false' };

      await expect(
        service.generateStructuredOutput({
          schema,
          system: 'system',
          userContent: 'user',
          logContext: 'contexte',
          userErrorMessage: 'échec',
          usage: ATTRIBUTION,
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      // Rien n'a été dépensé, donc rien ne doit apparaître au journal : un
      // zéro inscrit fausserait le compte des appels autant qu'un oubli.
      expect(aiUsage.record).not.toHaveBeenCalled();
    });

    it("n'enregistre rien quand l'appel n'a jamais abouti", async () => {
      parseMock.mockRejectedValue(new APIConnectionError('réseau'));

      await expect(
        service.generateStructuredOutput({
          schema,
          system: 'system',
          userContent: 'user',
          logContext: 'contexte',
          userErrorMessage: 'échec',
          usage: ATTRIBUTION,
        }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(aiUsage.record).not.toHaveBeenCalled();
    });

    it('ne fait pas perdre son résultat à la personne quand le journal tombe en panne', async () => {
      // La hiérarchie est explicite : entre perdre une ligne de comptabilité
      // et perdre quarante secondes de travail déjà payées, c'est la ligne
      // qui saute. Ce test verrouille ce choix.
      parseMock.mockResolvedValue({ parsed_output: { answer: '42' }, usage: UTILISATION });
      aiUsage.record.mockRejectedValue(new Error('base injoignable'));

      await expect(
        service.generateStructuredOutput({
          schema,
          system: 'system',
          userContent: 'user',
          logContext: 'contexte',
          userErrorMessage: 'échec',
          usage: ATTRIBUTION,
        }),
      ).resolves.toEqual({ answer: '42' });
    });
  });

  describe('ce que l offre couvre', () => {
    // Les cinq generateurs passent par ce point unique : un controle pose
    // ici ne peut etre oublie par aucun d entre eux.
    it('verifie les droits avant tout appel reseau', async () => {
      offres.exiger.mockRejectedValue(new Error('offre insuffisante'));

      await expect(genererQuelqueChose()).rejects.toThrow();
      expect(parseMock).not.toHaveBeenCalled();
    });

    it('transmet le generateur reellement appele', async () => {
      parseMock.mockResolvedValue({ parsed_output: { answer: 'ok' }, usage: UTILISATION });

      await genererQuelqueChose();

      const action = offres.exiger.mock.calls[0][1];
      expect(action.kind).toBe('generer');
      expect(action.generateur).toBe('analyser');
    });

    // Le plafond technique protege le budget d Ignitux ; l offre decrit ce
    // que la personne a souscrit. Repondre « plafond atteint » a quelqu un
    // dont l offre n inclut pas ce generateur lui ferait attendre un mois
    // pour rien.
    it('passe par l offre avant le plafond technique', async () => {
      offres.exiger.mockRejectedValue(new Error('offre insuffisante'));

      await expect(genererQuelqueChose()).rejects.toThrow();
      expect(aiUsage.assertWithinQuota).not.toHaveBeenCalled();
    });
  });
});
