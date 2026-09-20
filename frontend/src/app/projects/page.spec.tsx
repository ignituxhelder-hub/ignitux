import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, mockFetchSequence, signInAs } from '@/test-utils/mocks';
import ProjectsPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

describe('ProjectsPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redirige vers /login quand personne n\'est connecté', async () => {
    mockFetchSequence({ status: 200, body: [] });

    render(
      <AuthProvider>
        <ProjectsPage />
      </AuthProvider>,
    );

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  });

  it('affiche les projets du propriétaire connecté', async () => {
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
    mockFetchSequence({
      status: 200,
      body: [{ id: 'p1', owner_id: 'u1', title: 'École motocross', description: null }],
    });

    render(
      <AuthProvider>
        <ProjectsPage />
      </AuthProvider>,
    );

    expect(await screen.findByText('École motocross')).toBeInTheDocument();
    expect(screen.getByText('a@b.com')).toBeInTheDocument();
  });

  it("affiche un message quand aucun projet n'existe encore", async () => {
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
    mockFetchSequence({ status: 200, body: [] });

    render(
      <AuthProvider>
        <ProjectsPage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/aucun projet pour l'instant/i)).toBeInTheDocument();
  });

  it('crée un projet et l\'ajoute en tête de liste', async () => {
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
    // Adresse par route et non par ordre d arrivee : la page interroge aussi
    // ses roles, et une sequence positionnelle attribuerait la liste des
    // projets a la mauvaise requete des que l ordre change.
    mockApiRoutes({
      'GET /projects': { status: 200, body: [] },
      'POST /projects': {
        status: 201,
        body: { id: 'p1', owner_id: 'u1', title: 'Nouvelle idée', description: null },
      },
    });

    render(
      <AuthProvider>
        <ProjectsPage />
      </AuthProvider>,
    );

    await screen.findByText(/aucun projet pour l'instant/i);

    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Nouvelle idée' } });
    fireEvent.click(screen.getByRole('button', { name: /créer le projet/i }));

    expect(await screen.findByText('Nouvelle idée')).toBeInTheDocument();
  });
});
