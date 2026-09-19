import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRouterMock, mockFetchOnce } from '@/test-utils/mocks';
import ResetPasswordPage from './page';

const router = createRouterMock();
// Mutable, remis à une valeur par défaut avant chaque test : vi.mock est
// hissé en tête de fichier, donc on ne peut pas repasser un objet différent
// par test, mais on peut faire varier ce que useSearchParams() renvoie.
let currentToken = 'le-bon-token';
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(currentToken ? { token: currentToken } : undefined),
}));

beforeEach(() => {
  currentToken = 'le-bon-token';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ResetPasswordPage', () => {
  it('affiche une confirmation et un lien de connexion après un changement réussi', async () => {
    mockFetchOnce(200, { success: true });

    render(<ResetPasswordPage />);

    fireEvent.change(await screen.findByLabelText('Nouveau mot de passe'), {
      target: { value: 'NouveauMotDePasse123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /changer le mot de passe/i }));

    expect(await screen.findByText('Ton mot de passe a été changé.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /se connecter/i })).toBeInTheDocument();
  });

  it("affiche le message d'erreur du backend si le token est invalide", async () => {
    mockFetchOnce(400, { message: 'Ce lien est invalide, expiré, ou déjà utilisé.' });

    render(<ResetPasswordPage />);

    fireEvent.change(await screen.findByLabelText('Nouveau mot de passe'), {
      target: { value: 'NouveauMotDePasse123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /changer le mot de passe/i }));

    expect(
      await screen.findByText('Ce lien est invalide, expiré, ou déjà utilisé.'),
    ).toBeInTheDocument();
  });

  it('affiche un message clair si le lien est incomplet (pas de token)', async () => {
    currentToken = '';

    render(<ResetPasswordPage />);

    expect(await screen.findByText(/ce lien est incomplet/i)).toBeInTheDocument();
  });
});
