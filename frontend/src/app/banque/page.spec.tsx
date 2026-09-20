import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import BanquePage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const COMPTE = {
  id: 'b1',
  label: 'Compte pro',
  kind: 'courant',
  currency: 'EUR',
  iban_last4: '1234',
  ledger_account_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

const MOUVEMENT = {
  id: 'm1',
  bank_account_id: 'b1',
  amount_cents: -4250,
  occurred_on: '2026-02-03T00:00:00.000Z',
  label: 'Achat de matériel',
  external_ref: null,
  reconciled_entry_id: null,
};

const SOLDE = {
  balanceCents: -4250,
  movements: 1,
  unreconciledCount: 1,
  unreconciledCents: -4250,
};

const AVEC_COMPTE = {
  'GET /banque/comptes': { status: 200, body: [COMPTE] },
  'GET /banque/comptes/b1/mouvements': { status: 200, body: [MOUVEMENT] },
  'GET /banque/comptes/b1/solde': { status: 200, body: SOLDE },
};

function afficher() {
  render(
    <AuthProvider>
      <BanquePage />
    </AuthProvider>,
  );
}

describe('BanquePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('affiche le solde, les mouvements et ce qui reste à rapprocher', async () => {
    mockApiRoutes(AVEC_COMPTE);

    afficher();

    expect(await screen.findByText('Achat de matériel')).toBeInTheDocument();
    // Le montant apparaît deux fois : sur la ligne, et dans le total à
    // rapprocher. Les deux sont voulus.
    expect(screen.getAllByText((t) => t.includes('42,50')).length).toBeGreaterThan(0);
    expect(screen.getByText((t) => t.includes('1 ·') && t.includes('42,50'))).toBeInTheDocument();
  });

  // Ignitux ne se connecte à aucune banque. Le laisser croire ferait
  // attendre des lignes qui ne viendront jamais.
  it('annonce que les mouvements se saisissent à la main', async () => {
    mockApiRoutes(AVEC_COMPTE);

    afficher();

    expect(await screen.findByText(/ne se connecte à aucune banque/)).toBeInTheDocument();
  });

  // Un menu déroulant vide ne dit rien. Sans écriture, l'écran envoie vers
  // l'endroit où on en crée.
  it('renvoie vers la comptabilité quand il n’y a aucune écriture à rattacher', async () => {
    mockApiRoutes(AVEC_COMPTE);

    afficher();

    expect(await screen.findByText(/aucune écriture comptable à y rattacher/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tenir la comptabilité' })).toHaveAttribute(
      'href',
      '/comptabilite',
    );
  });

  it('propose les écritures existantes et rapproche le mouvement choisi', async () => {
    mockApiRoutes({
      ...AVEC_COMPTE,
      'GET /comptabilite/ecritures': {
        status: 200,
        body: [
          {
            id: 'e1',
            occurred_on: '2026-02-03T00:00:00.000Z',
            label: 'Achat de matériel',
            reference: null,
            currency: 'EUR',
            lines: [],
          },
        ],
      },
      'POST /banque/mouvements/m1/rapprochement': { status: 201, body: MOUVEMENT },
    });

    afficher();

    const choix = await screen.findByLabelText('Écriture à rapprocher de Achat de matériel');
    fireEvent.change(choix, { target: { value: 'e1' } });
    fireEvent.click(screen.getByRole('button', { name: /^rapprocher$/i }));

    await waitFor(() => {
      const appels = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const envoi = appels.find((a) => String(a[0]).includes('/rapprochement'));
      expect(envoi).toBeTruthy();
      expect(JSON.parse(String((envoi?.[1] as RequestInit)?.body))).toEqual({ entryId: 'e1' });
    });
  });

  // Rapprocher sans choisir rattacherait le mouvement à n'importe quoi.
  it('refuse de rapprocher sans écriture choisie', async () => {
    mockApiRoutes({
      ...AVEC_COMPTE,
      'GET /comptabilite/ecritures': {
        status: 200,
        body: [
          {
            id: 'e1',
            occurred_on: '2026-02-03T00:00:00.000Z',
            label: 'Achat de matériel',
            reference: null,
            currency: 'EUR',
            lines: [],
          },
        ],
      },
    });

    afficher();

    fireEvent.click(await screen.findByRole('button', { name: /^rapprocher$/i }));

    expect(await screen.findByText(/Choisis l’écriture/)).toBeInTheDocument();
  });

  it('propose de déclarer un compte quand il n’y en a aucun', async () => {
    mockApiRoutes({ 'GET /banque/comptes': { status: 200, body: [] } });

    afficher();

    expect(await screen.findByText(/Aucun compte déclaré/)).toBeInTheDocument();
    expect(screen.getByLabelText('Nom du compte')).toBeInTheDocument();
  });

  // Refuser ici plutôt qu'au serveur : le message y serait plus sec et la
  // saisie aurait déjà été perdue en chemin.
  it('refuse un montant illisible sans rien envoyer', async () => {
    mockApiRoutes(AVEC_COMPTE);

    afficher();

    fireEvent.change(await screen.findByLabelText('Libellé'), {
      target: { value: 'Essai' },
    });
    fireEvent.change(screen.getByLabelText('Montant en euros'), {
      target: { value: 'quarante-deux' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer le mouvement/i }));

    expect(await screen.findByText(/Montant illisible/)).toBeInTheDocument();
    const appels = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(appels.some((a) => (a[1] as RequestInit)?.method === 'POST')).toBe(false);
  });

  it('refuse un mouvement nul, qui ne constate rien', async () => {
    mockApiRoutes(AVEC_COMPTE);

    afficher();

    fireEvent.change(await screen.findByLabelText('Libellé'), { target: { value: 'Essai' } });
    fireEvent.change(screen.getByLabelText('Montant en euros'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer le mouvement/i }));

    expect(await screen.findByText(/ne constate rien/)).toBeInTheDocument();
  });

  it('envoie un montant en centimes entiers, signe compris', async () => {
    mockApiRoutes({
      ...AVEC_COMPTE,
      'POST /banque/comptes/b1/mouvements': { status: 201, body: MOUVEMENT },
    });

    afficher();

    fireEvent.change(await screen.findByLabelText('Libellé'), {
      target: { value: 'Achat de matériel' },
    });
    fireEvent.change(screen.getByLabelText('Montant en euros'), { target: { value: '-42,50' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer le mouvement/i }));

    await waitFor(() => {
      const appels = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const envoi = appels.find((a) => (a[1] as RequestInit)?.method === 'POST');
      expect(envoi).toBeTruthy();
      const corps = JSON.parse(String((envoi?.[1] as RequestInit)?.body));
      expect(corps.amountCents).toBe(-4250);
      expect(corps.label).toBe('Achat de matériel');
    });
  });

  // Quatre caractères suffisent à reconnaître un compte. Un IBAN entier
  // collé ici est refusé à la saisie, pas nettoyé en silence.
  it('refuse un IBAN entier au lieu des quatre derniers caractères', async () => {
    mockApiRoutes({ 'GET /banque/comptes': { status: 200, body: [] } });

    afficher();

    fireEvent.change(await screen.findByLabelText('Nom du compte'), {
      target: { value: 'Compte pro' },
    });
    fireEvent.change(
      screen.getByLabelText('Quatre derniers caractères de l’IBAN (facultatif)'),
      { target: { value: 'FR7630' } },
    );
    fireEvent.click(screen.getByRole('button', { name: /déclarer ce compte/i }));

    // Par la classe d'erreur : le texte d'aide sous le champ contient une
    // phrase proche, et c'est bien le refus qu'on veut voir apparaître.
    const erreur = await screen.findByText((t) => t.startsWith('On n'));
    expect(erreur).toHaveClass('error');
  });

  it('affiche une erreur lisible si les comptes ne chargent pas', async () => {
    mockApiRoutes({ 'GET /banque/comptes': { status: 500, body: { message: 'Base absente.' } } });

    afficher();

    expect(await screen.findByText('Base absente.')).toBeInTheDocument();
  });
});
