import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApiRoutes } from '@/test-utils/mocks';
import { CollaboratorsSection } from './collaborators-section';

const TOKEN = 'tok123';
const PROJECT_ID = 'p1';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CollaboratorsSection', () => {
  it('liste les collaborateurs existants', async () => {
    mockApiRoutes({
      'GET /projects/p1/collaborators': {
        status: 200,
        body: [
          {
            id: 'pc1',
            project_id: 'p1',
            user_id: 'u2',
            created_at: '2026-01-01T00:00:00.000Z',
            user: { id: 'u2', email: 'b@b.com' },
          },
        ],
      },
    });

    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText('b@b.com')).toBeInTheDocument();
  });

  it("affiche un message quand il n'y a aucun collaborateur", async () => {
    mockApiRoutes({ 'GET /projects/p1/collaborators': { status: 200, body: [] } });

    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText("Aucun collaborateur pour l'instant.")).toBeInTheDocument();
  });

  it('invite un collaborateur par email', async () => {
    mockApiRoutes({
      'GET /projects/p1/collaborators': { status: 200, body: [] },
      'POST /projects/p1/collaborators': {
        status: 201,
        body: {
          id: 'pc1',
          project_id: 'p1',
          user_id: 'u2',
          created_at: '2026-01-01T00:00:00.000Z',
          user: { id: 'u2', email: 'b@b.com' },
        },
      },
    });

    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText("Aucun collaborateur pour l'instant.");
    fireEvent.change(screen.getByLabelText('Email du collaborateur à ajouter'), {
      target: { value: 'b@b.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /inviter/i }));

    expect(await screen.findByText('b@b.com')).toBeInTheDocument();
  });

  it('retire un collaborateur', async () => {
    mockApiRoutes({
      'GET /projects/p1/collaborators': {
        status: 200,
        body: [
          {
            id: 'pc1',
            project_id: 'p1',
            user_id: 'u2',
            created_at: '2026-01-01T00:00:00.000Z',
            user: { id: 'u2', email: 'b@b.com' },
          },
        ],
      },
      'DELETE /projects/p1/collaborators/u2': { status: 204, body: null },
    });

    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('b@b.com');
    fireEvent.click(screen.getByRole('button', { name: /retirer/i }));

    await screen.findByText("Aucun collaborateur pour l'instant.");
  });

  it("affiche une erreur si l'invitation échoue", async () => {
    mockApiRoutes({
      'GET /projects/p1/collaborators': { status: 200, body: [] },
      'POST /projects/p1/collaborators': {
        status: 404,
        body: { message: 'Aucun compte ne correspond à cet email.' },
      },
    });

    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText("Aucun collaborateur pour l'instant.");
    fireEvent.change(screen.getByLabelText('Email du collaborateur à ajouter'), {
      target: { value: 'inconnu@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /inviter/i }));

    expect(await screen.findByText('Aucun compte ne correspond à cet email.')).toBeInTheDocument();
  });
});
