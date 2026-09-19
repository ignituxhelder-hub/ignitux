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
 *
 * ── Ce que la révision du 19/09/2026 a corrigé ────────────────────────
 *
 * Le module tenait ses deux règles face au serveur, et les trahissait
 * face au stockage. Quatre défauts, tous capables de faire disparaître
 * une écriture sans que personne le sache :
 *
 *   — les identifiants pouvaient entrer en collision, et supprimer une
 *     écriture en supprimait alors deux ;
 *   — `enqueue` annonçait une mise en file même quand l'écriture dans le
 *     stockage avait échoué ;
 *   — le rejeu pouvait boucler indéfiniment en renvoyant la même écriture
 *     au serveur ;
 *   — une entrée corrompue partait au réseau telle quelle.
 *
 * Chacun est décrit à l'endroit où il est corrigé, et couvert par un test
 * qui échoue si on revient en arrière.
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
  /**
   * Compteur monotone qui numérote les écritures. Persisté avec la file :
   * c'est ce qui garantit qu'un identifiant n'est jamais réutilisé, y
   * compris après une suppression (voir `enqueue`).
   */
  nextId: number;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'ignitux.offline';

const METHODS = ['POST', 'PATCH', 'DELETE'] as const;

function emptyState(): OfflineState {
  return { pending: [], rejected: [], nextId: 1 };
}

/**
 * Une entrée est-elle réellement rejouable ?
 *
 * Sans ce contrôle, une entrée corrompue — un `null` dans le tableau, un
 * `path` manquant après une écriture tronquée — partait au réseau telle
 * quelle : `fetch('undefined')`, ou une requête au mauvais endroit. On
 * préfère l'écarter à la lecture.
 *
 * Écarter n'est pas « perdre en silence » au sens de la règle 2 : cette
 * règle protège une écriture que le serveur a refusée, c'est-à-dire une
 * intention connue de l'utilisateur. Une entrée sans chemin ni méthode ne
 * porte plus aucune intention identifiable — on ne peut ni la rejouer, ni
 * dire à quelqu'un ce qu'il avait voulu faire. La garder bloquerait la
 * file pour toutes les suivantes.
 */
function isReplayable(value: unknown): value is QueuedMutation {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<QueuedMutation>;
  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.path === 'string' &&
    item.path.startsWith('/') &&
    typeof item.method === 'string' &&
    (METHODS as readonly string[]).includes(item.method) &&
    (item.body === null || typeof item.body === 'string')
  );
}

function isRejected(value: unknown): value is RejectedMutation {
  return (
    isReplayable(value) &&
    typeof (value as Partial<RejectedMutation>).reason === 'string'
  );
}

/**
 * Lecture tolérante : un stockage indisponible ou un contenu corrompu
 * renvoie une file vide plutôt que de faire planter l'application. Perdre
 * la file est grave, mais empêcher l'utilisateur d'ouvrir son projet parce
 * qu'une ligne de JSON est cassée l'est davantage.
 */
export function readState(storage: KeyValueStorage): OfflineState {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return emptyState();
    const state = parsed as Partial<OfflineState>;

    const pending = Array.isArray(state.pending) ? state.pending.filter(isReplayable) : [];
    const rejected = Array.isArray(state.rejected) ? state.rejected.filter(isRejected) : [];

    // `nextId` doit toujours dépasser tout identifiant déjà attribué, même
    // si le compteur manque (file écrite par une version antérieure) ou a
    // été bricolé à la main dans le stockage.
    const highest = pending.reduce((max, item) => Math.max(max, sequenceOf(item.id)), 0);
    const stored = typeof state.nextId === 'number' && Number.isFinite(state.nextId)
      ? Math.floor(state.nextId)
      : 0;

    return { pending, rejected, nextId: Math.max(stored, highest + 1, 1) };
  } catch {
    return emptyState();
  }
}

