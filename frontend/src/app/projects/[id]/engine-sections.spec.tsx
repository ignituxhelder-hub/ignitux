import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
});

describe('MemorySection', () => {
  it('affiche le résumé et permet d\'enregistrer un souvenir', async () => {
    mockApiRoutes({
      'GET /memory': { status: 200, body: [] },
      'GET /memory/summary': { status: 200, body: { summary: 'Aucun souvenir pour l\'instant.' } },
      'POST /memory': {
        status: 201,
        body: {
          id: 'm1',
          user_id: 'u1',
          project_id: 'p1',
          category: 'decision',
          content: 'Choisir un MVP simple.',
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

    expect(await screen.findByText('Client cible')).toBeInTheDocument();
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
});
