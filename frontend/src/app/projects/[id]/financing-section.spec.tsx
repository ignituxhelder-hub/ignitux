import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApiRoutes } from '@/test-utils/mocks';
import { FinancingSection } from './financing-section';

const TOKEN = 'tok123';
const PROJECT_ID = 'p1';

const NOTICE =
  "Ignitux enregistre ici les financements reçus. Il ne calcule aucune valorisation du projet.";

function capTable(overrides: Record<string, unknown> = {}) {
  return {
    notice: NOTICE,
    holders: [
      { holderId: 'h1', name: 'Porteur', isFounder: true, shareBasisPoints: 7000 },
      { holderId: 'h2', name: 'Ignitux', isFounder: false, shareBasisPoints: 3000 },
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
    'GET /projects/p1/financing/rounds': { status: 200, body: { rounds: [], totalCents: 0 } },
    'GET /projects/p1/financing/cap-table': { status: 200, body: capTable() },
    'GET /projects/p1/financing/dividends': { status: 200, body: { dividends: [], totalCents: 0 } },
    ...overrides,
  };
}

describe('FinancingSection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("affiche l'avertissement de périmètre du modèle économique", async () => {
    mockApiRoutes(routes());

    render(<FinancingSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText(/aucune valorisation du projet/)).toBeInTheDocument();
  });

  it('convertit les centimes en euros pour les apports', async () => {
    mockApiRoutes(
      routes({
        'GET /projects/p1/financing/rounds': {
          status: 200,
          body: {
            rounds: [
              {
                id: 'r1',
                project_id: PROJECT_ID,
                source: 'ignitux',
                amount_cents: 500000,
                occurred_at: '2026-03-01T00:00:00.000Z',
                note: null,
              },
            ],
            totalCents: 500000,
          },
        },
      }),
    );

    const { container } = render(<FinancingSection token={TOKEN} projectId={PROJECT_ID} />);

    await waitFor(() => expect(container.textContent).toContain('5000,00 €'));
  });

  it('affiche la répartition et la majorité du porteur', async () => {
    mockApiRoutes(routes());

    const { container } = render(<FinancingSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Porteur');
    await waitFor(() => expect(container.textContent).toContain('70 %'));
    expect(container.textContent).toContain('Le porteur détient la majorité des parts.');
  });

  it("signale un écart à 100 % et refuse de le répartir tout seul", async () => {
    mockApiRoutes(
      routes({
        'GET /projects/p1/financing/cap-table': {
          status: 200,
          body: capTable({
            holders: [
              { holderId: 'h1', name: 'Porteur', isFounder: true, shareBasisPoints: 6000 },
            ],
            totalBasisPoints: 6000,
            discrepancyBasisPoints: 4000,
            founderHasMajority: null,
          }),
        },
      }),
    );

    const { container } = render(<FinancingSection token={TOKEN} projectId={PROJECT_ID} />);

    await waitFor(() =>
      expect(container.textContent).toContain('totalise 60 % au lieu de 100 %'),
    );
    expect(container.textContent).toContain('ce serait décider à la place des personnes');
  });

  it("ne se prononce pas sur la majorité quand la répartition est incomplète", async () => {
    mockApiRoutes(
      routes({
        'GET /projects/p1/financing/cap-table': {
          status: 200,
          body: capTable({ discrepancyBasisPoints: 1000, founderHasMajority: null }),
        },
      }),
    );

    const { container } = render(<FinancingSection token={TOKEN} projectId={PROJECT_ID} />);

    await waitFor(() =>
      expect(container.textContent).toContain('impossible à établir'),
    );
  });

  it("distingue une part non renseignée d'une part nulle", async () => {
    // Zéro dirait « il ne détient rien », null dit « on ne sait pas ».
    mockApiRoutes(
      routes({
        'GET /projects/p1/financing/cap-table': {
          status: 200,
          body: capTable({
            holders: [
              { holderId: 'h1', name: 'Porteur', isFounder: true, shareBasisPoints: null },
            ],
            totalBasisPoints: 0,
            discrepancyBasisPoints: 10000,
            founderHasMajority: null,
          }),
        },
      }),
    );

    render(<FinancingSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText('part non renseignée')).toBeInTheDocument();
  });

  it("dit pourquoi aucun dividende prévisionnel n'est affiché", async () => {
    mockApiRoutes(routes());

    const { container } = render(<FinancingSection token={TOKEN} projectId={PROJECT_ID} />);

    await waitFor(() =>
      expect(container.textContent).toContain('le prédire reviendrait à promettre un revenu'),
    );
  });

  it("montre la trajectoire du porteur quand elle comporte plusieurs points", async () => {
    mockApiRoutes(
      routes({
        'GET /projects/p1/financing/cap-table': {
          status: 200,
          body: capTable({
            founderTrajectory: [
              { occurredAt: '2026-01-01T00:00:00.000Z', shareBasisPoints: 6000 },
              { occurredAt: '2026-06-01T00:00:00.000Z', shareBasisPoints: 7000 },
            ],
          }),
        },
      }),
    );

    const { container } = render(<FinancingSection token={TOKEN} projectId={PROJECT_ID} />);

    await waitFor(() => expect(container.textContent).toContain('60 % → '));
  });

  it("masque le formulaire d'apport en lecture seule", async () => {
    mockApiRoutes(routes());

    render(<FinancingSection token={TOKEN} projectId={PROJECT_ID} readOnly />);

    await screen.findByText('Porteur');
    expect(screen.queryByLabelText('Montant reçu en euros')).not.toBeInTheDocument();
  });
});
