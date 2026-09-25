import { fireEvent, render, screen, within } from '@testing-library/react';
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
    'GET /investisseurs/moi/participations': { status: 200, body: [] },
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

  /**
   * LE PORTEFEUILLE VIDE.
   *
   * Un investisseur qui arrive voit un portefeuille à zéro et aucune liste de
   * projets — parce qu'Ignitux tient le registre des investissements, il ne
   * les organise pas : c'est le porteur du projet qui enregistre un apport.
   *
   * L'explication existe dans la carte « Mon identifiant », juste au-dessus,
   * mais elle se lit AVANT qu'on se pose la question. Sans rappel à l'endroit
   * du vide, la lecture la plus naturelle est « le produit ne marche pas ».
   */
  it('explique le portefeuille vide au lieu de le constater', async () => {
    mockApiRoutes(
      routes({
        'GET /espaces/investisseur': {
          status: 200,
          body: espace({
            lines: [],
            global: {
              investedCents: 0,
              repaidCents: 0,
              dividendsCents: 0,
              gainsCents: 0,
              netCents: 0,
              projectCount: 0,
            },
          }),
        },
      }),
    );

    render(
      <AuthProvider>
        <InvestorSpacePage />
      </AuthProvider>,
    );

    expect(
      await screen.findByText(/Aucun investissement enregistré pour l'instant/),
    ).toBeInTheDocument();
    expect(screen.getByText(/le porteur du projet l'enregistre/)).toBeInTheDocument();
    // Et il dit que c'est normal : sans cela, le vide se lit comme une panne.
    expect(screen.getByText(/C'est normal tant que personne ne t'a inscrit/)).toBeInTheDocument();
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

  it("propose de se déclarer investisseur quand personne ne l'est encore", async () => {
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

    expect(
      await screen.findByRole('heading', { name: 'Te déclarer investisseur' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Nom sous lequel tu investis/)).toBeInTheDocument();
  });

  // L'identifiant est le seul moyen pour un porteur d'enregistrer un apport :
  // il n'existe aucune recherche par email, qui laisserait savoir qui investit.
  it("montre l'identifiant à communiquer au porteur d'un projet", async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <InvestorSpacePage />
      </AuthProvider>,
    );

    expect(await screen.findByText('i1')).toBeInTheDocument();
    expect(screen.getByText(/aucune recherche d'investisseur par email/i)).toBeInTheDocument();
  });

  it("déplie l'historique d'un projet à la demande, une seule fois", async () => {
    mockApiRoutes(
      routes({
        'GET /investisseurs/moi/projets/f1': {
          status: 200,
          body: {
            financedProjectId: 'f1',
            movements: [
              {
                id: 'm1',
                financed_project_id: 'f1',
                investor_id: 'i1',
                participation_id: null,
                kind: 'dividende',
                amount_cents: 35000,
                occurred_on: '2026-09-01',
                reference: 'VIR-09',
                note: null,
                corrects_movement_id: null,
                distribution_id: null,
              },
            ],
            totals: {
              investedCents: 0,
              repaidCents: 0,
              dividendsCents: 35000,
              gainsCents: 0,
              netCents: 35000,
            },
          },
        },
      }),
    );

    render(
      <AuthProvider>
        <InvestorSpacePage />
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: "Voir l'historique" }));

    expect(await screen.findByText(/VIR-09/)).toBeInTheDocument();

    // Replier puis déplier ne doit pas relancer une requête pour des faits
    // qui ne bougent pas.
    fireEvent.click(screen.getByRole('button', { name: "Masquer l'historique" }));
    fireEvent.click(screen.getByRole('button', { name: "Voir l'historique" }));

    const appels = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => String(call[0]).includes('/investisseurs/moi/projets/f1'),
    );
    expect(appels).toHaveLength(1);
  });
});
