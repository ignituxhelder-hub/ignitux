import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import AiUsagePage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

function mois(overrides: Record<string, unknown> = {}) {
  return {
    periode: { depuis: '2026-09-01T00:00:00.000Z', jusqua: '2026-10-01T00:00:00.000Z' },
    appels: 12,
    tokens: { entree: 24000, sortie: 9000, dont_reflexion: 2000 },
    cout: { euros: 3.4, grille_du: '2026-05-01', estimation: true, modeles_non_tarifes: [] },
    par_generateur: [
      {
        generateur: 'analyser',
        appels: 8,
        tokens_entree: 16000,
        tokens_sortie: 6000,
        dont_reflexion: 1500,
        cout_euros: 2.2,
      },
    ],
    quota: {
      autorise: true,
      plafond_atteint: false,
      message: null,
      bientot_atteint: false,
      // Depuis les crédits : plus d'analyses incluses, le serveur rend null.
      restant: { analyses: null, euros: 6.6 },
      plafonds: { analyses_par_mois: null, euros_par_mois: 10 },
    },
    ...overrides,
  };
}

function historique(overrides: Record<string, unknown> = {}) {
  return {
    limite: 200,
    grille_du: '2026-05-01',
    appels: [
      {
        id: 'a1',
        quand: '2026-09-15T10:00:00.000Z',
        generateur: 'analyser',
        modele: 'claude-opus-5',
        projet_id: 'p1',
        tokens_entree: 2000,
        tokens_sortie: 800,
        dont_reflexion: 200,
        duree_ms: 4300,
        cout_euros: 0.28,
      },
    ],
    ...overrides,
  };
}

function routes(overrides: Record<string, { status: number; body: unknown }> = {}) {
  return {
    'GET /igini/usage/mois-en-cours': { status: 200, body: mois() },
    'GET /igini/usage/historique': { status: 200, body: historique() },
    'GET /credits': { status: 200, body: { solde: 26, bareme: { actions: [] }, historique: [] } },
    ...overrides,
  };
}

