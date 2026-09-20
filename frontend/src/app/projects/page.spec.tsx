import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import ProjectsPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const PROJET = {
  id: 'p1',
  owner_id: 'u1',
  title: 'École motocross',
  description: 'Une école de motocross avec suivi des élèves.',
};

function routes(overrides: Record<string, { status: number; body: unknown }> = {}) {
  return {
    'GET /projects': { status: 200, body: [PROJET] },
    'GET /parcours/mes-projets': {
      status: 200,
      body: [
        {
          projectId: 'p1',
          title: 'École motocross',
          phase: 'Découvrir',
          nextStep: 'Analyser ton idée',
        },
      ],
    },
    'GET /roles/moi': {
      status: 200,
      body: { roles: ['entrepreneur'], activeRole: 'entrepreneur', suggestions: [], catalogue: [] },
    },
    ...overrides,
  };
}

describe('ProjectsPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    router.push.mockClear();
  });

  it('redirige vers la connexion sans jeton', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <ProjectsPage />
      </AuthProvider>,
    );

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  });

  describe('accueil simplifié', () => {
    beforeEach(() => {
      signInAs('tok123', { id: 'u1', email: 'helder@exemple.fr' });
    });

    // On ne devine pas un prenom depuis une adresse : « heldersimoes.ge »
    // n en est pas un, et se tromper de nom est pire que ne pas nommer.
    it('accueille sans deviner de prénom, et dit quel compte est ouvert', async () => {
      mockApiRoutes(routes());

      render(
        <AuthProvider>
          <ProjectsPage />
        </AuthProvider>,
      );

      expect(
        await screen.findByRole('heading', { name: 'Bienvenue sur Ignitux' }),
      ).toBeInTheDocument();
      expect(screen.getByText('helder@exemple.fr')).toBeInTheDocument();
    });

    // Sept liens de navigation s'affichaient d'emblée : c'était demander de
    // comprendre Ignitux avant de s'en servir.
    it("n'étale pas les outils, mais les garde à un clic", async () => {
      mockApiRoutes(routes());

      render(
        <AuthProvider>
          <ProjectsPage />
        </AuthProvider>,
      );

      await screen.findByRole('heading', { name: 'Bienvenue sur Ignitux' });
      expect(screen.queryByRole('link', { name: 'Facturation' })).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Tous mes outils' }));

      expect(await screen.findByRole('link', { name: 'Facturation' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Relations' })).toBeInTheDocument();
    });

    // Une seule action principale : proposer de créer pendant qu'on liste,
    // c'est offrir deux actions là où une suffit.
    it('replie la création derrière un seul bouton', async () => {
      mockApiRoutes(routes());

      render(
        <AuthProvider>
          <ProjectsPage />
        </AuthProvider>,
      );

      expect(
        await screen.findByRole('button', { name: 'Créer mon projet' }),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText('Nom du projet')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Créer mon projet' }));

      expect(await screen.findByLabelText('Nom du projet')).toBeInTheDocument();
      expect(screen.getByLabelText('Décris ton idée')).toBeInTheDocument();
    });

    // Quand on revient, la question n'est pas « c'était quoi ? » mais
    // « j'en étais où ? ».
    it('montre la prochaine étape de chaque projet, pas sa description', async () => {
      mockApiRoutes(routes());

      render(
        <AuthProvider>
          <ProjectsPage />
        </AuthProvider>,
      );

      expect(await screen.findByText('Analyser ton idée')).toBeInTheDocument();
      expect(screen.getByText(/Découvrir · prochaine étape/)).toBeInTheDocument();
      expect(screen.queryByText(/suivi des élèves/)).toBeNull();
    });

    // Le parcours est un confort : s'il tombe, la liste reste utile.
    it('retombe sur la description quand le parcours ne répond pas', async () => {
      mockApiRoutes(routes({ 'GET /parcours/mes-projets': { status: 500, body: {} } }));

      render(
        <AuthProvider>
          <ProjectsPage />
        </AuthProvider>,
      );

      expect(await screen.findByText('École motocross')).toBeInTheDocument();
      expect(screen.getByText(/suivi des élèves/)).toBeInTheDocument();
    });

    it("invite à décrire son idée quand aucun projet n'existe", async () => {
      mockApiRoutes(routes({ 'GET /projects': { status: 200, body: [] } }));

      render(
        <AuthProvider>
          <ProjectsPage />
        </AuthProvider>,
      );

      expect(await screen.findByText(/pas encore de projet/i)).toBeInTheDocument();
    });

    // Revenir à une liste après avoir créé serait un détour que personne ne
    // demande : c'est dans le projet que le parcours reprend la main.
    it('emmène directement dans le projet créé', async () => {
      mockApiRoutes(
        routes({
          'GET /projects': { status: 200, body: [] },
          'POST /projects': {
            status: 201,
            body: { id: 'p9', owner_id: 'u1', title: 'Nouvelle idée', description: null },
          },
        }),
      );

      render(
        <AuthProvider>
          <ProjectsPage />
        </AuthProvider>,
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Créer mon projet' }));
      fireEvent.change(screen.getByLabelText('Nom du projet'), {
        target: { value: 'Nouvelle idée' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Commencer' }));

      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/projects/p9'));
    });
  });
});
