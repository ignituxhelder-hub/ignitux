import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, setUnauthorizedHandler } from './api';

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe('api', () => {
  afterEach(() => {
    setUnauthorizedHandler(null);
    vi.restoreAllMocks();
  });

  it('lève une ApiError avec le message renvoyé par le backend', async () => {
    mockFetchOnce(400, { message: 'Email invalide.' });

    await expect(api.signup('a@b.com', 'x')).rejects.toMatchObject({
      message: 'Email invalide.',
      status: 400,
    });
  });

  it('joint les messages quand le backend en renvoie plusieurs', async () => {
    mockFetchOnce(400, { message: ['Erreur 1', 'Erreur 2'] });

    await expect(api.signup('a@b.com', 'x')).rejects.toMatchObject({
      message: 'Erreur 1 Erreur 2',
    });
  });

  it('renvoie un message par défaut si le backend ne fournit rien d\'exploitable', async () => {
    mockFetchOnce(500, null);

    await expect(api.signup('a@b.com', 'x')).rejects.toMatchObject({
      message: 'Une erreur est survenue.',
      status: 500,
    });
  });

  it('déclenche le handler 401 pour une requête authentifiée (session expirée)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockFetchOnce(401, { message: 'Unauthorized' });

    await expect(api.listProjects('token-expire')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ne déclenche pas le handler 401 pour un login refusé (pas de session en jeu)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockFetchOnce(401, { message: 'Email ou mot de passe incorrect.' });

    await expect(api.login('a@b.com', 'mauvais')).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });
});
