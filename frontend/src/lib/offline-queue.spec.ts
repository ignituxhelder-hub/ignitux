import { describe, expect, it, vi } from 'vitest';
import {
  dismissRejected,
  enqueue,
  readState,
  reject,
  removePending,
  replay,
  writeState,
  type KeyValueStorage,
} from './offline-queue';

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

const CLOCK = () => new Date('2026-09-19T10:00:00.000Z');

describe('file d\'attente hors ligne', () => {
  describe('lecture tolérante', () => {
    it('renvoie une file vide quand rien n\'est stocké', () => {
      expect(readState(memoryStorage())).toEqual({ pending: [], rejected: [] });
    });

    it('renvoie une file vide sur un contenu corrompu au lieu de planter', () => {
      // Empêcher l'utilisateur d'ouvrir son projet parce qu'une ligne de
      // JSON est cassée serait pire que de perdre la file.
      const storage = memoryStorage({ 'ignitux.offline': '{ceci n\'est pas du json' });

      expect(readState(storage)).toEqual({ pending: [], rejected: [] });
    });

    it('renvoie une file vide si le stockage lève', () => {
      const storage: KeyValueStorage = {
        getItem: () => {
          throw new Error('navigation privée');
        },
        setItem: () => {},
      };

      expect(readState(storage)).toEqual({ pending: [], rejected: [] });
    });

    it('ne fait pas échouer une écriture quand le stockage est plein', () => {
      const storage: KeyValueStorage = {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota dépassé');
        },
      };

      expect(() => writeState(storage, { pending: [], rejected: [] })).not.toThrow();
    });
  });

  describe('enqueue', () => {
    it('ajoute en fin de file pour préserver l\'ordre des actions', () => {
      const storage = memoryStorage();

      enqueue(storage, { path: '/a', method: 'POST', body: null, label: 'A' }, CLOCK);
      enqueue(storage, { path: '/b', method: 'POST', body: null, label: 'B' }, CLOCK);

      expect(readState(storage).pending.map((item) => item.label)).toEqual(['A', 'B']);
    });

    it('horodate chaque entrée', () => {
      const storage = memoryStorage();

      const queued = enqueue(
        storage,
        { path: '/a', method: 'POST', body: null, label: 'A' },
        CLOCK,
      );

      expect(queued.queuedAt).toBe('2026-09-19T10:00:00.000Z');
    });
  });

  describe('reject', () => {
    it('déplace une entrée vers les refusées au lieu de la supprimer', () => {
      // Une action refusée qu'on ferait disparaître laisserait croire que
      // le travail est enregistré alors qu'il est perdu.
      const storage = memoryStorage();
      const queued = enqueue(
        storage,
        { path: '/a', method: 'POST', body: null, label: 'A' },
        CLOCK,
      );

      const state = reject(storage, queued.id, 422, 'Refusée par la Constitution.', CLOCK);

      expect(state.pending).toHaveLength(0);
      expect(state.rejected[0]).toMatchObject({
        label: 'A',
        status: 422,
        reason: 'Refusée par la Constitution.',
      });
    });

    it('ne fait rien sur un identifiant inconnu', () => {
      const storage = memoryStorage();

      expect(reject(storage, 'inexistant', 400, 'x', CLOCK)).toEqual({
        pending: [],
        rejected: [],
      });
    });
  });

  it('removePending retire l\'entrée envoyée', () => {
    const storage = memoryStorage();
    const queued = enqueue(storage, { path: '/a', method: 'POST', body: null, label: 'A' }, CLOCK);

    expect(removePending(storage, queued.id).pending).toHaveLength(0);
  });

  it('dismissRejected retire une refusée écartée par l\'utilisateur', () => {
    const storage = memoryStorage();
    const queued = enqueue(storage, { path: '/a', method: 'POST', body: null, label: 'A' }, CLOCK);
    reject(storage, queued.id, 400, 'non', CLOCK);

    expect(dismissRejected(storage, queued.id).rejected).toHaveLength(0);
  });

  describe('replay', () => {
    it('envoie les actions dans leur ordre d\'arrivée', async () => {
      const storage = memoryStorage();
      enqueue(storage, { path: '/a', method: 'POST', body: null, label: 'A' }, CLOCK);
      enqueue(storage, { path: '/b', method: 'POST', body: null, label: 'B' }, CLOCK);
      const sentOrder: string[] = [];

      const outcome = await replay(storage, async (mutation) => {
        sentOrder.push(mutation.label);
        return { ok: true };
      });

      expect(sentOrder).toEqual(['A', 'B']);
      expect(outcome).toEqual({ sent: 2, rejected: 0, remaining: 0 });
    });

    it('s\'arrête au premier échec temporaire sans toucher à la suite', async () => {
      // Rejouer la suite alors qu'une écriture antérieure n'est pas passée
      // produirait des états incohérents côté serveur.
      const storage = memoryStorage();
      enqueue(storage, { path: '/a', method: 'POST', body: null, label: 'A' }, CLOCK);
      enqueue(storage, { path: '/b', method: 'POST', body: null, label: 'B' }, CLOCK);

      const outcome = await replay(storage, async () => ({
        ok: false,
        retryable: true,
        status: 503,
        reason: 'Serveur indisponible.',
      }));

      expect(outcome).toEqual({ sent: 0, rejected: 0, remaining: 2 });
      expect(readState(storage).pending).toHaveLength(2);
    });

    it('écarte une action définitivement refusée et poursuit la file', async () => {
      const storage = memoryStorage();
      enqueue(storage, { path: '/a', method: 'POST', body: null, label: 'A' }, CLOCK);
      enqueue(storage, { path: '/b', method: 'POST', body: null, label: 'B' }, CLOCK);

      const send = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, retryable: false, status: 422, reason: 'Invalide.' })
        .mockResolvedValueOnce({ ok: true });

      const outcome = await replay(storage, send, CLOCK);

      expect(outcome).toEqual({ sent: 1, rejected: 1, remaining: 0 });
      expect(readState(storage).rejected[0].label).toBe('A');
    });

    it('ne fait rien sur une file vide', async () => {
      const outcome = await replay(memoryStorage(), async () => ({ ok: true }));

      expect(outcome).toEqual({ sent: 0, rejected: 0, remaining: 0 });
    });
  });
});
