/**
 * Cache de lecture hors ligne.
 *
 * Règle unique, et elle est non négociable : une donnée servie depuis le
 * cache est TOUJOURS accompagnée de sa date de capture, et l'interface doit
 * l'afficher. Servir une donnée d'hier comme si elle venait d'arriver, c'est
 * présenter comme réelle une information qui ne l'est plus — l'article 12
 * de la Constitution, appliqué au client.
 *
 * Le cache ne sert donc jamais de « source rapide » : il ne sert que quand
 * le réseau a réellement échoué.
 */

import type { KeyValueStorage } from './offline-queue.js';

export interface CachedResponse<T> {
  data: T;
  cachedAt: string;
}

const PREFIX = 'ignitux.cache:';

/**
 * Nombre maximal d'entrées conservées. Sans plafond, le cache grossit
 * indéfiniment jusqu'à faire échouer toutes les écritures de stockage —
 * y compris celles de la file d'attente, bien plus précieuses.
 */
export const MAX_CACHE_ENTRIES = 60;

export interface IterableStorage extends KeyValueStorage {
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export function cacheResponse(
  storage: IterableStorage,
  path: string,
  data: unknown,
  now: () => Date = () => new Date(),
): void {
  try {
    evictIfNeeded(storage);
    storage.setItem(
      PREFIX + path,
      JSON.stringify({ data, cachedAt: now().toISOString() }),
    );
  } catch {
    // Le cache est un confort ; son échec ne doit jamais faire échouer la
    // requête qui vient pourtant de réussir.
  }
}

export function readCached<T>(storage: IterableStorage, path: string): CachedResponse<T> | null {
  try {
    const raw = storage.getItem(PREFIX + path);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const entry = parsed as Partial<CachedResponse<T>>;
    if (typeof entry.cachedAt !== 'string' || !('data' in entry)) return null;
    return { data: entry.data as T, cachedAt: entry.cachedAt };
  } catch {
    return null;
  }
}

export function clearCache(storage: IterableStorage): void {
  for (const key of cacheKeys(storage)) {
    storage.removeItem(key);
  }
}

function cacheKeys(storage: IterableStorage): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  return keys;
}

/**
 * Éviction la plus simple qui soit : quand le plafond est atteint, on vide
 * la moitié la plus ancienne. Une politique LRU exacte demanderait de
 * réécrire une entrée à chaque lecture, ce qui multiplierait les écritures
 * de stockage pour un gain invisible à cette échelle.
 */
function evictIfNeeded(storage: IterableStorage): void {
  const keys = cacheKeys(storage);
  if (keys.length < MAX_CACHE_ENTRIES) return;

  const dated = keys
    .map((key) => ({ key, cachedAt: readCachedAt(storage, key) }))
    .sort((left, right) => left.cachedAt.localeCompare(right.cachedAt));

  for (const entry of dated.slice(0, Math.ceil(dated.length / 2))) {
    storage.removeItem(entry.key);
  }
}

function readCachedAt(storage: IterableStorage, key: string): string {
  try {
    const raw = storage.getItem(key);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { cachedAt?: unknown };
    return typeof parsed.cachedAt === 'string' ? parsed.cachedAt : '';
  } catch {
    return '';
  }
}
