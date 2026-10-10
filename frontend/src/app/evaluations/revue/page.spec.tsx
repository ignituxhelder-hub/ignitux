import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import RevueEvaluationsPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const RAPPORT = {
  verdict: 'financable_apres_corrections',
  resume: 'Résumé d’IGINI.',
  montantRecherche: { montantEuros: 40000, source: 'plan de financement' },
  usageDesFonds: 'Four.',
  audit: { connu: ['analyse'], manques: ['prévisionnel'] },
  faisabilite: { marche: 'Quartier.', modeleEconomique: 'Comptoir.', capacite: 'À établir.' },
  dossier: [{ piece: 'Plan de financement', etat: 'prete' }],
  risques: [{ risque: 'Loyer', gravite: 'moyenne', reduction: 'Négocier' }],
  pistes: [{ type: 'Prêt bancaire', pourquoi: 'Matériel' }],
  prochainesEtapes: ['Prévisionnel'],
};

const LIGNE = {
  id: 'e1',
  projetTitre: 'Ma boulangerie',
  entrepreneurEmail: 'porteur@exemple.fr',
  verdict: 'financable_apres_corrections',
  createdAt: '2026-10-11T08:00:00Z',
};

const DETAIL = {
  id: 'e1',
  status: 'en_revue',
  projetTitre: 'Ma boulangerie',
  entrepreneurEmail: 'porteur@exemple.fr',
  createdAt: '2026-10-11T08:00:00Z',
  rapport: RAPPORT,
  noteIgnitux: null,
  traces: [],
};

function routes(extra: Record<string, { status: number; body: unknown }> = {}) {
  mockApiRoutes({
    'GET /evaluations-financement/revue': { status: 200, body: [LIGNE] },
    'GET /evaluations-financement/revue/e1': { status: 200, body: DETAIL },
    'PATCH /evaluations-financement/revue/e1': { status: 200, body: DETAIL },
    'POST /evaluations-financement/revue/e1/valider': { status: 204, body: null },
    'POST /evaluations-financement/revue/e1/refaire': { status: 204, body: null },
    'POST /evaluations-financement/revue/e1/refuser': { status: 204, body: null },
    ...extra,
  });
}

function appels(methode: string, chemin: string) {
  return vi
    .mocked(global.fetch)
    .mock.calls.filter(([url, options]) => new URL(String(url)).pathname === chemin && (options?.method ?? 'GET') === methode);
}

function afficher() {
  render(
    <AuthProvider>
      <RevueEvaluationsPage />
    </AuthProvider>,
  );
}

async function ouvrir() {
  fireEvent.click(await screen.findByRole('button', { name: /Ouvrir/ }));
  await screen.findByLabelText('Résumé');
}

describe('RevueEvaluationsPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    signInAs('tok', { id: 'admin', email: 'admin@exemple.fr' });
  });

  it('liste la file et ouvre une évaluation', async () => {
    routes();
    afficher();

    expect(await screen.findByRole('button', { name: 'Ouvrir « Ma boulangerie »' })).toBeInTheDocument();
    expect(screen.getByText(/porteur@exemple\.fr/)).toBeInTheDocument();
    await ouvrir();
    expect(screen.getByLabelText('Résumé')).toHaveValue('Résumé d’IGINI.');
    expect(screen.getByLabelText(/^Risques/)).toHaveValue('Loyer | moyenne | Négocier');
  });

  it('enregistre les sections modifiées et le verdict, puis valide', async () => {
    routes();
    afficher();
    await ouvrir();

    fireEvent.change(screen.getByLabelText('Résumé'), { target: { value: 'Résumé corrigé.' } });
    fireEvent.change(screen.getByLabelText('Verdict'), { target: { value: 'financable' } });
    fireEvent.change(screen.getByLabelText(/Note d’Ignitux/), { target: { value: 'Bon dossier.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Valider et envoyer' }));

    await waitFor(() => expect(appels('POST', '/evaluations-financement/revue/e1/valider')).toHaveLength(1));
    const [patch] = appels('PATCH', '/evaluations-financement/revue/e1');
    const corps = JSON.parse(String(patch[1]?.body));
    expect(corps.changements).toEqual([
      { section: 'verdict', valeur: 'financable' },
      { section: 'resume', valeur: 'Résumé corrigé.' },
    ]);
    expect(corps.noteIgnitux).toBe('Bon dossier.');
  });

  it('valide sans PATCH quand rien n’a été modifié', async () => {
    routes();
    afficher();
    await ouvrir();

    fireEvent.click(screen.getByRole('button', { name: 'Valider et envoyer' }));

    await waitFor(() => expect(appels('POST', '/evaluations-financement/revue/e1/valider')).toHaveLength(1));
    expect(appels('PATCH', '/evaluations-financement/revue/e1')).toHaveLength(0);
  });

  it('signale une ligne de risque mal écrite au lieu d’envoyer', async () => {
    routes();
    afficher();
    await ouvrir();

    fireEvent.change(screen.getByLabelText(/^Risques/), { target: { value: 'Loyer | énorme | Négocier' } });
    fireEvent.click(screen.getByRole('button', { name: 'Valider et envoyer' }));

    expect(await screen.findByText(/Risques, ligne 1/)).toBeInTheDocument();
    expect(appels('POST', '/evaluations-financement/revue/e1/valider')).toHaveLength(0);
  });

  it('n’envoie pas « Faire refaire » sans consigne ni « Refuser » sans motif', async () => {
    routes();
    afficher();
    await ouvrir();

    expect(screen.getByRole('button', { name: 'Faire refaire' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refuser' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Consigne pour IGINI'), { target: { value: 'Reprends le marché.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Faire refaire' }));
    await waitFor(() => expect(appels('POST', '/evaluations-financement/revue/e1/refaire')).toHaveLength(1));
    expect(JSON.parse(String(appels('POST', '/evaluations-financement/revue/e1/refaire')[0][1]?.body))).toEqual({
      consigne: 'Reprends le marché.',
    });
  });

  it('dit que l’écran est réservé aux administrateurs sur un 403', async () => {
    routes({ 'GET /evaluations-financement/revue': { status: 403, body: { message: 'Forbidden' } } });
    afficher();

    expect(await screen.findByText(/Réservé aux administrateurs/)).toBeInTheDocument();
  });
});
