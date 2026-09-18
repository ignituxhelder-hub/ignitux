import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import LoginPage from './page';

const replace = vi.fn();
// Référence stable, comme le vrai useRouter() de Next.js — évite qu'un objet
// recréé à chaque appel ne casse un futur effet qui l'aurait en dépendance.
const router = { replace };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe('LoginPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    replace.mockClear();
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

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/projects'));
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
    expect(replace).not.toHaveBeenCalled();
  });
});
