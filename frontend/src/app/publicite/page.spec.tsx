import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import PublicitePage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const CAMPAIGN = {
  id: 'c1',
  owner_id: 'u1',
  label: 'Soldes',
  channel: 'Instagram',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: null,
};

function routes(overrides: Record<string, { status: number; body: unknown }> = {}) {
  return {
    'GET /publicite': { status: 200, body: [CAMPAIGN] },
    ...overrides,
  };
}

describe('PublicitePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('liste les campagnes', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <PublicitePage />
      </AuthProvider>,
    );

    expect(await screen.findByText('Soldes')).toBeInTheDocument();
    expect(screen.getByText('Instagram')).toBeInTheDocument();
  });

  it('ajoute une campagne', async () => {
    const routeMap = routes({
      'POST /publicite': { status: 201, body: CAMPAIGN },
      'GET /publicite': { status: 200, body: [] },
    });
    mockApiRoutes(routeMap);

    render(
      <AuthProvider>
        <PublicitePage />
      </AuthProvider>,
    );

    await screen.findByText("Aucune campagne enregistrée pour l'instant.");
    routeMap['GET /publicite'] = { status: 200, body: [CAMPAIGN] };

    fireEvent.change(screen.getByLabelText('Nom de la campagne'), { target: { value: 'Soldes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    const list = await screen.findByRole('list', { name: 'Liste des campagnes' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
  });

  it('modifie une campagne via le formulaire en ligne', async () => {
    const routeMap = routes({
      'PATCH /publicite/c1': { status: 200, body: { ...CAMPAIGN, label: 'Soldes hiver' } },
    });
    mockApiRoutes(routeMap);

    render(
      <AuthProvider>
        <PublicitePage />
      </AuthProvider>,
    );

    await screen.findByText('Soldes');
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    fireEvent.change(screen.getByLabelText('Nom de Soldes'), { target: { value: 'Soldes hiver' } });
    routeMap['GET /publicite'] = { status: 200, body: [{ ...CAMPAIGN, label: 'Soldes hiver' }] };
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Soldes hiver')).toBeInTheDocument();
  });

  it('supprime une campagne directement, sans boîte de confirmation', async () => {
    const routeMap = routes({ 'DELETE /publicite/c1': { status: 204, body: null } });
    mockApiRoutes(routeMap);

    render(
      <AuthProvider>
        <PublicitePage />
      </AuthProvider>,
    );

    await screen.findByText('Soldes');
    routeMap['GET /publicite'] = { status: 200, body: [] };
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/publicite/c1'),
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it("affiche l'historique d'une campagne, avec le coût par prospect", async () => {
    mockApiRoutes(
      routes({
        'GET /publicite/c1/entrees': {
          status: 200,
          body: {
            entries: [
              {
                id: 'e1',
                campaign_id: 'c1',
                spent_cents: 10000,
                leads: 2,
                note: 'Bon retour',
                occurred_on: '2026-09-10T00:00:00.000Z',
                created_at: '2026-09-10T09:00:00.000Z',
              },
            ],
            totalSpentCents: 10000,
            totalLeads: 2,
            costPerLeadCents: 5000,
          },
        },
      }),
    );

    render(
      <AuthProvider>
        <PublicitePage />
      </AuthProvider>,
    );

    await screen.findByText('Soldes');
    fireEvent.click(screen.getByRole('button', { name: 'Historique' }));

    expect(await screen.findByText('Bon retour')).toBeInTheDocument();
    expect(screen.getByText(/50,00 € \/ prospect/)).toBeInTheDocument();
  });

  it("n'affiche pas de coût par prospect tant qu'aucun n'a été compté", async () => {
    mockApiRoutes(
      routes({
        'GET /publicite/c1/entrees': {
          status: 200,
          body: { entries: [], totalSpentCents: 0, totalLeads: 0, costPerLeadCents: null },
        },
      }),
    );

    render(
      <AuthProvider>
        <PublicitePage />
      </AuthProvider>,
    );

    await screen.findByText('Soldes');
    fireEvent.click(screen.getByRole('button', { name: 'Historique' }));

    await screen.findByText("Aucune entrée enregistrée pour l'instant.");
    expect(screen.queryByText(/\/ prospect/)).not.toBeInTheDocument();
  });

  it('redirige vers la connexion sans jeton', async () => {
    window.localStorage.clear();
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <PublicitePage />
      </AuthProvider>,
    );

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  });
});
