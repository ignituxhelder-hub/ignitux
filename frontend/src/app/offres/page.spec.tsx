import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import OffresPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const OFFRE = (
  id: string,
  label: string,
  prixCentimes: number,
  extra: Record<string, unknown> = {},
) => ({
  id,
  label,
  prixCentimes,
  resume: `Ce que ${label} permet de faire, en une phrase.`,
  argument: prixCentimes === 0 ? null : `Pourquoi passer à ${label}.`,
  actuelle: false,
  capacites: {
    projets: prixCentimes === 0 ? 1 : null,
    generateurs: prixCentimes === 0 ? ['analyser'] : ['analyser', 'construire'],
    appelsIaParMois: prixCentimes === 0 ? 3 : 30,
    outilsDeGestion: false,
    investisseurs: false,
    collaborateurs: 0,
    ...(extra.capacites as object),
  },
  ...extra,
});

const CATALOGUE = (extra: Record<string, unknown> = {}) => ({
  actuelle: 'decouverte',
  souscriptionPossible: false,
  offres: [
    OFFRE('decouverte', 'Découverte', 0, { actuelle: true }),
    OFFRE('entrepreneur', 'Entrepreneur', 990),
  ],
  evaluationFinancement: {
    prixCentimes: 9900,
    label: 'Évaluation de financement',
    resume: 'Un audit complet et une étude de faisabilité.',
    avertissement: "Ce montant paie l'évaluation, pas un financement.",
  },
  ...extra,
});

function afficher() {
  render(
    <AuthProvider>
      <OffresPage />
    </AuthProvider>,
  );
}

describe('OffresPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('affiche les offres, leur prix et ce qu’elles ouvrent', async () => {
    mockApiRoutes({ 'GET /offres': { status: 200, body: CATALOGUE() } });

    afficher();

    expect(await screen.findByRole('heading', { name: 'Découverte' })).toBeInTheDocument();
    expect(screen.getByText('Gratuit')).toBeInTheDocument();
    expect(screen.getByText((t) => t.includes('9,90') && t.includes('mois'))).toBeInTheDocument();
    expect(screen.getByText('1 projet')).toBeInTheDocument();
  });

  it('marque l’offre en cours', async () => {
    mockApiRoutes({ 'GET /offres': { status: 200, body: CATALOGUE() } });

    afficher();

    expect(await screen.findByText('Ton offre actuelle.')).toBeInTheDocument();
  });

  // Trois boutons qui échoueraient tous feraient conclure que le produit
  // est cassé, pas qu'il n'est pas encore en vente.
  it('n’affiche aucun bouton de souscription quand rien n’encaisse', async () => {
    mockApiRoutes({ 'GET /offres': { status: 200, body: CATALOGUE() } });

    afficher();

    await screen.findByRole('heading', { name: 'Découverte' });
    expect(screen.queryByRole('button', { name: /choisir/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Aucun moyen de paiement/)).toBeInTheDocument();
  });

  it('propose de choisir dès qu’un paiement existe, sauf pour l’offre en cours', async () => {
    mockApiRoutes({
      'GET /offres': { status: 200, body: CATALOGUE({ souscriptionPossible: true }) },
    });

    afficher();

    expect(
      await screen.findByRole('button', { name: /choisir entrepreneur/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /choisir découverte/i })).not.toBeInTheDocument();
  });

  // Une grille d'offres se lit d'habitude comme une liste de privations.
  // La colonne gratuite doit dire ce qu'elle donne.
  it('dit ce que la gratuite comporte, pas seulement ce qui lui manque', async () => {
    mockApiRoutes({ 'GET /offres': { status: 200, body: CATALOGUE() } });

    afficher();

    const carte = (await screen.findByRole('heading', { name: 'Découverte' })).closest('.card');
    expect(carte).toBeTruthy();
    expect(within(carte as HTMLElement).getByText('1 projet')).toBeInTheDocument();
    expect(within(carte as HTMLElement).getByText(/3 générations par mois/)).toBeInTheDocument();
    expect(within(carte as HTMLElement).getByText('Analyser')).toBeInTheDocument();
  });

  // La seule chose qui distingue une évaluation payante d'une promesse
  // vendue est cette phrase.
  it('n’affiche jamais le prix du financement sans dire ce qu’il n’achète pas', async () => {
    mockApiRoutes({ 'GET /offres': { status: 200, body: CATALOGUE() } });

    afficher();

    expect(await screen.findByText(/99,00/)).toBeInTheDocument();
    expect(screen.getByText(/pas un financement/)).toBeInTheDocument();
  });

  it('affiche une erreur lisible si les offres ne chargent pas', async () => {
    mockApiRoutes({ 'GET /offres': { status: 500, body: { message: 'Catalogue indisponible.' } } });

    afficher();

    expect(await screen.findByText('Catalogue indisponible.')).toBeInTheDocument();
  });
});
