import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, getEspaceActif, setEspaceActif } from '@/lib/api';
import { AuthProvider } from '@/lib/auth';
import { EspaceProvider } from '@/lib/espace';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import { Systeme } from './systeme';

const router = createRouterMock();
let chemin = '/accueil';
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => chemin,
}));

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const MES_ESPACES = [
  { ownerId: 'u1', nom: 'Mon espace', roles: ['proprietaire'] },
  { ownerId: ALICE, nom: 'Espace de Alice', roles: ['comptable'] },
];

const BANDEAU_ALICE =
  'Tu travailles dans l’espace de Alice (facturation, comptabilité, banque, caisse) — rôle : Comptable';

function chezAlice() {
  window.localStorage.setItem('ignitux.espace', JSON.stringify({ userId: 'u1', espace: MES_ESPACES[1] }));
}

function appelsEspaces() {
  return (global.fetch as unknown as { mock: { calls: [string][] } }).mock.calls.filter(([u]) => u.endsWith('/espaces'));
}

function afficher() {
  return render(
    <AuthProvider>
      <EspaceProvider>
        <Systeme>
          <p>contenu de la page</p>
        </Systeme>
      </EspaceProvider>
    </AuthProvider>,
  );
}

describe('Systeme — l’espace argent', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.push.mockClear();
    setEspaceActif(null);
    chemin = '/accueil';
    signInAs('tok123', { id: 'u1', email: 'moi@ignitux.test' });
  });

  it('sans autre espace (GET /espaces n’en rend qu’un) : ni sélecteur ni bandeau', async () => {
    mockApiRoutes({ 'GET /espaces': { status: 200, body: [MES_ESPACES[0]] } });
    afficher();
    await screen.findByRole('navigation', { name: 'Barre des tâches' });
    await waitFor(() => expect(appelsEspaces()).toHaveLength(1));
    expect(screen.queryByLabelText('Espace')).not.toBeInTheDocument();
    expect(screen.queryByText(/Tu travailles dans/)).not.toBeInTheDocument();
  });

  it('liste mes espaces, et passer chez Alice pose l’espace, le bandeau et ramène au bureau', async () => {
    mockApiRoutes({ 'GET /espaces': { status: 200, body: MES_ESPACES } });
    afficher();
    const selecteur = await screen.findByLabelText('Espace');
    expect([...(selecteur as HTMLSelectElement).options].map((o) => o.textContent)).toEqual([
      'Mon espace',
      'Espace de Alice (Comptable)',
    ]);

    fireEvent.change(selecteur, { target: { value: ALICE } });

    expect(await screen.findByText(BANDEAU_ALICE)).toBeInTheDocument();
    expect(getEspaceActif()).toBe(ALICE);
    expect(JSON.parse(window.localStorage.getItem('ignitux.espace') ?? '{}')).toMatchObject({
      userId: 'u1',
      espace: { ownerId: ALICE, roles: ['comptable'] },
    });
    expect(router.push).toHaveBeenCalledWith('/accueil');
  });

  it('comptable et associé chez le même propriétaire : les deux rôles sont dits', async () => {
    const lesDeux = { ...MES_ESPACES[1], roles: ['comptable', 'associe'] };
    mockApiRoutes({ 'GET /espaces': { status: 200, body: [MES_ESPACES[0], lesDeux] } });
    afficher();
    const selecteur = await screen.findByLabelText('Espace');
    expect((selecteur as HTMLSelectElement).options[1].textContent).toBe('Espace de Alice (Comptable et associé)');
  });

  it('revenir à « Mon espace » efface le choix et le bandeau', async () => {
    chezAlice();
    mockApiRoutes({ 'GET /espaces': { status: 200, body: MES_ESPACES } });
    afficher();
    const selecteur = await screen.findByLabelText('Espace');
    await screen.findByText(/Tu travailles dans/);

    fireEvent.change(selecteur, { target: { value: 'u1' } });

    await waitFor(() => expect(screen.queryByText(/Tu travailles dans/)).not.toBeInTheDocument());
    expect(getEspaceActif()).toBeNull();
    expect(window.localStorage.getItem('ignitux.espace')).toBeNull();
  });

  it('le choix mémorisé est repris au chargement, avant les pages', async () => {
    chezAlice();
    mockApiRoutes({ 'GET /espaces': { status: 200, body: MES_ESPACES } });
    afficher();
    await screen.findByText(BANDEAU_ALICE);
    expect(getEspaceActif()).toBe(ALICE);
  });

  it.each([
    ['/projects', 'Mes projets'],
    ['/crm', 'Relations'],
    ['/agenda', 'Agenda'],
    ['/profil', 'Mon profil'],
  ])('%s (hors argent) ne s’affiche pas chez Alice', async (route, nom) => {
    chezAlice();
    chemin = route;
    mockApiRoutes({ 'GET /espaces': { status: 200, body: MES_ESPACES } });
    afficher();
    expect(
      await screen.findByText(
        `${nom} n’est pas partagée dans l’espace de Alice : seules la facturation, la comptabilité, la banque et la caisse le sont.`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('contenu de la page')).not.toBeInTheDocument();
  });

  it('« Revenir à mon espace » depuis une application hors argent', async () => {
    chezAlice();
    chemin = '/projects';
    mockApiRoutes({ 'GET /espaces': { status: 200, body: MES_ESPACES } });
    afficher();
    fireEvent.click(await screen.findByRole('button', { name: 'Revenir à mon espace' }));
    await screen.findByText('contenu de la page');
    expect(getEspaceActif()).toBeNull();
  });

  it.each(['/facturation', '/comptabilite', '/banque', '/caisse'])(
    '%s s’affiche normalement chez Alice',
    async (route) => {
      chezAlice();
      chemin = route;
      mockApiRoutes({ 'GET /espaces': { status: 200, body: MES_ESPACES } });
      afficher();
      expect(await screen.findByText('contenu de la page')).toBeInTheDocument();
      expect(screen.getByText(BANDEAU_ALICE)).toBeInTheDocument();
    },
  );

  it('l’accès a disparu pendant mon absence : retour chez soi, avec un message clair', async () => {
    chezAlice();
    chemin = '/facturation';
    mockApiRoutes({ 'GET /espaces': { status: 200, body: [MES_ESPACES[0]] } });
    afficher();
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu n’as plus accès à cet espace.');
    expect(getEspaceActif()).toBeNull();
    expect(window.localStorage.getItem('ignitux.espace')).toBeNull();
    expect(router.push).toHaveBeenCalledWith('/accueil');
  });

  it('404 « Espace introuvable. » mais l’espace est toujours dans ma liste : on reste', async () => {
    chezAlice();
    chemin = '/facturation';
    mockApiRoutes({
      'GET /espaces': { status: 200, body: MES_ESPACES },
      'GET /billing/documents': { status: 404, body: { message: 'Espace introuvable.' } },
    });
    afficher();
    await screen.findByText(BANDEAU_ALICE);

    await expect(api.listBillingDocuments('tok123')).rejects.toMatchObject({ status: 404 });
    await waitFor(() => expect(appelsEspaces()).toHaveLength(2));
    expect(getEspaceActif()).toBe(ALICE);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('404 « Espace introuvable. » confirmé par la relecture de GET /espaces : retour chez soi, avec le message', async () => {
    chezAlice();
    chemin = '/facturation';
    mockApiRoutes({ 'GET /espaces': { status: 200, body: MES_ESPACES } });
    afficher();
    await screen.findByText(BANDEAU_ALICE);

    // Retirée du projet d'Alice entre-temps.
    mockApiRoutes({
      'GET /espaces': { status: 200, body: [MES_ESPACES[0]] },
      'GET /billing/documents': { status: 404, body: { message: 'Espace introuvable.' } },
    });
    await expect(api.listBillingDocuments('tok123')).rejects.toMatchObject({ status: 404 });

    expect(await screen.findByRole('alert')).toHaveTextContent('Tu n’as plus accès à cet espace.');
    expect(getEspaceActif()).toBeNull();
    expect(router.push).toHaveBeenCalledWith('/accueil');
  });

  it('un 403 ne relit rien et ne fait pas quitter l’espace', async () => {
    chezAlice();
    chemin = '/facturation';
    mockApiRoutes({
      'GET /espaces': { status: 200, body: MES_ESPACES },
      'GET /caisse/journees': { status: 403, body: { message: 'Action refusée.' } },
    });
    afficher();
    await screen.findByText(BANDEAU_ALICE);
    await waitFor(() => expect(appelsEspaces()).toHaveLength(1));

    await expect(api.listCaisseJournees('tok123')).rejects.toMatchObject({ status: 403 });
    expect(appelsEspaces()).toHaveLength(1);
    expect(getEspaceActif()).toBe(ALICE);
    expect(screen.getByText('contenu de la page')).toBeInTheDocument();
  });

  describe('pages connectées qui ne sont pas une application (identité, administration, évaluations…)', () => {
    it.each(['/identite', '/administration', '/evaluations/revue'])(
      '%s chez Alice : le bandeau et le sélecteur restent visibles, au-dessus de la page',
      async (route) => {
        chezAlice();
        chemin = route;
        mockApiRoutes({ 'GET /espaces': { status: 200, body: MES_ESPACES } });
        afficher();
        expect(await screen.findByText(BANDEAU_ALICE)).toBeInTheDocument();
        expect(screen.getByLabelText('Espace')).toBeInTheDocument();
        expect(screen.getByText('contenu de la page')).toBeInTheDocument();
      },
    );

    it('chez soi avec plusieurs espaces : le sélecteur y est aussi, sans bandeau', async () => {
      chemin = '/identite';
      mockApiRoutes({ 'GET /espaces': { status: 200, body: MES_ESPACES } });
      afficher();
      expect(await screen.findByLabelText('Espace')).toBeInTheDocument();
      expect(screen.queryByText(/Tu travailles dans/)).not.toBeInTheDocument();
      expect(screen.getByText('contenu de la page')).toBeInTheDocument();
    });

    it('l’accès perdu y est dit aussi', async () => {
      chezAlice();
      chemin = '/identite';
      mockApiRoutes({ 'GET /espaces': { status: 200, body: [MES_ESPACES[0]] } });
      afficher();
      expect(await screen.findByRole('alert')).toHaveTextContent('Tu n’as plus accès à cet espace.');
    });

    it('déconnecté (connexion, inscription) : rien de tout cela', async () => {
      window.localStorage.clear();
      chemin = '/login';
      mockApiRoutes({ 'GET /espaces': { status: 200, body: MES_ESPACES } });
      afficher();
      expect(await screen.findByText('contenu de la page')).toBeInTheDocument();
      expect(screen.queryByLabelText('Espace')).not.toBeInTheDocument();
    });
  });
});
