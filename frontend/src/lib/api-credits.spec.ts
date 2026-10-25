import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  ApiError,
  creditsInsuffisants,
  estPlafondSecurite,
  readOfflineState,
  setOfflineStorage,
  setUtilisateurActif,
} from './api';

/**
 * LES CRÉDITS IGINI, CÔTÉ API.
 *
 * Le serveur refuse une action IGINI en 402 avec un `code` : la phrase dit
 * tout à la personne, le code dit à l'interface quoi proposer (voir mes
 * crédits, ou rien quand c'est le garde-fou de coût). Les chiffres `requis` et
 * `disponible` voyagent avec, pour ne jamais avoir à relire la phrase.
 */

beforeEach(() => setUtilisateurActif('u1'));
afterEach(() => {
  setUtilisateurActif(null);
  setOfflineStorage(null);
  vi.restoreAllMocks();
});

function reponse(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

function appelEnvoye(): { url: string; init: RequestInit } {
  const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
    string,
    RequestInit,
  ];
  return { url, init };
}

function stockage() {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    key: (i: number) => [...entries.keys()][i] ?? null,
    getItem: (k: string) => entries.get(k) ?? null,
    setItem: (k: string, v: string) => void entries.set(k, v),
    removeItem: (k: string) => void entries.delete(k),
    entries,
  };
}

describe('le refus « crédits insuffisants »', () => {
  it('garde le code, le prix et le solde du serveur', async () => {
    reponse(402, {
      statusCode: 402,
      code: 'credits_insuffisants',
      message: 'Crédits insuffisants : il te faut 4 crédits, tu en as 1.',
      requis: 4,
      disponible: 1,
    });

    const erreur = await api.analyzeProject('t', 'p1').catch((e: unknown) => e);

    expect(erreur).toBeInstanceOf(ApiError);
    expect(erreur).toMatchObject({
      status: 402,
      code: 'credits_insuffisants',
      message: 'Crédits insuffisants : il te faut 4 crédits, tu en as 1.',
    });
    expect(creditsInsuffisants(erreur)).toEqual({ requis: 4, disponible: 1 });
    expect(estPlafondSecurite(erreur)).toBe(false);
  });

  it('ne confond pas le garde-fou de coût avec un solde trop bas', async () => {
    reponse(402, { statusCode: 402, code: 'plafond_securite', message: 'Garde-fou de coût IA atteint.' });

    const erreur = await api.analyzeProject('t', 'p1').catch((e: unknown) => e);

    expect(erreur).toMatchObject({ status: 402, code: 'plafond_securite' });
    expect(creditsInsuffisants(erreur)).toBeNull();
    expect(estPlafondSecurite(erreur)).toBe(true);
  });

  it('ne reconnaît rien dans une erreur ordinaire', () => {
    expect(creditsInsuffisants(new ApiError('Non.', 403))).toBeNull();
    expect(creditsInsuffisants(new Error('panne'))).toBeNull();
    expect(creditsInsuffisants(null)).toBeNull();
  });
});

describe('les routes des crédits', () => {
  it('lit le barème sans jeton : il est public', async () => {
    reponse(200, { valeurCreditCentimes: 10, actions: [] });

    await api.getBaremeCredits();

    const { url, init } = appelEnvoye();
    expect(new URL(url).pathname).toBe('/credits/bareme');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('lit « Mes crédits » avec le jeton', async () => {
    reponse(200, { solde: 30, bareme: {}, historique: [] });

    await api.getCredits('jeton');

    const { url, init } = appelEnvoye();
    expect(new URL(url).pathname).toBe('/credits');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jeton');
  });

  it('pagine et filtre la liste des comptes, sans la garder dans le navigateur', async () => {
    const memoire = stockage();
    setOfflineStorage(memoire);
    reponse(200, { page: 2, parPage: 50, total: 60, comptes: [] });

    await api.getComptesCredits('jeton', { page: 2, recherche: 'a+b@exemple.fr' });

    const url = new URL(appelEnvoye().url);
    expect(url.pathname).toBe('/admin/credits');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('recherche')).toBe('a+b@exemple.fr');
    // Des adresses de tiers : jamais recopiées dans le stockage local.
    expect(memoire.entries.size).toBe(0);
  });

  it('ajuste un compte avec un motif', async () => {
    reponse(201, { id: 'c1', solde: 40 });

    await expect(api.ajusterCredits('jeton', 'u2', -5, 'test')).resolves.toEqual({ id: 'c1', solde: 40 });

    const { url, init } = appelEnvoye();
    expect(new URL(url).pathname).toBe('/admin/credits/u2');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ credits: -5, motif: 'test' });
  });

  it("n'expose plus le changement d'offre : il n'y a plus d'abonnement", () => {
    expect('changerOffre' in api).toBe(false);
  });
});

describe('hors ligne, une action IGINI échoue au lieu d’attendre', () => {
  // Rejouée plus tard, sans personne devant l'écran, elle dépenserait des
  // crédits à l'insu de la personne.
  it.each([
    ['analyzeProject', () => api.analyzeProject('t', 'p1')],
    ['recommendLegalForm', () => api.recommendLegalForm('t', 'p1')],
    ['createBuildPlan', () => api.createBuildPlan('t', 'p1')],
    ['createFinancingPlan', () => api.createFinancingPlan('t', 'p1')],
    ['createDevelopmentPlan', () => api.createDevelopmentPlan('t', 'p1')],
    ['createTransmissionPlan', () => api.createTransmissionPlan('t', 'p1')],
    ['prepareIginiQuestions', () => api.prepareIginiQuestions('t', 'p1')],
    ['sendChatMessage', () => api.sendChatMessage('t', 'Bonjour')],
    ['ajusterCredits', () => api.ajusterCredits('t', 'u2', 10, 'geste commercial')],
  ])('%s', async (_nom, appel) => {
    setOfflineStorage(stockage());
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const erreur = await appel().catch((e: unknown) => e);

    expect(erreur).toBeInstanceOf(ApiError);
    expect(erreur).toMatchObject({ status: 0, message: expect.stringContaining('mis de côté') });
    expect(readOfflineState().pending).toHaveLength(0);
  });
});
