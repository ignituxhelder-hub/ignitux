import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import BoutiqueEnLignePage from './page';

const router = createRouterMock();
let recherche = '';
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(recherche),
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

const ETAT_CONNECTEE = {
  connectee: true,
  shopDomain: 'ma-boutique.myshopify.com',
  forfaitDeclare: null,
  prixDeclareCentimes: null,
  connectedAt: '2026-09-20T00:00:00.000Z',
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
    recherche = '';
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

  it('affiche le domaine, les produits, et un bouton pour déconnecter', async () => {
    mockApiRoutes(
      routes({
        'GET /projects/p1/boutique-en-ligne': { status: 200, body: ETAT_CONNECTEE },
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
    expect(screen.getByRole('button', { name: /déconnecter/i })).toBeInTheDocument();
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

  it('affiche un message d’erreur quand le callback Shopify a échoué', async () => {
    recherche = '?erreur=1';
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <BoutiqueEnLignePage />
      </AuthProvider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/échoué/i);
  });

  it('finalise la connexion reçue du callback, puis nettoie l’URL', async () => {
    recherche = '?projet=p1&shopify_code=c1&shopify_shop=ma-boutique.myshopify.com&shopify_state=s1&shopify_hmac=h1';
    mockApiRoutes(
      routes({
        'POST /projects/p1/boutique-en-ligne/finaliser': { status: 201, body: {} },
        'GET /projects/p1/boutique-en-ligne': { status: 200, body: ETAT_CONNECTEE },
      }),
    );

    render(
      <AuthProvider>
        <BoutiqueEnLignePage />
      </AuthProvider>,
    );

    expect(await screen.findByText('ma-boutique.myshopify.com')).toBeInTheDocument();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/boutique-en-ligne?projet=p1'));
  });

  it('affiche une erreur quand la finalisation est refusée (ex. connexion demandée par un autre compte)', async () => {
    recherche = '?projet=p1&shopify_code=c1&shopify_shop=ma-boutique.myshopify.com&shopify_state=s1&shopify_hmac=h1';
    mockApiRoutes(
      routes({
        'POST /projects/p1/boutique-en-ligne/finaliser': {
          status: 403,
          body: { message: 'Cette connexion Shopify a été demandée par un autre compte.' },
        },
      }),
    );

    render(
      <AuthProvider>
        <BoutiqueEnLignePage />
      </AuthProvider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/autre compte/i);
  });

  it('déconnecte la boutique au clic', async () => {
    mockApiRoutes(
      routes({
        'GET /projects/p1/boutique-en-ligne': { status: 200, body: ETAT_CONNECTEE },
        'POST /projects/p1/boutique-en-ligne/deconnexion': { status: 204, body: null },
      }),
    );

    render(
      <AuthProvider>
        <BoutiqueEnLignePage />
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /déconnecter/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/déconnectée/i);
  });
});
