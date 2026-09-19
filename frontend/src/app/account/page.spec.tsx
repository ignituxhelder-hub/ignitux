import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, mockFetchOnce, signInAs } from '@/test-utils/mocks';
import AccountPage from './page';

const PREVIEW = {
  compte_supprime_definitivement: true,
  resume: { projets: 2, contacts_crm: 5, documents_de_facturation_emis: 0 },
  avertissements: ["Les 5 contact(s) de ton CRM seront supprimés."],
  journal_constitutionnel: 'Les entrées du journal te concernant sont rendues anonymes.',
};

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

describe('AccountPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('affiche une confirmation après un changement de mot de passe réussi', async () => {
    mockFetchOnce(204, null);

    render(
      <AuthProvider>
        <AccountPage />
      </AuthProvider>,
    );

    fireEvent.change(await screen.findByLabelText('Mot de passe actuel'), {
      target: { value: 'ancien' },
    });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'nouveau123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /changer le mot de passe/i }));

    expect(await screen.findByText('Mot de passe changé.')).toBeInTheDocument();
  });

  it("affiche le message d'erreur du backend si le mot de passe actuel est incorrect", async () => {
    mockFetchOnce(403, { message: 'Mot de passe actuel incorrect.' });

    render(
      <AuthProvider>
        <AccountPage />
      </AuthProvider>,
    );

    fireEvent.change(await screen.findByLabelText('Mot de passe actuel'), {
      target: { value: 'mauvais' },
    });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'nouveau123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /changer le mot de passe/i }));

    expect(await screen.findByText('Mot de passe actuel incorrect.')).toBeInTheDocument();
  });

  describe('mes données', () => {
    it('avertit que le fichier contiendra des coordonnées de tiers', async () => {
      mockApiRoutes({});

      render(
        <AuthProvider>
          <AccountPage />
        </AuthProvider>,
      );

      expect(await screen.findByText(/coordonnées des/)).toBeInTheDocument();
      expect(screen.getByText('tiers')).toBeInTheDocument();
    });

    it('télécharge un fichier nommé et daté', async () => {
      const createObjectURL = vi.fn().mockReturnValue('blob:fake');
      const revokeObjectURL = vi.fn();
      Object.assign(URL, { createObjectURL, revokeObjectURL });
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      mockApiRoutes({
        'GET /users/me/export': { status: 200, body: { donnees: {}, non_inclus: [] } },
      });

      render(
        <AuthProvider>
          <AccountPage />
        </AuthProvider>,
      );

      fireEvent.click(await screen.findByRole('button', { name: /télécharger mes données/i }));

      await waitFor(() => expect(click).toHaveBeenCalled());
      // L'URL du blob est libérée : sans ça, l'export resterait en mémoire
      // dans l'onglet pour toute sa durée de vie.
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    });
  });

  describe('suppression du compte', () => {
    it("ne propose pas de supprimer avant d'avoir montré ce qui disparaît", async () => {
      mockApiRoutes({});

      render(
        <AuthProvider>
          <AccountPage />
        </AuthProvider>,
      );

      expect(
        await screen.findByRole('button', { name: /voir ce qui sera supprimé/i }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /supprimer définitivement/i }),
      ).not.toBeInTheDocument();
    });

    it("montre le détail et les avertissements avant de demander le mot de passe", async () => {
      mockApiRoutes({ 'GET /users/me/deletion-preview': { status: 200, body: PREVIEW } });

      render(
        <AuthProvider>
          <AccountPage />
        </AuthProvider>,
      );

      fireEvent.click(await screen.findByRole('button', { name: /voir ce qui sera supprimé/i }));

      expect(await screen.findByText(/5 contacts crm/)).toBeInTheDocument();
      expect(
        screen.getByText('Les 5 contact(s) de ton CRM seront supprimés.'),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/confirme avec ton mot de passe/i)).toBeInTheDocument();
    });

    it("n'affiche pas les catégories vides", async () => {
      // Annoncer « 0 document de facturation supprimé » ajoute du bruit à
      // un moment où la personne a besoin de lire vite et juste.
      mockApiRoutes({ 'GET /users/me/deletion-preview': { status: 200, body: PREVIEW } });

      const { container } = render(
        <AuthProvider>
          <AccountPage />
        </AuthProvider>,
      );

      fireEvent.click(await screen.findByRole('button', { name: /voir ce qui sera supprimé/i }));

      await screen.findByText(/2 projets/);
      expect(container.textContent).not.toContain('0 documents de facturation emis');
    });

    it('déconnecte et renvoie à l\'accueil après la suppression', async () => {
      mockApiRoutes({
        'GET /users/me/deletion-preview': { status: 200, body: PREVIEW },
        'DELETE /users/me': { status: 204, body: null },
      });

      render(
        <AuthProvider>
          <AccountPage />
        </AuthProvider>,
      );

      fireEvent.click(await screen.findByRole('button', { name: /voir ce qui sera supprimé/i }));
      fireEvent.change(await screen.findByLabelText(/confirme avec ton mot de passe/i), {
        target: { value: 'secret' },
      });
      fireEvent.click(screen.getByRole('button', { name: /supprimer définitivement/i }));

      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
      // La session doit disparaître : un jeton qui survit à son compte
      // ferait échouer toutes les requêtes suivantes en 401.
      expect(window.localStorage.getItem('ignitux.auth')).toBeNull();
    });

    it("affiche l'erreur du serveur et ne déconnecte pas si le mot de passe est faux", async () => {
      mockApiRoutes({
        'GET /users/me/deletion-preview': { status: 200, body: PREVIEW },
        'DELETE /users/me': { status: 403, body: { message: 'Mot de passe incorrect.' } },
      });

      render(
        <AuthProvider>
          <AccountPage />
        </AuthProvider>,
      );

      fireEvent.click(await screen.findByRole('button', { name: /voir ce qui sera supprimé/i }));
      fireEvent.change(await screen.findByLabelText(/confirme avec ton mot de passe/i), {
        target: { value: 'mauvais' },
      });
      fireEvent.click(screen.getByRole('button', { name: /supprimer définitivement/i }));

      expect(await screen.findByText('Mot de passe incorrect.')).toBeInTheDocument();
      expect(router.replace).not.toHaveBeenCalledWith('/');
    });
  });
});
