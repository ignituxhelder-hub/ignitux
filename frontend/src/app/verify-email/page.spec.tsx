import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockFetchOnce } from '@/test-utils/mocks';
import VerifyEmailPage from './page';

let currentToken = 'le-bon-token';
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(currentToken ? { token: currentToken } : undefined),
}));

beforeEach(() => {
  currentToken = 'le-bon-token';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VerifyEmailPage', () => {
  it('affiche une confirmation quand la vérification réussit', async () => {
    mockFetchOnce(200, { success: true });

    render(<VerifyEmailPage />);

    expect(await screen.findByText('Ton email est confirmé.')).toBeInTheDocument();
  });

  it("affiche le message d'erreur du backend si le token est invalide", async () => {
    mockFetchOnce(400, { message: 'Ce lien est invalide, expiré, ou déjà utilisé.' });

    render(<VerifyEmailPage />);

    expect(
      await screen.findByText('Ce lien est invalide, expiré, ou déjà utilisé.'),
    ).toBeInTheDocument();
  });

  it("affiche un message clair si le lien est incomplet (pas de token)", async () => {
    currentToken = '';

    render(<VerifyEmailPage />);

    expect(await screen.findByText('Ce lien est incomplet.')).toBeInTheDocument();
  });
});
