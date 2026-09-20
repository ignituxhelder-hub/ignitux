import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import RolesPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

function role(id: string, label: string, available: boolean, held: boolean) {
  return { id, label, summary: `Résumé ${label}`, available, home: null, domains: [], held };
}

function mesRoles(overrides: Record<string, unknown> = {}) {
  return {
    roles: [],
    activeRole: null,
    suggestions: [],
    catalogue: [
      role('entrepreneur', 'Entrepreneur', true, false),
      role('investisseur', 'Investisseur', true, false),
      role('mentor', 'Mentor', false, false),
    ],
    ...overrides,
  };
}

function routes(overrides: Record<string, { status: number; body: unknown }> = {}) {
  return {
    'GET /roles/moi': { status: 200, body: mesRoles() },
    ...overrides,
  };
}

describe('RolesPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    router.push.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  it("pose la question au premier passage", async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <RolesPage />
      </AuthProvider>,
    );

    expect(await screen.findByRole('heading', { name: /Qui es-tu aujourd'hui/ })).toBeInTheDocument();
  });

  // Les cacher laisserait croire qu'Ignitux ne les a pas prévus ; les ouvrir
  // promettrait un espace qui n'existe pas.
  it('montre les rôles à venir, désactivés, en disant pourquoi', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <RolesPage />
      </AuthProvider>,
    );

    const mentor = await screen.findByLabelText(/Mentor/);
    expect(mentor).toBeDisabled();
    expect(screen.getByText(/pas encore ouvert/)).toBeInTheDocument();
  });

  it('enregistre les rôles cochés puis emmène dans le premier espace', async () => {
    mockApiRoutes(
      routes({
        'PUT /roles/moi': {
          status: 200,
          body: mesRoles({
            roles: ['entrepreneur'],
            activeRole: 'entrepreneur',
            catalogue: [
              role('entrepreneur', 'Entrepreneur', true, true),
              role('investisseur', 'Investisseur', true, false),
              role('mentor', 'Mentor', false, false),
            ],
          }),
        },
      }),
    );

    render(
      <AuthProvider>
        <RolesPage />
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByLabelText(/Entrepreneur/));
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));

    await waitFor(() => {
      const envoi = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[1]?.method === 'PUT',
      );
      expect(envoi).toBeDefined();
      expect(JSON.parse(String(envoi![1].body))).toEqual({ roles: ['entrepreneur'] });
    });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/projects'));
  });

  it("n'enregistre rien sans rôle coché, et le dit", async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <RolesPage />
      </AuthProvider>,
    );

    expect(await screen.findByRole('button', { name: 'Continuer' })).toBeDisabled();
    expect(screen.getByText(/Garde au moins un rôle/)).toBeInTheDocument();
  });

  // Le serveur refuse de retirer un rôle qui tient encore des données ; la
  // page doit rendre ce refus lisible, pas l'avaler.
  it('affiche le refus du serveur quand un rôle retient des données', async () => {
    mockApiRoutes(
      routes({
        'GET /roles/moi': {
          status: 200,
          body: mesRoles({
            roles: ['entrepreneur', 'investisseur'],
            activeRole: 'entrepreneur',
            catalogue: [
              role('entrepreneur', 'Entrepreneur', true, true),
              role('investisseur', 'Investisseur', true, true),
            ],
          }),
        },
        'PUT /roles/moi': {
          status: 400,
          body: {
            message:
              'Le rôle « Investisseur » ne peut pas être retiré : 3 participation(s) sont ' +
              'enregistrées à ton nom.',
          },
        },
      }),
    );

    render(
      <AuthProvider>
        <RolesPage />
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByLabelText(/Investisseur/));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(/3 participation\(s\) sont enregistrées/)).toBeInTheDocument();
    // La case revient cochée : le rôle est toujours tenu, et l'écran ne doit
    // pas montrer un état que la base ne connaît pas.
    expect(screen.getByLabelText(/Investisseur/)).toBeChecked();
  });

  it('signale un rôle non pris pour lequel des données existent', async () => {
    mockApiRoutes(
      routes({
        'GET /roles/moi': {
          status: 200,
          body: mesRoles({
            roles: ['entrepreneur'],
            activeRole: 'entrepreneur',
            suggestions: [
              {
                role: 'investisseur',
                count: 2,
                detail: '2 participation(s) sont enregistrées à ton nom',
              },
            ],
          }),
        },
      }),
    );

    render(
      <AuthProvider>
        <RolesPage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/2 participation\(s\) sont enregistrées/)).toBeInTheDocument();
  });
});
