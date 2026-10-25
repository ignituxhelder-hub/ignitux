import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreditsProvider } from '@/components/prix-igini';
import { mockApiRoutes } from '@/test-utils/mocks';
import { EvaluationSection } from './evaluation-section';

const TOKEN = 'tok123';
const URL_LISTE = 'GET /projects/p1/evaluations-financement';

const rapport = {
  verdict: 'financable_apres_corrections',
  resume: 'Une boulangerie qui cherche 40 000 €.',
  montantRecherche: { montantEuros: 40000, source: 'plan de financement' },
  usageDesFonds: 'Four et travaux.',
  audit: { connu: ['analyse'], manques: ['prévisionnel sur 3 ans'] },
  faisabilite: { marche: 'Quartier sans boulangerie.', modeleEconomique: 'Comptoir.', capacite: 'À établir.' },
  dossier: [{ piece: 'Plan de financement', etat: 'prete' }],
  risques: [{ risque: 'Loyer élevé', gravite: 'moyenne', reduction: 'Négocier.' }],
  pistes: [{ type: 'Prêt bancaire', pourquoi: 'Matériel.' }],
  prochainesEtapes: ['Établir un prévisionnel'],
};

function vue(partiel: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    status: 'en_revue',
    createdAt: '2026-10-11T08:00:00Z',
    reviewedAt: null,
    verdict: null,
    rapport: null,
    noteIgnitux: null,
    motifRefus: null,
    motifEchec: null,
    ...partiel,
  };
}

function routes(liste: unknown[], extra: Record<string, { status: number; body: unknown }> = {}) {
  mockApiRoutes({
    [URL_LISTE]: { status: 200, body: liste },
    ...extra,
  });
}

