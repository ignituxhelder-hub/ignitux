import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import CommunityPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

describe('CommunityPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('liste les projets publics', async () => {
    mockApiRoutes({
      'GET /community/projects': {
        status: 200,
        body: [
          { id: 'p1', title: 'École motocross', description: 'Cours pour débutants', created_at: '2026-01-01T00:00:00.000Z' },
        ],
      },
    });

    render(
      <AuthProvider>
        <CommunityPage />
      </AuthProvider>,
    );

    expect(await screen.findByText('École motocross')).toBeInTheDocument();
    expect(screen.getByText('Cours pour débutants')).toBeInTheDocument();
  });

  it("affiche un message quand aucun projet n'est public", async () => {
    mockApiRoutes({ 'GET /community/projects': { status: 200, body: [] } });

    render(
      <AuthProvider>
        <CommunityPage />
      </AuthProvider>,
    );

    expect(
      await screen.findByText(/Aucun projet public pour l'instant/),
    ).toBeInTheDocument();
  });
});
