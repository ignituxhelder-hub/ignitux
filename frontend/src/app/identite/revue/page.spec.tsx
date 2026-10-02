import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, mockFetchOnce, signInAs } from '@/test-utils/mocks';
import RevuePage from './page';

// Réference stable entre les rendus, comme le vrai useRouter() de Next.js —
// voir frontend/src/test-utils/mocks.ts.
const router = createRouterMock();
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const VERIFICATION = {
  id: 'v1',
  document_type: 'passeport',
  status: 'en_attente',
  rejection_reason: null,
  created_at: '2026-09-30T00:00:00.000Z',
};

function routes(overrides: Record<string, { status: number; body: unknown }> = {}) {
  return {
    'GET /identite/verifications/en-attente': { status: 200, body: [] },
    ...overrides,
  };
}

// Le module api.ts n'est volontairement PAS mocké ici (pas de
// `vi.mock('@/lib/api.js')`) : automocker une classe comme `ApiError`
// remplace son constructeur par un mock vide, qui ne pose jamais `message`
// ni `status` (vérifié à la main — `new ApiError('x', 403).message` vaut ''
// une fois le module automocké). Le test du 403 a justement besoin que ce
// message traverse réellement jusqu'à l'écran. Comme le reste du
// frontend dans ce cas (voir vehicules/page.spec.tsx, account/page.spec.tsx,
// investisseur/page.spec.tsx), on simule la couche HTTP avec `mockApiRoutes`
// / `mockFetchOnce` et on laisse `api.ts` et `AuthProvider` réels.
describe('RevuePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'admin1', email: 'admin@ignitux.test' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('affiche « Aucune vérification en attente » quand la file est vide', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <RevuePage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/aucune vérification en attente/i)).toBeInTheDocument();
  });

  it('affiche un message clair quand l’accès est refusé (403)', async () => {
    mockFetchOnce(403, { message: 'Réservé aux administrateurs.' });

    render(
      <AuthProvider>
        <RevuePage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/réservé aux administrateurs/i)).toBeInTheDocument();
  });

  it('valide une vérification en un clic', async () => {
    mockApiRoutes(
      routes({
        'GET /identite/verifications/en-attente': { status: 200, body: [VERIFICATION] },
        'POST /identite/verifications/v1/revue': {
          status: 200,
          body: { ...VERIFICATION, status: 'validee' },
        },
      }),
    );

    render(
      <AuthProvider>
        <RevuePage />
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /valider/i }));

    // Pas de motif sur une validation : le corps envoyé ne doit porter que
    // la décision — équivalent à vérifier
    // `api.revoirVerification('tok', 'v1', 'validee', undefined)`, mais à
    // travers la vraie requête HTTP plutôt qu'un wrapper mocké.
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/identite/verifications/v1/revue'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ decision: 'validee', motif: undefined }),
        }),
      ),
    );
  });
});
