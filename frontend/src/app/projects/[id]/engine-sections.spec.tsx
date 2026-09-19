import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApiRoutes } from '@/test-utils/mocks';
import { KnowledgeSection, MemorySection, ScoreSection, TasksSection } from './engine-sections';

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
