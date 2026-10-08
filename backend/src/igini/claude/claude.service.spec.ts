import {
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { OffresService } from '../../offres/offres.service.js';
import { AiUsageService } from '../usage/ai-usage.service.js';
import { CLAUDE_MODEL, CLAUDE_ORCHESTRATOR_MODEL, ClaudeService } from './claude.service.js';
import { GENERATORS_DISABLED_MESSAGE } from './generators-availability.js';

const parseMock = vi.fn();
const createMock = vi.fn();

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
    messages = { parse: parseMock, create: createMock };
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
    createMock.mockReset();
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

  describe('recherche web', () => {
    /** Un bloc `web_search_tool_result` tel que l'API le renvoie. */
    const resultatRecherche = (urls: string[]) => ({
      type: 'web_search_tool_result',
      tool_use_id: 'srvtoolu_1',
      content: urls.map((url) => ({
        type: 'web_search_result',
        url,
        title: `Titre de ${url}`,
        encrypted_content: 'chiffré',
        page_age: null,
      })),
    });

    it("ne déclare aucun outil quand webSearch n'est pas demandé", async () => {
      parseMock.mockResolvedValue({ parsed_output: { answer: 'ok' }, usage: UTILISATION });

      await genererQuelqueChose();

      expect(parseMock.mock.calls[0][0].tools).toBeUndefined();
    });

    it('déclare web_search_20260209 plafonné au nombre demandé', async () => {
      parseMock.mockResolvedValue({
        parsed_output: { answer: 'ok' },
        usage: UTILISATION,
        content: [],
        stop_reason: 'end_turn',
      });

      await service.generateStructuredOutput({
        schema,
        system: 'system',
        userContent: 'user',
        logContext: 'contexte',
        userErrorMessage: 'échec',
        usage: ATTRIBUTION,
        webSearch: { maxUses: 3 },
      });

      expect(parseMock.mock.calls[0][0].tools).toEqual([
        { type: 'web_search_20260209', name: 'web_search', max_uses: 3 },
      ]);
    });

    it('reconstruit les sources à partir des résultats de recherche renvoyés, jamais du texte du modèle', async () => {
      parseMock.mockResolvedValue({
        parsed_output: { answer: 'ok' },
        usage: UTILISATION,
        stop_reason: 'end_turn',
        content: [resultatRecherche(['https://exemple.com/a', 'https://exemple.com/b'])],
      });

      const result = await service.generateStructuredOutput({
        schema,
        system: 'system',
        userContent: 'user',
        logContext: 'contexte',
        userErrorMessage: 'échec',
        usage: ATTRIBUTION,
        webSearch: { maxUses: 3 },
      });

      expect(result.sources).toEqual([
        { title: 'Titre de https://exemple.com/a', url: 'https://exemple.com/a' },
        { title: 'Titre de https://exemple.com/b', url: 'https://exemple.com/b' },
      ]);
    });

    it('déduplique les sources par URL', async () => {
      parseMock.mockResolvedValue({
        parsed_output: { answer: 'ok' },
        usage: UTILISATION,
        stop_reason: 'end_turn',
        content: [
          resultatRecherche(['https://exemple.com/a']),
          resultatRecherche(['https://exemple.com/a', 'https://exemple.com/b']),
        ],
      });

      const result = await service.generateStructuredOutput({
        schema,
        system: 'system',
        userContent: 'user',
        logContext: 'contexte',
        userErrorMessage: 'échec',
        usage: ATTRIBUTION,
        webSearch: { maxUses: 5 },
      });

      expect(result.sources).toHaveLength(2);
    });

    it("rend un tableau de sources vide quand la recherche n'a rien trouvé — jamais une source inventée", async () => {
      parseMock.mockResolvedValue({
        parsed_output: { answer: 'ok' },
        usage: UTILISATION,
        stop_reason: 'end_turn',
        content: [],
      });

      const result = await service.generateStructuredOutput({
        schema,
        system: 'system',
        userContent: 'user',
        logContext: 'contexte',
        userErrorMessage: 'échec',
        usage: ATTRIBUTION,
        webSearch: { maxUses: 3 },
      });

      expect(result.sources).toEqual([]);
    });

    it("relance un tour en pause_turn en renvoyant l'assistant tel quel, et cumule l'usage des deux tours", async () => {
      // La seule façon documentée de continuer une recherche mise en pause
      // côté serveur. Chaque tour est déjà facturé : perdre celui du premier
      // sous-évaluerait le coût réel de l'appel.
      const premierTour = {
        parsed_output: null,
        usage: { input_tokens: 500, output_tokens: 200, server_tool_use: { web_search_requests: 2 } },
        stop_reason: 'pause_turn',
        content: [{ type: 'text', text: 'je continue…', citations: null }],
      };
      const secondTour = {
        parsed_output: { answer: 'ok' },
        usage: { input_tokens: 300, output_tokens: 150, server_tool_use: { web_search_requests: 1 } },
        stop_reason: 'end_turn',
        content: [],
      };
      parseMock.mockResolvedValueOnce(premierTour).mockResolvedValueOnce(secondTour);

      await service.generateStructuredOutput({
        schema,
        system: 'system',
        userContent: 'user',
        logContext: 'contexte',
        userErrorMessage: 'échec',
        usage: ATTRIBUTION,
        webSearch: { maxUses: 5 },
      });

      expect(parseMock).toHaveBeenCalledTimes(2);
      // Le second appel renvoie le tour en pause tel quel, en plus du
      // message d'origine.
      const deuxiemAppel = parseMock.mock.calls[1][0];
      expect(deuxiemAppel.messages).toHaveLength(2);
      expect(deuxiemAppel.messages[1]).toEqual({ role: 'assistant', content: premierTour.content });

      expect(aiUsage.record).toHaveBeenCalledWith({
        context: ATTRIBUTION,
        model: 'claude-opus-5',
        usage: {
          input_tokens: 800,
          output_tokens: 350,
          output_tokens_details: { thinking_tokens: 0 },
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          server_tool_use: { web_search_requests: 3 },
        },
        durationMs: expect.any(Number),
      });
    });

    it('abandonne après un nombre borné de reprises plutôt que de relancer indéfiniment', async () => {
      const enPause = {
        parsed_output: null,
        usage: UTILISATION,
        stop_reason: 'pause_turn',
        content: [],
      };
      parseMock.mockResolvedValue(enPause);

      await expect(
        service.generateStructuredOutput({
          schema,
          system: 'system',
          userContent: 'user',
          logContext: 'contexte',
          userErrorMessage: 'échec',
          usage: ATTRIBUTION,
          webSearch: { maxUses: 5 },
        }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      // Le tour initial, plus au plus MAX_PAUSE_RESUMPTIONS reprises — pas
      // une boucle qui continuerait à facturer indéfiniment.
      expect(parseMock.mock.calls.length).toBeLessThanOrEqual(5);
    });
  });

  describe('ce que l offre couvre', () => {
    // Les six generateurs passent par ce point unique : un controle pose
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

  describe('converseWithTools', () => {
    const CHAT_ATTRIBUTION = { userId: 'u1', projectId: null, generator: 'discuter' } as const;
    const UN_OUTIL: Anthropic.Tool = {
      name: 'lister_projets',
      description: 'Liste les projets.',
      input_schema: { type: 'object', properties: {}, required: [] },
    };

    function reponseTexte(texte: string) {
      return { content: [{ type: 'text', text: texte }], usage: UTILISATION };
    }

    function reponseToolUse(id: string, name: string, input: unknown) {
      return { content: [{ type: 'tool_use', id, name, input }], usage: UTILISATION };
    }

    const converser = (executeTool = vi.fn()) =>
      service.converseWithTools({
        systemPrompt: 'system',
        messages: [{ role: 'user', content: 'Salut Igini' }],
        usage: CHAT_ATTRIBUTION,
        tools: [UN_OUTIL],
        executeTool,
      });

    it("n'envoie AUCUNE requête quand les générateurs sont éteints", async () => {
      env.current = { IGINI_AI_ENABLED: 'false' };

      await expect(converser()).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('refuse avant tout appel réseau quand le plafond de coût global est atteint', async () => {
      aiUsage.assertWithinQuota.mockRejectedValue(
        new HttpException('Plafond atteint.', HttpStatus.PAYMENT_REQUIRED),
      );

      await expect(converser()).rejects.toBeInstanceOf(HttpException);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('utilise un modèle distinct de celui des générateurs, et journalise dessous', async () => {
      createMock.mockResolvedValue(reponseTexte('Salut !'));

      await converser();

      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ model: CLAUDE_ORCHESTRATOR_MODEL }));
      expect(CLAUDE_ORCHESTRATOR_MODEL).not.toBe(CLAUDE_MODEL);
      expect(aiUsage.record).toHaveBeenCalledWith(
        expect.objectContaining({ context: CHAT_ATTRIBUTION, model: CLAUDE_ORCHESTRATOR_MODEL }),
      );
    });

    it("n'appelle jamais offres.exiger — le tour de conversation reste hors du système d'offres", async () => {
      createMock.mockResolvedValue(reponseTexte('Salut !'));

      await converser();

      expect(offres.exiger).not.toHaveBeenCalled();
    });

    it('répond directement quand Claude ne demande aucun outil', async () => {
      createMock.mockResolvedValue(reponseTexte('Bonjour, comment puis-je aider ?'));

      const result = await converser();

      expect(result).toBe('Bonjour, comment puis-je aider ?');
      expect(createMock).toHaveBeenCalledTimes(1);
    });

    it('exécute un outil demandé puis renvoie la réponse finale du tour suivant', async () => {
      createMock
        .mockResolvedValueOnce(reponseToolUse('t1', 'lister_projets', {}))
        .mockResolvedValueOnce(reponseTexte('Tu as un projet : Boulangerie.'));
      const executeTool = vi.fn().mockResolvedValue({ content: '[{"id":"p1"}]', isError: false });

      const result = await converser(executeTool);

      expect(executeTool).toHaveBeenCalledWith('lister_projets', {});
      expect(result).toBe('Tu as un projet : Boulangerie.');
      expect(createMock).toHaveBeenCalledTimes(2);
      // Le deuxième appel doit porter le tool_result rattaché au bon tool_use_id.
      const secondAppel = createMock.mock.calls[1][0];
      const dernierMessage = secondAppel.messages[secondAppel.messages.length - 1];
      expect(dernierMessage).toEqual({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 't1', content: '[{"id":"p1"}]', is_error: false }],
      });
    });

    it("n'exécute JAMAIS un outil sur le dernier tour autorisé — un générateur payant ne doit jamais tourner sans qu'on puisse en rendre compte", async () => {
      // Les 3 appels renvoient tous du tool_use : aucun n'est le dernier mot.
      createMock
        .mockResolvedValueOnce(reponseToolUse('t1', 'lister_projets', {}))
        .mockResolvedValueOnce(reponseToolUse('t2', 'lister_projets', {}))
        .mockResolvedValueOnce(reponseToolUse('t3', 'analyser', { project_id: 'p1' }));
      const executeTool = vi.fn().mockResolvedValue({ content: '[]', isError: false });

      const result = await converser(executeTool);

      expect(createMock).toHaveBeenCalledTimes(3);
      // Seuls les 2 premiers tool_use (tours 1 et 2) sont exécutés — jamais le 3e.
      expect(executeTool).toHaveBeenCalledTimes(2);
      expect(executeTool).not.toHaveBeenCalledWith('analyser', { project_id: 'p1' });
      expect(result).toBe("Je n'ai pas pu terminer cette demande, peux-tu préciser ?");
    });

    it("un générateur déclenché sur l'avant-dernier tour n'est jamais perdu en silence — le dernier tour est forcé en texte, pas juste dépourvu d'exécution", async () => {
      // Trouvaille de la revue finale : la seule garde « jamais exécuter sur
      // le dernier tour » ne suffit pas. Si le générateur tourne sur
      // l'AVANT-dernier tour (ici le 2e sur 3) et que le modèle tente un
      // NOUVEL outil au tour suivant, l'ancienne version retombait sur le
      // message de repli sans jamais dire que l'analyse avait bien eu lieu
      // — payée et enregistrée, mais invisible pour la personne.
      createMock
        .mockResolvedValueOnce(reponseToolUse('t1', 'lister_projets', {}))
        .mockResolvedValueOnce(reponseToolUse('t2', 'analyser', { project_id: 'p1' }))
        .mockResolvedValueOnce(reponseTexte('Analyse terminée : faisabilité 7/10.'));
      const executeTool = vi
        .fn()
        .mockResolvedValueOnce({ content: '[]', isError: false })
        .mockResolvedValueOnce({ content: '{"feasibility_score":7}', isError: false });

      const result = await converser(executeTool);

      expect(executeTool).toHaveBeenCalledWith('analyser', { project_id: 'p1' });
      expect(result).toBe('Analyse terminée : faisabilité 7/10.');
      // Le 3e appel (dernier tour) ne doit proposer aucun outil : c'est ce
      // qui force la réponse texte plutôt que de compter sur le fait que
      // le modèle choisisse de ne pas en demander.
      expect(createMock.mock.calls[2][0]).not.toHaveProperty('tools');
    });

    it("lève une InternalServerErrorException si l'appel Claude échoue", async () => {
      createMock.mockRejectedValue(new Error('network error'));

      await expect(converser()).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });
});
