import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, setOfflineStorage, setUnauthorizedHandler } from './api';

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

  describe('cache local et données personnelles', () => {
    /** Un stockage minimal, itérable comme celui attendu par le cache. */
    function fakeStorage() {
      const entries = new Map<string, string>();
      return {
        get length() {
          return entries.size;
        },
        key: (index: number) => [...entries.keys()][index] ?? null,
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => void entries.set(key, value),
        removeItem: (key: string) => void entries.delete(key),
        entries,
      };
    }

    afterEach(() => {
      setOfflineStorage(null);
    });

    it("n'écrit jamais l'export de données dans le stockage du navigateur", async () => {
      // Le cœur du sujet : l'export contient tout le CRM, donc des
      // coordonnées de tiers. Le mettre en cache le laisserait en clair
      // dans le navigateur longtemps après la fermeture de l'onglet, sans
      // que personne l'ait demandé.
      const storage = fakeStorage();
      setOfflineStorage(storage);
      mockFetchOnce(200, { donnees: { relations_professionnelles: { contacts: ['Durand'] } } });

      await api.exportMyData('token');

      expect(storage.entries.size).toBe(0);
    });

    it("ne met pas non plus en cache l'aperçu de suppression", async () => {
      const storage = fakeStorage();
      setOfflineStorage(storage);
      mockFetchOnce(200, { resume: {}, avertissements: [] });

      await api.getDeletionPreview('token');

      expect(storage.entries.size).toBe(0);
    });

    it('continue de mettre en cache une lecture ordinaire', async () => {
      // Sinon le test précédent passerait pour une mauvaise raison : il
      // suffirait que le cache soit cassé partout.
      const storage = fakeStorage();
      setOfflineStorage(storage);
      mockFetchOnce(200, [{ id: 'p1', title: 'Projet' }]);

      await api.listProjects('token');

      expect(storage.entries.size).toBeGreaterThan(0);
    });
  });
});
