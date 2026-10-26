import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { mockApiRoutes, signInAs } from '@/test-utils/mocks';
import { ChatIgini, extraireConfirmation, extraireMarqueurs } from './chat-igini';

const PROJET = '11111111-1111-4111-8111-111111111111';

function afficher(onClose = vi.fn()) {
  return render(
    <AuthProvider>
      <ChatIgini onClose={onClose} />
    </AuthProvider>,
  );
}

describe('ChatIgini', () => {
  beforeEach(() => {
    window.localStorage.clear();
    signInAs('tok123', { id: 'u1', email: 'fictif@ignitux.test' });
  });

  it('charge et affiche l’historique existant', async () => {
    mockApiRoutes({
      'GET /chat/messages': {
        status: 200,
        body: [{ id: 'm1', role: 'user', content: 'Salut', created_at: '2026-01-01T00:00:00Z' }],
      },
    });

    afficher();

    expect(await screen.findByText('Salut')).toBeInTheDocument();
  });

  it('envoie un message et affiche la réponse d’Igini', async () => {
    mockApiRoutes({
      'GET /chat/messages': { status: 200, body: [] },
      'POST /chat/messages': {
        status: 201,
        body: { id: 'm2', role: 'igini', content: 'Bonjour !', created_at: '2026-01-01T00:00:01Z' },
      },
    });

    afficher();
    fireEvent.change(await screen.findByLabelText('Ton message'), { target: { value: 'Salut Igini' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText('Salut Igini')).toBeInTheDocument();
    expect(await screen.findByText('Bonjour !')).toBeInTheDocument();
  });

  it("n'envoie rien pour un message vide ou blanc", async () => {
    mockApiRoutes({ 'GET /chat/messages': { status: 200, body: [] } });

    afficher();
    fireEvent.change(await screen.findByLabelText('Ton message'), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
  });

  it("affiche l'erreur du serveur si l'envoi échoue (ex. plafond de coût atteint)", async () => {
    mockApiRoutes({
      'GET /chat/messages': { status: 200, body: [] },
      'POST /chat/messages': { status: 402, body: { message: 'Plafond atteint.' } },
    });

    afficher();
    fireEvent.change(await screen.findByLabelText('Ton message'), { target: { value: 'Salut' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText('Plafond atteint.')).toBeInTheDocument();
  });

  it("échoue tout de suite hors-ligne, sans mise en file d'attente", async () => {
    mockApiRoutes({ 'GET /chat/messages': { status: 200, body: [] } });

    afficher();
    fireEvent.change(await screen.findByLabelText('Ton message'), { target: { value: 'Salut' } });
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText(/pas de réseau/i)).toBeInTheDocument();
  });

  it('ferme le panneau au clic sur le bouton fermer', async () => {
    const onClose = vi.fn();
    mockApiRoutes({ 'GET /chat/messages': { status: 200, body: [] } });

    afficher(onClose);
    fireEvent.click(await screen.findByRole('button', { name: 'Fermer le chat' }));

    expect(onClose).toHaveBeenCalled();
  });
});

describe('extraireMarqueurs', () => {
  it('ne modifie pas un texte sans marqueur', () => {
    expect(extraireMarqueurs('Bonjour, comment puis-je aider ?')).toEqual({
      texte: 'Bonjour, comment puis-je aider ?',
      projetId: null,
      souvenirSuggere: null,
    });
  });

  it('extrait le marqueur projet et le retire du texte affiché', () => {
    expect(extraireMarqueurs("J'ai lancé l'analyse : faisabilité 7/10.\n[[projet: p1]]")).toEqual({
      texte: "J'ai lancé l'analyse : faisabilité 7/10.",
      projetId: 'p1',
      souvenirSuggere: null,
    });
  });

  it('extrait le marqueur souvenir et le retire du texte affiché', () => {
    expect(extraireMarqueurs('Je retiens que le local fait 80 m².\n[[souvenir: Le local fait 80 m²]]')).toEqual({
      texte: 'Je retiens que le local fait 80 m².',
      projetId: null,
      souvenirSuggere: 'Le local fait 80 m²',
    });
  });

  it('extrait les deux marqueurs quand ils sont tous les deux présents', () => {
    expect(
      extraireMarqueurs('Fait.\n[[projet: p1]]\n[[souvenir: Contenu]]'),
    ).toEqual({ texte: 'Fait.', projetId: 'p1', souvenirSuggere: 'Contenu' });
  });

  it('extrait les deux marqueurs dans l’ordre inverse (souvenir avant projet)', () => {
    // Trouvaille de la revue finale : le prompt système ne garantit aucun
    // ordre entre les deux marqueurs (chacun dit juste « termine ta
    // réponse par… »). L'ancienne extraction, ancrée en fin de chaîne,
    // ratait le premier marqueur dès que l'ordre était celui-ci.
    expect(
      extraireMarqueurs('Fait.\n[[souvenir: Contenu]]\n[[projet: p1]]'),
    ).toEqual({ texte: 'Fait.', projetId: 'p1', souvenirSuggere: 'Contenu' });
  });

  it('ignore un marqueur projet dupliqué et garde le premier', () => {
    expect(
      extraireMarqueurs('Fait.\n[[projet: p1]]\n[[projet: p2]]'),
    ).toEqual({ texte: 'Fait.', projetId: 'p1', souvenirSuggere: null });
  });

  it('retire un marqueur même au milieu du texte, pas seulement en fin de chaîne', () => {
    expect(
      extraireMarqueurs('Avant.\n[[projet: p1]]\nAprès.'),
    ).toEqual({ texte: 'Avant.\nAprès.', projetId: 'p1', souvenirSuggere: null });
  });
});

describe('extraireConfirmation', () => {
  it('lit l’outil, le projet et le prix que le serveur a écrits', () => {
    expect(extraireConfirmation(`Ça coûte 4 crédits.\n[[confirmer: analyser ${PROJET} 4]]`)).toEqual({
      outil: 'analyser',
      projetId: PROJET,
      credits: 4,
    });
    expect(extraireConfirmation('Rien à confirmer.')).toBeNull();
  });

  it('le marqueur ne s’affiche jamais brut', () => {
    expect(extraireMarqueurs(`Ça coûte 4 crédits.\n[[confirmer: analyser ${PROJET} 4]]`).texte).toBe(
      'Ça coûte 4 crédits.',
    );
  });
});

describe('ChatIgini — confirmer le prix d’une étape', () => {
  beforeEach(() => {
    window.localStorage.clear();
    signInAs('tok123', { id: 'u1', email: 'fictif@ignitux.test' });
  });

  const proposition = (id: string, content: string) => ({
    id,
    role: 'igini',
    content,
    created_at: '2026-01-01T00:00:00Z',
  });

  it('montre le prix sur un bouton, et le oui part comme message', async () => {
    mockApiRoutes({
      'GET /chat/messages': {
        status: 200,
        body: [proposition('m1', `Cette analyse coûte 4 crédits. Je la lance ?\n[[confirmer: analyser ${PROJET} 4]]`)],
      },
      'POST /chat/messages': {
        status: 201,
        body: { id: 'm3', role: 'igini', content: 'C’est lancé.', created_at: '2026-01-01T00:00:02Z' },
      },
    });

    afficher();
    const bouton = await screen.findByRole('button', { name: 'Confirmer — 4 crédits' });
    expect(screen.queryByText(/\[\[confirmer/)).not.toBeInTheDocument();
    fireEvent.click(bouton);

    expect(await screen.findByText('C’est lancé.')).toBeInTheDocument();
    const envoi = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    );
    // La confirmation est STRUCTURÉE : c'est elle, pas le texte, que le serveur compare au marqueur.
    expect(JSON.parse(String((envoi?.[1] as RequestInit).body))).toEqual({
      content: 'Oui, je confirme.',
      confirmation: { outil: 'analyser', projectId: PROJET, credits: 4 },
    });
  });

  it('un « oui » tapé part comme un message ordinaire, sans confirmation', async () => {
    mockApiRoutes({
      'GET /chat/messages': {
        status: 200,
        body: [proposition('m1', `Je la lance ?
[[confirmer: analyser ${PROJET} 4]]`)],
      },
      'POST /chat/messages': {
        status: 201,
        body: { id: 'm3', role: 'igini', content: 'Clique sur Confirmer.', created_at: '2026-01-01T00:00:02Z' },
      },
    });

    afficher();
    fireEvent.change(await screen.findByLabelText('Ton message'), { target: { value: 'oui' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText('Clique sur Confirmer.')).toBeInTheDocument();
    const envoi = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(JSON.parse(String((envoi?.[1] as RequestInit).body))).toEqual({ content: 'oui' });
  });

  it('ne propose de confirmer que sur le dernier message : une proposition dépassée ne vaut plus', async () => {
    mockApiRoutes({
      'GET /chat/messages': {
        status: 200,
        body: [
          proposition('m1', `Je la lance ?\n[[confirmer: analyser ${PROJET} 4]]`),
          { id: 'm2', role: 'user', content: 'Attends', created_at: '2026-01-01T00:00:01Z' },
          proposition('m3', 'D’accord, j’attends.'),
        ],
      },
    });

    afficher();

    expect(await screen.findByText('D’accord, j’attends.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Confirmer/ })).not.toBeInTheDocument();
  });
});

describe('ChatIgini — marqueurs', () => {
  it('affiche un lien vers le projet sans jamais montrer le marqueur brut', async () => {
    mockApiRoutes({
      'GET /chat/messages': {
        status: 200,
        body: [
          {
            id: 'm1',
            role: 'igini',
            content: "J'ai lancé l'analyse.\n[[projet: p1]]",
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
    });

    afficher();

    expect(await screen.findByText("J'ai lancé l'analyse.")).toBeInTheDocument();
    expect(screen.queryByText(/\[\[projet/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /voir le projet/i })).toHaveAttribute('href', '/projects/p1');
  });

  it('affiche un bouton "Enregistrer ce souvenir" sans jamais montrer le marqueur brut', async () => {
    mockApiRoutes({
      'GET /chat/messages': {
        status: 200,
        body: [
          {
            id: 'm1',
            role: 'igini',
            content: 'Je retiens que le local fait 80 m² — je l’enregistre ?\n[[souvenir: Le local fait 80 m²]]',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
    });

    afficher();

    expect(await screen.findByText('Je retiens que le local fait 80 m² — je l’enregistre ?')).toBeInTheDocument();
    expect(screen.queryByText(/\[\[souvenir/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer ce souvenir' })).toBeInTheDocument();
  });

  it('enregistre le souvenir suggéré au clic, avec la catégorie fact par défaut', async () => {
    mockApiRoutes({
      'GET /chat/messages': {
        status: 200,
        body: [
          {
            id: 'm1',
            role: 'igini',
            content: 'Je retiens ceci.\n[[souvenir: Contenu suggéré]]',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
      'POST /memory': { status: 201, body: { id: 'mem1' } },
    });

    afficher();
    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer ce souvenir' }));

    expect(await screen.findByText('Souvenir enregistré.')).toBeInTheDocument();
  });

  describe('un crédit par message', () => {
    const credits = (solde: number) => ({
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
            actions: [{ generateur: 'discuter', libelle: 'Message à IGINI', credits: 1, par: 'message' }],
          },
        },
      },
    });

    it('le dit discrètement sous la conversation', async () => {
      mockApiRoutes({ 'GET /chat/messages': { status: 200, body: [] }, ...credits(26) });

      afficher();

      expect(await screen.findByText(/par message/)).toHaveTextContent('1 crédit par message — il t’en reste 26.');
    });

    it('sans crédit, n’envoie pas et mène aux crédits', async () => {
      mockApiRoutes({ 'GET /chat/messages': { status: 200, body: [] }, ...credits(0) });

      afficher();
      fireEvent.change(await screen.findByLabelText('Ton message'), { target: { value: 'Salut' } });

      expect(await screen.findByText(/Crédits insuffisants/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
      expect(screen.getByRole('link', { name: 'Voir mes crédits' })).toHaveAttribute('href', '/credits');
    });

    it('un refus « crédits insuffisants » du serveur porte le lien vers les crédits', async () => {
      mockApiRoutes({
        'GET /chat/messages': { status: 200, body: [] },
        'POST /chat/messages': {
          status: 402,
          body: {
            code: 'credits_insuffisants',
            message: 'Crédits insuffisants : il te faut 1 crédit, tu en as 0.',
            requis: 1,
            disponible: 0,
          },
        },
      });

      afficher();
      fireEvent.change(await screen.findByLabelText('Ton message'), { target: { value: 'Salut' } });
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

      expect(await screen.findByText(/tu en as 0\./)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Voir mes crédits' })).toHaveAttribute('href', '/credits');
    });
  });
});
