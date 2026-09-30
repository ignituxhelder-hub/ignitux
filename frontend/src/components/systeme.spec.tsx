import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, signInAs } from '@/test-utils/mocks';
import { Systeme } from './systeme';

const router = createRouterMock();
let chemin = '/projects';
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => chemin,
}));

function afficher() {
  return render(
    <AuthProvider>
      <Systeme>
        <p>contenu de la page</p>
      </Systeme>
    </AuthProvider>,
  );
}

function taches() {
  return JSON.parse(window.localStorage.getItem('ignitux.taches') ?? '[]') as unknown[];
}

describe('Systeme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.push.mockClear();
    chemin = '/projects';
  });

  it('ne montre aucune barre sans connexion, et oublie les tâches', async () => {
    window.localStorage.setItem('ignitux.taches', JSON.stringify([{ id: 'banque', url: '/banque' }]));
    afficher();
    expect(screen.getByText('contenu de la page')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Barre des tâches' })).not.toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem('ignitux.taches')).toBeNull());
  });

  describe('connecté', () => {
    beforeEach(() => {
      signInAs('tok123', { id: 'u1', email: 'fictif@ignitux.test' });
    });

    it("dans une application : son nom en haut, un retour au bureau, et la barre des tâches", async () => {
      afficher();
      const barre = await screen.findByRole('navigation', { name: 'Barre des tâches' });
      const entete = screen.getByRole('banner');
      expect(entete).toHaveTextContent('Mes projets');
      expect(within(entete).getByRole('link', { name: /bureau/i })).toHaveAttribute(
        'href',
        '/accueil',
      );
      expect(barre.querySelector('[aria-current="page"]')).toHaveTextContent('Mes projets');
    });

    it("retient l'endroit exact où on a laissé chaque application", async () => {
      window.localStorage.setItem(
        'ignitux.taches',
        JSON.stringify([{ id: 'facturation', url: '/facturation/d7' }]),
      );
      chemin = '/projects/p1';
      afficher();
      await waitFor(() =>
        expect(taches()).toEqual([
          { id: 'facturation', url: '/facturation/d7' },
          { id: 'parcours', url: '/projects/p1' },
        ]),
      );
      const barre = screen.getByRole('navigation', { name: 'Barre des tâches' });
      const facturation = [...barre.querySelectorAll('a')].find((a) =>
        a.textContent?.includes('Facturation'),
      );
      expect(facturation).toHaveAttribute('href', '/facturation/d7');
    });

    it('sur le bureau : la barre des tâches, sans barre d’application', async () => {
      chemin = '/accueil';
      afficher();
      const barre = await screen.findByRole('navigation', { name: 'Barre des tâches' });
      expect(barre.querySelector('[aria-current="page"]')).toHaveTextContent('Bureau');
      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    });

    it("hors du système (connexion, pages d'erreur) : aucune barre", () => {
      chemin = '/login';
      afficher();
      expect(screen.queryByRole('navigation', { name: 'Barre des tâches' })).not.toBeInTheDocument();
    });

    it("fermer l'application la retire de la barre et ramène au bureau", async () => {
      afficher();
      fireEvent.click(await screen.findByRole('button', { name: 'Fermer Mes projets' }));
      expect(router.push).toHaveBeenCalledWith('/accueil');
      expect(taches()).toEqual([]);
    });
  });
});
