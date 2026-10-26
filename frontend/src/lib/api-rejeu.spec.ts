import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readOfflineState, rejeuRetentable, replayOfflineQueue, setOfflineStorage, setUtilisateurActif } from './api';
import { enqueue } from './offline-queue';

/**
 * LE REJEU NE DÉPENSE JAMAIS DE CRÉDITS À L'INSU DE LA PERSONNE.
 *
 * Les routes payantes (IGINI) ne peuvent plus entrer en file. Mais un ancien
 * écran — d'avant les crédits — a pu y mettre une analyse ou une exécution
 * de tâche, restée dans le navigateur. Le rejeu refait donc le tri : ce qui
 * n'a plus le droit d'être en file n'est jamais envoyé.
 */
function fauxStockage() {
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

describe('replayOfflineQueue — ce qui n’a plus le droit d’être en file', () => {
  let stockage: ReturnType<typeof fauxStockage>;

  beforeEach(() => {
    stockage = fauxStockage();
    setOfflineStorage(stockage);
    setUtilisateurActif('u1');
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) }) as never;
  });

  afterEach(() => {
    setOfflineStorage(null);
    setUtilisateurActif(null);
    vi.restoreAllMocks();
  });

  const mettreEnFile = (method: 'POST' | 'PATCH' | 'DELETE', path: string) =>
    enqueue(stockage, { method, path, body: '{}', label: `${method} ${path}`, utilisateur: 'u1' });

  it.each([
    ['une analyse', '/projects/p1/analyze'],
    ['un plan de financement', '/projects/p1/financing-plan'],
    ['une exécution de tâche', '/projects/p1/tasks/t1/run'],
    ['une démarche de conformité', '/projects/p1/compliance/r1/run'],
    ['une génération de statuts', '/projects/p1/statuts/regenerer'],
    ['une évaluation de financement', '/projects/p1/evaluations-financement'],
    ['un message à IGINI', '/chat/messages'],
  ])('%s mise en file par un ancien écran n’est jamais envoyée : elle passe dans les refusées', async (_cas, chemin) => {
    mettreEnFile('POST', chemin);

    const bilan = await replayOfflineQueue('jeton');

    expect(global.fetch).not.toHaveBeenCalled();
    expect(bilan).toMatchObject({ sent: 0, rejected: 1, remaining: 0 });
    const [refusee] = readOfflineState().rejected;
    expect(refusee.path).toBe(chemin);
    expect(refusee.reason).toMatch(/ne se rejoue pas/);
  });

  it('une écriture ordinaire part toujours, après une payante écartée', async () => {
    mettreEnFile('POST', '/projects/p1/analyze');
    mettreEnFile('PATCH', '/projects/p1');

    const bilan = await replayOfflineQueue('jeton');

    expect(bilan).toMatchObject({ sent: 1, rejected: 1 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(global.fetch).mock.calls[0][0])).toMatch(/\/projects\/p1$/);
  });
});

describe('rejeuRetentable — une panne du serveur ne relance jamais une action payante', () => {
  it('retente une écriture ordinaire après une erreur serveur ou réseau', () => {
    expect(rejeuRetentable(503, '/projects/p1')).toBe(true);
    expect(rejeuRetentable(0, '/projects/p1/tasks')).toBe(true);
  });

  it('ne retente jamais une route IGINI payante, même sur 5xx', () => {
    expect(rejeuRetentable(500, '/projects/p1/analyze')).toBe(false);
    expect(rejeuRetentable(502, '/projects/p1/tasks/t1/run')).toBe(false);
    expect(rejeuRetentable(0, '/chat/messages')).toBe(false);
  });

  it('ne retente pas un refus du serveur (4xx)', () => {
    expect(rejeuRetentable(409, '/projects/p1')).toBe(false);
  });
});
