import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import ProjectFinancesPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useParams: () => ({ id: 'p1' }),
}));

const PROJET = { id: 'p1', owner_id: 'u1', title: 'Ressourcerie du Val', description: null };

function registre(overrides: Record<string, unknown> = {}) {
  return {
    financedProject: {
      id: 'f1',
      project_id: 'p1',
      project_title: 'Ressourcerie du Val',
      target_cents: 2000000,
      status: 'ouvert',
      opened_on: '2026-03-01',
      note: null,
    },
    raisedCents: 500000,
    participations: [
      {
        id: 'part1',
        investor_id: 'i1',
        financed_project_id: 'f1',
        invested_cents: 500000,
        share_basis_points_granted: 1200,
        equity_holder_id: 'h1',
        status: 'active',
        occurred_on: '2026-03-15',
        note: null,
        investor: {
          id: 'i1',
          user_id: 'u2',
          kind: 'personne',
          display_name: 'Camille Brun',
          note: null,
        },
      },
    ],
    movements: [
      {
        id: 'm1',
        financed_project_id: 'f1',
        investor_id: 'i1',
        participation_id: 'part1',
        kind: 'investissement',
        amount_cents: -500000,
        occurred_on: '2026-03-15',
        reference: null,
        note: null,
        corrects_movement_id: null,
        distribution_id: null,
      },
    ],
    totals: {
      investedCents: 500000,
      repaidCents: 120000,
      dividendsCents: 40000,
      gainsCents: 0,
      netCents: -340000,
    },
    ...overrides,
  };
}

function capTable(overrides: Record<string, unknown> = {}) {
  return {
    notice: 'La répartition ci-dessous est celle saisie.',
    holders: [
      { holderId: 'h0', name: 'Porteuse du projet', isFounder: true, shareBasisPoints: 8800 },
      { holderId: 'h1', name: 'Camille Brun', isFounder: false, shareBasisPoints: 1200 },
    ],
    totalBasisPoints: 10000,
    discrepancyBasisPoints: 0,
    founderHasMajority: true,
    founderTrajectory: [],
    ...overrides,
  };
}

function routes(overrides: Record<string, { status: number; body: unknown }> = {}) {
  return {
    'GET /projects/p1': { status: 200, body: PROJET },
    'GET /projects/p1/financement': { status: 200, body: registre() },
    'GET /projects/p1/financing/cap-table': { status: 200, body: capTable() },
    'GET /projects/p1/financing/dividends': { status: 200, body: { dividends: [], totalCents: 0 } },
    ...overrides,
  };
}

