import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import VehiculesPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const VEHICLE = {
  id: 'v1',
  owner_id: 'u1',
  label: 'Fourgon',
  plate: 'AA-123-BB',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: null,
};

function routes(overrides: Record<string, { status: number; body: unknown }> = {}) {
  return {
    'GET /vehicules': { status: 200, body: [VEHICLE] },
    ...overrides,
  };
}

describe('VehiculesPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('liste les véhicules de la flotte', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <VehiculesPage />
      </AuthProvider>,
    );

    expect(await screen.findByText('Fourgon')).toBeInTheDocument();
    expect(screen.getByText('AA-123-BB')).toBeInTheDocument();
  });

  it('ajoute un véhicule', async () => {
    const routeMap = routes({
      'POST /vehicules': { status: 201, body: VEHICLE },
      'GET /vehicules': { status: 200, body: [] },
    });
    mockApiRoutes(routeMap);

    render(
      <AuthProvider>
        <VehiculesPage />
      </AuthProvider>,
    );

    await screen.findByText("Aucun véhicule enregistré pour l'instant.");
    routeMap['GET /vehicules'] = { status: 200, body: [VEHICLE] };

    fireEvent.change(screen.getByLabelText('Nom du véhicule'), { target: { value: 'Fourgon' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    const list = await screen.findByRole('list', { name: 'Liste des véhicules' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
  });

  it('modifie un véhicule via le formulaire en ligne', async () => {
    const routeMap = routes({
      'PATCH /vehicules/v1': { status: 200, body: { ...VEHICLE, label: 'Camion' } },
    });
    mockApiRoutes(routeMap);

    render(
      <AuthProvider>
        <VehiculesPage />
      </AuthProvider>,
    );

    await screen.findByText('Fourgon');
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    fireEvent.change(screen.getByLabelText('Nom de Fourgon'), { target: { value: 'Camion' } });
    routeMap['GET /vehicules'] = { status: 200, body: [{ ...VEHICLE, label: 'Camion' }] };
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Camion')).toBeInTheDocument();
  });

  it('supprime un véhicule directement, sans boîte de confirmation', async () => {
    const routeMap = routes({ 'DELETE /vehicules/v1': { status: 204, body: null } });
    mockApiRoutes(routeMap);

    render(
      <AuthProvider>
        <VehiculesPage />
      </AuthProvider>,
    );

    await screen.findByText('Fourgon');
    routeMap['GET /vehicules'] = { status: 200, body: [] };
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/vehicules/v1'),
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it("affiche l'entretien d'un véhicule, avec le coût au kilomètre", async () => {
    mockApiRoutes(
      routes({
        'GET /vehicules/v1/entretien': {
          status: 200,
          body: {
            entries: [
              {
                id: 'e1',
                vehicle_id: 'v1',
                cost_cents: 10000,
                odometer_km: 1100,
                reason: 'Vidange',
                occurred_on: '2026-09-10T00:00:00.000Z',
                created_at: '2026-09-10T09:00:00.000Z',
              },
            ],
            totalCostCents: 10000,
            costPerKmCents: 100,
          },
        },
      }),
    );

    render(
      <AuthProvider>
        <VehiculesPage />
      </AuthProvider>,
    );

    await screen.findByText('Fourgon');
    fireEvent.click(screen.getByRole('button', { name: 'Entretien' }));

    expect(await screen.findByText('Vidange')).toBeInTheDocument();
    expect(screen.getByText(/1,00 € \/ km/)).toBeInTheDocument();
  });

  it("n'affiche pas de coût au kilomètre tant qu'il n'est pas calculable", async () => {
    mockApiRoutes(
      routes({
        'GET /vehicules/v1/entretien': {
          status: 200,
          body: { entries: [], totalCostCents: 0, costPerKmCents: null },
        },
      }),
    );

    render(
      <AuthProvider>
        <VehiculesPage />
      </AuthProvider>,
    );

    await screen.findByText('Fourgon');
    fireEvent.click(screen.getByRole('button', { name: 'Entretien' }));

    await screen.findByText("Aucun relevé enregistré pour l'instant.");
    expect(screen.queryByText(/\/ km/)).not.toBeInTheDocument();
  });

  it('redirige vers la connexion sans jeton', async () => {
    window.localStorage.clear();
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <VehiculesPage />
      </AuthProvider>,
    );

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  });
});
