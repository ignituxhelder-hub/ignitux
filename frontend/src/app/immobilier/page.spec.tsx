import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import ImmobilierPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const PROPERTY = {
  id: 'p1',
  owner_id: 'u1',
  project_id: null,
  label: 'Studio centre-ville',
  address: '1 rue des Fleurs',
  balance_cents: 45000,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: null,
};

function routes(overrides: Record<string, { status: number; body: unknown }> = {}) {
  return {
    'GET /immobilier': { status: 200, body: [PROPERTY] },
    ...overrides,
  };
}

describe('ImmobilierPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('liste les biens avec leur solde en euros', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <ImmobilierPage />
      </AuthProvider>,
    );

    expect(await screen.findByText('Studio centre-ville')).toBeInTheDocument();
    expect(screen.getByText(/450,00 €/)).toBeInTheDocument();
  });

  it('ajoute un bien', async () => {
    const routeMap = routes({
      'POST /immobilier': { status: 201, body: PROPERTY },
      'GET /immobilier': { status: 200, body: [] },
    });
    mockApiRoutes(routeMap);

    render(
      <AuthProvider>
        <ImmobilierPage />
      </AuthProvider>,
    );

    await screen.findByText("Aucun bien enregistré pour l'instant.");
    routeMap['GET /immobilier'] = { status: 200, body: [PROPERTY] };

    fireEvent.change(screen.getByLabelText('Nom du bien'), { target: { value: 'Studio centre-ville' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    const list = await screen.findByRole('list', { name: 'Liste des biens' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
  });

  it('modifie un bien via le formulaire en ligne', async () => {
    const routeMap = routes({
      'PATCH /immobilier/p1': { status: 200, body: { ...PROPERTY, label: 'Studio rénové' } },
    });
    mockApiRoutes(routeMap);

    render(
      <AuthProvider>
        <ImmobilierPage />
      </AuthProvider>,
    );

    await screen.findByText('Studio centre-ville');
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    fireEvent.change(screen.getByLabelText('Nom de Studio centre-ville'), {
      target: { value: 'Studio rénové' },
    });
    routeMap['GET /immobilier'] = { status: 200, body: [{ ...PROPERTY, label: 'Studio rénové' }] };
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Studio rénové')).toBeInTheDocument();
  });

  it('supprime un bien directement, sans boîte de confirmation', async () => {
    const routeMap = routes({
      'DELETE /immobilier/p1': { status: 204, body: null },
    });
    mockApiRoutes(routeMap);

    render(
      <AuthProvider>
        <ImmobilierPage />
      </AuthProvider>,
    );

    await screen.findByText('Studio centre-ville');
    routeMap['GET /immobilier'] = { status: 200, body: [] };
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/immobilier/p1'),
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it("affiche l'historique d'un bien et permet d'y enregistrer un mouvement", async () => {
    const routeMap = routes({
      'GET /immobilier/p1/mouvements': {
        status: 200,
        body: [
          {
            id: 'm1',
            property_id: 'p1',
            amount_cents: -8000,
            reason: 'Plomberie',
            occurred_on: '2026-09-10T00:00:00.000Z',
            created_at: '2026-09-10T09:00:00.000Z',
          },
        ],
      },
      'POST /immobilier/p1/mouvements': { status: 201, body: { ...PROPERTY, balance_cents: 37000 } },
    });
    mockApiRoutes(routeMap);

    render(
      <AuthProvider>
        <ImmobilierPage />
      </AuthProvider>,
    );

    await screen.findByText('Studio centre-ville');
    fireEvent.click(screen.getByRole('button', { name: 'Historique' }));

    expect(await screen.findByText('Plomberie')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Montant du mouvement en euros'), {
      target: { value: '-80' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/immobilier/p1/mouvements'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('refuse un montant illisible sans appeler le serveur', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <ImmobilierPage />
      </AuthProvider>,
    );

    await screen.findByText('Studio centre-ville');
    fireEvent.click(screen.getByRole('button', { name: 'Historique' }));
    await screen.findByText("Aucun mouvement enregistré pour l'instant.");
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();

    fireEvent.change(screen.getByLabelText('Montant du mouvement en euros'), {
      target: { value: 'pas un nombre' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Le montant doit être un nombre.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('redirige vers la connexion sans jeton', async () => {
    window.localStorage.clear();
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <ImmobilierPage />
      </AuthProvider>,
    );

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  });
});