describe('AiUsagePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  it('montre ce qui est utilisé, le solde de crédits, et ce que ça a coûté', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <AiUsagePage />
      </AuthProvider>,
    );

    expect(await screen.findByText('12')).toBeInTheDocument();
    // Là où se lisait le quota d'analyses : le solde, en or, qui mène à « Mes crédits ».
    const lien = await screen.findByRole('link', { name: 'Mes crédits' });
    expect(lien).toHaveAttribute('href', '/credits');
    expect(await within(lien).findByText('26')).toHaveClass('credits-montant');
    expect(screen.getAllByText(/3,40/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Analyses restantes|incluses ce mois-ci/)).not.toBeInTheDocument();
  });

  it('garde le lien vers « Mes crédits » quand le solde ne se lit pas', async () => {
    mockApiRoutes(routes({ 'GET /credits': { status: 500, body: { message: 'Panne.' } } }));

    render(
      <AuthProvider>
        <AiUsagePage />
      </AuthProvider>,
    );

    expect(await screen.findByRole('link', { name: 'Mes crédits' })).toHaveTextContent('Voir');
  });

  it('nomme le générateur « executer » « Exécution de tâches »', async () => {
    const base = mois();
    mockApiRoutes(
      routes({
        'GET /igini/usage/mois-en-cours': {
          status: 200,
          body: mois({
            par_generateur: [
              ...base.par_generateur,
              { generateur: 'executer', appels: 4, tokens_entree: 800, tokens_sortie: 300, dont_reflexion: 0, cout_euros: 0.5 },
            ],
          }),
        },
      }),
    );

    render(
      <AuthProvider>
        <AiUsagePage />
      </AuthProvider>,
    );

    expect((await screen.findAllByText('Exécution de tâches')).length).toBeGreaterThan(0);
  });

  // Le coût est dérivé d'une grille, pas facturé. Sans la date de la grille,
  // le montant n'est pas vérifiable.
  it('date la grille tarifaire et dit que le coût est une estimation', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <AiUsagePage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/grille tarifaire du 2026-05-01/)).toBeInTheDocument();
    expect(screen.getByText(/estimé/)).toBeInTheDocument();
  });

  // Un plafond qu'on ne voit pas approcher est un refus qui tombe sans
  // prévenir, au moment où la personne avait préparé son travail.
  it('avertit avant le mur, pas seulement dedans', async () => {
    mockApiRoutes(
      routes({
        'GET /igini/usage/mois-en-cours': {
          status: 200,
          body: mois({
            quota: {
              autorise: true,
              plafond_atteint: false,
              message: null,
              bientot_atteint: true,
              restant: { analyses: 1, euros: 0.2 },
              plafonds: { analyses_par_mois: 50, euros_par_mois: 10 },
            },
          }),
        },
      }),
    );

    render(
      <AuthProvider>
        <AiUsagePage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/approches du garde-fou/)).toBeInTheDocument();
    expect(screen.getByText(/distinct de ton solde de crédits/)).toBeInTheDocument();
  });

  it('affiche le refus quand le plafond est atteint', async () => {
    mockApiRoutes(
      routes({
        'GET /igini/usage/mois-en-cours': {
          status: 200,
          body: mois({
            quota: {
              autorise: false,
              plafond_atteint: true,
              message: 'Plafond mensuel de 50 analyses atteint.',
              bientot_atteint: true,
              restant: { analyses: 0, euros: 0 },
              plafonds: { analyses_par_mois: 50, euros_par_mois: 10 },
            },
          }),
        },
      }),
    );

    render(
      <AuthProvider>
        <AiUsagePage />
      </AuthProvider>,
    );

    expect(await screen.findByText('Plafond mensuel de 50 analyses atteint.')).toBeInTheDocument();
  });

  // Un modèle hors grille donne null, jamais zéro : zéro dirait « gratuit »,
  // null dit « on ignore combien ». Ce n'est pas la même information.
  it("distingue « on ne sait pas » de « il reste de la marge »", async () => {
    mockApiRoutes(
      routes({
        'GET /igini/usage/mois-en-cours': {
          status: 200,
          body: mois({
            cout: {
              euros: null,
              grille_du: '2026-05-01',
              estimation: true,
              modeles_non_tarifes: ['modele-experimental'],
            },
            quota: {
              autorise: true,
              plafond_atteint: false,
              message: null,
              bientot_atteint: false,
              restant: { analyses: 38, euros: null },
              plafonds: { analyses_par_mois: 50, euros_par_mois: 10 },
            },
          }),
        },
      }),
    );

    render(
      <AuthProvider>
        <AiUsagePage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/c&apos;est « on ne sait pas »|on ne sait pas/)).toBeInTheDocument();
    expect(screen.getByText(/modele-experimental/)).toBeInTheDocument();
  });

  it("explique un historique vide plutôt que de laisser un trou", async () => {
    mockApiRoutes(
      routes({
        'GET /igini/usage/historique': { status: 200, body: historique({ appels: [] }) },
      }),
    );

    render(
      <AuthProvider>
        <AiUsagePage />
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Historique' }));

    expect(await screen.findByText(/rien n'a été dépensé/)).toBeInTheDocument();
  });

  it('dit que ce qui se paie, ce sont des crédits, et nomme le garde-fou', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <AiUsagePage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/Ce que tu paies, ce sont des crédits/)).toBeInTheDocument();
    expect(screen.getByText(/Garde-fou anti-abus du mois : 10,00 €/)).toBeInTheDocument();
    expect(screen.queryByText(/offre|analyses incluses/)).not.toBeInTheDocument();
  });

  it('nomme les appels des crédits (chat, statuts, conformité…)', async () => {
    mockApiRoutes(
      routes({
        'GET /igini/usage/mois-en-cours': {
          status: 200,
          body: mois({
            par_generateur: [
              { generateur: 'discuter', appels: 3, tokens_entree: 900, tokens_sortie: 90, dont_reflexion: 0, cout_euros: 0.02 },
              { generateur: 'statuts', appels: 1, tokens_entree: 1500, tokens_sortie: 5000, dont_reflexion: 0, cout_euros: 0.12 },
            ],
          }),
        },
      }),
    );

    render(
      <AuthProvider>
        <AiUsagePage />
      </AuthProvider>,
    );

    expect(await screen.findByText('Chat')).toBeInTheDocument();
    expect(screen.getByText('Statuts')).toBeInTheDocument();
  });

  it('détaille chaque appel avec son modèle et son coût', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <AiUsagePage />
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Historique' }));

    expect(await screen.findByText(/claude-opus-5/)).toBeInTheDocument();
    expect(screen.getByText(/0,28/)).toBeInTheDocument();
  });
});
