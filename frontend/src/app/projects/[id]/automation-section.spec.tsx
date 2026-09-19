import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApiRoutes } from '@/test-utils/mocks';
import { AutomationSection } from './automation-section';

const TOKEN = 'tok123';
const PROJECT_ID = 'p1';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AutomationSection', () => {
  it("affiche l'historique des exécutions passées", async () => {
    mockApiRoutes({
      'GET /projects/p1/automation/runs': {
        status: 200,
        body: [
          {
            id: 'run1',
            project_id: 'p1',
            tasks_created_count: 5,
            tasks_closed_count: 0,
            concept_links_created_count: 0,
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    });

    const { container } = render(<AutomationSection token={TOKEN} projectId={PROJECT_ID} />);

    await waitFor(() => expect(container.textContent).toContain('5 tâche(s) créée(s)'));
  });

  it("lance une exécution manuelle et affiche le résultat", async () => {
    mockApiRoutes({
      'GET /projects/p1/automation/runs': { status: 200, body: [] },
      'POST /projects/p1/automation/run': {
        status: 201,
        body: {
          run: {
            id: 'run1',
            project_id: 'p1',
            tasks_created_count: 2,
            tasks_closed_count: 1,
            concept_links_created_count: 0,
            created_at: '2026-01-01T00:00:00.000Z',
          },
          tasksCreated: [{ id: 't1' }, { id: 't2' }],
          tasksClosed: [{ id: 't3' }],
          conceptLinksCreated: [],
        },
      },
    });

    const { container } = render(<AutomationSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText("Aucune exécution pour l'instant.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /lancer l'automatisation/i }));

    await waitFor(() =>
      expect(container.textContent).toContain('2 tâche(s) créée(s), 1 fermée(s), 0 lien(s) de concept créé(s).'),
    );
  });

  it('masque le bouton de déclenchement manuel en lecture seule', async () => {
    mockApiRoutes({
      'GET /projects/p1/automation/runs': { status: 200, body: [] },
    });

    render(<AutomationSection token={TOKEN} projectId={PROJECT_ID} readOnly />);

    await screen.findByText("Aucune exécution pour l'instant.");
    expect(screen.queryByRole('button', { name: /lancer l'automatisation/i })).not.toBeInTheDocument();
  });
});