describe('ProjectFinancesPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  it('montre ce qui a été levé, remboursé et versé', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <ProjectFinancesPage />
      </AuthProvider>,
    );

    expect(await screen.findByRole('heading', { name: /Ressourcerie du Val/ })).toBeInTheDocument();
    expect(screen.getAllByText(/5\s?000,00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/1\s?200,00/)).toBeInTheDocument();
  });

  it('regroupe les apports par investisseur', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <ProjectFinancesPage />
      </AuthProvider>,
    );

    const section = (await screen.findByRole('heading', { name: 'Investisseurs' }))
      .parentElement!;
    expect(within(section).getByText('Camille Brun')).toBeInTheDocument();
    expect(within(section).getByText(/1 apport\(s\)/)).toBeInTheDocument();
  });

  it('montre la répartition du capital telle qu’elle est aujourd’hui', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <ProjectFinancesPage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/^88\s?%$/)).toBeInTheDocument();
    expect(screen.getByText(/^12\s?%$/)).toBeInTheDocument();
  });

  // Ignitux ne redistribue pas un écart de répartition : ce serait décider à
  // la place des personnes qui détiennent ces parts.
  it('signale une répartition incomplète sans la normaliser', async () => {
    mockApiRoutes(
      routes({
        'GET /projects/p1/financing/cap-table': {
          status: 200,
          body: capTable({ totalBasisPoints: 9000, discrepancyBasisPoints: 1000 }),
        },
      }),
    );

    render(
      <AuthProvider>
        <ProjectFinancesPage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/totalise 90\s?% au lieu de 100/)).toBeInTheDocument();
  });

  // La plupart des projets ne cherchent pas d'argent : ne pas être ouvert au
  // financement est l'état normal, pas une erreur.
  it("propose d'ouvrir le financement quand le projet ne l'est pas", async () => {
    mockApiRoutes(
      routes({
        'GET /projects/p1/financement': {
          status: 200,
          body: registre({
            financedProject: null,
            raisedCents: 0,
            participations: [],
            movements: [],
          }),
        },
      }),
    );

    render(
      <AuthProvider>
        <ProjectFinancesPage />
      </AuthProvider>,
    );

    expect(
      await screen.findByRole('button', { name: 'Ouvrir au financement' }),
    ).toBeInTheDocument();
  });

  it('enregistre un apport avec sa part convertie en points de base', async () => {
    mockApiRoutes(
      routes({
        'POST /projets-finances/f1/participations': { status: 201, body: {} },
      }),
    );

    render(
      <AuthProvider>
        <ProjectFinancesPage />
      </AuthProvider>,
    );

    fireEvent.change(await screen.findByLabelText(/Identifiant de l'investisseur/), {
      target: { value: 'i2' },
    });
    fireEvent.change(screen.getByLabelText(/Montant apporté/), { target: { value: '2500' } });
    fireEvent.change(screen.getByLabelText(/Part accordée/), { target: { value: '5,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer un apport' }));

    await waitFor(() => {
      const envoi = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find((call) =>
        String(call[0]).includes('/participations'),
      );
      expect(envoi).toBeDefined();
      const corps = JSON.parse(String(envoi![1].body));
      expect(corps.investedCents).toBe(250000);
      expect(corps.shareBasisPointsGranted).toBe(550);
    });
  });

  it('refuse un montant illisible sans rien envoyer', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <ProjectFinancesPage />
      </AuthProvider>,
    );

    fireEvent.change(await screen.findByLabelText(/Identifiant de l'investisseur/), {
      target: { value: 'i2' },
    });
    fireEvent.change(screen.getByLabelText(/Montant apporté/), { target: { value: 'beaucoup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer un apport' }));

    expect(await screen.findByText(/Montant de l’apport illisible/)).toBeInTheDocument();
  });

  // Prélever 5 % par défaut reviendrait à décider à la place du porteur :
  // tous les projets ne sont pas entrés au capital selon le modèle 51/49.
  it('exige que la part perpétuelle soit dite explicitement', async () => {
    mockApiRoutes(
      routes({ 'POST /projets-finances/f1/dividendes': { status: 201, body: {} } }),
    );

    render(
      <AuthProvider>
        <ProjectFinancesPage />
      </AuthProvider>,
    );

    fireEvent.change(await screen.findByLabelText('Nature'), { target: { value: 'dividende' } });
    fireEvent.change(screen.getByLabelText(/Montant total à répartir/), {
      target: { value: '400' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le versement' }));

    await waitFor(() => {
      const envoi = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find((call) =>
        String(call[0]).includes('/dividendes'),
      );
      expect(envoi).toBeDefined();
      expect(JSON.parse(String(envoi![1].body)).applyPerpetualShare).toBe(false);
    });
  });

  it("n'invente aucun avancement quand aucun objectif n'a été annoncé", async () => {
    mockApiRoutes(
      routes({
        'GET /projects/p1/financement': {
          status: 200,
          body: registre({
            financedProject: {
              id: 'f1',
              project_id: 'p1',
              project_title: 'Ressourcerie du Val',
              target_cents: null,
              status: 'ouvert',
              opened_on: '2026-03-01',
              note: null,
            },
          }),
        },
      }),
    );

    render(
      <AuthProvider>
        <ProjectFinancesPage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/Ignitux n'en invente pas/)).toBeInTheDocument();
  });
});
