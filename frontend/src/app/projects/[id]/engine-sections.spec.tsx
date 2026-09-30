import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApiRoutes } from '@/test-utils/mocks';
import { KnowledgeSection, MemorySection, ScoreHistorySection, ScoreSection, TasksSection } from './engine-sections';

const TOKEN = 'tok123';
const PROJECT_ID = 'p1';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ScoreSection', () => {
  it('affiche les scores connus et un tiret pour les scores absents', async () => {
    mockApiRoutes({
      'GET /projects/p1/scores': {
        status: 200,
        body: { etincelle: 7, construction: null, evolution: null, transmission: null, confiance: 2 },
      },
    });

    render(<ScoreSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText('7/10')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('affiche une erreur si le chargement échoue', async () => {
    mockApiRoutes({ 'GET /projects/p1/scores': { status: 500, body: { message: 'Oups.' } } });

    render(<ScoreSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText('Oups.')).toBeInTheDocument();
  });
});

describe('ScoreHistorySection', () => {
  it("affiche un message quand il n'y a pas encore d'historique", async () => {
    mockApiRoutes({ 'GET /projects/p1/scores/historique': { status: 200, body: [] } });

    render(<ScoreHistorySection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText(/Pas encore d.historique/)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Évolution des scores dans le temps' })).not.toBeInTheDocument();
  });

  it('dessine une courbe par score, en sautant les relevés manquants', async () => {
    mockApiRoutes({
      'GET /projects/p1/scores/historique': {
        status: 200,
        body: [
          { jour: '2026-09-01', etincelle: 5, construction: null, evolution: 2, transmission: null, confiance: 4 },
          { jour: '2026-09-02', etincelle: 6, construction: 3, evolution: null, transmission: null, confiance: 4 },
          { jour: '2026-09-03', etincelle: 7, construction: 4, evolution: 3, transmission: 1, confiance: 6 },
        ],
      },
    });

    const { container } = render(<ScoreHistorySection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByRole('img', { name: 'Évolution des scores dans le temps' })).toBeInTheDocument();
    // Un tracé par score qui a au moins deux points consécutifs connus
    // (étincelle et confiance) ; construction n'en a qu'un seul relevé
    // consécutif possible (jours 2 et 3), les autres sont trop troués.
    expect(container.querySelectorAll('svg path').length).toBeGreaterThan(0);
    expect(screen.getByText('2026-09-01')).toBeInTheDocument();
    expect(screen.getByText('2026-09-03')).toBeInTheDocument();
  });

  it('affiche une erreur si le chargement échoue', async () => {
    mockApiRoutes({ 'GET /projects/p1/scores/historique': { status: 500, body: { message: 'Oups.' } } });

    render(<ScoreHistorySection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText('Oups.')).toBeInTheDocument();
  });
});

describe('TasksSection', () => {
  it('liste les tâches et permet de créer une tâche', async () => {
    mockApiRoutes({
      'GET /projects/p1/tasks': {
        status: 200,
        body: [
          {
            id: 't1',
            project_id: 'p1',
            title: 'Valider le pitch',
            description: null,
            status: 'pending',
            assignee: 'human',
            source: 'analysis',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      'POST /projects/p1/tasks': {
        status: 201,
        body: {
          id: 't2',
          project_id: 'p1',
          title: 'Nouvelle tâche',
          description: null,
          status: 'pending',
          assignee: 'human',
          source: 'manual',
          created_at: '2026-01-02T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        },
      },
    });

    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText('Valider le pitch')).toBeInTheDocument();
    expect(screen.getByText("Suggérée par l'analyse")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nouvelle tâche'), { target: { value: 'Nouvelle tâche' } });
    fireEvent.click(screen.getByRole('button', { name: /^ajouter$/i }));

    expect(await screen.findByText('Ajoutée manuellement')).toBeInTheDocument();
  });

  it('met à jour le statut d\'une tâche', async () => {
    mockApiRoutes({
      'GET /projects/p1/tasks': {
        status: 200,
        body: [
          {
            id: 't1',
            project_id: 'p1',
            title: 'Valider le pitch',
            description: null,
            status: 'pending',
            assignee: 'human',
            source: 'manual',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      'PATCH /tasks/t1/status': {
        status: 200,
        body: {
          id: 't1',
          project_id: 'p1',
          title: 'Valider le pitch',
          description: null,
          status: 'done',
          assignee: 'human',
          source: 'manual',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        },
      },
    });

    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} />);

    const select = await screen.findByLabelText('Statut de Valider le pitch');
    fireEvent.change(select, { target: { value: 'done' } });

    await waitFor(() => expect((select as HTMLSelectElement).value).toBe('done'));
  });

  it('masque le formulaire d\'ajout et le statut modifiable en lecture seule', async () => {
    mockApiRoutes({
      'GET /projects/p1/tasks': {
        status: 200,
        body: [
          {
            id: 't1',
            project_id: 'p1',
            title: 'Valider le pitch',
            description: null,
            status: 'pending',
            assignee: 'human',
            source: 'manual',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    });

    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} readOnly />);

    expect(await screen.findByText('Valider le pitch')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nouvelle tâche')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Statut de Valider le pitch')).not.toBeInTheDocument();
    expect(screen.getByText('À faire')).toBeInTheDocument();
  });
});

describe('MemorySection', () => {
  it('affiche le résumé et permet d\'enregistrer un souvenir', async () => {
    mockApiRoutes({
      'GET /memory': { status: 200, body: [] },
      'GET /memory/summary': { status: 200, body: { summary: "Aucun souvenir enregistré pour l'instant." } },
      'POST /memory': {
        status: 201,
        body: {
          id: 'm1',
          user_id: 'u1',
          project_id: 'p1',
          category: 'decision',
          content: 'Choisir un MVP simple.',
          tags: [],
          created_at: '2026-01-01T00:00:00.000Z',
        },
      },
    });

    render(<MemorySection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText('Aucun souvenir pour l\'instant.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Contenu du souvenir'), {
      target: { value: 'Choisir un MVP simple.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    expect(await screen.findByText('Choisir un MVP simple.')).toBeInTheDocument();
  });

  it('masque le formulaire d\'enregistrement en lecture seule', async () => {
    mockApiRoutes({
      'GET /memory': {
        status: 200,
        body: [
          {
            id: 'm1',
            user_id: 'u1',
            project_id: 'p1',
            category: 'decision',
            content: 'Choisir un MVP simple.',
            tags: ['produit'],
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      'GET /memory/summary': { status: 200, body: { summary: '' } },
    });

    render(<MemorySection token={TOKEN} projectId={PROJECT_ID} readOnly />);

    expect(await screen.findByText('Choisir un MVP simple.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Contenu du souvenir')).not.toBeInTheDocument();
  });

  it("n'offre pas d'oublier un souvenir en lecture seule", async () => {
    // Article 8 : un collaborateur ne réécrit pas l'histoire du porteur.
    mockApiRoutes({
      'GET /memory': {
        status: 200,
        body: [
          {
            id: 'm1',
            user_id: 'u1',
            project_id: 'p1',
            category: 'decision',
            content: 'Choisir un MVP simple.',
            tags: [],
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      'GET /memory/summary': { status: 200, body: { summary: '' } },
    });

    render(<MemorySection token={TOKEN} projectId={PROJECT_ID} readOnly />);

    await screen.findByText('Choisir un MVP simple.');
    expect(screen.queryByRole('button', { name: 'Oublier' })).not.toBeInTheDocument();
  });

  it('affiche les étiquettes des souvenirs', async () => {
    mockApiRoutes({
      'GET /memory': {
        status: 200,
        body: [
          {
            id: 'm1',
            user_id: 'u1',
            project_id: 'p1',
            category: 'fact',
            content: 'Local trouvé rue des Lilas.',
            tags: ['local', 'budget'],
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      'GET /memory/summary': { status: 200, body: { summary: '' } },
    });

    render(<MemorySection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText('#local #budget')).toBeInTheDocument();
  });

  it('transmet la recherche et les filtres à l\'API', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      const parsed = new URL(url);
      calls.push(parsed.pathname + parsed.search);
      const body = parsed.pathname === '/memory/summary' ? { summary: '' } : [];
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    }) as unknown as typeof fetch;

    render(<MemorySection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText("Aucun souvenir pour l'instant.");

    fireEvent.change(screen.getByLabelText('Rechercher dans les souvenirs'), {
      target: { value: 'local budget' },
    });
    fireEvent.change(screen.getByLabelText('Filtrer par catégorie'), {
      target: { value: 'decision' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));

    await waitFor(() => {
      const searched = calls.filter((call) => call.startsWith('/memory?') && call.includes('q='));
      expect(searched.length).toBeGreaterThan(0);
      expect(searched[searched.length - 1]).toContain('category=decision');
    });
  });

  it('affiche le rappel prioritaire à côté de la liste des souvenirs', async () => {
    mockApiRoutes({
      'GET /memory': { status: 200, body: [] },
      'GET /memory/summary': { status: 200, body: { summary: '' } },
      'GET /memory/recall/p1': {
        status: 200,
        body: [
          {
            id: 'm1',
            user_id: 'u1',
            project_id: 'p1',
            category: 'decision',
            content: 'Rester sur un MVP simple.',
            tags: [],
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    });

    render(<MemorySection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText('Ce dont IGINI se souvient en priorité')).toBeInTheDocument();
    expect(screen.getByText('Rester sur un MVP simple.')).toBeInTheDocument();
  });

  it('distingue « aucun résultat » de « aucun souvenir »', async () => {
    // Afficher « aucun souvenir » alors qu'un filtre est actif ferait croire
    // que la mémoire est vide, ce qui est faux.
    mockApiRoutes({
      'GET /memory': { status: 200, body: [] },
      'GET /memory/summary': { status: 200, body: { summary: '' } },
    });

    render(<MemorySection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText("Aucun souvenir pour l'instant.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Rechercher dans les souvenirs'), {
      target: { value: 'introuvable' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));

    expect(
      await screen.findByText('Aucun souvenir ne correspond à cette recherche.'),
    ).toBeInTheDocument();
  });
});

describe('KnowledgeSection — recherche, isolés, suppressions', () => {
  const CONCEPTS = [
    {
      id: 'c1',
      user_id: 'u1',
      project_id: PROJECT_ID,
      name: 'Atelier mobile',
      description: null,
      category: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'c2',
      user_id: 'u1',
      project_id: PROJECT_ID,
      name: 'Budget',
      description: null,
      category: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ];

  it('signale les concepts que rien ne relie, sans en faire un défaut', async () => {
    mockApiRoutes({
      'GET /knowledge/graph': {
        status: 200,
        body: { nodes: CONCEPTS, edges: [], isolated: ['c1', 'c2'] },
      },
    });

    render(<KnowledgeSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText(/2 concept\(s\) ne sont reliés à rien/)).toBeInTheDocument();
  });

  it('filtre la liste des concepts sur une recherche', async () => {
    mockApiRoutes({
      'GET /knowledge/graph': {
        status: 200,
        body: { nodes: CONCEPTS, edges: [], isolated: [] },
      },
      'GET /knowledge/concepts/search': { status: 200, body: [CONCEPTS[0]] },
    });

    render(<KnowledgeSection token={TOKEN} projectId={PROJECT_ID} />);

    const list = await screen.findByRole('list', { name: 'Concepts du projet' });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(2));

    fireEvent.change(screen.getByLabelText('Rechercher un concept'), {
      target: { value: 'atelier' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));

    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(1));
    expect(within(list).getByText(/Atelier mobile/)).toBeInTheDocument();
  });

  it("dit qu'aucun lien n'existe plutôt que d'en inventer un", async () => {
    mockApiRoutes({
      'GET /knowledge/graph': {
        status: 200,
        body: { nodes: CONCEPTS, edges: [], isolated: [] },
      },
      'GET /knowledge/path': {
        status: 200,
        body: { from: CONCEPTS[0], to: CONCEPTS[1], path: null },
      },
    });

    render(<KnowledgeSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByLabelText('Concept de départ');
    fireEvent.change(screen.getByLabelText('Concept de départ'), { target: { value: 'c1' } });
    fireEvent.change(screen.getByLabelText("Concept d'arrivée"), { target: { value: 'c2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chercher un chemin' }));

    expect(await screen.findByText(/Aucun lien connu entre ces deux concepts/)).toBeInTheDocument();
  });

  it('affiche le chemin trouvé entre deux concepts', async () => {
    mockApiRoutes({
      'GET /knowledge/graph': {
        status: 200,
        body: { nodes: CONCEPTS, edges: [], isolated: [] },
      },
      'GET /knowledge/path': {
        status: 200,
        body: { from: CONCEPTS[0], to: CONCEPTS[1], path: CONCEPTS },
      },
    });

    render(<KnowledgeSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByLabelText('Concept de départ');
    fireEvent.change(screen.getByLabelText('Concept de départ'), { target: { value: 'c1' } });
    fireEvent.change(screen.getByLabelText("Concept d'arrivée"), { target: { value: 'c2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chercher un chemin' }));

    expect(await screen.findByText('Chemin : Atelier mobile → Budget')).toBeInTheDocument();
  });

  it('masque les suppressions en lecture seule', async () => {
    mockApiRoutes({
      'GET /knowledge/graph': {
        status: 200,
        body: {
          nodes: CONCEPTS,
          edges: [
            {
              id: 'l1',
              from_concept_id: 'c1',
              to_concept_id: 'c2',
              relation_type: 'dépend de',
              created_at: '2026-01-01T00:00:00.000Z',
            },
          ],
          isolated: [],
        },
      },
    });

    render(<KnowledgeSection token={TOKEN} projectId={PROJECT_ID} readOnly />);

    await screen.findByRole('list', { name: 'Concepts du projet' });
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Délier' })).not.toBeInTheDocument();
  });
});

describe('KnowledgeSection', () => {
  it('liste les concepts et permet d\'en créer un', async () => {
    mockApiRoutes({
      'GET /knowledge/graph': { status: 200, body: { nodes: [], edges: [] } },
      'POST /knowledge/concepts': {
        status: 201,
        body: {
          id: 'c1',
          user_id: 'u1',
          project_id: 'p1',
          name: 'Client cible',
          description: null,
          category: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      },
    });

    render(<KnowledgeSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText("Aucun concept pour l'instant.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nom du concept'), { target: { value: 'Client cible' } });
    fireEvent.click(screen.getByRole('button', { name: /^ajouter$/i }));

    // Le nom apparaît deux fois : une fois dans le graphe SVG, une fois dans la liste.
    const matches = await screen.findAllByText('Client cible');
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('ne propose de relier des concepts que si au moins deux existent', async () => {
    mockApiRoutes({
      'GET /knowledge/graph': {
        status: 200,
        body: {
          nodes: [
            {
              id: 'c1',
              user_id: 'u1',
              project_id: 'p1',
              name: 'Client cible',
              description: null,
              category: null,
              created_at: '2026-01-01T00:00:00.000Z',
            },
            {
              id: 'c2',
              user_id: 'u1',
              project_id: 'p1',
              name: 'Offre SaaS',
              description: null,
              category: null,
              created_at: '2026-01-01T00:00:00.000Z',
            },
          ],
          edges: [],
        },
      },
    });

    render(<KnowledgeSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByLabelText('Concept de départ')).toBeInTheDocument();
  });

  it('affiche un graphe SVG avec un nœud par concept et une ligne par relation', async () => {
    mockApiRoutes({
      'GET /knowledge/graph': {
        status: 200,
        body: {
          nodes: [
            {
              id: 'c1',
              user_id: 'u1',
              project_id: 'p1',
              name: 'Client cible',
              description: null,
              category: null,
              created_at: '2026-01-01T00:00:00.000Z',
            },
            {
              id: 'c2',
              user_id: 'u1',
              project_id: 'p1',
              name: 'Offre SaaS',
              description: null,
              category: null,
              created_at: '2026-01-01T00:00:00.000Z',
            },
          ],
          edges: [
            {
              id: 'l1',
              from_concept_id: 'c1',
              to_concept_id: 'c2',
              relation_type: 'a_besoin_de',
              created_at: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      },
    });

    const { container } = render(<KnowledgeSection token={TOKEN} projectId={PROJECT_ID} />);

    const svg = await screen.findByRole('img', { name: 'Graphe des concepts et de leurs relations' });
    expect(svg.querySelectorAll('circle')).toHaveLength(2);
    expect(container.querySelectorAll('svg line')).toHaveLength(1);
  });

  it("n'affiche pas de graphe quand il n'y a aucun concept", async () => {
    mockApiRoutes({
      'GET /knowledge/graph': { status: 200, body: { nodes: [], edges: [] } },
    });

    render(<KnowledgeSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText("Aucun concept pour l'instant.");
    expect(screen.queryByRole('img', { name: 'Graphe des concepts et de leurs relations' })).not.toBeInTheDocument();
  });

  it('centre le graphe sur le voisinage d\'un concept puis revient à la vue complète', async () => {
    const c1 = {
      id: 'c1',
      user_id: 'u1',
      project_id: 'p1',
      name: 'Client cible',
      description: null,
      category: null,
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const c2 = {
      id: 'c2',
      user_id: 'u1',
      project_id: 'p1',
      name: 'Offre SaaS',
      description: null,
      category: null,
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const c3 = {
      id: 'c3',
      user_id: 'u1',
      project_id: 'p1',
      name: 'Concurrent X',
      description: null,
      category: null,
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const edgeC1C2 = {
      id: 'l1',
      from_concept_id: 'c1',
      to_concept_id: 'c2',
      relation_type: 'a_besoin_de',
      created_at: '2026-01-01T00:00:00.000Z',
    };

    mockApiRoutes({
      'GET /knowledge/graph': {
        status: 200,
        body: { nodes: [c1, c2, c3], edges: [edgeC1C2] },
      },
      'GET /knowledge/concepts/c1/neighbourhood': {
        status: 200,
        body: { center: c1, depth: 1, nodes: [c1, c2], edges: [edgeC1C2] },
      },
    });

    render(<KnowledgeSection token={TOKEN} projectId={PROJECT_ID} />);

    const svg = await screen.findByRole('img', { name: 'Graphe des concepts et de leurs relations' });
    expect(svg.querySelectorAll('circle')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Centrer sur Client cible' }));

    expect(await screen.findByText(/Voisinage de Client cible\./)).toBeInTheDocument();
    expect(svg.querySelectorAll('circle')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Centrer sur tout le graphe' }));

    await waitFor(() => expect(svg.querySelectorAll('circle')).toHaveLength(3));
    expect(screen.queryByText(/Voisinage de Client cible\./)).not.toBeInTheDocument();
  });

  it('masque les formulaires de création et de liaison en lecture seule', async () => {
    mockApiRoutes({
      'GET /knowledge/graph': {
        status: 200,
        body: {
          nodes: [
            {
              id: 'c1',
              user_id: 'u1',
              project_id: 'p1',
              name: 'Client cible',
              description: null,
              category: null,
              created_at: '2026-01-01T00:00:00.000Z',
            },
            {
              id: 'c2',
              user_id: 'u1',
              project_id: 'p1',
              name: 'Offre SaaS',
              description: null,
              category: null,
              created_at: '2026-01-01T00:00:00.000Z',
            },
          ],
          edges: [],
        },
      },
    });

    render(<KnowledgeSection token={TOKEN} projectId={PROJECT_ID} readOnly />);

    const matches = await screen.findAllByText('Client cible');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByLabelText('Nom du concept')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Concept de départ')).not.toBeInTheDocument();
  });
});

// Le serveur relance l'orchestration à chaque mutation manuelle et calcule
// les scores à la lecture : sans ce rappel, l'écran affichait une tâche
// terminée au-dessus d'un score Construction inchangé, et c'est le score
// qu'on finissait par croire faux.
describe('les modifications manuelles préviennent la page', () => {
  it('prévient après la création d’une tâche', async () => {
    mockApiRoutes({
      'GET /projects/p1/tasks': { status: 200, body: [] },
      'POST /projects/p1/tasks': {
        status: 201,
        body: {
            id: 't1',
            project_id: 'p1',
            title: 'Valider le pitch',
            description: null,
            status: 'pending',
            assignee: 'human',
            source: 'manual',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
      },
    });
    const onChanged = vi.fn();

    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} onChanged={onChanged} />);

    fireEvent.change(await screen.findByLabelText('Nouvelle tâche'), {
      target: { value: 'Valider le pitch' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^ajouter$/i }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('prévient après un changement de statut', async () => {
    mockApiRoutes({
      'GET /projects/p1/tasks': { status: 200, body: [{
            id: 't1',
            project_id: 'p1',
            title: 'Valider le pitch',
            description: null,
            status: 'pending',
            assignee: 'human',
            source: 'manual',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          }] },
      'PATCH /tasks/t1/status': { status: 200, body: {
            id: 't1',
            project_id: 'p1',
            title: 'Valider le pitch',
            description: null,
            status: 'done',
            assignee: 'human',
            source: 'manual',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          } },
    });
    const onChanged = vi.fn();

    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} onChanged={onChanged} />);

    fireEvent.change(await screen.findByLabelText('Statut de Valider le pitch'), {
      target: { value: 'done' },
    });

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('ne prévient pas quand rien n’a changé', async () => {
    mockApiRoutes({ 'GET /projects/p1/tasks': { status: 200, body: [{
            id: 't1',
            project_id: 'p1',
            title: 'Valider le pitch',
            description: null,
            status: 'pending',
            assignee: 'human',
            source: 'manual',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          }] } });
    const onChanged = vi.fn();

    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} onChanged={onChanged} />);

    await screen.findByText('Valider le pitch');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('ne prévient pas si la création échoue', async () => {
    mockApiRoutes({
      'GET /projects/p1/tasks': { status: 200, body: [] },
      'POST /projects/p1/tasks': { status: 500, body: { message: 'Oups.' } },
    });
    const onChanged = vi.fn();

    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} onChanged={onChanged} />);

    fireEvent.change(await screen.findByLabelText('Nouvelle tâche'), {
      target: { value: 'Valider le pitch' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^ajouter$/i }));

    expect(await screen.findByText('Oups.')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
