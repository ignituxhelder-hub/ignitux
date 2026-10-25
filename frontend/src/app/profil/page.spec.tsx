import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, signInAs } from '@/test-utils/mocks';
import ProfilPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

describe('ProfilPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('range le profil en icônes qui mènent chacune à leur page', () => {
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });

    render(
      <AuthProvider>
        <ProfilPage />
      </AuthProvider>,
    );

    const attendus: Array<[string, string]> = [
      ['Mes informations', '/profil/informations'],
      ['Mon identité', '/identite'],
      ['Mes rôles', '/roles'],
      ['Mes crédits', '/credits'],
      ['Consommation IA', '/consommation-ia'],
      ['Mon compte', '/account'],
      ['Confidentialité', '/confidentialite'],
      ['Conditions', '/cgu'],
    ];
    for (const [nom, route] of attendus) {
      expect(screen.getByRole('link', { name: nom })).toHaveAttribute('href', route);
    }
  });

  it('ramène au bureau', () => {
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });

    render(
      <AuthProvider>
        <ProfilPage />
      </AuthProvider>,
    );

    expect(screen.getByRole('link', { name: '← Bureau' })).toHaveAttribute('href', '/accueil');
  });

  it('renvoie vers la connexion sans jeton', async () => {
    render(
      <AuthProvider>
        <ProfilPage />
      </AuthProvider>,
    );

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  });
});
