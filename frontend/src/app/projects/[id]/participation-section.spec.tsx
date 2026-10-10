import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApiRoutes } from '@/test-utils/mocks';
import { ParticipationSection } from './participation-section';

const TOKEN = 'tok123';
const PROJECT_ID = 'p1';
const NOTICE = 'La participation se lit en trois couches séparées.';

type Overrides = Record<string, unknown>;

function milestone(overrides: Overrides = {}) {
  return {
    id: 'm1',
    position: 1,
    label: null,
    target_ignitux_bps: 3000,
    conditions: ['Trois mois de trésorerie positive'],
    status: 'prevu',
    validated_at: null,
    validation_note: null,
    founder_acknowledged_at: null,
    effective_on: null,
    ...overrides,
  };
}

function view(overrides: Overrides = {}, viewer = { isIgnituxOperator: false }) {
  return {
    agreement: {
      id: 'a1',
      project_id: PROJECT_ID,
      initial_founder_bps: 5100,
      initial_ignitux_bps: 4900,
      dividend_right_bps: 500,
      status: 'actif',
      effective_on: '2026-10-01',
      contract_reference: null,
      ecosystem_offre: 'entrepreneur',
      transmitted_on: null,
    },
    notice: NOTICE,
    phase: 'partagee',
    capital: {
      holders: [
        { holderId: 'hf', name: 'Camille Porteuse', isFounder: true, shareBasisPoints: 6400 },
        { holderId: 'hi', name: 'IGNITUX', isFounder: false, shareBasisPoints: 3600 },
      ],
      totalBasisPoints: 10000,
      discrepancyBasisPoints: 0,
      founderHasMajority: true,
    },
    history: [
      { holderName: 'Camille Porteuse', shareBasisPoints: 5100, reason: 'Entrée au capital', occurredAt: '2026-10-01T00:00:00.000Z' },
      { holderName: 'IGNITUX', shareBasisPoints: 4900, reason: 'Entrée au capital', occurredAt: '2026-10-01T00:00:00.000Z' },
      { holderName: 'Camille Porteuse', shareBasisPoints: 6400, reason: 'Palier 1', occurredAt: '2027-02-10T00:00:00.000Z' },
      { holderName: 'IGNITUX', shareBasisPoints: 3600, reason: 'Palier 1', occurredAt: '2027-02-10T00:00:00.000Z' },
    ],
    milestones: [milestone()],
    dividendRight: { rightBasisPoints: 500, active: false, entries: [], totalDueCents: 0, totalSettledCents: 0 },
    ecosystem: { offre: 'entrepreneur', label: 'Entrepreneur', active: true },
    viewer,
    ...overrides,
  };
}

function transmise(overrides: Overrides = {}, viewer = { isIgnituxOperator: false }) {
  return view(
    {
      phase: 'transmise',
      agreement: { ...view().agreement, status: 'transmis', transmitted_on: '2031-01-20' },
      capital: {
        holders: [
          { holderId: 'hf', name: 'Camille Porteuse', isFounder: true, shareBasisPoints: 10000 },
          { holderId: 'hi', name: 'IGNITUX', isFounder: false, shareBasisPoints: 0 },
        ],
        totalBasisPoints: 10000,
        discrepancyBasisPoints: 0,
        founderHasMajority: true,
      },
      milestones: [milestone({ status: 'execute', target_ignitux_bps: 0 })],
      dividendRight: { rightBasisPoints: 300, active: true, entries: [], totalDueCents: 0, totalSettledCents: 0 },
      ...overrides,
    },
    viewer,
  );
}

function routes(body: unknown, extra: Record<string, { status: number; body: unknown }> = {}) {
  return { 'GET /projects/p1/participation': { status: 200, body }, ...extra };
}

function appels(methodAndPath: string) {
  const [method, path] = methodAndPath.split(' ');
  return (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
    (call) => new URL(call[0]).pathname === path && (call[1]?.method ?? 'GET') === method,
  );
}

