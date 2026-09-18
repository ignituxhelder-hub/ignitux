import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import SignupPage from './page';

const replace = vi.fn();
// Référence stable, comme le vrai useRouter() de Next.js — évite qu'un objet
// recréé à chaque appel ne casse un futur effet qui l'aurait en dépendance.
const router = { replace };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

/** Simule les réponses successives de fetch, dans l'ordre des appels. */
function mockFetchSequence(...responses: Array<{ status: number; body: unknown }>) {
  let call = 0;
  global.fetch = vi.fn().mockImplementation(() => {
    const { status, body } = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
  }) as unknown as typeof fetch;
}

describe('SignupPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    replace.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("crée le compte, connecte l'utilisateur, puis redirige vers /projects", async () => {
    mockFetchSequence(
      { status: 201, body: { id: 'u1', email: 'a@b.com' } },
      { status: 200, body: { accessToken: 'tok123', user: { id: 'u1', email: 'a@b.com' } } },
    );

    render(
      <AuthProvider>
        <SignupPage />
      </AuthProvider>,
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'motdepasse' } });
    fireEvent.click(screen.getByRole('button', { name: /créer mon compte/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/projects'));
  });

  it('affiche le message du backend si l\'email existe déjà', async () => {
    mockFetchSequence({ status: 409, body: { message: 'Un compte existe déjà avec cet email.' } });

    render(
      <AuthProvider>
        <SignupPage />
      </AuthProvider>,
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'motdepasse' } });
    fireEvent.click(screen.getByRole('button', { name: /créer mon compte/i }));

    expect(await screen.findByText('Un compte existe déjà avec cet email.')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
