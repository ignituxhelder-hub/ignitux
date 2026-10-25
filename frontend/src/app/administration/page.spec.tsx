import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import AdministrationPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function afficher() {
  render(
    <AuthProvider>
      <AdministrationPage />
    </AuthProvider>,
  );
}

describe('AdministrationPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    signInAs('tok', { id: 'admin', email: 'admin@exemple.fr' });
  });

  it('montre les deux files avec le nombre d’éléments en attente', async () => {
    mockApiRoutes({
      'GET /evaluations-financement/revue': { status: 200, body: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }] },
      'GET /identite/verifications/en-attente': { status: 200, body: [{ id: 'v1' }] },
    });
    afficher();

    expect(await screen.findByRole('link', { name: /Évaluations de financement à revoir \(3\)/ })).toHaveAttribute(
      'href',
      '/evaluations/revue',
    );
    expect(await screen.findByRole('link', { name: /Pièces d’identité à revoir \(1\)/ })).toHaveAttribute(
      'href',
      '/identite/revue',
    );
    expect(screen.getByRole('link', { name: 'Crédits des comptes' })).toHaveAttribute(
      'href',
      '/administration/credits',
    );
  });

  it('dit que la page est réservée aux administrateurs sur un 403', async () => {
    mockApiRoutes({
      'GET /evaluations-financement/revue': { status: 403, body: { message: 'Forbidden' } },
      'GET /identite/verifications/en-attente': { status: 403, body: { message: 'Forbidden' } },
    });
    afficher();

    expect(await screen.findByText(/Réservé aux administrateurs/)).toBeInTheDocument();
  });
});
