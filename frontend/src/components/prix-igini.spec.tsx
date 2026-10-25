import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { mockApiRoutes } from '@/test-utils/mocks';
import {
  CreditsProvider,
  erreurIgini,
  MessageErreurIgini,
  PrixIgini,
  useCredits,
  usePrixIgini,
} from './prix-igini';

const BAREME = {
  valeurCreditCentimes: 10,
  bienvenue: 30,
  recharges: [{ prixCentimes: 1000, credits: 100 }],
  rechargeDisponible: false,
  rechargeMessage: 'Bientôt disponible.',
  actions: [
    { generateur: 'analyser', libelle: 'Analyser une idée', credits: 4, par: 'action' },
    { generateur: 'executer', libelle: 'Faire faire une tâche par IGINI', credits: 4, par: 'action' },
    { generateur: 'discuter', libelle: 'Message à IGINI', credits: 1, par: 'message' },
  ],
};

function credits(solde: number) {
  mockApiRoutes({ 'GET /credits': { status: 200, body: { solde, bareme: BAREME, historique: [] } } });
}

/** Un bouton d'action IGINI comme les écrans les écrivent. */
function Bouton({ generateur = 'analyser', quantite = 1 }: { generateur?: string; quantite?: number }) {
  const prix = usePrixIgini(generateur as 'analyser', quantite);
  return (
    <>
      <button type="button" disabled={prix?.insuffisant}>
        Lancer
      </button>
      <PrixIgini generateur={generateur as 'analyser'} quantite={quantite} />
    </>
  );
}

function rendre(enfant: React.ReactNode, payeParLeProprietaire = false) {
  return render(
    <CreditsProvider token="jeton" payeParLeProprietaire={payeParLeProprietaire}>
      {enfant}
    </CreditsProvider>,
  );
}

describe('le prix d’une action IGINI, avant de la lancer', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('dit le prix et ce qu’il restera', async () => {
    credits(26);
    rendre(<Bouton />);

    expect(await screen.findByText(/Cette action coûte/)).toHaveTextContent(
      'Cette action coûte 4 crédits — il t’en reste 26.',
    );
    expect(screen.getByRole('button', { name: 'Lancer' })).toBeEnabled();
    // Un montant se constate : gravé en or, jamais en feu.
    expect(screen.getByText('4 crédits')).toHaveClass('credits-montant');
  });

  it('bloque l’action quand le solde ne suffit pas, et mène aux crédits', async () => {
    credits(1);
    rendre(<Bouton />);

    expect(await screen.findByText(/Crédits insuffisants/)).toHaveTextContent(
      'Crédits insuffisants : il te faut 4 crédits, il t’en reste 1.',
    );
    expect(screen.getByRole('button', { name: 'Lancer' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Voir mes crédits' })).toHaveAttribute('href', '/credits');
  });

  it('additionne le prix d’un lot', async () => {
    credits(10);
    rendre(<Bouton generateur="executer" quantite={3} />);

    expect(await screen.findByText(/Crédits insuffisants/)).toHaveTextContent(
      'Crédits insuffisants : il te faut 12 crédits, il t’en reste 10.',
    );
    expect(screen.getByRole('button', { name: 'Lancer' })).toBeDisabled();
  });

  it('dit « par message » pour le chat', async () => {
    credits(26);
    rendre(<Bouton generateur="discuter" />);

    expect(await screen.findByText(/par message/)).toHaveTextContent('1 crédit par message — il t’en reste 26.');
  });

  it('dans le projet d’un autre, dit que les crédits du propriétaire paient et ne bloque pas', async () => {
    // Le solde du membre ne compte pas : le serveur débite le propriétaire,
    // et c'est lui qui tranche.
    credits(0);
    rendre(<Bouton />, true);

    expect(await screen.findByText(/propriétaire/)).toHaveTextContent(
      'Cette action coûte 4 crédits, pris sur les crédits du propriétaire du projet.',
    );
    expect(screen.getByRole('button', { name: 'Lancer' })).toBeEnabled();
    expect(screen.queryByText(/il t’en reste/)).not.toBeInTheDocument();
  });

  it('sans réponse lisible du serveur, ne dit rien et ne bloque rien', async () => {
    mockApiRoutes({ 'GET /credits': { status: 500, body: { message: 'Panne.' } } });
    rendre(<Bouton />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(/crédit/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lancer' })).toBeEnabled();
  });

  it('hors d’un fournisseur, ne lit rien et ne bloque rien', () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    render(<Bouton />);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Lancer' })).toBeEnabled();
  });

  it('relit le solde après une action réussie', async () => {
    credits(26);
    function Relire() {
      const contexte = useCredits();
      return (
        <button type="button" onClick={() => contexte?.actualiser()}>
          Relire
        </button>
      );
    }
    rendre(
      <>
        <Bouton />
        <Relire />
      </>,
    );
    expect(await screen.findByText(/Cette action coûte/)).toHaveTextContent('il t’en reste 26.');

    credits(22);
    fireEvent.click(screen.getByRole('button', { name: 'Relire' }));

    await waitFor(() => expect(screen.getByText(/Cette action coûte/)).toHaveTextContent('il t’en reste 22.'));
  });
});

describe('le refus du serveur, dit clairement', () => {
  it('« Crédits insuffisants » propose d’aller voir ses crédits', () => {
    const erreur = erreurIgini(
      new ApiError('Crédits insuffisants : il te faut 4 crédits, tu en as 1.', 402, undefined, {
        code: 'credits_insuffisants',
        requis: 4,
        disponible: 1,
      }),
      'Impossible.',
    );
    render(<MessageErreurIgini erreur={erreur} />);

    expect(screen.getByText(/Crédits insuffisants : il te faut 4 crédits, tu en as 1\./)).toHaveClass('error');
    expect(screen.getByRole('link', { name: 'Voir mes crédits' })).toHaveAttribute('href', '/credits');
  });

  it('le garde-fou de coût ne propose pas de recharger', () => {
    const erreur = erreurIgini(
      new ApiError('Garde-fou de coût IA atteint.', 402, undefined, { code: 'plafond_securite' }),
      'Impossible.',
    );
    render(<MessageErreurIgini erreur={erreur} />);

    expect(screen.getByText('Garde-fou de coût IA atteint.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('une erreur qui n’est pas du serveur prend le message de repli', () => {
    expect(erreurIgini(new Error('x'), 'Impossible d’analyser.')).toEqual({
      message: 'Impossible d’analyser.',
      voirCredits: false,
    });
  });
});
