import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetchOnce } from '@/test-utils/mocks';
import ForgotPasswordPage from './page';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ForgotPasswordPage', () => {
  it('affiche le même message de confirmation, que le compte existe ou non', async () => {
    mockFetchOnce(204, null);

    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: /envoyer le lien/i }));

    expect(
      await screen.findByText(/un lien de réinitialisation vient d'être envoyé/i),
    ).toBeInTheDocument();
  });

  it('affiche aussi la confirmation si la requête échoue (ne révèle rien)', async () => {
    mockFetchOnce(500, { message: 'boom' });

    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: /envoyer le lien/i }));

    expect(
      await screen.findByText(/un lien de réinitialisation vient d'être envoyé/i),
    ).toBeInTheDocument();
  });
});
