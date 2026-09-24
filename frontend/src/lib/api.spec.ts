import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  ApiError,
  readOfflineState,
  replayOfflineQueue,
  setOfflineStorage,
  setUnauthorizedHandler,
} from './api';

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

    /**
     * L'ÂGE DE CAPTURE — ce qui empêche une écriture hors ligne d'effacer
     * du travail plus récent.
     *
     * Chaque écriture rejouée part avec le nombre de millisecondes écoulées
     * depuis sa mise en file. Le serveur reconstitue l'instant de capture sur
     * SA propre horloge et refuse l'écriture si la ressource a bougé depuis.
     *
     * Un âge, et non une date : une date viendrait de l'horloge de l'appareil,
     * et une montre en retard de dix minutes ferait refuser tout ce que la
     * personne a fait hors ligne. C'est précisément la panne que ce dispositif
     * doit éviter, pas provoquer.
     */
    describe('l’âge de capture accompagne les écritures rejouées', () => {
      const T0 = new Date('2026-09-24T12:00:00.000Z').getTime();

      function horsLigne() {
        global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      }

      /** Rebranche le réseau et note les en-têtes de chaque envoi. */
      function enLigneEnNotant(statut = 200) {
        const envois: Array<{ url: string; headers: Record<string, string> }> = [];
        global.fetch = vi.fn().mockImplementation((url: string, init: RequestInit) => {
          envois.push({ url, headers: (init.headers ?? {}) as Record<string, string> });
          return Promise.resolve({
            ok: statut >= 200 && statut < 300,
            status: statut,
            json: () => Promise.resolve({ message: 'Ce projet a changé pendant que tu étais hors ligne.' }),
          });
        }) as unknown as typeof fetch;
        return envois;
      }

      afterEach(() => {
        vi.useRealTimers();
      });

      it('envoie le temps écoulé depuis la mise en file, pas une date', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(T0);
        setOfflineStorage(fakeStorage());
        horsLigne();
        await expect(api.updateProject('t', 'p1', 'Titre', 'Corps')).rejects.toBeDefined();

        vi.setSystemTime(T0 + 5 * 60_000);
        const envois = enLigneEnNotant();
        await replayOfflineQueue('t');

        expect(envois).toHaveLength(1);
        expect(envois[0].headers['X-Ignitux-Capture-Age']).toBe(String(5 * 60_000));
      });

      it('ne le pose pas sur une écriture envoyée directement', async () => {
        // Le garde du serveur ne s'adresse qu'aux écritures revenues du froid.
        // Une écriture en ligne n'a pas d'âge à comparer : se mesurer à
        // soi-même n'aurait aucun sens, et refuserait du travail en cours.
        setOfflineStorage(fakeStorage());
        const envois = enLigneEnNotant();

        await api.updateProject('t', 'p1', 'Titre', 'Corps');

        expect(envois[0].headers['X-Ignitux-Capture-Age']).toBeUndefined();
      });

      it('ne fait pas se heurter deux modifications du même projet', async () => {
        // Le piège : la première écriture rejouée repousse la date de dernière
        // modification à maintenant. Sans cette règle, la seconde — capturée
        // avant — se ferait refuser, et la personne lirait « ce projet a changé
        // pendant que tu étais hors ligne » alors que ce qui a changé est sa
        // propre écriture, partie dix millisecondes plus tôt.
        setOfflineStorage(fakeStorage());
        horsLigne();
        await expect(api.updateProject('t', 'p1', 'Premier', 'a')).rejects.toBeDefined();
        await expect(api.updateProjectSector('t', 'p1', 'agriculture')).rejects.toBeDefined();

        const envois = enLigneEnNotant();
        await replayOfflineQueue('t');

        expect(envois).toHaveLength(2);
        expect(envois[0].headers['X-Ignitux-Capture-Age']).toBeDefined();
        expect(envois[1].headers['X-Ignitux-Capture-Age']).toBeUndefined();
      });

      it('garde la protection sur une ressource différente', async () => {
        setOfflineStorage(fakeStorage());
        horsLigne();
        await expect(api.updateProject('t', 'p1', 'Premier', 'a')).rejects.toBeDefined();
        await expect(api.updateTaskStatus('t', 'tache-1', 'done')).rejects.toBeDefined();

        const envois = enLigneEnNotant();
        await replayOfflineQueue('t');

        expect(envois).toHaveLength(2);
        expect(envois[0].headers['X-Ignitux-Capture-Age']).toBeDefined();
        // Deux lignes distinctes en base : rien ne justifie de baisser la garde.
        expect(envois[1].headers['X-Ignitux-Capture-Age']).toBeDefined();
      });

      it('un refus 409 part dans les « refusées », avec la raison du serveur', async () => {
        // C'est ce qui rend le dispositif honnête : l'écriture n'est ni
        // appliquée ni jetée, et la personne lit pourquoi.
        setOfflineStorage(fakeStorage());
        horsLigne();
        await expect(api.updateProject('t', 'p1', 'Titre', 'Corps')).rejects.toBeDefined();

        enLigneEnNotant(409);
        const bilan = await replayOfflineQueue('t');

        expect(bilan.rejected).toBe(1);
        const refusees = readOfflineState().rejected;
        expect(refusees).toHaveLength(1);
        expect(refusees[0].status).toBe(409);
        expect(refusees[0].reason).toContain('hors ligne');
      });
    });
  });
});
