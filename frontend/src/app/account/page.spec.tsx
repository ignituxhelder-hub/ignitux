import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockFetchOnce, signInAs } from '@/test-utils/mocks';
import AccountPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

describe('AccountPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('affiche une confirmation après un changement de mot de passe réussi', async () => {
    mockFetchOnce(204, null);

    render(
      <AuthProvider>
        <AccountPage />
      </AuthProvider>,
    );

    fireEvent.change(await screen.findByLabelText('Mot de passe actuel'), {
      target: { value: 'ancien' },
    });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'nouveau123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /changer le mot de passe/i }));

    expect(await screen.findByText('Mot de passe changé.')).toBeInTheDocument();
  });

  it("affiche le message d'erreur du backend si le mot de passe actuel est incorrect", async () => {
    mockFetchOnce(403, { message: 'Mot de passe actuel incorrect.' });

    render(
      <AuthProvider>
        <AccountPage />
      </AuthProvider>,
    );

    fireEvent.change(await screen.findByLabelText('Mot de passe actuel'), {
      target: { value: 'mauvais' },
    });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'nouveau123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /changer le mot de passe/i }));

    expect(await screen.findByText('Mot de passe actuel incorrect.')).toBeInTheDocument();
  });
});
