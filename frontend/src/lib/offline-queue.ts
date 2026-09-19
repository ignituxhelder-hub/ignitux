/**
 * File d'attente hors ligne — la partie « Offline First » côté client.
 *
 * Deux règles portent la conception, et elles découlent directement de la
 * devise :
 *
 * 1. Une écriture mise en file n'est JAMAIS présentée comme réussie. Elle
 *    est « en attente d'envoi ». Afficher un succès optimiste puis
 *    découvrir trois heures plus tard que le serveur a refusé, c'est le
 *    mensonge le plus coûteux qu'une application hors ligne puisse faire.
 * 2. Une écriture refusée par le serveur au moment du rejeu n'est jamais
 *    supprimée en silence : elle passe dans `rejected` et l'utilisateur
 *    doit pouvoir la voir et décider.
 *
 * Le stockage est injecté plutôt qu'importé : ça rend le module testable
 * sans navigateur, et surtout ça oblige à traiter le cas où le stockage
 * est indisponible (navigation privée, quota plein) au lieu de le
 * supposer résolu.
 */

export interface QueuedMutation {
  id: string;
  /** Chemin d'API, relatif — ex. '/projects/p1/tasks'. */
  path: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body: string | null;
  /** Ce que l'utilisateur a voulu faire, en français, pour l'affichage. */
  label: string;
  queuedAt: string;
}

export interface RejectedMutation extends QueuedMutation {
  rejectedAt: string;
  status: number;
  reason: string;
}

export interface OfflineState {
  pending: QueuedMutation[];
  rejected: RejectedMutation[];
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'ignitux.offline';

const EMPTY_STATE: OfflineState = { pending: [], rejected: [] };

/**
 * Lecture tolérante : un stockage indisponible ou un contenu corrompu
 * renvoie une file vide plutôt que de faire planter l'application. Perdre
 * la file est grave, mais empêcher l'utilisateur d'ouvrir son projet parce
 * qu'une ligne de JSON est cassée l'est davantage.
 */
export function readState(storage: KeyValueStorage): OfflineState {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_STATE };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...EMPTY_STATE };
    const state = parsed as Partial<OfflineState>;
    return {
      pending: Array.isArray(state.pending) ? state.pending : [],
      rejected: Array.isArray(state.rejected) ? state.rejected : [],
    };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export function writeState(storage: KeyValueStorage, state: OfflineState): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota plein ou stockage refusé : on ne peut rien faire de mieux que
    // continuer. Le signaler par une exception ferait échouer l'action de
    // l'utilisateur alors qu'elle a peut-être réussi en ligne.
  }
}

export function enqueue(
  storage: KeyValueStorage,
  mutation: Omit<QueuedMutation, 'id' | 'queuedAt'>,
  now: () => Date = () => new Date(),
): QueuedMutation {
  const state = readState(storage);
  const queued: QueuedMutation = {
    ...mutation,
    id: `${now().getTime()}-${state.pending.length}`,
    queuedAt: now().toISOString(),
  };
  writeState(storage, { ...state, pending: [...state.pending, queued] });
  return queued;
}

export function removePending(storage: KeyValueStorage, id: string): OfflineState {
  const state = readState(storage);
  const next = { ...state, pending: state.pending.filter((item) => item.id !== id) };
  writeState(storage, next);
  return next;
}

export function reject(
  storage: KeyValueStorage,
  id: string,
  status: number,
  reason: string,
  now: () => Date = () => new Date(),
): OfflineState {
  const state = readState(storage);
  const mutation = state.pending.find((item) => item.id === id);
  if (!mutation) return state;

  const next: OfflineState = {
    pending: state.pending.filter((item) => item.id !== id),
    rejected: [
      ...state.rejected,
      { ...mutation, status, reason, rejectedAt: now().toISOString() },
    ],
  };
  writeState(storage, next);
  return next;
}

export function dismissRejected(storage: KeyValueStorage, id: string): OfflineState {
  const state = readState(storage);
  const next = { ...state, rejected: state.rejected.filter((item) => item.id !== id) };
  writeState(storage, next);
  return next;
}

export type ReplaySend = (
  mutation: QueuedMutation,
) => Promise<{ ok: true } | { ok: false; retryable: boolean; status: number; reason: string }>;

export interface ReplayOutcome {
  sent: number;
  rejected: number;
  /** Restées en file : l'envoi a échoué pour une raison temporaire. */
  remaining: number;
}

/**
 * Rejoue la file dans l'ordre d'arrivée.
 *
 * L'ordre compte : créer une tâche puis la marquer terminée n'a de sens
 * que dans ce sens-là. C'est aussi pourquoi on s'arrête au premier échec
 * temporaire — rejouer la suite alors qu'une écriture antérieure n'est
 * pas passée produirait des états incohérents (marquer terminée une tâche
 * qui n'existe pas encore côté serveur).
 */
export async function replay(
  storage: KeyValueStorage,
  send: ReplaySend,
  now: () => Date = () => new Date(),
): Promise<ReplayOutcome> {
  let sent = 0;
  let rejected = 0;

  // On relit la file à chaque tour : le rejeu peut durer, et une autre
  // action de l'utilisateur peut y ajouter une écriture entre-temps.
  for (;;) {
    const state = readState(storage);
    const next = state.pending[0];
    if (!next) {
      return { sent, rejected, remaining: 0 };
    }

    const result = await send(next);
    if (result.ok) {
      removePending(storage, next.id);
      sent += 1;
      continue;
    }

    if (result.retryable) {
      return { sent, rejected, remaining: readState(storage).pending.length };
    }

    reject(storage, next.id, result.status, result.reason, now);
    rejected += 1;
  }
}
