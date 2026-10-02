import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  created_at: '2026-09-30T00:00:00.000Z',
  extracted_document_number: 'L898902C3',
  extracted_birth_date: '1974-08-12T00:00:00.000Z',
  extracted_expiry_date: '2036-01-01T00:00:00.000Z',
  mrz_checksum_valid: true,
  name_matches_account: true,
  a_un_verso: false,
  owner: { email: 'jean@exemple.fr', display_name: 'Jean Dupont' },
};

function routes(overrides: Record<string, { status: number; body: unknown }> = {}) {
  return {
    'GET /identite/verifications/en-attente': { status: 200, body: [] },
    ...overrides,
  };
}

/**
 * `mockApiRoutes` ne simule que des réponses JSON : les faces de document,
 * elles, sont lues en binaire (`res.blob()`). On complète donc le fetch
 * simulé pour ces seules routes, et on garde la trace des faces demandées.
 */
function mockRevue(overrides: Record<string, { status: number; body: unknown }> = {}) {
  mockApiRoutes(routes(overrides));
  const fetchJson = global.fetch;
  global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    if (new URL(url).pathname.includes('/document/')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' })),
      });
    }
    return fetchJson(url, options);
  }) as unknown as typeof fetch;
}

function rendre() {
  render(
    <AuthProvider>
      <RevuePage />
    </AuthProvider>,
  );
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
  const urlsCreees: string[] = [];
  const revoquees: string[] = [];

  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'admin1', email: 'admin@ignitux.test' });
    // jsdom n'implémente pas les URL blob: ; on les simule pour vérifier
    // qu'elles sont bien créées puis révoquées.
    urlsCreees.length = 0;
    revoquees.length = 0;
    Object.assign(URL, {
      createObjectURL: vi.fn(() => {
        const url = `blob:apercu-${urlsCreees.length + 1}`;
        urlsCreees.push(url);
        return url;
      }),
      revokeObjectURL: vi.fn((url: string) => revoquees.push(url)),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('affiche « Aucune vérification en attente » quand la file est vide', async () => {
    mockRevue();
    rendre();
    expect(await screen.findByText(/aucune vérification en attente/i)).toBeInTheDocument();
  });

  it('affiche un message clair quand l’accès est refusé (403)', async () => {
    mockFetchOnce(403, { message: 'Réservé aux administrateurs.' });
    rendre();
    expect(await screen.findByText(/réservé aux administrateurs/i)).toBeInTheDocument();
  });

  it('montre le recto de la pièce, récupéré avec le jeton', async () => {
    mockRevue({ 'GET /identite/verifications/en-attente': { status: 200, body: [VERIFICATION] } });
    rendre();

    const recto = await screen.findByRole('img', { name: /recto/i });
    expect(recto).toHaveAttribute('src', 'blob:apercu-1');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/identite/verifications/v1/document/front'),
      expect.objectContaining({ headers: { Authorization: 'Bearer tok123' } }),
    );
    // Passeport sans verso : on ne demande même pas la face absente.
    expect(screen.queryByRole('img', { name: /verso/i })).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/document/back'),
      expect.anything(),
    );
  });

  it('montre aussi le verso quand il existe', async () => {
    mockRevue({
      'GET /identite/verifications/en-attente': {
        status: 200,
        body: [{ ...VERIFICATION, document_type: 'carte_identite', a_un_verso: true }],
      },
    });
    rendre();

    expect(await screen.findByRole('img', { name: /recto/i })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /verso/i })).toBeInTheDocument();
  });

  it('affiche les champs extraits et l’identité du déposant', async () => {
    mockRevue({ 'GET /identite/verifications/en-attente': { status: 200, body: [VERIFICATION] } });
    rendre();

    expect(await screen.findByText('L898902C3')).toBeInTheDocument();
    expect(screen.getByText('12/08/1974')).toBeInTheDocument();
    expect(screen.getByText('01/01/2036')).toBeInTheDocument();
    expect(screen.getByText(/Jean Dupont/)).toBeInTheDocument();
    expect(screen.getByText(/jean@exemple\.fr/)).toBeInTheDocument();
  });

  it('signale visiblement un chiffre de contrôle MRZ invalide et un nom incohérent', async () => {
    mockRevue({
      'GET /identite/verifications/en-attente': {
        status: 200,
        body: [{ ...VERIFICATION, mrz_checksum_valid: false, name_matches_account: false }],
      },
    });
    rendre();

    const alerte = await screen.findByTestId('signaux-v1');
    expect(alerte).toHaveAttribute('role', 'alert');
    expect(within(alerte).getByText(/mrz/i)).toBeInTheDocument();
    expect(within(alerte).getByText(/nom du compte/i)).toBeInTheDocument();
  });

  it('n’affiche aucune alerte pour un dossier sans signal', async () => {
    mockRevue({ 'GET /identite/verifications/en-attente': { status: 200, body: [VERIFICATION] } });
    rendre();

    await screen.findByText('L898902C3');
    expect(screen.queryByTestId('signaux-v1')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('affiche les dossiers dans l’ordre reçu du serveur (signalés en tête)', async () => {
    // Le tri « signalés d'abord » est fait côté serveur (listerEnAttente) ;
    // l'écran doit le respecter, pas le défaire.
    mockRevue({
      'GET /identite/verifications/en-attente': {
        status: 200,
        body: [
          {
            ...VERIFICATION,
            id: 'v-signale',
            name_matches_account: false,
            owner: { email: 'b@exemple.fr', display_name: 'Signalé Bernard' },
          },
          { ...VERIFICATION, id: 'v-ok', owner: { email: 'a@exemple.fr', display_name: 'Sans Signal Alice' } },
        ],
      },
    });
    rendre();

    const cartes = await screen.findAllByTestId(/^verification-/);
    expect(cartes.map((c) => c.getAttribute('data-testid'))).toEqual([
      'verification-v-signale',
      'verification-v-ok',
    ]);
    expect(within(cartes[0]).getByRole('alert')).toBeInTheDocument();
  });

  it('valide une vérification en un clic', async () => {
    mockRevue({
      'GET /identite/verifications/en-attente': { status: 200, body: [VERIFICATION] },
      'POST /identite/verifications/v1/revue': {
        status: 200,
        body: { ...VERIFICATION, status: 'validee' },
      },
    });
    rendre();

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

  it('révoque l’URL blob de l’aperçu quand le dossier quitte l’écran', async () => {
    mockRevue({ 'GET /identite/verifications/en-attente': { status: 200, body: [VERIFICATION] } });
    rendre();
    await screen.findByRole('img', { name: /recto/i });

    // Après validation, la file rechargée est vide : l'aperçu est démonté.
    mockRevue({
      'GET /identite/verifications/en-attente': { status: 200, body: [] },
      'POST /identite/verifications/v1/revue': { status: 200, body: { ...VERIFICATION, status: 'validee' } },
    });
    fireEvent.click(screen.getByRole('button', { name: /valider/i }));

    await screen.findByText(/aucune vérification en attente/i);
    expect(revoquees).toContain('blob:apercu-1');
  });
});
