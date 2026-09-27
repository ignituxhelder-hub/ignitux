import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import BoutiqueEnLignePage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const PROJET = {
  id: 'p1',
  owner_id: 'u1',
  title: 'Ma boutique de bougies',
  description: null,
  sector: null,
  is_public: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const ETAT_NON_CONNECTEE = {
  connectee: false,
  shopDomain: null,
  forfaitDeclare: null,
  prixDeclareCentimes: null,
  connectedAt: null,
};

function routes(overrides: Record<string, { status: number; body: unknown }> = {}) {
  return {
    'GET /projects': { status: 200, body: [PROJET] },
    'GET /projects/p1/boutique-en-ligne': { status: 200, body: ETAT_NON_CONNECTEE },
    'GET /projects/p1/boutique-en-ligne/produits': { status: 200, body: [] },
    'GET /projects/p1/boutique-en-ligne/commandes': { status: 200, body: [] },
    ...overrides,
  };
}

describe('BoutiqueEnLignePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'fictif@ignitux.test' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sélectionne automatiquement l’unique projet, et propose de connecter une boutique', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <BoutiqueEnLignePage />
      </AuthProvider>,
    );

    expect(await screen.findByRole('button', { name: /connecter/i })).toBeInTheDocument();
  });

  it('affiche le domaine et les produits quand une boutique est connectée', async () => {
    mockApiRoutes(
      routes({
        'GET /projects/p1/boutique-en-ligne': {
          status: 200,
          body: {
            connectee: true,
            shopDomain: 'ma-boutique.myshopify.com',
            forfaitDeclare: null,
            prixDeclareCentimes: null,
            connectedAt: '2026-09-20T00:00:00.000Z',
          },
        },
        'GET /projects/p1/boutique-en-ligne/produits': {
          status: 200,
          body: [{ id: 'gid://1', title: 'Bougie', status: 'ACTIVE', totalInventory: 5 }],
        },
      }),
    );

    render(
      <AuthProvider>
        <BoutiqueEnLignePage />
      </AuthProvider>,
    );

    expect(await screen.findByText('ma-boutique.myshopify.com')).toBeInTheDocument();
    expect(await screen.findByText('Bougie')).toBeInTheDocument();
  });

  it('propose de choisir un projet quand il y en a plusieurs', async () => {
    const autreProjet = { ...PROJET, id: 'p2', title: 'Autre projet' };
    mockApiRoutes({
      'GET /projects': { status: 200, body: [PROJET, autreProjet] },
    });

    render(
      <AuthProvider>
        <BoutiqueEnLignePage />
      </AuthProvider>,
    );

    expect(await screen.findByRole('combobox', { name: /projet/i })).toBeInTheDocument();
  });
});
