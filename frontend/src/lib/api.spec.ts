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

    /**
     * Trouvé en traversant les écrans avec un vrai navigateur, pas en
     * lisant le code : une connexion tentée hors ligne était mise en file
     * comme n'importe quelle écriture, et la file conserve le corps de la
     * requête tel quel. Le mot de passe en clair se retrouvait dans
     * localStorage, et y restait.
     */
    describe('les routes d’authentification n’entrent jamais en file', () => {
      function horsLigne() {
        global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      }

      it('ne conserve pas le mot de passe d’une connexion hors ligne', async () => {
        const storage = fakeStorage();
        setOfflineStorage(storage);
        horsLigne();

        await expect(api.login('victime@exemple.fr', 'MotDePasseSecret')).rejects.toBeInstanceOf(
          ApiError,
        );

        const tout = [...storage.entries.values()].join(' ');
        expect(tout).not.toContain('MotDePasseSecret');
        expect(tout).not.toContain('victime@exemple.fr');
      });

      it('ne conserve pas non plus celui d’une inscription', async () => {
        const storage = fakeStorage();
        setOfflineStorage(storage);
        horsLigne();

        await expect(api.signup('victime@exemple.fr', 'MotDePasseSecret')).rejects.toBeInstanceOf(
          ApiError,
        );

        expect([...storage.entries.values()].join(' ')).not.toContain('MotDePasseSecret');
      });

      it('dit que rien n’a été gardé, au lieu de promettre un envoi différé', async () => {
        // « 1 action en attente d'envoi » est faux ici : une connexion en
        // file ne peut pas être rejouée, puisque le rejeu exige un jeton
        // qu'on n'obtient qu'en se connectant. L'entrée resterait là pour
        // toujours, et la personne attendrait quelque chose qui n'arrive
        // jamais.
        const storage = fakeStorage();
        setOfflineStorage(storage);
        horsLigne();

        await expect(api.login('a@b.fr', 'x')).rejects.toMatchObject({
          message: expect.stringContaining('ne peut pas être mis de côté'),
          status: 0,
        });
        expect(storage.entries.size).toBe(0);
      });

      it('met toujours en file une écriture ordinaire', async () => {
        // Sinon les tests précédents passeraient pour une mauvaise raison :
        // il suffirait que la file soit cassée partout.
        const storage = fakeStorage();
        setOfflineStorage(storage);
        horsLigne();

        await expect(api.createProject('token', 'Mon projet', 'Une description')).rejects.toBeTruthy();

        expect([...storage.entries.values()].join(' ')).toContain('Mon projet');
      });
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
