import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import ProjectsPage from './page';

const router = createRouterMock();
// Un seul `?creer=1` possible par test, comme reset-password/page.spec.tsx :
// mutable au niveau du module, remis à vide avant chaque test.
let recherche = '';
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(recherche),
}));

const PROJET = {
  id: 'p1',
  owner_id: 'u1',
  title: 'École motocross',
  description: 'Une école de motocross avec suivi des élèves.',
};

const AUTRE_PROJET = {
  id: 'p2',
  owner_id: 'u1',
  title: 'Boutique de thés',
  description: 'Vente en ligne de thés en vrac.',
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
    recherche = '';
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
      // 0 projet : avec exactement 1, la page redirige directement dedans
      // (voir plus bas) et cet écran ne serait jamais vu.
      mockApiRoutes(routes({ 'GET /projects': { status: 200, body: [] } }));

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

    // « Mes projets » est une application parmi d'autres : on passe aux
    // voisines par le bureau et la barre des tâches, pas par elle.
    it('ne mène plus vers les autres applications', async () => {
      mockApiRoutes(routes({ 'GET /projects': { status: 200, body: [] } }));

      render(
        <AuthProvider>
          <ProjectsPage />
        </AuthProvider>,
      );

      await screen.findByRole('heading', { name: 'Bienvenue sur Ignitux' });
      expect(screen.queryByRole('link', { name: 'Facturation' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Relations' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Tous mes outils' })).toBeNull();
    });

    // Une seule action principale : proposer de créer pendant qu'on liste,
    // c'est offrir deux actions là où une suffit.
    it('replie la création derrière un seul bouton', async () => {
      mockApiRoutes(routes({ 'GET /projects': { status: 200, body: [] } }));

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
      // 2 projets : avec un seul, la page redirigerait directement dedans
      // au lieu de montrer la liste (voir plus bas).
      mockApiRoutes(routes({ 'GET /projects': { status: 200, body: [PROJET, AUTRE_PROJET] } }));

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
      mockApiRoutes(
        routes({
          'GET /projects': { status: 200, body: [PROJET, AUTRE_PROJET] },
          'GET /parcours/mes-projets': { status: 500, body: {} },
        }),
      );

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

    // Avec un seul projet, passer par une liste qui ne contient qu'une seule
    // ligne n'aide personne : on entre directement dedans.
    describe('un seul projet', () => {
      it("redirige directement dans l'unique projet, sans montrer la liste", async () => {
        mockApiRoutes(routes());

        render(
          <AuthProvider>
            <ProjectsPage />
          </AuthProvider>,
        );

        await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/projects/p1'));
      });

      // Le seul moyen de créer un second projet passe par ce lien : sans ce
      // garde-fou, la redirection ci-dessus empêcherait d'en créer un autre.
      it("ne redirige pas quand on vient créer un nouveau projet (?creer=1)", async () => {
        recherche = 'creer=1';
        mockApiRoutes(routes());

        render(
          <AuthProvider>
            <ProjectsPage />
          </AuthProvider>,
        );

        expect(await screen.findByLabelText('Nom du projet')).toBeInTheDocument();
        expect(router.replace).not.toHaveBeenCalledWith('/projects/p1');
      });
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
