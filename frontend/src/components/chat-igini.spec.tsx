import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { mockApiRoutes, signInAs } from '@/test-utils/mocks';
import { ChatIgini } from './chat-igini';

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
