import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import CommunityProjectPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useParams: () => ({ id: 'p1' }),
}));

const PUBLIC_PROJECT = {
  id: 'p1',
  title: 'École motocross',
  description: 'Cours pour débutants',
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('CommunityProjectPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('affiche le projet et permet de laisser un encouragement', async () => {
    mockApiRoutes({
      'GET /community/projects/p1': { status: 200, body: PUBLIC_PROJECT },
      'GET /community/projects/p1/comments': { status: 200, body: [] },
      'POST /community/projects/p1/comments': {
        status: 201,
        body: {
          id: 'c1',
          project_id: 'p1',
          author_id: 'u1',
          content: 'Bravo pour ce projet !',
          created_at: '2026-01-02T00:00:00.000Z',
        },
      },
    });

    render(
      <AuthProvider>
        <CommunityProjectPage />
      </AuthProvider>,
    );

    expect(await screen.findByText('École motocross')).toBeInTheDocument();
    expect(screen.getByText("Aucun message pour l'instant.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Ton message'), {
      target: { value: 'Bravo pour ce projet !' },
    });
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));

    expect(await screen.findByText('Bravo pour ce projet !')).toBeInTheDocument();
  });

  it("affiche une erreur si le projet n'est pas public ou n'existe pas", async () => {
    mockApiRoutes({
      'GET /community/projects/p1': { status: 404, body: { message: 'Projet introuvable.' } },
      'GET /community/projects/p1/comments': { status: 404, body: { message: 'Projet introuvable.' } },
    });

    render(
      <AuthProvider>
        <CommunityProjectPage />
      </AuthProvider>,
    );

    expect(await screen.findByText('Projet introuvable.')).toBeInTheDocument();
  });
});
