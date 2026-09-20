import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import InvestorSpacePage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

function ligne(overrides: Record<string, unknown> = {}) {
  return {
    financedProjectId: 'f1',
    projectId: 'p1',
    projectTitle: 'Atelier Perrin',
    status: 'en_remboursement',
    investedCents: 500000,
    repaidCents: 120000,
    dividendsCents: 35000,
    gainsCents: 0,
    netCents: -345000,
    shareBasisPoints: 1000,
    shareNotice: null,
    participations: 1,
    ...overrides,
  };
}

function espace(overrides: Record<string, unknown> = {}) {
  return {
    role: 'investisseur',
    investorId: 'i1',
    displayName: 'Helder Simões',
    global: {
      investedCents: 500000,
      repaidCents: 120000,
      dividendsCents: 35000,
      gainsCents: 0,
      netCents: -345000,
      projectCount: 1,
    },
    lines: [ligne()],
    notice: 'Chaque projet totalise ses propres mouvements.',
    ...overrides,
  };
}

function routes(overrides: Record<string, { status: number; body: unknown }> = {}) {
  return {
    'GET /espaces/investisseur': { status: 200, body: espace() },
    'GET /roles/moi': {
      status: 200,
      body: { roles: ['investisseur'], activeRole: 'investisseur', suggestions: [], catalogue: [] },
    },
    ...overrides,
  };
}

describe('InvestorSpacePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  it('montre le portefeuille global en euros', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <InvestorSpacePage />
      </AuthProvider>,
    );

    // Le total global et la ligne unique portent les memes montants : on
    // interroge le bloc global nommement, sinon la requete en trouve deux.
    const global = (await screen.findByRole('heading', { name: 'Portefeuille global' }))
      .parentElement!;

    expect(within(global).getByText('5 000,00 €')).toBeInTheDocument();
    expect(within(global).getByText('1 200,00 €')).toBeInTheDocument();
    expect(within(global).getByText('350,00 €')).toBeInTheDocument();
    // Le solde net est negatif tant que le capital n est pas rentre : on
    // l affiche tel quel plutot que de le masquer.
    expect(within(global).getByText('-3 450,00 €')).toBeInTheDocument();
  });

  it('montre la part détenue en pourcentage', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <InvestorSpacePage />
      </AuthProvider>,
    );

    expect(await screen.findByText('10 %')).toBeInTheDocument();
  });

  // Un pourcentage absent n'est pas un zéro : on dit pourquoi il manque
  // plutôt que d'afficher un chiffre qu'aucune donnée ne justifie.
  it("explique une part absente au lieu d'afficher zéro", async () => {
    mockApiRoutes(
      routes({
        'GET /espaces/investisseur': {
          status: 200,
          body: espace({
            lines: [
              ligne({
                shareBasisPoints: null,
                shareNotice: "Aucune part n'est rattachée à cet apport.",
              }),
            ],
          }),
        },
      }),
    );

    render(
      <AuthProvider>
        <InvestorSpacePage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/Aucune part n'est rattachée/)).toBeInTheDocument();
    expect(screen.queryByText('0 %')).toBeNull();
  });

  // 403 = le rôle n'est pas pris. Ce n'est pas une panne : c'est une porte,
  // et l'écran doit montrer où est la poignée.
  it("propose de prendre le rôle quand l'espace est refusé", async () => {
    mockApiRoutes(
      routes({
        'GET /espaces/investisseur': {
          status: 403,
          body: { message: 'Cet espace est réservé au rôle « Investisseur ».' },
        },
      }),
    );

    render(
      <AuthProvider>
        <InvestorSpacePage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/réservé au rôle/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Prendre le rôle Investisseur/ })).toHaveAttribute(
      'href',
      '/roles',
    );
    // Un refus de rôle ne doit pas déconnecter.
    expect(router.replace).not.toHaveBeenCalledWith('/login');
  });

  it('rend un espace vide lisible plutôt qu’une page blanche', async () => {
    mockApiRoutes(
      routes({
        'GET /espaces/investisseur': {
          status: 200,
          body: espace({
            investorId: null,
            displayName: null,
            lines: [],
            global: {
              investedCents: 0,
              repaidCents: 0,
              dividendsCents: 0,
              gainsCents: 0,
              netCents: 0,
              projectCount: 0,
            },
            notice: "Aucun investissement n'est enregistré à ton nom.",
          }),
        },
      }),
    );

    render(
      <AuthProvider>
        <InvestorSpacePage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/Aucun investissement n'est enregistré/)).toBeInTheDocument();
  });
});
