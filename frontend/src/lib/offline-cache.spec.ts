import { describe, expect, it } from 'vitest';
import {
  cacheResponse,
  clearCache,
  MAX_CACHE_ENTRIES,
  readCached,
  type IterableStorage,
} from './offline-cache';

function memoryStorage(): IterableStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    key: (index) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
}

describe('cache de lecture hors ligne', () => {
  it('rend la donnée accompagnée de sa date de capture', () => {
    // La date n'est pas décorative : sans elle, l'interface ne peut pas
    // dire à l'utilisateur qu'il regarde une donnée périmée.
    const storage = memoryStorage();
    cacheResponse(storage, '/projects', [{ id: 'p1' }], () => new Date('2026-09-19T10:00:00Z'));

    expect(readCached(storage, '/projects')).toEqual({
      data: [{ id: 'p1' }],
      cachedAt: '2026-09-19T10:00:00.000Z',
    });
  });

  it('renvoie null pour un chemin jamais chargé', () => {
    expect(readCached(memoryStorage(), '/jamais-vu')).toBeNull();
  });

  it('renvoie null sur une entrée corrompue', () => {
    const storage = memoryStorage();
    storage.setItem('ignitux.cache:/projects', 'pas du json');

    expect(readCached(storage, '/projects')).toBeNull();
  });

  it('renvoie null sur une entrée sans date, qui ne pourrait pas être signalée', () => {
    const storage = memoryStorage();
    storage.setItem('ignitux.cache:/projects', JSON.stringify({ data: [] }));

    expect(readCached(storage, '/projects')).toBeNull();
  });

  it("n'échoue pas quand le stockage refuse d'écrire", () => {
    const storage: IterableStorage = {
      ...memoryStorage(),
      setItem: () => {
        throw new Error('quota dépassé');
      },
    };

    expect(() => cacheResponse(storage, '/projects', [])).not.toThrow();
  });

  it('évince les entrées les plus anciennes quand le plafond est atteint', () => {
    // Sans plafond, le cache finirait par faire échouer toutes les
    // écritures de stockage — y compris celles de la file d'attente.
    const storage = memoryStorage();
    // Une entrée de plus que le plafond : l'éviction se déclenche sur
    // cette dernière écriture.
    const total = MAX_CACHE_ENTRIES + 1;
    for (let index = 0; index < total; index += 1) {
      cacheResponse(
        storage,
        `/p${index}`,
        index,
        () => new Date(Date.UTC(2026, 0, 1, 0, index)),
      );
    }

    expect(storage.length).toBeLessThan(MAX_CACHE_ENTRIES);
    expect(readCached(storage, '/p0')).toBeNull();
    expect(readCached(storage, `/p${total - 1}`)).not.toBeNull();
  });

  it('clearCache ne touche que les entrées de cache', () => {
    const storage = memoryStorage();
    storage.setItem('ignitux.auth', 'jeton');
    cacheResponse(storage, '/projects', []);

    clearCache(storage);

    expect(storage.getItem('ignitux.auth')).toBe('jeton');
    expect(readCached(storage, '/projects')).toBeNull();
  });
});
