import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, signInAs } from '@/test-utils/mocks';
import HomePage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

describe('HomePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('présente la méthode et les moteurs pour un visiteur non connecté', () => {
    render(
      <AuthProvider>
        <HomePage />
      </AuthProvider>,
    );

    // La grande scène : IGNITUX, la devise, et les mots autour de la boussole.
    expect(screen.getByRole('heading', { level: 1, name: 'Ignitux' })).toBeInTheDocument();
    expect(screen.getByText('Des idées au monde réel')).toBeInTheDocument();
    expect(screen.getByText('Nous servir')).toBeInTheDocument();
    expect(screen.getByText('La vérité avant tout')).toBeInTheDocument();
    expect(screen.getByText('Découvrir')).toBeInTheDocument();
    expect(screen.queryByText('Transformer une idée en réalité')).not.toBeInTheDocument();
    // La boussole est un décor : tout le sens est dans le texte voisin.
    expect(document.querySelector('img.scene__boussole')).toHaveAttribute('alt', '');

    expect(screen.getByText('Analyser')).toBeInTheDocument();
    // Deux fois : la colonne de la scène et l'étape de la méthode.
    expect(screen.getAllByText('Transmettre')).toHaveLength(2);
    expect(screen.getByText('Mémoire')).toBeInTheDocument();
    expect(screen.getByText('Score')).toBeInTheDocument();
    // Le texte n'apparaît qu'au clic sur l'icône.
    expect(screen.queryByText(/porteurs de projet/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Communauté' }));
    expect(screen.getByText(/porteurs de projet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Communauté' }));
    expect(screen.queryByText(/porteurs de projet/)).not.toBeInTheDocument();
  });

  it('redirige vers /projects si déjà connecté', async () => {
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });

    render(
      <AuthProvider>
        <HomePage />
      </AuthProvider>,
    );

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/accueil'));
  });
});