function credits(solde: number) {
  return {
    'GET /credits': {
      status: 200,
      body: {
        solde,
        historique: [],
        bareme: {
          valeurCreditCentimes: 10,
          bienvenue: 30,
          recharges: [],
          rechargeDisponible: false,
          rechargeMessage: '',
          actions: [{ generateur: 'evaluer', libelle: 'Évaluation de financement', credits: 6, par: 'action' }],
        },
      },
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('EvaluationSection', () => {
  it('propose « Demander une évaluation » quand il n’y en a aucune', async () => {
    routes([]);
    render(<EvaluationSection token={TOKEN} projectId="p1" />);
    expect(await screen.findByRole('button', { name: 'Demander une évaluation' })).toBeInTheDocument();
  });

  it('envoie la demande et affiche la préparation', async () => {
    routes([], { 'POST /projects/p1/evaluations-financement': { status: 201, body: vue({ status: 'en_preparation' }) } });
    render(<EvaluationSection token={TOKEN} projectId="p1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Demander une évaluation' }));

    expect(await screen.findByText(/En préparation/)).toBeInTheDocument();
  });

  it('affiche « En cours de revue par Ignitux » sans aucun contenu du rapport', async () => {
    routes([vue({ status: 'en_revue' })]);
    render(<EvaluationSection token={TOKEN} projectId="p1" />);

    expect(await screen.findByText(/En cours de revue par Ignitux/)).toBeInTheDocument();
    expect(screen.queryByText(/Finançable/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Demander une évaluation' })).not.toBeInTheDocument();
  });

  it('affiche le rapport validé : verdict, note signée Ignitux, date, bouton PDF', async () => {
    routes([
      vue({
        status: 'validee',
        verdict: 'financable_apres_corrections',
        rapport,
        noteIgnitux: 'Dossier sérieux.',
        reviewedAt: '2026-10-11T10:00:00Z',
      }),
    ]);
    render(<EvaluationSection token={TOKEN} projectId="p1" />);

    expect(await screen.findByText('Finançable après corrections')).toBeInTheDocument();
    expect(screen.getByText(/Dossier sérieux\./)).toBeInTheDocument();
    expect(screen.getByText(/— Ignitux/)).toBeInTheDocument();
    expect(screen.getByText(/11\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByText('prévisionnel sur 3 ans')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Télécharger le dossier (PDF)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Demander une nouvelle évaluation' })).toBeInTheDocument();
  });

  it('affiche le montant recherché, l’usage des fonds et ce qui est connu', async () => {
    routes([vue({ status: 'validee', verdict: 'financable', rapport, reviewedAt: '2026-10-11T10:00:00Z' })]);
    render(<EvaluationSection token={TOKEN} projectId="p1" />);

    expect(await screen.findByText(/40\s000\s€ \(source : plan de financement\)/)).toBeInTheDocument();
    expect(screen.getByText(/Four et travaux./)).toBeInTheDocument();
    expect(screen.getByText('analyse')).toBeInTheDocument();
  });

  it('efface une erreur de lecture dès qu’une lecture suivante réussit, sans lire d’offre', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockApiRoutes({
      [URL_LISTE]: { status: 200, body: [vue({ status: 'en_preparation' })] },
    });
    render(<EvaluationSection token={TOKEN} projectId="p1" />);
    await screen.findByText(/En préparation/);

    mockApiRoutes({ [URL_LISTE]: { status: 500, body: { message: 'Panne passagère.' } } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(await screen.findByText('Panne passagère.')).toBeInTheDocument();

    mockApiRoutes({ [URL_LISTE]: { status: 200, body: [vue({ status: 'en_revue' })] } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await waitFor(() => expect(screen.queryByText('Panne passagère.')).not.toBeInTheDocument());
    // Plus d'offre payante : l'évaluation n'attend plus aucune lecture d'offre.
    const lecturesOffres = vi
      .mocked(global.fetch)
      .mock.calls.filter(([url]) => new URL(String(url)).pathname === '/offres');
    expect(lecturesOffres).toHaveLength(0);
  });

  it('affiche le motif d’un refus et permet de redemander', async () => {
    routes([vue({ status: 'refusee', motifRefus: 'Projet trop flou.' })]);
    render(<EvaluationSection token={TOKEN} projectId="p1" />);

    expect(await screen.findByText(/Projet trop flou\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Demander une nouvelle évaluation' })).toBeInTheDocument();
  });

  it('affiche l’échec et un bouton Réessayer', async () => {
    routes([vue({ status: 'echec', motifEchec: 'Le compteur repart le 1er.' })]);
    render(<EvaluationSection token={TOKEN} projectId="p1" />);

    expect(await screen.findByText(/n’a pas pu être préparée/)).toBeInTheDocument();
    expect(screen.getByText(/Le compteur repart le 1er\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('ne parle plus d’offre : l’évaluation est ouverte à tous, payée en crédits', async () => {
    routes([]);
    render(<EvaluationSection token={TOKEN} projectId="p1" />);

    expect(await screen.findByRole('button', { name: 'Demander une évaluation' })).toBeEnabled();
    expect(screen.queryByText(/offre Entrepreneur/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /offres/i })).not.toBeInTheDocument();
  });

  it('dit le prix de l’évaluation avant de la demander', async () => {
    mockApiRoutes({ [URL_LISTE]: { status: 200, body: [] }, ...credits(30) });
    render(
      <CreditsProvider token={TOKEN}>
        <EvaluationSection token={TOKEN} projectId="p1" />
      </CreditsProvider>,
    );

    expect(await screen.findByText(/Cette action coûte/)).toHaveTextContent(
      'Cette action coûte 6 crédits — il t’en reste 30.',
    );
    expect(screen.getByRole('button', { name: 'Demander une évaluation' })).toBeEnabled();
  });

  it('grise la demande quand le solde ne suffit pas', async () => {
    mockApiRoutes({ [URL_LISTE]: { status: 200, body: [] }, ...credits(2) });
    render(
      <CreditsProvider token={TOKEN}>
        <EvaluationSection token={TOKEN} projectId="p1" />
      </CreditsProvider>,
    );

    expect(await screen.findByText(/Crédits insuffisants/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Demander une évaluation' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Voir mes crédits' })).toHaveAttribute('href', '/credits');
  });

  it('montre le refus « crédits insuffisants » du serveur avec le lien vers les crédits', async () => {
    routes([], {
      'POST /projects/p1/evaluations-financement': {
        status: 402,
        body: {
          code: 'credits_insuffisants',
          message: 'Crédits insuffisants : il te faut 6 crédits, tu en as 2.',
          requis: 6,
          disponible: 2,
        },
      },
    });
    render(<EvaluationSection token={TOKEN} projectId="p1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Demander une évaluation' }));

    expect(await screen.findByText(/tu en as 2./)).toHaveClass('error');
    expect(screen.getByRole('link', { name: 'Voir mes crédits' })).toHaveAttribute('href', '/credits');
  });

  it('interroge à nouveau l’état tant qu’une évaluation est en préparation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    routes([vue({ status: 'en_preparation' })]);
    render(<EvaluationSection token={TOKEN} projectId="p1" />);
    await screen.findByText(/En préparation/);

    routes([vue({ status: 'en_revue' })]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    await waitFor(() => expect(screen.getByText(/En cours de revue par Ignitux/)).toBeInTheDocument());
  });

  it('en lecture seule (associé, comptable), ne propose pas de demander une évaluation', async () => {
    routes([]);
    render(<EvaluationSection token={TOKEN} projectId="p1" readOnly />);

    expect(await screen.findByText(/Aucune évaluation validée pour l’instant/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('en lecture seule, montre le rapport validé et son PDF, sans « nouvelle évaluation »', async () => {
    routes([
      vue({ status: 'validee', verdict: 'financable', rapport, reviewedAt: '2026-10-11T10:00:00Z' }),
    ]);
    render(<EvaluationSection token={TOKEN} projectId="p1" readOnly />);

    expect(await screen.findByText('Finançable après corrections')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Télécharger le dossier (PDF)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Demander/ })).not.toBeInTheDocument();
  });
});
