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

function afficher() {
  return render(
    <AuthProvider>
      <RolesPage />
    </AuthProvider>,
  );
}

describe('RolesPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    router.push.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  it('pose la question au premier passage, sans jargon', async () => {
    mockApiRoutes(routes());
    afficher();

    expect(await screen.findByRole('heading', { name: /Qui es-tu aujourd'hui/ })).toBeInTheDocument();
    expect(screen.getByText(/Tu peux en changer quand tu veux/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/pas un dossier|architecture/);
  });

  // Les cacher laisserait croire qu'Ignitux ne les a pas prévus ; les ouvrir
  // promettrait un espace qui n'existe pas. Une ligne suffit à le dire.
  it('nomme les rôles à venir sur une ligne, sans case à cocher', async () => {
    mockApiRoutes(
      routes({
        'GET /roles/moi': {
          status: 200,
          body: mesRoles({
            catalogue: [
              role('entrepreneur', 'Entrepreneur', true, false),
              role('mentor', 'Mentor', false, false),
              role('expert', 'Expert', false, false),
              role('administrateur', 'Administrateur', false, false),
            ],
          }),
        },
      }),
    );
    afficher();

    expect(await screen.findByText('Bientôt : Mentor, Expert — pas encore ouverts.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Mentor/)).not.toBeInTheDocument();
    // L'administration n'est pas un rôle « à venir » pour le public.
    expect(document.body.textContent).not.toContain('Administrateur');
  });

  it('coche Entrepreneur d’avance au premier passage', async () => {
    mockApiRoutes(routes());
    afficher();

    expect(await screen.findByLabelText(/Entrepreneur/)).toBeChecked();
    expect(screen.getByLabelText(/Investisseur/)).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeEnabled();
  });

  it('enregistre Entrepreneur d’un clic puis emmène créer le premier projet', async () => {
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
    afficher();

    // Déjà coché : un seul clic.
    expect(await screen.findByLabelText(/Entrepreneur/)).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));

    await waitFor(() => {
      const envoi = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[1]?.method === 'PUT',
      );
      expect(envoi).toBeDefined();
      expect(JSON.parse(String(envoi![1].body))).toEqual({ roles: ['entrepreneur'] });
    });
    // Juste après l'inscription, l'entrepreneur va droit à son premier projet.
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/projects'));
  });

  it('emmène sur le bureau qui ne prend que le rôle Investisseur', async () => {
    mockApiRoutes(
      routes({
        'PUT /roles/moi': {
          status: 200,
          body: mesRoles({ roles: ['investisseur'], activeRole: 'investisseur' }),
        },
      }),
    );
    afficher();

    fireEvent.click(await screen.findByLabelText(/Entrepreneur/));
    fireEvent.click(screen.getByLabelText(/Investisseur/));
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/accueil'));
  });

  it("n'enregistre rien sans rôle coché, et le dit", async () => {
    mockApiRoutes(routes());
    afficher();

    // Entrepreneur est coché d'avance : on le décoche.
    fireEvent.click(await screen.findByLabelText(/Entrepreneur/));
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeDisabled();
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
    afficher();

    fireEvent.click(await screen.findByLabelText(/Investisseur/));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(/3 participation\(s\) sont enregistrées/)).toBeInTheDocument();
    // La case revient cochée : le rôle est toujours tenu, et l'écran ne doit
    // pas montrer un état que la base ne connaît pas.
    expect(screen.getByLabelText(/Investisseur/)).toBeChecked();
  });

  it('garde en carte un rôle fermé que la personne tient déjà', async () => {
    mockApiRoutes(
      routes({
        'GET /roles/moi': {
          status: 200,
          body: mesRoles({
            roles: ['entrepreneur', 'administrateur'],
            activeRole: 'entrepreneur',
            catalogue: [
              role('entrepreneur', 'Entrepreneur', true, true),
              role('administrateur', 'Administrateur', false, true),
            ],
          }),
        },
      }),
    );
    afficher();

    const admin = await screen.findByLabelText(/Administrateur/);
    expect(admin).toBeChecked();
    expect(admin).toBeDisabled();
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
    afficher();

    expect(await screen.findByText(/2 participation\(s\) sont enregistrées/)).toBeInTheDocument();
  });
});
