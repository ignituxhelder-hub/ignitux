import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockFetchOnce } from '@/test-utils/mocks';
import LoginPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

describe('LoginPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redirige vers /projects après une connexion réussie', async () => {
    mockFetchOnce(200, { accessToken: 'tok123', user: { id: 'u1', email: 'a@b.com' } });

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'motdepasse' } });
    fireEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/projects'));
  });

  it("affiche le message d'erreur du backend en cas d'échec", async () => {
    mockFetchOnce(401, { message: 'Email ou mot de passe incorrect.' });

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'mauvais' } });
    fireEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    expect(await screen.findByText('Email ou mot de passe incorrect.')).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('propose un lien vers la réinitialisation du mot de passe', () => {
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    const link = screen.getByRole('link', { name: /mot de passe oublié/i });
    expect(link).toHaveAttribute('href', '/forgot-password');
  });
});
