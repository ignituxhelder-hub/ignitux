import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockFetchSequence } from '@/test-utils/mocks';
import SignupPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

describe('SignupPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("crée le compte, connecte l'utilisateur, puis demande qui il est", async () => {
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

    // On ne l envoie pas directement dans l espace entrepreneur : rien ne dit
    // encore qu il en est un. La question precede l espace.
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/roles'));
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
    expect(router.replace).not.toHaveBeenCalled();
  });
});
