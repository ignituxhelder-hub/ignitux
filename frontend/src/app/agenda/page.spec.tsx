import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import AgendaPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const CONTACT = {
  id: 'c1',
  owner_id: 'u1',
  company_id: null,
  project_id: null,
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@exemple.fr',
  phone: null,
  role: null,
  kind: 'prospect',
  stage: 'nouveau',
  notes: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

const EVENEMENT = {
  type: 'evenement',
  id: 'e1',
  title: 'Rendez-vous Ada',
  date: '2026-10-05T09:00:00.000Z',
  location: 'Bureau',
  note: null,
  projectId: null,
  contactId: 'c1',
};

const ECHEANCE = {
  type: 'echeance',
  id: 't1',
  title: 'Envoyer le devis',
  date: '2026-10-01T00:00:00.000Z',
  projectId: 'p1',
  status: 'pending',
};

function routes(overrides: Record<string, { status: number; body: unknown }> = {}) {
  return {
    'GET /agenda': { status: 200, body: [ECHEANCE, EVENEMENT] },
    'GET /crm/contacts': { status: 200, body: [CONTACT] },
    ...overrides,
  };
}

describe('AgendaPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('liste les rendez-vous et les échéances, triés par date', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <AgendaPage />
      </AuthProvider>,
    );

    const list = await screen.findByRole('list', { name: 'Agenda' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Envoyer le devis')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Rendez-vous Ada')).toBeInTheDocument();
  });

  it("affiche le lieu d'un rendez-vous et signale une échéance", async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <AgendaPage />
      </AuthProvider>,
    );

    expect(await screen.findByText('Rendez-vous Ada')).toBeInTheDocument();
    expect(screen.getByText(/Bureau/)).toBeInTheDocument();
    expect(screen.getAllByText(/échéance/).length).toBeGreaterThan(0);
  });

  it('ajoute un rendez-vous', async () => {
    const routeMap = routes({
      'POST /agenda': { status: 201, body: EVENEMENT },
      'GET /agenda': { status: 200, body: [] },
    });
    mockApiRoutes(routeMap);

    render(
      <AuthProvider>
        <AgendaPage />
      </AuthProvider>,
    );

    await screen.findByText("Aucun rendez-vous ni échéance pour l'instant.");
    routeMap['GET /agenda'] = { status: 200, body: [EVENEMENT] };

    fireEvent.change(screen.getByLabelText('Titre du rendez-vous'), {
      target: { value: 'Rendez-vous Ada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    const list = await screen.findByRole('list', { name: 'Agenda' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
  });

  it('modifie un rendez-vous via le formulaire en ligne', async () => {
    const routeMap = routes({
      'GET /agenda': { status: 200, body: [EVENEMENT] },
      'PATCH /agenda/e1': { status: 200, body: { ...EVENEMENT, title: 'Rendez-vous reporté' } },
    });
    mockApiRoutes(routeMap);

    render(
      <AuthProvider>
        <AgendaPage />
      </AuthProvider>,
    );

    await screen.findByText('Rendez-vous Ada');
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    fireEvent.change(screen.getByLabelText('Titre de Rendez-vous Ada'), {
      target: { value: 'Rendez-vous reporté' },
    });
    routeMap['GET /agenda'] = { status: 200, body: [{ ...EVENEMENT, title: 'Rendez-vous reporté' }] };
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Rendez-vous reporté')).toBeInTheDocument();
  });

  it('supprime un rendez-vous directement, sans boîte de confirmation', async () => {
    const routeMap = routes({
      'GET /agenda': { status: 200, body: [EVENEMENT] },
      'DELETE /agenda/e1': { status: 204, body: null },
    });
    mockApiRoutes(routeMap);

    render(
      <AuthProvider>
        <AgendaPage />
      </AuthProvider>,
    );

    await screen.findByText('Rendez-vous Ada');
    routeMap['GET /agenda'] = { status: 200, body: [] };
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/agenda/e1'),
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it('ne propose pas de modifier ou supprimer une échéance', async () => {
    mockApiRoutes(routes({ 'GET /agenda': { status: 200, body: [ECHEANCE] } }));

    render(
      <AuthProvider>
        <AgendaPage />
      </AuthProvider>,
    );

    await screen.findByText('Envoyer le devis');
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
  });

  it('redirige vers la connexion sans jeton', async () => {
    window.localStorage.clear();
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <AgendaPage />
      </AuthProvider>,
    );

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  });
});
