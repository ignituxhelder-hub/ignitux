import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, signInAs } from '@/test-utils/mocks';
import HomePage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

describe('HomePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('présente la méthode et les moteurs pour un visiteur non connecté', () => {
    render(
      <AuthProvider>
        <HomePage />
      </AuthProvider>,
    );

    expect(screen.getByText('Transformer une idée en réalité')).toBeInTheDocument();
    expect(screen.getByText('Analyser')).toBeInTheDocument();
    expect(screen.getByText('Transmettre')).toBeInTheDocument();
    expect(screen.getByText('Mémoire')).toBeInTheDocument();
    expect(screen.getByText('Score')).toBeInTheDocument();
    expect(screen.getByText(/porteurs de projet/)).toBeInTheDocument();
  });

  it('redirige vers /projects si déjà connecté', async () => {
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });

    render(
      <AuthProvider>
        <HomePage />
      </AuthProvider>,
    );

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/projects'));
  });
});
