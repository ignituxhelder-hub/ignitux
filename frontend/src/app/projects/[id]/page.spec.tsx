import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import ProjectDetailPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useParams: () => ({ id: 'p1' }),
}));

const PROJECT = {
  id: 'p1',
  owner_id: 'u1',
  title: 'École motocross',
  description: 'École de motocross avec suivi des élèves en compétition',
  is_public: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

// Les 4 moteurs IGINI (score, tâches, mémoire, connaissance) font chacun leur
// propre appel au montage de la page ; ces routes doivent renvoyer une forme
// réaliste dans tous les tests, sinon le fallback générique de mockApiRoutes
// (200 []) casse les composants qui attendent un objet (score, résumé, graphe).
const ENGINE_ROUTES = {
  // Par défaut, les générateurs sont disponibles : c'est l'état normal du
  // produit, et les tests existants décrivent ce cas-là.
  'GET /igini/status': { status: 200, body: { generatorsEnabled: true, unavailableReason: null } },
  'GET /projects/p1/scores': {
    status: 200,
    body: { etincelle: null, construction: null, evolution: null, transmission: null, confiance: 0 },
  },
  'GET /projects/p1/tasks': { status: 200, body: [] },
  'GET /memory': { status: 200, body: [] },
  'GET /memory/summary': { status: 200, body: { summary: '' } },
  'GET /knowledge/graph': { status: 200, body: { nodes: [], edges: [], isolated: [] } },
  'GET /memory/tags': { status: 200, body: [] },
  'GET /projects/p1/collaborators': { status: 200, body: [] },
  'GET /projects/p1/compliance': { status: 200, body: { disclaimer: 'Info générale.', requirements: [] } },
  'GET /projects/p1/automation/runs': { status: 200, body: [] },
  'GET /projects/p1/workflows': { status: 200, body: [] },
  'GET /workflows/templates': { status: 200, body: [] },
  'GET /projects/p1/financing/rounds': { status: 200, body: { rounds: [], totalCents: 0 } },
  'GET /projects/p1/financing/cap-table': {
    status: 200,
    body: {
      notice: 'Périmètre.',
      holders: [],
      totalBasisPoints: 0,
      discrepancyBasisPoints: 10000,
      founderHasMajority: null,
      founderTrajectory: [],
    },
  },
  'GET /projects/p1/financing/dividends': { status: 200, body: { dividends: [], totalCents: 0 } },
  'GET /projects/p1/financing/buyback': {
    status: 200,
    body: {
      notice: 'Perimetre du rachat.',
      conditions: [],
      definedCount: 0,
      reachedCount: 0,
      totalCount: 3,
      allReached: null,
      missingDefinitions: ['rentabilite', 'autonomie', 'stabilite'],
    },
  },
};

describe('ProjectDetailPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('charge le projet et affiche les 5 sections vides', async () => {
    mockApiRoutes({ 'GET /projects/p1': { status: 200, body: PROJECT }, ...ENGINE_ROUTES });

    render(
      <AuthProvider>
        <ProjectDetailPage />
      </AuthProvider>,
    );

    expect(await screen.findByDisplayValue('École motocross')).toBeInTheDocument();
    expect(screen.getByText("Aucune analyse pour l'instant.")).toBeInTheDocument();
    expect(screen.getByText("Aucun plan pour l'instant.")).toBeInTheDocument();
    expect(screen.getByText("Aucun plan de financement pour l'instant.")).toBeInTheDocument();
    expect(screen.getByText("Aucun plan de développement pour l'instant.")).toBeInTheDocument();
    expect(screen.getByText("Aucun plan de transmission pour l'instant.")).toBeInTheDocument();
  });

  describe('générateurs IA éteints', () => {
    const OFF = {
      'GET /igini/status': {
        status: 200,
        body: {
          generatorsEnabled: false,
          unavailableReason: 'Fonctionnalité IA non disponible pour ce test.',
        },
      },
    };

    it('remplace les 5 boutons par un message, sans erreur rouge', async () => {
      // Un bouton qui échoue fait croire que le produit est cassé. Ici la
      // personne lit « indisponible » avant même de cliquer.
      mockApiRoutes({ 'GET /projects/p1': { status: 200, body: PROJECT }, ...ENGINE_ROUTES, ...OFF });

      render(
        <AuthProvider>
          <ProjectDetailPage />
        </AuthProvider>,
      );

      await screen.findByDisplayValue('École motocross');

      await waitFor(() =>
        expect(screen.getAllByText('Fonctionnalité IA non disponible pour ce test.')).toHaveLength(5),
      );
      expect(screen.queryByText('Analyser ce projet')).not.toBeInTheDocument();
      expect(screen.queryByText('Générer un plan de financement')).not.toBeInTheDocument();
      expect(screen.getAllByText('IA indisponible')).toHaveLength(5);
    });

    it('laisse les 4 moteurs transverses utilisables', async () => {
      // Le sens du dispositif : seuls les générateurs sont coupés. Si les
      // moteurs disparaissaient aussi, il ne resterait plus rien à tester.
      mockApiRoutes({ 'GET /projects/p1': { status: 200, body: PROJECT }, ...ENGINE_ROUTES, ...OFF });

      const { container } = render(
        <AuthProvider>
          <ProjectDetailPage />
        </AuthProvider>,
      );

      await screen.findByDisplayValue('École motocross');

      await waitFor(() => expect(container.textContent).toContain('Mémoire'));
      expect(container.textContent).toContain('Connaissance');
      expect(container.textContent).toContain('Conformité');
    });

    it('garde les boutons tant que le serveur ne répond pas explicitement', async () => {
      // Dans le doute, on propose : annoncer « indisponible » à tort
      // empêcherait quelqu'un d'utiliser une fonctionnalité qui marche.
      mockApiRoutes({
        'GET /projects/p1': { status: 200, body: PROJECT },
        ...ENGINE_ROUTES,
        'GET /igini/status': { status: 500, body: { message: 'boom' } },
      });

      render(
        <AuthProvider>
          <ProjectDetailPage />
        </AuthProvider>,
      );

      expect(await screen.findByText('Analyser ce projet')).toBeInTheDocument();
      expect(screen.queryByText('IA indisponible')).not.toBeInTheDocument();
    });
  });

  it('génère une analyse et l\'affiche sans appeler la vraie API Claude (tout est simulé)', async () => {
    mockApiRoutes({
      'GET /projects/p1': { status: 200, body: PROJECT },
      'POST /projects/p1/analyze': {
        status: 201,
        body: {
          id: 'a1',
          project_id: 'p1',
          summary: 'Idée solide pour un premier lancement local.',
          feasibility_score: 7,
          strengths: ['Marché de niche identifié'],
          risks: ['Dépendance à un nombre limité de compétitions'],
          next_steps: ['Valider avec 10 élèves potentiels'],
          created_at: '2026-01-02T00:00:00.000Z',
        },
      },
      ...ENGINE_ROUTES,
    });

    render(
      <AuthProvider>
        <ProjectDetailPage />
      </AuthProvider>,
    );

    await screen.findByDisplayValue('École motocross');
    fireEvent.click(screen.getByRole('button', { name: /analyser ce projet/i }));

    expect(await screen.findByText('Idée solide pour un premier lancement local.')).toBeInTheDocument();
    expect(screen.getByText('Score de faisabilité : 7/10')).toBeInTheDocument();
  });

  it("recharge les tâches et l'automatisation après une génération (régression)", async () => {
    // Régression : chaque génération déclenche l'automatisation côté backend
    // (tâches d'étape créées/fermées), mais les sections dérivées ne se
    // rechargeaient qu'au montage. Résultat visible pour l'utilisateur :
    // l'automatisation semblait n'avoir rien fait, et un déclenchement manuel
    // juste après affichait "0 tâche créée" (le travail ayant déjà été fait
    // automatiquement quelques secondes plus tôt, sans que l'UI le montre).
    const routes: Record<string, { status: number; body: unknown }> = {
      'GET /projects/p1': { status: 200, body: PROJECT },
      'POST /projects/p1/analyze': {
        status: 201,
        body: {
          id: 'a1',
          project_id: 'p1',
          summary: 'Analyse générée.',
          feasibility_score: 7,
          strengths: [],
          risks: [],
          next_steps: [],
          created_at: '2026-01-02T00:00:00.000Z',
        },
      },
      ...ENGINE_ROUTES,
    };
    mockApiRoutes(routes);

    render(
      <AuthProvider>
        <ProjectDetailPage />
      </AuthProvider>,
    );

    await screen.findByDisplayValue('École motocross');
    expect(await screen.findByText("Aucune tâche pour l'instant.")).toBeInTheDocument();

    // Ce que le backend aura fait pendant la génération : l'automatisation a
    // créé une tâche d'étape et journalisé son exécution.
    routes['GET /projects/p1/tasks'] = {
      status: 200,
      body: [
        {
          id: 't1',
          project_id: 'p1',
          title: 'Créer le plan de construction (Construction)',
          description: null,
          status: 'pending',
          assignee: 'igini',
          source: 'automation',
          created_at: '2026-01-02T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        },
      ],
    };
    routes['GET /projects/p1/automation/runs'] = {
      status: 200,
      body: [
        {
          id: 'run1',
          project_id: 'p1',
          tasks_created_count: 4,
          tasks_closed_count: 0,
          concept_links_created_count: 0,
          created_at: '2026-01-02T00:00:00.000Z',
        },
      ],
    };

    fireEvent.click(screen.getByRole('button', { name: /analyser ce projet/i }));

    // Sans le signal de rafraîchissement, ces deux assertions échouent : la
    // liste resterait vide et l'historique d'automatisation aussi.
    expect(await screen.findByText('Créer le plan de construction (Construction)')).toBeInTheDocument();
    await waitFor(() =>
      expect(document.body.textContent).toContain('4 tâche(s) créée(s), 0 fermée(s)'),
    );
  });

  it('sauvegarde les modifications du projet', async () => {
    mockApiRoutes({
      'GET /projects/p1': { status: 200, body: PROJECT },
      'PATCH /projects/p1': {
        status: 200,
        body: { ...PROJECT, title: 'École motocross avancée' },
      },
      ...ENGINE_ROUTES,
    });

    render(
      <AuthProvider>
        <ProjectDetailPage />
      </AuthProvider>,
    );

    const titleInput = await screen.findByDisplayValue('École motocross');
    fireEvent.change(titleInput, { target: { value: 'École motocross avancée' } });
    fireEvent.click(screen.getByRole('button', { name: /^sauvegarder$/i }));

    await waitFor(() => expect(screen.getByDisplayValue('École motocross avancée')).toBeInTheDocument());
  });

  it('supprime le projet et redirige vers /projects', async () => {
    mockApiRoutes({
      'GET /projects/p1': { status: 200, body: PROJECT },
      'DELETE /projects/p1': { status: 204, body: null },
      ...ENGINE_ROUTES,
    });

    render(
      <AuthProvider>
        <ProjectDetailPage />
      </AuthProvider>,
    );

    await screen.findByDisplayValue('École motocross');
    fireEvent.click(screen.getByRole('button', { name: /supprimer le projet/i }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/projects'));
  });

  it('rend le projet public puis privé', async () => {
    mockApiRoutes({
      'GET /projects/p1': { status: 200, body: PROJECT },
      'PATCH /projects/p1/visibility': { status: 200, body: { ...PROJECT, is_public: true } },
      ...ENGINE_ROUTES,
    });

    render(
      <AuthProvider>
        <ProjectDetailPage />
      </AuthProvider>,
    );

    await screen.findByDisplayValue('École motocross');
    expect(screen.getByText("Ce projet n'est visible que par toi.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /rendre public/i }));

    expect(await screen.findByText('Ce projet est visible dans la communauté.')).toBeInTheDocument();
  });

  it('affiche une vue lecture seule pour un collaborateur (pas le propriétaire)', async () => {
    signInAs('tok456', { id: 'u2', email: 'collaborateur@b.com' });
    mockApiRoutes({
      'GET /projects/p1': { status: 200, body: PROJECT },
      'GET /projects/p1/analyses': {
        status: 200,
        body: [
          {
            id: 'a1',
            project_id: 'p1',
            summary: 'Résumé existant.',
            feasibility_score: 6,
            strengths: [],
            risks: [],
            next_steps: [],
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      ...ENGINE_ROUTES,
    });

    render(
      <AuthProvider>
        <ProjectDetailPage />
      </AuthProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'École motocross' })).toBeInTheDocument();
    expect(screen.getByText(/Projet partagé avec toi/)).toBeInTheDocument();
    expect(screen.getByText('Résumé existant.')).toBeInTheDocument();

    // Pas de bouton de génération, pas de formulaire d'édition.
    expect(screen.queryByRole('button', { name: /analyser ce projet/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /supprimer le projet/i })).not.toBeInTheDocument();
    // La gestion des collaborateurs reste réservée au propriétaire.
    expect(screen.queryByText('Collaborateurs')).not.toBeInTheDocument();

    // Les 4 moteurs transverses sont visibles en lecture seule pour un collaborateur.
    expect(screen.getByText('Score IGNITUX')).toBeInTheDocument();
    expect(screen.getByText('Tâches')).toBeInTheDocument();
    expect(screen.getByText('Mémoire')).toBeInTheDocument();
    expect(screen.getByText('Connaissance')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nouvelle tâche')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Contenu du souvenir')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nom du concept')).not.toBeInTheDocument();

    // Conformité et automatisation sont aussi visibles en lecture seule.
    expect(screen.getByText('Conformité (France)')).toBeInTheDocument();
    expect(screen.getByText('Automatisation')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /lancer l'automatisation/i })).not.toBeInTheDocument();
  });
});
