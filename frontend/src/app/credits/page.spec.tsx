import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import CreditsPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const BAREME = {
  valeurCreditCentimes: 10,
  bienvenue: 30,
  recharges: [
    { prixCentimes: 1000, credits: 100 },
    { prixCentimes: 2000, credits: 200 },
    { prixCentimes: 5000, credits: 500 },
  ],
  rechargeDisponible: false,
  rechargeMessage:
    'Bientôt disponible — le paiement par carte arrive dès que l’entreprise Ignitux sera immatriculée.',
  actions: [
    { generateur: 'analyser', libelle: 'Analyser une idée', credits: 4, par: 'action' },
    { generateur: 'discuter', libelle: 'Message à IGINI', credits: 1, par: 'message' },
  ],
};

let compteur = 0;
function ligne(partiel: Record<string, unknown>) {
  compteur += 1;
  return {
    id: `l${compteur}`,
    date: '2026-10-25T10:00:00.000Z',
    kind: 'debit',
    credits: -4,
    generateur: 'analyser',
    libelle: 'Analyser une idée',
    projet: null,
    acteur: null,
    motif: null,
    ...partiel,
  };
}

const HISTORIQUE = [
  ligne({ projet: { id: 'p1', titre: 'Food-truck' }, acteur: 'Camille' }),
  ligne({ kind: 'ajustement_admin', credits: 10, generateur: null, libelle: null, motif: 'geste commercial' }),
  ligne({ kind: 'remboursement', credits: 4, motif: 'Génération échouée : crédits rendus.' }),
  ligne({ kind: 'bienvenue', credits: 30, generateur: null, libelle: null, motif: 'Cadeau de bienvenue' }),
];

function vue(solde: number, historique: unknown[] = []) {
  return { 'GET /credits': { status: 200, body: { solde, bareme: BAREME, historique } } };
}

function afficher() {
  render(
    <AuthProvider>
      <CreditsPage />
    </AuthProvider>,
  );
}

describe('Mes crédits', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('jeton', { id: 'u1', email: 'a@b.fr' });
  });

  it('montre le solde en grand, en or, et le cadeau de bienvenue', async () => {
    mockApiRoutes(vue(26));
    afficher();

    expect(await screen.findByRole('heading', { level: 1, name: 'Mes crédits' })).toBeInTheDocument();
    const solde = await screen.findByText('26');
    expect(solde.closest('.credits-solde')).toHaveTextContent('26 crédits');
    expect(screen.getByText(/1 crédit = 0,10 €/)).toBeInTheDocument();
    expect(screen.getByText('30 crédits offerts à l’inscription.')).toBeInTheDocument();
  });

  it('propose les trois recharges, grisées tant que le paiement par carte n’existe pas', async () => {
    mockApiRoutes(vue(26));
    afficher();

    const recharger = (await screen.findByRole('heading', { name: 'Recharger' })).closest('section') as HTMLElement;
    for (const nom of ['10 € · 100 crédits', '20 € · 200 crédits', '50 € · 500 crédits']) {
      expect(within(recharger).getByRole('button', { name: nom })).toBeDisabled();
    }
    expect(within(recharger).getByText(/paiement par carte arrive/)).toBeInTheDocument();
    // Plus d'abonnement nulle part.
    expect(document.body.textContent).not.toMatch(/\/ mois|abonnement|Entrepreneur/);
  });

  it('range le barème derrière un repli', async () => {
    mockApiRoutes(vue(26));
    afficher();

    const resume = await screen.findByText('Le prix de chaque action (2)');
    const repli = resume.closest('details') as HTMLElement;
    expect(repli).not.toHaveAttribute('open');
    expect(within(repli).getByText(/Analyser une idée/).closest('li')).toHaveTextContent('Analyser une idée · 4 crédits');
    expect(within(repli).getByText(/Message à IGINI/).closest('li')).toHaveTextContent('1 crédit par message');
  });

  it('raconte l’historique : action, projet, membre, motif, crédits signés', async () => {
    mockApiRoutes(vue(26, HISTORIQUE));
    afficher();

    const historique = (await screen.findByRole('heading', { name: 'Historique' })).closest('section') as HTMLElement;
    const lignes = within(historique).getAllByRole('listitem');
    expect(lignes).toHaveLength(4);
    expect(lignes[0]).toHaveTextContent('Analyser une idée');
    expect(lignes[0]).toHaveTextContent('Food-truck');
    expect(lignes[0]).toHaveTextContent('par Camille');
    expect(within(lignes[0]).getByText('−4')).toHaveClass('credits-montant');
    expect(lignes[1]).toHaveTextContent('Ajustement par Ignitux');
    expect(lignes[1]).toHaveTextContent('geste commercial');
    expect(within(lignes[1]).getByText('+10')).toBeInTheDocument();
    expect(lignes[2]).toHaveTextContent('Rendu : Analyser une idée');
    expect(lignes[3]).toHaveTextContent('Cadeau de bienvenue');
    expect(within(lignes[3]).getByText('+30')).toBeInTheDocument();
  });

  it('replie les mouvements anciens au-delà des dix derniers', async () => {
    mockApiRoutes(vue(26, Array.from({ length: 13 }, () => ligne({}))));
    afficher();

    const plusAnciens = await screen.findByText('Plus anciens (3)');
    expect(plusAnciens.closest('details')).not.toHaveAttribute('open');
  });

  it('dit qu’il n’y a encore aucun mouvement', async () => {
    mockApiRoutes(vue(0));
    afficher();

    expect(await screen.findByText('Aucun mouvement pour l’instant.')).toBeInTheDocument();
  });

  it('affiche l’erreur du serveur', async () => {
    mockApiRoutes({ 'GET /credits': { status: 500, body: { message: 'Panne passagère.' } } });
    afficher();

    expect(await screen.findByText('Panne passagère.')).toHaveClass('error');
  });

  it('renvoie à la connexion sans session', async () => {
    window.localStorage.clear();
    mockApiRoutes({});
    afficher();

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  });
});
