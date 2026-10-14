import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setEspaceActif } from '@/lib/api';
import { AuthProvider } from '@/lib/auth';
import { EspaceProvider } from '@/lib/espace';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import LanceurPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const app = (id: string, nom: string, route: string, categorie = 'gerer') => ({
  id,
  nom,
  resume: `${nom}.`,
  categorie,
  route,
  horsOffre: false,
});

const LANCEUR = {
  applications: [
    app('parcours', 'Mes projets', '/projects', 'creer'),
    app('facturation', 'Facturation', '/facturation'),
    app('comptabilite', 'Comptabilité', '/comptabilite'),
  ],
  suggestions: [{ ...app('relations', 'Relations', '/crm', 'vendre'), raison: 'Garde tes contacts.' }],
  reglages: [app('profil', 'Mon profil', '/profil', 'reglages'), app('compte', 'Mon compte', '/account', 'reglages')],
  prevues: [],
  boutique: [
    app('banque', 'Banque', '/banque'),
    app('caisse', 'Caisse', '/caisse'),
    app('stocks', 'Stocks', '/stocks'),
    app('agenda', 'Agenda', '/agenda'),
  ],
  rolesRetenus: ['entrepreneur'],
};

const ALICE = { ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', nom: 'Espace de Alice', roles: ['associe'] };

function afficher(chezAlice: boolean) {
  if (chezAlice) window.localStorage.setItem('ignitux.espace', JSON.stringify({ userId: 'u1', espace: ALICE }));
  mockApiRoutes({
    'GET /me/applications': { status: 200, body: LANCEUR },
    'GET /roles/moi': {
      status: 200,
      body: { roles: ['entrepreneur'], activeRole: 'entrepreneur', suggestions: [], catalogue: [] },
    },
    'GET /espaces': {
      status: 200,
      body: [{ ownerId: 'u1', nom: 'Mon espace', roles: ['proprietaire'] }, ALICE],
    },
  });
  render(
    <AuthProvider>
      <EspaceProvider>
        <LanceurPage />
      </EspaceProvider>
    </AuthProvider>,
  );
}

describe('le bureau dans l’espace argent d’un autre', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setEspaceActif(null);
    signInAs('tok123', { id: 'u1', email: 'moi@ignitux.test' });
  });

  it('seulement Facturation, Comptabilité, Banque et Caisse — même pour un associé', async () => {
    afficher(true);
    expect(await screen.findByRole('heading', { level: 1, name: 'Espace de Alice' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Facturation' })).toHaveAttribute('href', '/facturation');
    for (const nom of ['Comptabilité', 'Banque', 'Caisse']) {
      expect(screen.getByRole('link', { name: nom })).toBeInTheDocument();
    }
    for (const nom of ['Mes projets', 'Relations', 'Stocks', 'Agenda', 'Mon profil', 'Mon compte']) {
      expect(screen.queryByRole('link', { name: nom })).not.toBeInTheDocument();
    }
    // Ni dossier, ni rangement, ni suggestions d'IGINI.
    expect(screen.queryByRole('button', { name: 'Organiser mon bureau' })).not.toBeInTheDocument();
    expect(screen.queryByText('Garde tes contacts.')).not.toBeInTheDocument();
  });

  it('chez soi, le bureau est inchangé', async () => {
    afficher(false);
    expect(await screen.findByRole('heading', { level: 1, name: 'Ton bureau' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Mes projets' })).toBeInTheDocument();
  });
});
