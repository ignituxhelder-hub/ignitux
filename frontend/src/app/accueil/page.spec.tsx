import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import LanceurPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const LANCEUR = {
  applications: [
    {
      id: 'parcours',
      nom: 'Mes projets',
      resume: "De l'idée au lancement.",
      categorie: 'creer',
      route: '/projects',
      horsOffre: false,
    },
  ],
  suggestions: [
    {
      id: 'relations',
      nom: 'Relations',
      resume: 'Tes contacts.',
      categorie: 'vendre',
      route: '/crm',
      horsOffre: false,
      raison: 'Ton projet existe : garde la trace des personnes que tu rencontres.',
    },
  ],
  reglages: [
    {
      id: 'profil',
      nom: 'Profil',
      resume: 'Qui tu es.',
      categorie: 'reglages',
      route: '/profil',
      horsOffre: false,
    },
  ],
  prevues: [
    {
      id: 'agenda',
      nom: 'Agenda',
      resume: 'Tes rendez-vous.',
      categorie: 'gerer',
      route: null,
      horsOffre: false,
      pourToi: false,
      cadre: null,
    },
    {
      id: 'caisse',
      nom: 'Caisse',
      resume: 'Encaisser au comptoir.',
      categorie: 'vendre',
      route: null,
      horsOffre: false,
      pourToi: true,
      cadre: 'Un logiciel de caisse doit être certifié.',
    },
  ],
  boutique: [
    {
      id: 'banque',
      nom: 'Banque',
      resume: 'Tes comptes.',
      categorie: 'gerer',
      route: '/banque',
      horsOffre: false,
    },
  ],
  rolesRetenus: ['entrepreneur'],
};

function routes(overrides: Record<string, { status: number; body: unknown }> = {}) {
  return {
    'GET /me/applications': { status: 200, body: LANCEUR },
    'GET /roles/moi': {
      status: 200,
      body: { roles: ['entrepreneur'], activeRole: 'entrepreneur', suggestions: [], catalogue: [] },
    },
    ...overrides,
  };
}

function afficher() {
  render(
    <AuthProvider>
      <LanceurPage />
    </AuthProvider>,
  );
}

