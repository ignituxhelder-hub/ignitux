import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApiRoutes } from '@/test-utils/mocks';
import { WorkflowSection } from './workflow-section';

const TOKEN = 'tok123';
const PROJECT_ID = 'p1';

const TEMPLATE = {
  slug: 'methode-ignitux',
  name: 'Méthode Ignitux en 5 étapes',
  description: 'Le parcours complet.',
  stepCount: 5,
};

function workflow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'w1',
    project_id: PROJECT_ID,
    name: 'Mon processus',
    description: 'Un enchaînement.',
    created_at: '2026-01-01T00:00:00.000Z',
    steps: [
      {
        id: 's1',
        workflow_id: 'w1',
        position: 0,
        title: 'Analyser',
        description: null,
        condition_type: 'stage_exists',
        condition_value: 'analysis',
        action_type: 'none',
        action_value: null,
      },
      {
        id: 's2',
        workflow_id: 'w1',
        position: 1,
        title: 'Valider',
        description: null,
        condition_type: 'manual',
        condition_value: null,
        action_type: 'none',
        action_value: null,
      },
    ],
    runs: [],
    ...overrides,
  };
}

const RUNNING_RUN = {
  id: 'r1',
  workflow_id: 'w1',
  project_id: PROJECT_ID,
  status: 'blocked',
  current_position: 1,
  started_at: '2026-01-01T00:00:00.000Z',
  completed_at: null,
};

describe('WorkflowSection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dit qu'aucun processus n'est imposé quand il n'y en a pas", async () => {
    mockApiRoutes({
      'GET /projects/p1/workflows': { status: 200, body: [] },
      'GET /workflows/templates': { status: 200, body: [TEMPLATE] },
    });

    render(<WorkflowSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText(/Ignitux n'en impose aucun/)).toBeInTheDocument();
  });

  it('liste les étapes avec leur condition en clair', async () => {
    mockApiRoutes({
      'GET /projects/p1/workflows': { status: 200, body: [workflow()] },
      'GET /workflows/templates': { status: 200, body: [TEMPLATE] },
    });

    const { container } = render(<WorkflowSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Mon processus');
    expect(container.textContent).toContain('quand une étape existe');
    expect(container.textContent).toContain('sur ta validation');
  });

  it("affiche la position de l'exécution en cours", async () => {
    mockApiRoutes({
      'GET /projects/p1/workflows': {
        status: 200,
        body: [workflow({ runs: [RUNNING_RUN] })],
      },
      'GET /workflows/templates': { status: 200, body: [TEMPLATE] },
    });

    const { container } = render(<WorkflowSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Mon processus');
    await waitFor(() => expect(container.textContent).toContain('étape 2 sur 2'));
    expect(container.textContent).toContain('en attente');
  });

  it("propose « Valider cette étape » uniquement sur une étape manuelle en attente", async () => {
    mockApiRoutes({
      'GET /projects/p1/workflows': {
        status: 200,
        body: [workflow({ runs: [RUNNING_RUN] })],
      },
      'GET /workflows/templates': { status: 200, body: [TEMPLATE] },
    });

    render(<WorkflowSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByRole('button', { name: 'Valider cette étape' })).toBeInTheDocument();
  });

  it("ne propose pas de validation quand l'étape en attente n'est pas manuelle", async () => {
    mockApiRoutes({
      'GET /projects/p1/workflows': {
        status: 200,
        body: [workflow({ runs: [{ ...RUNNING_RUN, current_position: 0 }] })],
      },
      'GET /workflows/templates': { status: 200, body: [TEMPLATE] },
    });

    render(<WorkflowSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Mon processus');
    expect(screen.queryByRole('button', { name: 'Valider cette étape' })).not.toBeInTheDocument();
  });

  it("explique le blocage renvoyé par le moteur plutôt qu'un échec muet", async () => {
    mockApiRoutes({
      'GET /projects/p1/workflows': { status: 200, body: [workflow()] },
      'GET /workflows/templates': { status: 200, body: [TEMPLATE] },
      'POST /workflows/w1/runs': {
        status: 201,
        body: {
          run: { id: 'r1', status: 'blocked', current_position: 0 },
          stepsCompleted: [],
          blockedReason: "En attente : l'étape « Analyse » n'a pas encore été produite.",
          tasksCreated: [],
        },
      },
    });

    render(<WorkflowSection token={TOKEN} projectId={PROJECT_ID} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Démarrer' }));

    expect(
      await screen.findByText(/Aucune étape franchie.*n'a pas encore été produite/),
    ).toBeInTheDocument();
  });

  it('masque toutes les actions en lecture seule', async () => {
    mockApiRoutes({
      'GET /projects/p1/workflows': {
        status: 200,
        body: [workflow({ runs: [RUNNING_RUN] })],
      },
      'GET /workflows/templates': { status: 200, body: [TEMPLATE] },
    });

    render(<WorkflowSection token={TOKEN} projectId={PROJECT_ID} readOnly />);

    await screen.findByText('Mon processus');
    expect(screen.queryByRole('button', { name: 'Réévaluer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Créer depuis ce modèle' })).not.toBeInTheDocument();
  });

  it('crée un processus depuis un modèle', async () => {
    const routes: Record<string, { status: number; body: unknown }> = {
      'GET /projects/p1/workflows': { status: 200, body: [] },
      'GET /workflows/templates': { status: 200, body: [TEMPLATE] },
      'POST /projects/p1/workflows/from-template': { status: 201, body: workflow() },
    };
    mockApiRoutes(routes);

    render(<WorkflowSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText(/Ignitux n'en impose aucun/);
    routes['GET /projects/p1/workflows'] = { status: 200, body: [workflow()] };
    fireEvent.click(screen.getByRole('button', { name: 'Créer depuis ce modèle' }));

    expect(await screen.findByText('Mon processus')).toBeInTheDocument();
  });
});
