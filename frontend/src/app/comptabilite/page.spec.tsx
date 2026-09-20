import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import ComptabilitePage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const BANQUE = { id: 'c1', code: '512', label: 'Banque', kind: 'actif', currency: 'EUR' };
const VENTES = { id: 'c2', code: '706', label: 'Prestations', kind: 'produit', currency: 'EUR' };

const BALANCE_EQUILIBREE = {
  currency: 'EUR',
  lines: [
    { accountId: 'c1', code: '512', label: 'Banque', kind: 'actif', debitCents: 120000, creditCents: 0, balanceCents: 120000 },
    { accountId: 'c2', code: '706', label: 'Prestations', kind: 'produit', debitCents: 0, creditCents: 120000, balanceCents: -120000 },
  ],
  totalDebitCents: 120000,
  totalCreditCents: 120000,
  balanced: true,
};

const AVEC_PLAN = {
  'GET /comptabilite/comptes': { status: 200, body: [BANQUE, VENTES] },
  'GET /comptabilite/ecritures': { status: 200, body: [] },
  'GET /comptabilite/balance': { status: 200, body: BALANCE_EQUILIBREE },
};

function afficher() {
  render(
    <AuthProvider>
      <ComptabilitePage />
    </AuthProvider>,
  );
}

function corpsEnvoye() {
  const appels = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  const envoi = appels.find((a) => (a[1] as RequestInit)?.method === 'POST');
  return envoi ? JSON.parse(String((envoi[1] as RequestInit).body)) : null;
}

describe('ComptabilitePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('affiche la balance et dit que les deux colonnes se répondent', async () => {
    mockApiRoutes(AVEC_PLAN);

    afficher();

    expect(await screen.findByText(/512/)).toBeInTheDocument();
    expect(screen.getByText(/Débits et crédits se répondent/)).toBeInTheDocument();
  });

  // Un déséquilibre ne se rattrape pas en relisant : il se voit là, ou pas.
  it('signale un déséquilibre au lieu de le laisser passer', async () => {
    mockApiRoutes({
      ...AVEC_PLAN,
      'GET /comptabilite/balance': {
        status: 200,
        body: { ...BALANCE_EQUILIBREE, totalCreditCents: 110000, balanced: false },
      },
    });

    afficher();

    expect(await screen.findByText(/Déséquilibre/)).toBeInTheDocument();
  });

  // Aucun plan comptable n'est déposé d'office : selon le pays et le
  // régime, ce ne serait pas le bon.
  it('dit qu’Ignitux ne dépose aucun plan comptable tout fait', async () => {
    mockApiRoutes(AVEC_PLAN);

    afficher();

    expect(await screen.findByText(/aucun plan comptable tout fait/)).toBeInTheDocument();
  });

  it('n’offre pas de saisir une écriture tant qu’il n’y a pas deux comptes', async () => {
    mockApiRoutes({
      ...AVEC_PLAN,
      'GET /comptabilite/comptes': { status: 200, body: [BANQUE] },
      'GET /comptabilite/balance': {
        status: 200,
        body: { ...BALANCE_EQUILIBREE, lines: [BALANCE_EQUILIBREE.lines[0]] },
      },
    });

    afficher();

    expect(await screen.findByText(/il en faut donc au moins deux/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Compte débité')).not.toBeInTheDocument();
  });

  // LA propriété de ce formulaire : écrite ainsi, une écriture ne PEUT pas
  // être déséquilibrée.
  it('envoie deux lignes du même montant, débit d’un côté, crédit de l’autre', async () => {
    mockApiRoutes({
      ...AVEC_PLAN,
      'POST /comptabilite/ecritures': { status: 201, body: { id: 'e1' } },
    });

    afficher();

    fireEvent.change(await screen.findByLabelText('Libellé'), {
      target: { value: 'Facture client' },
    });
    fireEvent.change(screen.getByLabelText('Montant en euros'), { target: { value: '1200' } });
    fireEvent.change(screen.getByLabelText('Compte débité'), { target: { value: 'c1' } });
    fireEvent.change(screen.getByLabelText('Compte crédité'), { target: { value: 'c2' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer l’écriture/i }));

    await waitFor(() => {
      const corps = corpsEnvoye();
      expect(corps).toBeTruthy();
      expect(corps.lines).toEqual([
        { accountId: 'c1', debitCents: 120000, creditCents: 0 },
        { accountId: 'c2', debitCents: 0, creditCents: 120000 },
      ]);
    });
  });

  it('refuse le même compte des deux côtés', async () => {
    mockApiRoutes(AVEC_PLAN);

    afficher();

    fireEvent.change(await screen.findByLabelText('Libellé'), { target: { value: 'Essai' } });
    fireEvent.change(screen.getByLabelText('Montant en euros'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Compte crédité'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer l’écriture/i }));

    expect(await screen.findByText(/ne constaterait rien/)).toBeInTheDocument();
    expect(corpsEnvoye()).toBeNull();
  });

  // Le sens est porté par les deux comptes, pas par un signe. Accepter un
  // montant négatif ferait deux façons de dire la même chose.
  it('refuse un montant négatif en expliquant où est le sens', async () => {
    mockApiRoutes(AVEC_PLAN);

    afficher();

    fireEvent.change(await screen.findByLabelText('Libellé'), { target: { value: 'Essai' } });
    fireEvent.change(screen.getByLabelText('Montant en euros'), { target: { value: '-100' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer l’écriture/i }));

    expect(await screen.findByText(/le sens est porté par les deux comptes/i)).toBeInTheDocument();
    expect(corpsEnvoye()).toBeNull();
  });

  it('ouvre un compte avec son code, son intitulé et sa nature', async () => {
    mockApiRoutes({
      ...AVEC_PLAN,
      'POST /comptabilite/comptes': { status: 201, body: BANQUE },
    });

    afficher();

    fireEvent.change(await screen.findByLabelText('Code'), { target: { value: '627' } });
    fireEvent.change(screen.getByLabelText('Intitulé'), { target: { value: 'Frais bancaires' } });
    fireEvent.change(screen.getByLabelText('Nature'), { target: { value: 'charge' } });
    fireEvent.click(screen.getByRole('button', { name: /ouvrir ce compte/i }));

    await waitFor(() => {
      expect(corpsEnvoye()).toEqual({ code: '627', label: 'Frais bancaires', kind: 'charge' });
    });
  });

  it('affiche une erreur lisible si la comptabilité ne charge pas', async () => {
    mockApiRoutes({
      'GET /comptabilite/comptes': { status: 500, body: { message: 'Livres injoignables.' } },
    });

    afficher();

    expect(await screen.findByText('Livres injoignables.')).toBeInTheDocument();
  });
});
