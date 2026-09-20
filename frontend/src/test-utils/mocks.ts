import { vi } from 'vitest';

/**
 * Un routeur simulé avec une référence stable entre les rendus, comme le
 * vrai useRouter() de Next.js — un objet recréé à chaque appel casserait les
 * effets qui l'ont en dépendance (re-render → nouvelle référence → effet
 * relancé en boucle). Chaque fichier de test doit tout de même appeler
 * `vi.mock('next/navigation', ...)` lui-même : Vitest hisse ces appels en
 * tête du fichier où ils sont écrits, ça ne fonctionne pas depuis un module
 * partagé importé.
 */
export function createRouterMock() {
  // `push` autant que `replace` : une bascule de mode empile une entree
  // dans l historique — revenir en arriere doit ramener au mode precedent.
  return { replace: vi.fn(), push: vi.fn() };
}

export function signInAs(token: string, user: { id: string; email: string }) {
  window.localStorage.setItem('ignitux.auth', JSON.stringify({ token, user }));
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

/** Simule une seule réponse de fetch, quel que soit l'appel. */
export function mockFetchOnce(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue(jsonResponse(status, body)) as unknown as typeof fetch;
}

/** Simule les réponses successives de fetch, dans l'ordre des appels. */
export function mockFetchSequence(...responses: Array<{ status: number; body: unknown }>) {
  let call = 0;
  global.fetch = vi.fn().mockImplementation(() => {
    const { status, body } = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return Promise.resolve(jsonResponse(status, body));
  }) as unknown as typeof fetch;
}

/**
 * Simule l'API par route (méthode + chemin), avec une réponse par défaut
 * pour tout endpoint non explicitement décrit — utile pour les pages qui
 * déclenchent plusieurs requêtes en parallèle au montage.
 */
export function mockApiRoutes(
  routes: Record<string, { status: number; body: unknown }>,
  fallback: { status: number; body: unknown } = { status: 200, body: [] },
) {
  global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    const path = new URL(url).pathname;
    const key = `${options?.method ?? 'GET'} ${path}`;
    const resp = routes[key] ?? fallback;
    return Promise.resolve(jsonResponse(resp.status, resp.body));
  }) as unknown as typeof fetch;
}
