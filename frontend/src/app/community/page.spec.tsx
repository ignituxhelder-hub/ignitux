import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import CommunityPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

describe('CommunityPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('liste les projets publics, avec leur porteur', async () => {
    mockApiRoutes({
      'GET /community/projects': {
        status: 200,
        body: [
          { id: 'p1', title: 'École motocross', description: 'Cours pour débutants', created_at: '2026-01-01T00:00:00.000Z', porteur: 'Camille' },
        ],
      },
    });

    render(
      <AuthProvider>
        <CommunityPage />
      </AuthProvider>,
    );

    expect(await screen.findByText('École motocross')).toBeInTheDocument();
    expect(screen.getByText('Cours pour débutants')).toBeInTheDocument();
    // Article 21 : une idée exposée sans son auteur ne lui laisse aucune
    // reconnaissance. Jusqu'au 25 septembre 2026, cette page n'affichait que
    // le titre et la description.
    expect(screen.getByText('Porté par Camille')).toBeInTheDocument();
  });

  it('dit que le porteur n’a pas de nom affiché, plutôt que de l’appeler anonyme', async () => {
    // `null` ne veut pas dire « anonyme » : la personne n'a pas choisi de se
    // cacher, elle n'a pas rempli son nom. Écrire « Anonyme » lui prêterait
    // une intention. Et son adresse email n'est évidemment pas une solution
    // de repli — elle est privée par défaut (article 13).
    mockApiRoutes({
      'GET /community/projects': {
        status: 200,
        body: [
          { id: 'p1', title: 'École motocross', description: null, created_at: '2026-01-01T00:00:00.000Z', porteur: null },
        ],
      },
    });

    render(
      <AuthProvider>
        <CommunityPage />
      </AuthProvider>,
    );

    expect(await screen.findByText('Porteur sans nom affiché')).toBeInTheDocument();
    expect(screen.queryByText(/anonyme/i)).toBeNull();
    expect(screen.queryByText(/@/)).toBeNull();
  });

  it("affiche un message quand aucun projet n'est public", async () => {
    mockApiRoutes({ 'GET /community/projects': { status: 200, body: [] } });

    render(
      <AuthProvider>
        <CommunityPage />
      </AuthProvider>,
    );

    expect(
      await screen.findByText(/Aucun projet public pour l'instant/),
    ).toBeInTheDocument();
  });
});
