import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockFetchSequence } from '@/test-utils/mocks';
import SignupPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

/**
 * Simule le widget Cloudflare Turnstile sans charger le vrai script : la
 * page expose son callback sur `window` (voir data-callback dans page.tsx),
 * exactement comme Turnstile l'appellerait une fois le défi résolu.
 */
function completeCaptcha(token = 'faux-jeton-captcha') {
  act(() => {
    (window as unknown as { handleTurnstileToken: (t: string) => void }).handleTurnstileToken(
      token,
    );
  });
}

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
    fireEvent.click(screen.getByLabelText(/j'ai lu et j'accepte/i));
    completeCaptcha();
    fireEvent.click(screen.getByRole('button', { name: /créer mon compte/i }));

    // On ne l envoie pas directement dans l espace entrepreneur : rien ne dit
    // encore qu il en est un. La question precede l espace.
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/roles'));
  });

  it('envoie le jeton Turnstile avec la demande d\'inscription', async () => {
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
    fireEvent.click(screen.getByLabelText(/j'ai lu et j'accepte/i));
    completeCaptcha('jeton-cloudflare-123');
    fireEvent.click(screen.getByRole('button', { name: /créer mon compte/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/signup'),
        expect.objectContaining({
          body: JSON.stringify({
            email: 'a@b.com',
            password: 'motdepasse',
            captchaToken: 'jeton-cloudflare-123',
          }),
        }),
      ),
    );
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
    fireEvent.click(screen.getByLabelText(/j'ai lu et j'accepte/i));
    completeCaptcha();
    fireEvent.click(screen.getByRole('button', { name: /créer mon compte/i }));

    expect(await screen.findByText('Un compte existe déjà avec cet email.')).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("bloque l'inscription tant que les CGU ne sont pas acceptées", async () => {
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
    completeCaptcha();

    expect(screen.getByRole('button', { name: /créer mon compte/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /créer mon compte/i }));
    expect(router.replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/j'ai lu et j'accepte/i));
    expect(screen.getByRole('button', { name: /créer mon compte/i })).toBeEnabled();
  });

  it("bloque l'inscription tant que la vérification anti-robot n'est pas validée", () => {
    render(
      <AuthProvider>
        <SignupPage />
      </AuthProvider>,
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'motdepasse' } });
    fireEvent.click(screen.getByLabelText(/j'ai lu et j'accepte/i));

    // CGU acceptées, mais le widget Turnstile n'a pas encore renvoyé de
    // jeton : le bouton doit rester désactivé.
    expect(screen.getByRole('button', { name: /créer mon compte/i })).toBeDisabled();

    completeCaptcha();
    expect(screen.getByRole('button', { name: /créer mon compte/i })).toBeEnabled();
  });

  it('lie les CGU et la politique de confidentialité', () => {
    render(
      <AuthProvider>
        <SignupPage />
      </AuthProvider>,
    );

    expect(screen.getByRole('link', { name: /conditions d'utilisation/i })).toHaveAttribute(
      'href',
      '/cgu',
    );
    expect(screen.getByRole('link', { name: /politique de confidentialité/i })).toHaveAttribute(
      'href',
      '/confidentialite',
    );
  });
});