/** Extrait le numéro de séquence d'un identifiant `<horodatage>-<n>`. */
function sequenceOf(id: string): number {
  const parsed = Number.parseInt(id.slice(id.lastIndexOf('-') + 1), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Écrit la file. Renvoie `false` si le stockage a refusé.
 *
 * Le booléen n'est pas décoratif : tant que cette fonction avalait son
 * échec, `enqueue` annonçait une mise en attente qui n'avait pas eu lieu,
 * et l'écriture disparaissait au rechargement de la page. Le module
 * promet de ne jamais présenter une écriture comme sauvegardée à tort —
 * il devait tenir cette promesse face au stockage comme face au serveur.
 */
export function writeState(storage: KeyValueStorage, state: OfflineState): boolean {
  const serialized = JSON.stringify(state);
  try {
    storage.setItem(STORAGE_KEY, serialized);
    // On relit pour vérifier, au lieu de déduire le succès de l'absence
    // d'exception. Un `localStorage` saturé lève en général, mais pas
    // toujours : certains contextes (navigation privée, stockage bridé par
    // une politique) acceptent l'appel sans rien conserver. Ce module
    // promet qu'une écriture annoncée en attente l'est réellement — cette
    // promesse se vérifie, elle ne se suppose pas. Le coût est une lecture.
    return storage.getItem(STORAGE_KEY) === serialized;
  } catch {
    return false;
  }
}

/**
 * Met une écriture en file. Renvoie `null` si le stockage n'a pas pu la
 * conserver — l'appelant DOIT traiter ce cas et le dire à l'utilisateur,
 * plutôt que d'afficher « en attente d'envoi » pour une action qui aura
 * disparu au prochain chargement.
 *
 * L'identifiant combine l'horodatage et un compteur monotone persisté.
 * L'ancienne version utilisait la longueur de la file : deux écritures
 * ajoutées dans la même milliseconde de part et d'autre d'une suppression
 * recevaient le même identifiant, et supprimer l'une supprimait l'autre.
 */
export function enqueue(
  storage: KeyValueStorage,
  mutation: Omit<QueuedMutation, 'id' | 'queuedAt'>,
  now: () => Date = () => new Date(),
): QueuedMutation | null {
  const state = readState(storage);
  const queued: QueuedMutation = {
    ...mutation,
    id: `${now().getTime()}-${state.nextId}`,
    queuedAt: now().toISOString(),
  };

  const stored = writeState(storage, {
    ...state,
    pending: [...state.pending, queued],
    nextId: state.nextId + 1,
  });

  return stored ? queued : null;
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
    ...state,
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
  /**
   * Le rejeu s'est arrêté parce que le stockage ne retient plus rien.
   * Distinct de `remaining` : ici l'écriture est peut-être partie au
   * serveur, mais la file ne peut pas enregistrer qu'elle est partie.
   */
  storageStalled?: true;
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
      sent += 1;
      // Garde-fou contre une boucle infinie. Si le stockage refuse
      // d'enregistrer la suppression (quota plein), la tête de file ne
      // bouge pas — et sans ce contrôle on renverrait éternellement la
      // même écriture au serveur, en gelant l'onglet au passage.
      //
      // On RELIT le stockage au lieu d'utiliser la valeur renvoyée :
      // `removePending` calcule l'état suivant et le renvoie qu'il ait pu
      // l'écrire ou non. Se fier à son retour, c'est vérifier l'intention
      // plutôt que le fait — exactement l'erreur qu'on veut détecter ici.
      removePending(storage, next.id);
      if (readState(storage).pending[0]?.id === next.id) {
        return { sent, rejected, remaining: state.pending.length, storageStalled: true };
      }
      continue;
    }

    if (result.retryable) {
      return { sent, rejected, remaining: readState(storage).pending.length };
    }

    rejected += 1;
    reject(storage, next.id, result.status, result.reason, now);
    if (readState(storage).pending[0]?.id === next.id) {
      return { sent, rejected, remaining: state.pending.length, storageStalled: true };
    }
  }
}