describe('ParticipationSection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sans accord', () => {
    it('ne montre rien à l’entrepreneur : le suivi manuel du capital reste comme avant', async () => {
      mockApiRoutes(routes({ agreement: null, viewer: { isIgnituxOperator: false } }));

      const { container } = render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      expect(container).toBeEmptyDOMElement();
    });

    it('propose à IGNITUX de créer l’accord, sans envoyer de valeur qu’on n’a pas saisie', async () => {
      mockApiRoutes(
        routes(
          { agreement: null, viewer: { isIgnituxOperator: true } },
          { 'POST /projects/p1/participation/agreement': { status: 201, body: { id: 'a1' } } },
        ),
      );

      render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

      fireEvent.change(await screen.findByLabelText('Nom du porteur'), { target: { value: 'Camille' } });
      fireEvent.change(screen.getByLabelText('Date d’effet'), { target: { value: '2026-10-01' } });
      fireEvent.click(screen.getByRole('button', { name: 'Créer l’accord' }));

      await waitFor(() => expect(appels('POST /projects/p1/participation/agreement')).toHaveLength(1));
      const corps = JSON.parse(appels('POST /projects/p1/participation/agreement')[0][1].body);
      // Les répartitions non saisies ne sont pas envoyées : le serveur applique
      // ses valeurs par défaut, l'écran n'en code aucune.
      expect(corps).toEqual({ founderName: 'Camille', effectiveOn: '2026-10-01' });
    });

    it('convertit les pourcentages saisis en points de base, décimales comprises', async () => {
      mockApiRoutes(
        routes(
          { agreement: null, viewer: { isIgnituxOperator: true } },
          { 'POST /projects/p1/participation/agreement': { status: 201, body: { id: 'a1' } } },
        ),
      );

      render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

      fireEvent.change(await screen.findByLabelText('Nom du porteur'), { target: { value: 'Camille' } });
      fireEvent.change(screen.getByLabelText('Date d’effet'), { target: { value: '2026-10-01' } });
      fireEvent.change(screen.getByLabelText('Part du porteur (%)'), { target: { value: '60' } });
      fireEvent.change(screen.getByLabelText('Part d’IGNITUX (%)'), { target: { value: '40' } });
      fireEvent.change(screen.getByLabelText('Droit sur les dividendes (%)'), { target: { value: '2,5' } });
      fireEvent.click(screen.getByRole('button', { name: 'Créer l’accord' }));

      await waitFor(() => expect(appels('POST /projects/p1/participation/agreement')).toHaveLength(1));
      expect(JSON.parse(appels('POST /projects/p1/participation/agreement')[0][1].body)).toMatchObject({
        founderBasisPoints: 6000,
        ignituxBasisPoints: 4000,
        dividendRightBasisPoints: 250,
      });
    });
  });

  describe('les trois couches', () => {
    it('sépare visuellement le capital, le droit économique et l’accès à l’écosystème', async () => {
      mockApiRoutes(routes(view()));

      render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

      expect(await screen.findByRole('heading', { name: 'Capital' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Droit économique d’IGNITUX sur les dividendes' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Accès à l’écosystème IGNITUX' })).toBeInTheDocument();
      expect(screen.getByText(NOTICE)).toBeInTheDocument();
    });

    it('affiche la répartition actuelle du capital, sans la supposer à 51/49', async () => {
      mockApiRoutes(routes(view()));

      render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

      const capital = (await screen.findByRole('heading', { name: 'Capital' })).closest('section')!;
      expect(within(capital).getByText(/Camille Porteuse/)).toHaveTextContent('64 %');
      expect(within(capital).getByText(/^IGNITUX/)).toHaveTextContent('36 %');
    });

    it('déroule l’historique complet du capital', async () => {
      mockApiRoutes(routes(view()));

      render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

      const historique = (await screen.findByRole('heading', { name: 'Historique du capital' })).closest('section')!;
      expect(within(historique).getAllByRole('listitem')).toHaveLength(4);
      expect(within(historique).getAllByText(/Palier 1/)).toHaveLength(2);
    });

    it('dit que le droit sur les dividendes n’existe pas avant la transmission complète', async () => {
      mockApiRoutes(routes(view()));

      render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

      expect(await screen.findByText(/ne commence qu’une fois le capital entièrement transmis/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Constater un dividende distribué' })).not.toBeInTheDocument();
    });

    it('après transmission : le droit est actif, au taux de l’accord, et distinct du capital', async () => {
      mockApiRoutes(routes(transmise()));

      render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

      expect(await screen.findByText(/IGNITUX conserve 3 % des dividendes effectivement distribués/)).toBeInTheDocument();
      expect(screen.getByText(/Ce n’est pas une part de capital/)).toBeInTheDocument();
      const capital = screen.getByRole('heading', { name: 'Capital' }).closest('section')!;
      expect(within(capital).getByText(/^IGNITUX/)).toHaveTextContent('0 %');
    });

    it('montre l’offre garantie par l’accord, indépendante du capital', async () => {
      mockApiRoutes(routes(transmise()));

      render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

      const acces = (await screen.findByRole('heading', { name: 'Accès à l’écosystème IGNITUX' })).closest('section')!;
      expect(within(acces).getByText(/Entrepreneur/)).toBeInTheDocument();
      expect(within(acces).getByText(/indépendant de ta part de capital/)).toBeInTheDocument();
    });
  });

  describe('les paliers', () => {
    it('dit « conditions à définir » plutôt que d’inventer des conditions', async () => {
      mockApiRoutes(routes(view({ milestones: [milestone({ conditions: [] })] })));

      render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

      expect(await screen.findByText(/Conditions à définir par IGNITUX/)).toBeInTheDocument();
    });

    it('n’affiche aucune échéance ni durée', async () => {
      mockApiRoutes(routes(view()));

      render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

      await screen.findByText(/Trois mois de trésorerie positive/);
      expect(screen.queryByText(/échéance/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/dans \d+ (an|mois)/i)).not.toBeInTheDocument();
    });

    it('laisse l’entrepreneur prendre connaissance, sans bouton pour valider ni exécuter', async () => {
      mockApiRoutes(
        routes(view(), { 'POST /participation/milestones/m1/acknowledge': { status: 200, body: {} } }),
      );

      render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

      fireEvent.click(await screen.findByRole('button', { name: 'Prendre connaissance' }));

      await waitFor(() => expect(appels('POST /participation/milestones/m1/acknowledge')).toHaveLength(1));
      expect(screen.queryByRole('button', { name: 'Valider ce palier' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Exécuter ce palier' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Ajouter un palier' })).not.toBeInTheDocument();
    });

    it('laisse IGNITUX valider un palier dont les conditions sont écrites', async () => {
      mockApiRoutes(
        routes(view({}, { isIgnituxOperator: true }), {
          'POST /participation/milestones/m1/validate': { status: 200, body: {} },
        }),
      );

      render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

      fireEvent.click(await screen.findByRole('button', { name: 'Valider ce palier' }));

      await waitFor(() => expect(appels('POST /participation/milestones/m1/validate')).toHaveLength(1));
    });

    it('ne propose pas de valider un palier sans condition', async () => {
      mockApiRoutes(routes(view({ milestones: [milestone({ conditions: [] })] }, { isIgnituxOperator: true })));

      render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

      await screen.findByText(/Conditions à définir par IGNITUX/);
      expect(screen.queryByRole('button', { name: 'Valider ce palier' })).not.toBeInTheDocument();
    });

    it('laisse IGNITUX exécuter un palier validé à une date effective choisie', async () => {
      mockApiRoutes(
        routes(view({ milestones: [milestone({ status: 'valide' })] }, { isIgnituxOperator: true }), {
          'POST /participation/milestones/m1/execute': { status: 200, body: {} },
        }),
      );

      render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

      fireEvent.change(await screen.findByLabelText('Date effective'), { target: { value: '2027-03-01' } });
      fireEvent.click(screen.getByRole('button', { name: 'Exécuter ce palier' }));

      await waitFor(() => expect(appels('POST /participation/milestones/m1/execute')).toHaveLength(1));
      expect(JSON.parse(appels('POST /participation/milestones/m1/execute')[0][1].body)).toEqual({
        effectiveOn: '2027-03-01',
      });
    });

    it('laisse IGNITUX prévoir un palier : pourcentage libre, conditions une par ligne', async () => {
      mockApiRoutes(
        routes(view({ milestones: [] }, { isIgnituxOperator: true }), {
          'POST /projects/p1/participation/milestones': { status: 201, body: {} },
        }),
      );

      render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

      fireEvent.change(await screen.findByLabelText('Part d’IGNITUX visée (%)'), { target: { value: '12,5' } });
      fireEvent.change(screen.getByLabelText('Conditions (une par ligne)'), {
        target: { value: 'Condition A\n\nCondition B  ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Ajouter un palier' }));

      await waitFor(() => expect(appels('POST /projects/p1/participation/milestones')).toHaveLength(1));
      expect(JSON.parse(appels('POST /projects/p1/participation/milestones')[0][1].body)).toEqual({
        targetIgnituxBasisPoints: 1250,
        conditions: ['Condition A', 'Condition B'],
      });
    });

    it('refuse un pourcentage illisible sans rien envoyer', async () => {
      mockApiRoutes(routes(view({ milestones: [] }, { isIgnituxOperator: true })));

      render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

      fireEvent.change(await screen.findByLabelText('Part d’IGNITUX visée (%)'), { target: { value: 'beaucoup' } });
      fireEvent.click(screen.getByRole('button', { name: 'Ajouter un palier' }));

      expect(await screen.findByText(/Pourcentage illisible/)).toBeInTheDocument();
      expect(appels('POST /projects/p1/participation/milestones')).toHaveLength(0);
    });
  });

  describe('le droit sur les dividendes', () => {
    it('laisse l’entrepreneur constater un dividende distribué, en centimes entiers', async () => {
      mockApiRoutes(
        routes(transmise(), { 'POST /projects/p1/participation/dividends': { status: 201, body: {} } }),
      );

      render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

      fireEvent.change(await screen.findByLabelText('Dividende distribué (€)'), { target: { value: '10000' } });
      fireEvent.change(screen.getByLabelText('Date de distribution'), { target: { value: '2031-12-31' } });
      fireEvent.click(screen.getByRole('button', { name: 'Constater un dividende distribué' }));

      await waitFor(() => expect(appels('POST /projects/p1/participation/dividends')).toHaveLength(1));
      expect(JSON.parse(appels('POST /projects/p1/participation/dividends')[0][1].body)).toEqual({
        distributedCents: 1_000_000,
        occurredOn: '2031-12-31',
      });
    });

    it('affiche ce qui est dû, et laisse IGNITUX seul le marquer réglé', async () => {
      const entrees = [
        { id: 'd1', distributed_cents: 1_000_000, right_bps: 500, due_cents: 50_000, occurred_on: '2031-12-31', status: 'du', settled_on: null, note: null },
      ];
      const dividendRight = { rightBasisPoints: 500, active: true, entries: entrees, totalDueCents: 50_000, totalSettledCents: 0 };

      mockApiRoutes(routes(transmise({ dividendRight })));
      const { unmount } = render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

      const bloc = (await screen.findByRole('heading', { name: 'Droit économique d’IGNITUX sur les dividendes' })).closest('section')!;
      expect(within(bloc).getByText(/distribué 10\s000,00 €, dû 500,00 €/)).toBeInTheDocument();
      expect(within(bloc).getByText(/Total dû : 500,00 €/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Marquer comme réglé' })).not.toBeInTheDocument();
      unmount();

      mockApiRoutes(
        routes(transmise({ dividendRight }, { isIgnituxOperator: true }), {
          'POST /participation/dividend-rights/d1/settle': { status: 200, body: {} },
        }),
      );
      render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

      fireEvent.change(await screen.findByLabelText('Date de règlement'), { target: { value: '2032-01-15' } });
      fireEvent.click(screen.getByRole('button', { name: 'Marquer comme réglé' }));

      await waitFor(() => expect(appels('POST /participation/dividend-rights/d1/settle')).toHaveLength(1));
      expect(JSON.parse(appels('POST /participation/dividend-rights/d1/settle')[0][1].body)).toEqual({
        settledOn: '2032-01-15',
      });
    });
  });

  it('en lecture seule (collaborateur), n’offre aucun geste d’écriture', async () => {
    mockApiRoutes(routes(transmise({}, { isIgnituxOperator: false })));

    render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} readOnly />);

    await screen.findByRole('heading', { name: 'Capital' });
    expect(screen.queryByRole('button', { name: 'Constater un dividende distribué' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Prendre connaissance' })).not.toBeInTheDocument();
  });

  it('affiche l’erreur du serveur quand une écriture est refusée', async () => {
    mockApiRoutes(
      routes(view({}, { isIgnituxOperator: true }), {
        'POST /participation/milestones/m1/validate': {
          status: 400,
          body: { message: 'Le palier précédent n’est pas encore exécuté.' },
        },
      }),
    );

    render(<ParticipationSection token={TOKEN} projectId={PROJECT_ID} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Valider ce palier' }));

    expect(await screen.findByText(/Le palier précédent n’est pas encore exécuté/)).toBeInTheDocument();
  });
});
