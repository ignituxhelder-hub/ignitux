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
  type QueuedMutation,
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

/**
 * Un stockage qui accepte les lectures et **avale** les écritures sans
 * lever : le cas le plus perfide, parce que tout a l'air de marcher.
 * C'est le comportement réel de certains navigateurs en quota dépassé.
 */
function silentlyLossyStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const data = { ...initial };
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: () => {},
  };
}

const CLOCK = () => new Date('2026-09-19T10:00:00.000Z');

const EMPTY = { pending: [], rejected: [], nextId: 1 };

/** Met en file et échoue le test si le stockage n'a pas conservé l'écriture. */
function queued(
  storage: KeyValueStorage,
  mutation: Omit<QueuedMutation, 'id' | 'queuedAt'>,
  clock = CLOCK,
): QueuedMutation {
  const result = enqueue(storage, mutation, clock);
  if (!result) throw new Error('mise en file refusée par le stockage');
  return result;
}

describe("file d'attente hors ligne", () => {
  describe('lecture tolérante', () => {
    it("renvoie une file vide quand rien n'est stocké", () => {
      expect(readState(memoryStorage())).toEqual(EMPTY);
    });

    it('renvoie une file vide sur un contenu corrompu au lieu de planter', () => {
      // Empêcher l'utilisateur d'ouvrir son projet parce qu'une ligne de
      // JSON est cassée serait pire que de perdre la file.
      const storage = memoryStorage({ 'ignitux.offline': "{ceci n'est pas du json" });

      expect(readState(storage)).toEqual(EMPTY);
    });

    it('renvoie une file vide si le stockage lève', () => {
      const storage: KeyValueStorage = {
        getItem: () => {
          throw new Error('navigation privée');
        },
        setItem: () => {},
      };

      expect(readState(storage)).toEqual(EMPTY);
    });

    it("ne fait pas échouer une écriture quand le stockage est plein", () => {
      const storage: KeyValueStorage = {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota dépassé');
        },
      };

      expect(() => writeState(storage, EMPTY)).not.toThrow();
      // …mais elle doit le DIRE, au lieu de laisser croire que c'est écrit.
      expect(writeState(storage, EMPTY)).toBe(false);
    });
  });

  describe('entrées corrompues', () => {
    it("écarte à la lecture ce qui ne peut pas être rejoué", () => {
      // RÉGRESSION. Sans ce filtre, une entrée sans chemin partait au
      // réseau telle quelle : fetch('undefined'), ou pire, une requête
      // envoyée au mauvais endroit. Et une entrée irréparable en tête de
      // file bloquait toutes les suivantes.
      const storage = memoryStorage({
        'ignitux.offline': JSON.stringify({
          pending: [
            null,
            { id: '1-1', path: '/ok', method: 'POST', body: null, label: 'Bonne', queuedAt: 'x' },
            { id: '1-2', method: 'POST', body: null, label: 'Sans chemin', queuedAt: 'x' },
            { id: '1-3', path: '/x', method: 'TRACE', body: null, label: 'Méthode inconnue', queuedAt: 'x' },
            { id: '', path: '/x', method: 'POST', body: null, label: 'Sans identifiant', queuedAt: 'x' },
            { id: '1-5', path: 'pas-absolu', method: 'POST', body: null, label: 'Chemin relatif', queuedAt: 'x' },
          ],
          rejected: [],
        }),
      });

      const state = readState(storage);

      expect(state.pending).toHaveLength(1);
      expect(state.pending[0].label).toBe('Bonne');
    });

    it('accepte un corps de requête nul comme une chaîne', () => {
      const storage = memoryStorage({
        'ignitux.offline': JSON.stringify({
          pending: [
            { id: '1-1', path: '/a', method: 'DELETE', body: null, label: 'A', queuedAt: 'x' },
            { id: '1-2', path: '/b', method: 'PATCH', body: '{}', label: 'B', queuedAt: 'x' },
          ],
          rejected: [],
        }),
      });

      expect(readState(storage).pending).toHaveLength(2);
    });
  });

  describe('enqueue', () => {
    it("ajoute en fin de file pour préserver l'ordre des actions", () => {
      const storage = memoryStorage();

      queued(storage, { path: '/a', method: 'POST', body: null, label: 'A' });
      queued(storage, { path: '/b', method: 'POST', body: null, label: 'B' });

      expect(readState(storage).pending.map((item) => item.label)).toEqual(['A', 'B']);
    });

    it('horodate chaque entrée', () => {
      const storage = memoryStorage();

      expect(queued(storage, { path: '/a', method: 'POST', body: null, label: 'A' }).queuedAt).toBe(
        '2026-09-19T10:00:00.000Z',
      );
    });

    it("ne réutilise jamais un identifiant, même après une suppression", () => {
      // RÉGRESSION — perte silencieuse d'une écriture.
      //
      // L'identifiant valait `<horodatage>-<longueur de la file>`. Deux
      // écritures ajoutées dans la même milliseconde, de part et d'autre
      // d'une suppression, recevaient donc le MÊME identifiant. Supprimer
      // l'une supprimait alors les deux : le travail de quelqu'un
      // disparaissait sans trace, ce que ce module dit précisément refuser.
      const storage = memoryStorage();

      const a = queued(storage, { path: '/a', method: 'POST', body: null, label: 'A' });
      const b = queued(storage, { path: '/b', method: 'POST', body: null, label: 'B' });
      removePending(storage, a.id);
      const c = queued(storage, { path: '/c', method: 'POST', body: null, label: 'C' });

      expect(new Set([a.id, b.id, c.id]).size).toBe(3);

      // La conséquence concrète : retirer B ne doit pas emporter C.
      expect(removePending(storage, b.id).pending.map((item) => item.label)).toEqual(['C']);
    });

    it("renvoie null quand le stockage n'a pas conservé l'écriture", () => {
      // RÉGRESSION — le mensonge que ce module existe pour éviter.
      //
      // `writeState` avalait l'échec du stockage, et `enqueue` renvoyait
      // quand même l'écriture : l'interface affichait « en attente
      // d'envoi » pour une action qui n'était nulle part, et qui avait
      // disparu au rechargement de la page.
      const storage = silentlyLossyStorage();

      expect(enqueue(storage, { path: '/a', method: 'POST', body: null, label: 'A' }, CLOCK)).toBeNull();
      expect(readState(storage).pending).toHaveLength(0);
    });

    it('repart du bon numéro sur une file écrite par une version antérieure', () => {
      // Les files déjà stockées n'ont pas de compteur : il faut le
      // reconstruire au-dessus du plus grand numéro déjà attribué, sinon
      // on recrée immédiatement une collision.
      const storage = memoryStorage({
        'ignitux.offline': JSON.stringify({
          pending: [
            { id: '1758276000000-7', path: '/a', method: 'POST', body: null, label: 'A', queuedAt: 'x' },
          ],
          rejected: [],
        }),
      });

      expect(readState(storage).nextId).toBe(8);
      expect(queued(storage, { path: '/b', method: 'POST', body: null, label: 'B' }).id).toMatch(/-8$/);
    });
  });

  describe('reject', () => {
    it("déplace une entrée vers les refusées au lieu de la supprimer", () => {
      // Une action refusée qu'on ferait disparaître laisserait croire que
      // le travail est enregistré alors qu'il est perdu.
      const storage = memoryStorage();
      const a = queued(storage, { path: '/a', method: 'POST', body: null, label: 'A' });

      const state = reject(storage, a.id, 422, 'Refusée par la Constitution.', CLOCK);

      expect(state.pending).toHaveLength(0);
      expect(state.rejected[0]).toMatchObject({
        label: 'A',
        status: 422,
        reason: 'Refusée par la Constitution.',
      });
    });

    it('ne fait rien sur un identifiant inconnu', () => {
      const storage = memoryStorage();

      expect(reject(storage, 'inexistant', 400, 'x', CLOCK)).toEqual(EMPTY);
    });
  });

  it("removePending retire l'entrée envoyée", () => {
    const storage = memoryStorage();
    const a = queued(storage, { path: '/a', method: 'POST', body: null, label: 'A' });

    expect(removePending(storage, a.id).pending).toHaveLength(0);
  });

  it("dismissRejected retire une refusée écartée par l'utilisateur", () => {
    const storage = memoryStorage();
    const a = queued(storage, { path: '/a', method: 'POST', body: null, label: 'A' });
    reject(storage, a.id, 400, 'non', CLOCK);

    expect(dismissRejected(storage, a.id).rejected).toHaveLength(0);
  });

  describe('replay', () => {
    it("envoie les actions dans leur ordre d'arrivée", async () => {
      const storage = memoryStorage();
      queued(storage, { path: '/a', method: 'POST', body: null, label: 'A' });
      queued(storage, { path: '/b', method: 'POST', body: null, label: 'B' });
      const sentOrder: string[] = [];

      const outcome = await replay(storage, async (mutation) => {
        sentOrder.push(mutation.label);
        return { ok: true };
      });

      expect(sentOrder).toEqual(['A', 'B']);
      expect(outcome).toEqual({ sent: 2, rejected: 0, remaining: 0 });
    });

    it("s'arrête au premier échec temporaire sans toucher à la suite", async () => {
      // Rejouer la suite alors qu'une écriture antérieure n'est pas passée
      // produirait des états incohérents côté serveur.
      const storage = memoryStorage();
      queued(storage, { path: '/a', method: 'POST', body: null, label: 'A' });
      queued(storage, { path: '/b', method: 'POST', body: null, label: 'B' });

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
      queued(storage, { path: '/a', method: 'POST', body: null, label: 'A' });
      queued(storage, { path: '/b', method: 'POST', body: null, label: 'B' });

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

    it("s'arrête au lieu de renvoyer indéfiniment la même écriture", async () => {
      // RÉGRESSION — boucle infinie et envois dupliqués.
      //
      // Si le stockage refuse d'enregistrer la suppression, la tête de
      // file ne bouge pas. L'ancienne boucle repartait alors sur la même
      // entrée : l'onglet se figeait et le serveur recevait la même
      // écriture encore et encore. Le compteur ci-dessous coupe le test
      // plutôt que de laisser tourner la suite pour toujours.
      const storage = silentlyLossyStorage({
        'ignitux.offline': JSON.stringify({
          pending: [
            { id: '1-1', path: '/a', method: 'POST', body: null, label: 'A', queuedAt: 'x' },
          ],
          rejected: [],
          nextId: 2,
        }),
      });

      let calls = 0;
      const outcome = await replay(storage, async () => {
        calls += 1;
        if (calls > 5) throw new Error('boucle infinie : la même écriture est renvoyée sans fin');
        return { ok: true };
      });

      expect(calls).toBe(1);
      expect(outcome.storageStalled).toBe(true);
      expect(outcome.sent).toBe(1);
    });

    it("s'arrête aussi quand le refus ne peut pas être enregistré", async () => {
      // Même piège, par l'autre branche : une écriture définitivement
      // refusée qu'on n'arrive pas à déplacer resterait en tête de file.
      const storage = silentlyLossyStorage({
        'ignitux.offline': JSON.stringify({
          pending: [
            { id: '1-1', path: '/a', method: 'POST', body: null, label: 'A', queuedAt: 'x' },
          ],
          rejected: [],
          nextId: 2,
        }),
      });

      let calls = 0;
      const outcome = await replay(storage, async () => {
        calls += 1;
        if (calls > 5) throw new Error('boucle infinie sur une écriture refusée');
        return { ok: false, retryable: false, status: 422, reason: 'Invalide.' };
      });

      expect(calls).toBe(1);
      expect(outcome.storageStalled).toBe(true);
      expect(outcome.rejected).toBe(1);
    });
  });
});
