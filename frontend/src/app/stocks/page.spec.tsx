import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import StocksPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const ITEM = {
  id: 'i1',
  owner_id: 'u1',
  project_id: null,
  name: 'Farine',
  unit: 'kg',
  quantity: '10',
  alert_below: '5',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: null,
};

function routes(overrides: Record<string, { status: number; body: unknown }> = {}) {
  return {
    'GET /stocks': { status: 200, body: [ITEM] },
    ...overrides,
  };
}

describe('StocksPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('liste les articles', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <StocksPage />
      </AuthProvider>,
    );

    expect(await screen.findByText('Farine')).toBeInTheDocument();
    expect(screen.getByText('10 Kg')).toBeInTheDocument();
  });

  it("signale un article sous son seuil d'alerte", async () => {
    mockApiRoutes(routes({ 'GET /stocks': { status: 200, body: [{ ...ITEM, quantity: '3' }] } }));

    render(
      <AuthProvider>
        <StocksPage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/sous le seuil d'alerte/)).toBeInTheDocument();
  });

  it('ne signale rien pour un article au-dessus de son seuil', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <StocksPage />
      </AuthProvider>,
    );

    await screen.findByText('Farine');
    expect(screen.queryByText(/sous le seuil d'alerte/)).not.toBeInTheDocument();
  });

  it('ajoute un article', async () => {
    const routeMap = routes({
      'POST /stocks': { status: 201, body: ITEM },
      'GET /stocks': { status: 200, body: [] },
    });
    mockApiRoutes(routeMap);

    render(
      <AuthProvider>
        <StocksPage />
      </AuthProvider>,
    );

    await screen.findByText("Aucun article en stock pour l'instant.");
    routeMap['GET /stocks'] = { status: 200, body: [ITEM] };

    fireEvent.change(screen.getByLabelText("Nom de l'article"), {
      target: { value: 'Farine' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    const list = await screen.findByRole('list', { name: 'Liste des articles' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
  });

  it('modifie un article via le formulaire en ligne', async () => {
    const routeMap = routes({
      'PATCH /stocks/i1': { status: 200, body: { ...ITEM, name: 'Farine T45' } },
    });
    mockApiRoutes(routeMap);

    render(
      <AuthProvider>
        <StocksPage />
      </AuthProvider>,
    );

    await screen.findByText('Farine');
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    fireEvent.change(screen.getByLabelText('Nom de Farine'), {
      target: { value: 'Farine T45' },
    });
    routeMap['GET /stocks'] = { status: 200, body: [{ ...ITEM, name: 'Farine T45' }] };
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Farine T45')).toBeInTheDocument();
  });

  it('supprime un article directement, sans boîte de confirmation', async () => {
    const routeMap = routes({
      'DELETE /stocks/i1': { status: 204, body: null },
    });
    mockApiRoutes(routeMap);

    render(
      <AuthProvider>
        <StocksPage />
      </AuthProvider>,
    );

    await screen.findByText('Farine');
    routeMap['GET /stocks'] = { status: 200, body: [] };
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/stocks/i1'),
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it("affiche l'historique d'un article et permet d'y enregistrer un mouvement", async () => {
    const routeMap = routes({
      'GET /stocks/i1/mouvements': {
        status: 200,
        body: [
          {
            id: 'm1',
            item_id: 'i1',
            quantity: '-2',
            reason: 'Casse',
            occurred_on: '2026-09-10T00:00:00.000Z',
            created_at: '2026-09-10T09:00:00.000Z',
          },
        ],
      },
      'POST /stocks/i1/mouvements': { status: 201, body: { ...ITEM, quantity: '8' } },
    });
    mockApiRoutes(routeMap);

    render(
      <AuthProvider>
        <StocksPage />
      </AuthProvider>,
    );

    await screen.findByText('Farine');
    fireEvent.click(screen.getByRole('button', { name: 'Historique' }));

    expect(await screen.findByText('Casse')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Quantité du mouvement'), {
      target: { value: '-2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/stocks/i1/mouvements'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('redirige vers la connexion sans jeton', async () => {
    window.localStorage.clear();
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <StocksPage />
      </AuthProvider>,
    );

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  });
});
