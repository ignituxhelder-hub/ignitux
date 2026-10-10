import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

function offres(evaluationFinancement: boolean) {
  return {
    status: 200,
    body: {
      actuelle: evaluationFinancement ? 'entrepreneur' : 'decouverte',
      souscriptionPossible: false,
      offres: [
        {
          id: evaluationFinancement ? 'entrepreneur' : 'decouverte',
          label: evaluationFinancement ? 'Entrepreneur' : 'Découverte',
          actuelle: true,
          capacites: { evaluationFinancement },
        },
      ],
    },
  };
}

function routes(liste: unknown[], avecEvaluation = true, extra: Record<string, { status: number; body: unknown }> = {}) {
  mockApiRoutes({
    [URL_LISTE]: { status: 200, body: liste },
    'GET /offres': offres(avecEvaluation),
    ...extra,
  });
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
    routes([], true, { 'POST /projects/p1/evaluations-financement': { status: 201, body: vue({ status: 'en_preparation' }) } });
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

  it('en Découverte, dit « Comprise dans l’offre Entrepreneur » sans bouton de demande', async () => {
    routes([], false);
    render(<EvaluationSection token={TOKEN} projectId="p1" />);

    expect(await screen.findByText(/Comprise dans l’offre Entrepreneur/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Demander une évaluation' })).not.toBeInTheDocument();
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

  it('n’affiche aucun bouton en lecture seule (collaborateur)', async () => {
    routes([]);
    render(<EvaluationSection token={TOKEN} projectId="p1" readOnly />);

    expect(await screen.findByText(/réservée au porteur du projet/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