describe('LanceurPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
  });

  it('redirige vers la connexion sans jeton', async () => {
    mockApiRoutes(routes());
    afficher();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  });

  describe('connecté', () => {
    beforeEach(() => {
      signInAs('tok123', { id: 'u1', email: 'fictif@ignitux.test' });
    });

    it('affiche chaque application en icône qui mène à sa page', async () => {
      mockApiRoutes(routes());
      afficher();
      const icone = await screen.findByRole('link', { name: 'Mes projets' });
      expect(icone).toHaveAttribute('href', '/projects');
    });

    it("montre la proposition d'IGINI avec sa raison", async () => {
      mockApiRoutes(routes());
      afficher();
      expect(await screen.findByText(/garde la trace des personnes/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Ouvrir Relations' })).toHaveAttribute('href', '/crm');
    });

    it('met Profil sur le bureau, et le reste des réglages dans le dossier', async () => {
      mockApiRoutes(routes());
      afficher();
      expect(await screen.findByRole('link', { name: 'Profil' })).toHaveAttribute('href', '/profil');
    });

    describe('le dossier Entreprise', () => {
      const AVEC_PLUS = {
        ...LANCEUR,
        applications: [
          ...LANCEUR.applications,
          { id: 'crm', nom: 'Relations', resume: 'Tes contacts.', categorie: 'vendre', route: '/crm', horsOffre: false },
        ],
        reglages: [
          ...LANCEUR.reglages,
          { id: 'offres', nom: 'Mes crédits', resume: 'Ton solde de crédits IGINI.', categorie: 'reglages', route: '/credits', horsOffre: false },
        ],
      };

      it('range les applications en un dossier par catégorie, sans dossier vide', async () => {
        mockApiRoutes(routes({ 'GET /me/applications': { status: 200, body: AVEC_PLUS } }));
        afficher();
        fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir Entreprise' }));

        const dossiers = screen
          .getAllByRole('button')
          .map((b) => b.getAttribute('aria-label') ?? '')
          .filter((nom) => nom.startsWith('Ouvrir '));
        // Vendre (Relations, Caisse), Gérer (Agenda), Réglages (Mon offre).
        // Ni Investir ni Réseau : aucune application de ces catégories ici.
        expect(dossiers).toEqual(['Ouvrir Vendre', 'Ouvrir Gérer', 'Ouvrir Réglages']);
        // Les applications restent dans leur dossier tant qu'on ne l'ouvre pas.
        expect(screen.queryByRole('link', { name: 'Relations' })).not.toBeInTheDocument();
      });

      // Une application prévue n'a pas d'écran : son icône ne doit pas être
      // un lien qui ouvrirait une page vide. Elle dit seulement ce qui arrive.
      it('ouvre un dossier sur ses applications et ses prévues, et revient en arrière', async () => {
        mockApiRoutes(routes({ 'GET /me/applications': { status: 200, body: AVEC_PLUS } }));
        afficher();
        await screen.findByRole('link', { name: 'Mes projets' });
        expect(screen.queryByRole('button', { name: 'Caisse, bientôt' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Ouvrir Entreprise' }));
        fireEvent.click(screen.getByRole('button', { name: 'Ouvrir Vendre' }));

        expect(screen.getByRole('heading', { name: 'Vendre' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Relations' })).toHaveAttribute('href', '/crm');
        const caisse = screen.getByRole('button', { name: 'Caisse, bientôt' });
        expect(screen.queryByRole('link', { name: /caisse/i })).not.toBeInTheDocument();
        // Agenda est dans Gérer, pas ici ; Mon offre dans Réglages.
        expect(screen.queryByRole('button', { name: 'Agenda, bientôt' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Mon offre' })).not.toBeInTheDocument();

        fireEvent.click(caisse);
        const detail = screen.getByRole('status');
        expect(detail).toHaveTextContent('Pour ton secteur');
        expect(detail).toHaveTextContent('certifié');

        // Un cran en arrière : Entreprise et ses dossiers.
        fireEvent.click(screen.getByRole('button', { name: '← Entreprise' }));
        expect(screen.getByRole('button', { name: 'Ouvrir Gérer' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Relations' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Ouvrir Réglages' }));
        expect(screen.getByRole('link', { name: 'Mes crédits' })).toHaveAttribute('href', '/credits');

        // Encore un cran, puis le bureau : Mes projets revient.
        fireEvent.click(screen.getByRole('button', { name: '← Entreprise' }));
        fireEvent.click(screen.getByRole('button', { name: '← Bureau' }));
        expect(await screen.findByRole('link', { name: 'Mes projets' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Ouvrir Vendre' })).not.toBeInTheDocument();
      });

      it('range la prévue du secteur avant les autres dans son dossier', async () => {
        const DEUX_PREVUES = {
          ...LANCEUR,
          prevues: [
            { ...LANCEUR.prevues[1], id: 'publicite', nom: 'Publicité', pourToi: false, cadre: null },
            LANCEUR.prevues[1],
          ],
        };
        mockApiRoutes(routes({ 'GET /me/applications': { status: 200, body: DEUX_PREVUES } }));
        afficher();
        fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir Entreprise' }));
        fireEvent.click(screen.getByRole('button', { name: 'Ouvrir Vendre' }));

        const prevues = screen
          .getAllByRole('button')
          .filter((b) => /, bientôt$/.test(b.getAttribute('aria-label') ?? ''));
        expect(prevues.map((b) => b.getAttribute('aria-label'))).toEqual([
          'Caisse, bientôt',
          'Publicité, bientôt',
        ]);
      });

      it('retire une application depuis l’intérieur d’un dossier', async () => {
        mockApiRoutes(routes({ 'GET /me/applications': { status: 200, body: AVEC_PLUS } }));
        afficher();
        fireEvent.click(await screen.findByRole('button', { name: /organiser mon bureau/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Ouvrir Entreprise' }));
        fireEvent.click(screen.getByRole('button', { name: 'Ouvrir Vendre' }));
        expect(screen.getByRole('button', { name: 'Retirer Relations du bureau' })).toBeEnabled();
      });
    });

    describe('les pages qu’on fait glisser', () => {
      // Mes projets reste seul sur le bureau ; les 20 autres (catégorie
      // « créer ») tombent dans le dossier Créer, où la pagination se joue.
      const PLEIN = {
        ...LANCEUR,
        applications: [
          LANCEUR.applications[0],
          ...Array.from({ length: 20 }, (_, i) => ({
            ...LANCEUR.applications[0],
            id: `app${i}`,
            nom: `Appli ${i}`,
          })),
        ],
      };

      it('une seule page, sans points, quand tout tient', async () => {
        mockApiRoutes(routes());
        afficher();
        await screen.findByRole('link', { name: 'Mes projets' });
        expect(screen.getByRole('list', { name: 'Page 1 sur 1' })).toBeInTheDocument();
        expect(screen.queryByRole('group', { name: 'Pages du bureau' })).not.toBeInTheDocument();
      });

      it('range le surplus sur une page suivante, et les points y mènent', async () => {
        mockApiRoutes(routes({ 'GET /me/applications': { status: 200, body: PLEIN } }));
        afficher();
        fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir Entreprise' }));
        fireEvent.click(screen.getByRole('button', { name: 'Ouvrir Créer' }));
        await screen.findByRole('link', { name: 'Appli 0' });
        // 16 icônes par page sur téléphone : la 17e ouvre la page 2.
        const page1 = screen.getByRole('list', { name: 'Page 1 sur 2' });
        const page2 = screen.getByRole('list', { name: 'Page 2 sur 2' });
        expect(within(page1).getAllByRole('listitem')).toHaveLength(16);
        expect(within(page2).getByRole('link', { name: 'Appli 16' })).toBeInTheDocument();

        const points = screen.getByRole('group', { name: 'Pages du dossier' });
        expect(within(points).getByRole('button', { name: 'Page 1' })).toHaveAttribute(
          'aria-current',
          'true',
        );
        fireEvent.click(within(points).getByRole('button', { name: 'Page 2' }));
        expect(within(points).getByRole('button', { name: 'Page 2' })).toHaveAttribute(
          'aria-current',
          'true',
        );
      });
    });
    it('montre la tuile Administration au seul administrateur', async () => {
      mockApiRoutes(
        routes({
          'GET /roles/moi': {
            status: 200,
            body: { roles: ['entrepreneur', 'administrateur'], activeRole: 'entrepreneur', suggestions: [], catalogue: [] },
          },
        }),
      );
      afficher();
      expect(await screen.findByRole('link', { name: /Administration/ })).toHaveAttribute('href', '/administration');
    });

    it('ne montre pas la tuile Administration aux autres comptes', async () => {
      mockApiRoutes(routes());
      afficher();
      await screen.findByText('Ton bureau');
      await screen.findAllByRole('link');
      expect(screen.queryByRole('link', { name: /Administration/ })).not.toBeInTheDocument();
    });

    it('invite à choisir ses rôles quand le compte n’en a aucun', async () => {
      mockApiRoutes(
        routes({
          'GET /roles/moi': {
            status: 200,
            body: { roles: [], activeRole: null, suggestions: [], catalogue: [] },
          },
        }),
      );
      afficher();
      expect(await screen.findByText(/Choisir mes rôles/)).toBeInTheDocument();
    });

    describe('organiser le bureau', () => {
      const APRES_AJOUT = {
        ...LANCEUR,
        applications: [...LANCEUR.applications, LANCEUR.boutique[0]],
        boutique: [],
      };

      it("ne montre la boutique qu'en rangement", async () => {
        mockApiRoutes(routes());
        afficher();
        await screen.findByRole('link', { name: /mes projets/i });
        expect(screen.queryByRole('heading', { name: 'Boutique' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /organiser mon bureau/i }));

        expect(screen.getByRole('heading', { name: 'Boutique' })).toBeInTheDocument();
        // En rangement, la tuile ne s'ouvre plus : elle se retire.
        expect(screen.queryByRole('link', { name: /mes projets/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retirer Mes projets du bureau' })).toBeEnabled();
        // Les réglages ne se retirent pas : sans eux, plus moyen de revenir.
        expect(screen.queryByRole('button', { name: 'Retirer Profil du bureau' })).not.toBeInTheDocument();
      });

      it("ajoute une application depuis la boutique et affiche le bureau que rend le serveur", async () => {
        mockApiRoutes(routes({ 'PUT /me/applications/banque': { status: 200, body: APRES_AJOUT } }));
        afficher();
        fireEvent.click(await screen.findByRole('button', { name: /organiser mon bureau/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Ajouter Banque au bureau' }));

        expect(
          await screen.findByText('Toutes les applications disponibles sont déjà sur ton bureau.'),
        ).toBeInTheDocument();
        const appel = vi
          .mocked(global.fetch)
          .mock.calls.find(([, options]) => (options as RequestInit | undefined)?.method === 'PUT');
        expect(String(appel?.[0])).toMatch(/\/me\/applications\/banque$/);
        expect(JSON.parse(String((appel?.[1] as RequestInit).body))).toEqual({ choix: 'ajoutee' });
      });

      it('retire une application du bureau et de la barre des tâches', async () => {
        window.localStorage.setItem(
          'ignitux.taches',
          JSON.stringify([{ id: 'parcours', url: '/projects/p1' }]),
        );
        const sansParcours = {
          ...LANCEUR,
          applications: [],
          boutique: [...LANCEUR.boutique, LANCEUR.applications[0]],
        };
        mockApiRoutes(
          routes({ 'PUT /me/applications/parcours': { status: 200, body: sansParcours } }),
        );
        afficher();
        fireEvent.click(await screen.findByRole('button', { name: /organiser mon bureau/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Retirer Mes projets du bureau' }));

        expect(
          await screen.findByRole('button', { name: 'Ajouter Mes projets au bureau' }),
        ).toBeInTheDocument();
        expect(window.localStorage.getItem('ignitux.taches')).toBeNull();
      });

      it("dit pourquoi le bureau n'a pas bougé", async () => {
        mockApiRoutes(
          routes({
            'PUT /me/applications/banque': {
              status: 400,
              body: { message: "Cette application n'est pas encore disponible." },
            },
          }),
        );
        afficher();
        fireEvent.click(await screen.findByRole('button', { name: /organiser mon bureau/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Ajouter Banque au bureau' }));
        expect(
          await screen.findByText("Cette application n'est pas encore disponible."),
        ).toBeInTheDocument();
      });
    });

    it("dit ce qui ne va pas si le serveur refuse", async () => {
      mockApiRoutes(
        routes({ 'GET /me/applications': { status: 500, body: { message: 'Erreur interne.' } } }),
      );
      afficher();
      expect(await screen.findByText('Erreur interne.')).toBeInTheDocument();
    });
  });
});
