import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApiRoutes } from '@/test-utils/mocks';
import { CollaboratorsSection } from './collaborators-section';

const TOKEN = 'tok123';
const PROJECT_ID = 'p1';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CollaboratorsSection', () => {
  it('liste les collaborateurs existants', async () => {
    mockApiRoutes({
      'GET /projects/p1/collaborators': {
        status: 200,
        body: [
          {
            id: 'pc1',
            project_id: 'p1',
            user_id: 'u2',
            created_at: '2026-01-01T00:00:00.000Z',
            user: { id: 'u2', email: 'b@b.com' },
          },
        ],
      },
    });

    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText('b@b.com')).toBeInTheDocument();
  });

  it("affiche un message quand il n'y a aucun collaborateur", async () => {
    mockApiRoutes({ 'GET /projects/p1/collaborators': { status: 200, body: [] } });

    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText("Aucun collaborateur pour l'instant.")).toBeInTheDocument();
  });

  it('invite un collaborateur par email', async () => {
    mockApiRoutes({
      'GET /projects/p1/collaborators': { status: 200, body: [] },
      'POST /projects/p1/collaborators': {
        status: 201,
        body: {
          id: 'pc1',
          project_id: 'p1',
          user_id: 'u2',
          created_at: '2026-01-01T00:00:00.000Z',
          user: { id: 'u2', email: 'b@b.com' },
        },
      },
    });

    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText("Aucun collaborateur pour l'instant.");
    fireEvent.change(screen.getByLabelText('Email du collaborateur à ajouter'), {
      target: { value: 'b@b.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /inviter/i }));

    expect(await screen.findByText('b@b.com')).toBeInTheDocument();
  });

  it('retire un collaborateur', async () => {
    mockApiRoutes({
      'GET /projects/p1/collaborators': {
        status: 200,
        body: [
          {
            id: 'pc1',
            project_id: 'p1',
            user_id: 'u2',
            created_at: '2026-01-01T00:00:00.000Z',
            user: { id: 'u2', email: 'b@b.com' },
          },
        ],
      },
      'DELETE /projects/p1/collaborators/u2': { status: 204, body: null },
    });

    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('b@b.com');
    fireEvent.click(screen.getByRole('button', { name: /retirer/i }));

    await screen.findByText("Aucun collaborateur pour l'instant.");
  });

  it("affiche une erreur si l'invitation échoue", async () => {
    mockApiRoutes({
      'GET /projects/p1/collaborators': { status: 200, body: [] },
      'POST /projects/p1/collaborators': {
        status: 404,
        body: { message: 'Aucun compte ne correspond à cet email.' },
      },
    });

    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText("Aucun collaborateur pour l'instant.");
    fireEvent.change(screen.getByLabelText('Email du collaborateur à ajouter'), {
      target: { value: 'inconnu@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /inviter/i }));

    expect(await screen.findByText('Aucun compte ne correspond à cet email.')).toBeInTheDocument();
  });

  const MEMBRE = {
    id: 'pc1',
    project_id: 'p1',
    user_id: 'u2',
    created_at: '2026-01-01T00:00:00.000Z',
    role: 'salarie',
    user: { id: 'u2', email: 'b@b.com' },
  };

  function appels(methode: string, chemin: string) {
    return vi
      .mocked(global.fetch)
      .mock.calls.filter(([url, o]) => new URL(String(url)).pathname === chemin && (o?.method ?? 'GET') === methode);
  }

  it('invite avec le rôle choisi et explique ce que ce rôle permet', async () => {
    mockApiRoutes({
      'GET /projects/p1/collaborators': { status: 200, body: [] },
      'POST /projects/p1/collaborators': { status: 201, body: MEMBRE },
    });
    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText("Aucun collaborateur pour l'instant.");
    fireEvent.change(screen.getByLabelText('Rôle de la personne invitée'), { target: { value: 'salarie' } });
    expect(screen.getByText(/travaille sur les tâches/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email du collaborateur à ajouter'), { target: { value: 'b@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: /inviter/i }));

    await screen.findByText('b@b.com');
    expect(JSON.parse(String(appels('POST', '/projects/p1/collaborators')[0][1]?.body))).toEqual({
      email: 'b@b.com',
      role: 'salarie',
    });
  });

  it('change le rôle d’un membre', async () => {
    mockApiRoutes({
      'GET /projects/p1/collaborators': { status: 200, body: [MEMBRE] },
      'PATCH /projects/p1/collaborators/u2': { status: 204, body: null },
    });
    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

    fireEvent.change(await screen.findByLabelText('Rôle de b@b.com'), { target: { value: 'comptable' } });

    await waitFor(() => expect(appels('PATCH', '/projects/p1/collaborators/u2')).toHaveLength(1));
    expect(JSON.parse(String(appels('PATCH', '/projects/p1/collaborators/u2')[0][1]?.body))).toEqual({
      role: 'comptable',
    });
  });

  it('montre l’équipe et les rôles à un membre, sans aucune action', async () => {
    mockApiRoutes({ 'GET /projects/p1/collaborators': { status: 200, body: [MEMBRE] } });
    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} peutGerer={false} />);

    expect(await screen.findByText('b@b.com')).toBeInTheDocument();
    expect(screen.getByText('Salarié')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  describe('« Activité de mon équipe dans mon argent » (propriétaire, lecture seule)', () => {
    const ACTIVITE = [
      { date: '2026-10-14T10:00:00.000Z', acteur: 'Bob', methode: 'POST', chemin: '/caisse/journees', statut: 201 },
      { date: '2026-10-13T09:00:00.000Z', acteur: 'un membre', methode: 'PATCH', chemin: '/billing/documents/d1', statut: 422 },
    ];
    const lectures = () =>
      (global.fetch as unknown as { mock: { calls: [string][] } }).mock.calls.filter(([u]) => u.endsWith('/espaces/activite'));

    it('rien n’est chargé tant qu’on ne l’ouvre pas, puis la liste s’affiche, la plus récente d’abord', async () => {
      mockApiRoutes({
        'GET /projects/p1/collaborators': { status: 200, body: [] },
        'GET /espaces/activite': { status: 200, body: ACTIVITE },
      });
      render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);
      await screen.findByText("Aucun collaborateur pour l'instant.");
      expect(lectures()).toHaveLength(0);

      const bouton = screen.getByRole('button', { name: 'Activité de mon équipe dans mon argent' });
      expect(bouton).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(bouton);

      const liste = await screen.findByRole('list', { name: 'Activité de mon équipe dans mon argent' });
      const lignes = within(liste).getAllByRole('listitem');
      expect(lignes).toHaveLength(2);
      expect(lignes[0]).toHaveTextContent('Bob');
      expect(lignes[0]).toHaveTextContent('POST /caisse/journees');
      expect(lignes[0]).toHaveTextContent('201');
      expect(lignes[1]).toHaveTextContent('un membre');
      expect(lignes[1]).toHaveTextContent('PATCH /billing/documents/d1');
      expect(lignes[1]).toHaveTextContent('422');
      expect(bouton).toHaveAttribute('aria-expanded', 'true');
      expect(lectures()).toHaveLength(1);
    });

    it('journal vide : un message, aucune action proposée sur les lignes', async () => {
      mockApiRoutes({
        'GET /projects/p1/collaborators': { status: 200, body: [] },
        'GET /espaces/activite': { status: 200, body: [] },
      });
      render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Activité de mon équipe dans mon argent' }));
      expect(await screen.findByText('Aucune activité de ton équipe dans ton argent pour l’instant.')).toBeInTheDocument();
    });

    it('un échec du serveur est dit, sans casser la section', async () => {
      mockApiRoutes({
        'GET /projects/p1/collaborators': { status: 200, body: [] },
        'GET /espaces/activite': { status: 403, body: { message: 'Refusé.' } },
      });
      render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Activité de mon équipe dans mon argent' }));
      expect(await screen.findByText('Refusé.')).toBeInTheDocument();
    });

    it('un membre ne la voit pas', async () => {
      mockApiRoutes({ 'GET /projects/p1/collaborators': { status: 200, body: [MEMBRE] } });
      render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} peutGerer={false} />);
      await screen.findByText('b@b.com');
      expect(screen.queryByText('Activité de mon équipe dans mon argent')).not.toBeInTheDocument();
    });
  });

  describe('« Accès à mon argent » (propriétaire) — activé à l’invitation ou par moi', () => {
    const TITRE = 'Accès à mon argent (facturation, compta, banque, caisse)';
    const BOB = '66666666-6666-4666-8666-666666666666';
    const CHLOE = '77777777-7777-4777-8777-777777777777';
    const DAN = '88888888-8888-4888-8888-888888888888';
    const EVE = '99999999-9999-4999-8999-999999999999';
    const membre = (memberId: string, nom: string, acces: boolean, raison: string, roles = ['comptable']) => ({
      memberId,
      nom,
      email: `${nom.toLowerCase()}@exemple.fr`,
      roles,
      acces,
      raison,
    });
    const EQUIPE = [
      membre(BOB, 'Bob', false, 'a_activer'),
      membre(CHLOE, 'Chloé', true, 'automatique', ['associe']),
      membre(DAN, 'Dan', true, 'active_par_toi', ['comptable', 'associe']),
      membre(EVE, 'Eve', false, 'coupe_par_toi'),
    ];

    type Reponse = { status: number; body: unknown };
    /** Un faux serveur : GET de la liste (fixe, ou relue à chaque appel), et PUT dont on garde le corps. */
    function serveur(
      liste: unknown[] | (() => unknown[]),
      put: (memberId: string, corps: unknown) => Reponse | Promise<Reponse>,
    ) {
      const lire = typeof liste === 'function' ? liste : () => liste;
      const envois: { memberId: string; corps: unknown }[] = [];
      global.fetch = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
        const chemin = new URL(url).pathname;
        const methode = options?.method ?? 'GET';
        let reponse: Reponse = { status: 200, body: [] };
        if (methode === 'GET' && chemin === '/espaces/acces-argent') reponse = { status: 200, body: lire() };
        const cible = /^\/espaces\/acces-argent\/([^/]+)$/.exec(chemin);
        if (methode === 'PUT' && cible) {
          const corps = JSON.parse(String(options?.body));
          envois.push({ memberId: cible[1], corps });
          reponse = await put(cible[1], corps);
        }
        return {
          ok: reponse.status >= 200 && reponse.status < 300,
          status: reponse.status,
          json: () => Promise.resolve(reponse.body),
        };
      }) as unknown as typeof fetch;
      return envois;
    }

    const lecturesAcces = () =>
      vi
        .mocked(global.fetch)
        .mock.calls.filter(
          ([u, o]) => new URL(String(u)).pathname === '/espaces/acces-argent' && (o?.method ?? 'GET') === 'GET',
        );

    it('liste mes comptables et associés, chacun avec une case étiquetée et sa raison en clair', async () => {
      serveur(EQUIPE, () => ({ status: 200, body: EQUIPE }));
      render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

      const bloc = await screen.findByRole('region', { name: TITRE });
      const caseBob = await within(bloc).findByLabelText('Bob (Comptable)');
      expect(caseBob).toHaveAttribute('type', 'checkbox');
      expect(caseBob).not.toBeChecked();
      expect(within(bloc).getByLabelText('Chloé (Associé)')).toBeChecked();
      expect(within(bloc).getByLabelText('Dan (Comptable et associé)')).toBeChecked();
      expect(within(bloc).getByLabelText('Eve (Comptable)')).not.toBeChecked();

      // La raison est rattachée à la case (lue par les lecteurs d'écran).
      expect(caseBob).toHaveAccessibleDescription('À activer');
      expect(within(bloc).getByLabelText('Chloé (Associé)')).toHaveAccessibleDescription('Activé à l’invitation');
      expect(within(bloc).getByLabelText('Dan (Comptable et associé)')).toHaveAccessibleDescription('Activé par toi');
      expect(within(bloc).getByLabelText('Eve (Comptable)')).toHaveAccessibleDescription('Coupé par toi');
      expect(lecturesAcces()).toHaveLength(1);
    });

    it('aucun texte du bloc ne cite de date ni « invité avant » : l’accès vient du geste, pas d’une date', async () => {
      serveur(EQUIPE, () => ({ status: 200, body: EQUIPE }));
      render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

      const bloc = await screen.findByRole('region', { name: TITRE });
      await within(bloc).findByLabelText('Bob (Comptable)');
      expect(bloc.textContent).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
      expect(bloc.textContent).not.toMatch(/invité avant|à partir du/);
      expect(bloc).toHaveTextContent(
        "Quand tu invites quelqu'un comme comptable ou associé, ou que tu lui donnes l'un de ces rôles, " +
          'son accès est activé automatiquement.',
      );
      expect(bloc).toHaveTextContent("Une personne « À activer » n'y a accès que si tu l'actives.");
    });

    it('activer demande confirmation, envoie le choix, puis affiche la réponse du serveur (rien avant)', async () => {
      let repondre: (r: Reponse) => void = () => {};
      const envois = serveur(EQUIPE, () => new Promise<Reponse>((resolve) => (repondre = resolve)));
      const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(true);
      render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

      const caseBob = await screen.findByLabelText('Bob (Comptable)');
      fireEvent.click(caseBob);

      expect(confirmer).toHaveBeenCalledWith(
        'Bob pourra voir et modifier ta facturation, ta compta, ta banque et ta caisse.',
      );
      await waitFor(() => expect(envois).toEqual([{ memberId: BOB, corps: { acces: true } }]));
      // Pas d'affichage anticipé : tant que le serveur n'a pas répondu, la case reste décochée.
      expect(screen.getByLabelText('Bob (Comptable)')).not.toBeChecked();
      expect(screen.getByLabelText('Bob (Comptable)')).toBeDisabled();

      repondre({ status: 200, body: [membre(BOB, 'Bob', true, 'active_par_toi'), ...EQUIPE.slice(1)] });

      await waitFor(() => expect(screen.getByLabelText('Bob (Comptable)')).toBeChecked());
      expect(screen.getByLabelText('Bob (Comptable)')).toHaveAccessibleDescription('Activé par toi');
      expect(screen.getByLabelText('Bob (Comptable)')).not.toBeDisabled();
    });

    it('activer puis annuler la confirmation : rien n’est envoyé, la case reste décochée', async () => {
      const envois = serveur(EQUIPE, () => ({ status: 200, body: EQUIPE }));
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

      fireEvent.click(await screen.findByLabelText('Bob (Comptable)'));

      expect(screen.getByLabelText('Bob (Comptable)')).not.toBeChecked();
      expect(envois).toEqual([]);
    });

    it('couper ne demande pas de confirmation et affiche « Coupé par toi » renvoyé par le serveur', async () => {
      const envois = serveur(EQUIPE, () => ({
        status: 200,
        body: [EQUIPE[0], membre(CHLOE, 'Chloé', false, 'coupe_par_toi', ['associe']), ...EQUIPE.slice(2)],
      }));
      const confirmer = vi.spyOn(window, 'confirm');
      render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

      fireEvent.click(await screen.findByLabelText('Chloé (Associé)'));

      await waitFor(() => expect(screen.getByLabelText('Chloé (Associé)')).not.toBeChecked());
      expect(screen.getByLabelText('Chloé (Associé)')).toHaveAccessibleDescription('Coupé par toi');
      expect(envois).toEqual([{ memberId: CHLOE, corps: { acces: false } }]);
      expect(confirmer).not.toHaveBeenCalled();
    });

    it('un refus du serveur est dit, et la case garde l’état du serveur', async () => {
      serveur(EQUIPE, () => ({
        status: 404,
        body: { message: 'Cette personne n’est ni comptable ni associée sur un de tes projets.' },
      }));
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

      fireEvent.click(await screen.findByLabelText('Bob (Comptable)'));

      expect(
        await screen.findByText('Cette personne n’est ni comptable ni associée sur un de tes projets.'),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Bob (Comptable)')).not.toBeChecked();
      // La liste est relue après l'échec ; les cases reviennent ensuite.
      await waitFor(() => expect(screen.getByLabelText('Bob (Comptable)')).not.toBeDisabled());
      expect(screen.getByLabelText('Bob (Comptable)')).not.toBeChecked();
    });

    it('après un échec d’enregistrement, la liste est relue : elle redevient celle du serveur', async () => {
      // Bob a été retiré de l'équipe ailleurs : le choix échoue, et la liste
      // relue ne le montre plus. Le message d'échec reste affiché.
      let lectures = 0;
      serveur(
        () => (lectures++ === 0 ? EQUIPE : EQUIPE.slice(1)),
        () => ({ status: 404, body: { message: 'Cette personne n’est ni comptable ni associée sur un de tes projets.' } }),
      );
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

      fireEvent.click(await screen.findByLabelText('Bob (Comptable)'));

      await waitFor(() => expect(screen.queryByLabelText('Bob (Comptable)')).not.toBeInTheDocument());
      expect(lecturesAcces()).toHaveLength(2);
      expect(screen.getByText('Cette personne n’est ni comptable ni associée sur un de tes projets.')).toBeInTheDocument();
      expect(screen.getByLabelText('Chloé (Associé)')).toBeChecked();
      expect(screen.getByLabelText('Chloé (Associé)')).not.toBeDisabled();
    });

    it('sans comptable ni associé : un message, aucune case', async () => {
      serveur([], () => ({ status: 200, body: [] }));
      render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

      const bloc = await screen.findByRole('region', { name: TITRE });
      expect(
        await within(bloc).findByText('Aucun comptable ni associé : personne d’autre que toi n’a accès à ton argent.'),
      ).toBeInTheDocument();
      expect(within(bloc).queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('la liste est relue après un changement de rôle dans l’équipe', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
        const chemin = new URL(url).pathname;
        const methode = options?.method ?? 'GET';
        const body =
          methode === 'GET' && chemin === '/projects/p1/collaborators'
            ? [MEMBRE]
            : methode === 'GET' && chemin === '/espaces/acces-argent'
              ? []
              : null;
        return { ok: true, status: methode === 'PATCH' ? 204 : 200, json: () => Promise.resolve(body) };
      }) as unknown as typeof fetch;
      render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

      await waitFor(() => expect(lecturesAcces()).toHaveLength(1));
      fireEvent.change(await screen.findByLabelText('Rôle de b@b.com'), { target: { value: 'comptable' } });

      await waitFor(() => expect(lecturesAcces()).toHaveLength(2));
    });

    describe('lectures et choix qui se croisent', () => {
      type EnAttente = { methode: string; corps: unknown; repondre: (r: Reponse) => void };
      /**
       * Un faux serveur dont le test libère chaque réponse de l'accès à
       * l'argent quand il veut, dans l'ordre qu'il veut. L'équipe du projet
       * (b@b.com, salarié) et ses changements de rôle répondent tout de suite.
       */
      function serveurPilote() {
        const attente: EnAttente[] = [];
        global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
          const chemin = new URL(url).pathname;
          const methode = options?.method ?? 'GET';
          if (chemin.startsWith('/espaces/acces-argent')) {
            return new Promise((resolve) => {
              attente.push({
                methode,
                corps: options?.body ? JSON.parse(String(options.body)) : undefined,
                repondre: ({ status, body }) =>
                  resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }),
              });
            });
          }
          const body = methode === 'GET' && chemin === '/projects/p1/collaborators' ? [MEMBRE] : null;
          return Promise.resolve({ ok: true, status: methode === 'PATCH' ? 204 : 200, json: () => Promise.resolve(body) });
        }) as unknown as typeof fetch;
        /** La plus ancienne requête encore en attente pour cette méthode (attendue si besoin). */
        const prochaine = async (methode: string) => {
          let trouvee: EnAttente | undefined;
          await waitFor(() => {
            trouvee = attente.find((r) => r.methode === methode);
            expect(trouvee).toBeDefined();
          });
          attente.splice(attente.indexOf(trouvee!), 1);
          return trouvee!;
        };
        return { attente, prochaine };
      }

      const CASES = ['Bob (Comptable)', 'Chloé (Associé)', 'Dan (Comptable et associé)', 'Eve (Comptable)'];
      const CHLOE_COUPEE = [EQUIPE[0], membre(CHLOE, 'Chloé', false, 'coupe_par_toi', ['associe']), ...EQUIPE.slice(2)];

      it('les cases sont désactivées pendant une lecture : rien ne part avant sa réponse', async () => {
        const { attente, prochaine } = serveurPilote();
        const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

        // Première lecture : tant qu'elle n'a pas répondu, aucune case.
        const premiere = await prochaine('GET');
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        premiere.repondre({ status: 200, body: EQUIPE });
        await waitFor(() => expect(screen.getByLabelText('Bob (Comptable)')).not.toBeDisabled());

        // Un changement de rôle dans l'équipe relance la lecture : toutes les cases l'attendent.
        fireEvent.change(screen.getByLabelText('Rôle de b@b.com'), { target: { value: 'comptable' } });
        const relue = await prochaine('GET');
        await waitFor(() => {
          for (const nom of CASES) expect(screen.getByLabelText(nom)).toBeDisabled();
        });
        fireEvent.click(screen.getByLabelText('Bob (Comptable)'));
        fireEvent.click(screen.getByLabelText('Chloé (Associé)'));
        expect(confirmer).not.toHaveBeenCalled();
        expect(attente.filter((r) => r.methode === 'PUT')).toEqual([]);

        relue.repondre({ status: 200, body: EQUIPE });
        await waitFor(() => {
          for (const nom of CASES) expect(screen.getByLabelText(nom)).not.toBeDisabled();
        });
        expect(screen.getByLabelText('Bob (Comptable)')).not.toBeChecked();
        expect(screen.getByLabelText('Chloé (Associé)')).toBeChecked();
      });

      it('une lecture plus ancienne n’écrase jamais un état plus récent (numéro de requête)', async () => {
        const { attente, prochaine } = serveurPilote();
        render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);
        (await prochaine('GET')).repondre({ status: 200, body: EQUIPE });

        // Je coupe Chloé : le choix part…
        fireEvent.click(await screen.findByLabelText('Chloé (Associé)'));
        const choix = await prochaine('PUT');
        expect(choix.corps).toEqual({ acces: false });
        // … et pendant son envoi, un changement de rôle dans l'équipe relance une lecture.
        fireEvent.change(screen.getByLabelText('Rôle de b@b.com'), { target: { value: 'comptable' } });
        const lanceePendantLeChoix = await prochaine('GET');

        // Le choix répond (Chloé coupée) ; la lecture, servie avant que le
        // serveur n'enregistre le choix, répond ensuite l'état d'avant.
        choix.repondre({ status: 200, body: CHLOE_COUPEE });
        const apresLeChoix = await prochaine('GET');
        lanceePendantLeChoix.repondre({ status: 200, body: EQUIPE });

        // La réponse périmée n'est jamais l'état final : la liste relue après le choix l'emporte.
        apresLeChoix.repondre({ status: 200, body: CHLOE_COUPEE });
        await waitFor(() => expect(screen.getByLabelText('Chloé (Associé)')).not.toBeChecked());
        expect(screen.getByLabelText('Chloé (Associé)')).toHaveAccessibleDescription('Coupé par toi');
        await waitFor(() => expect(screen.getByLabelText('Chloé (Associé)')).not.toBeDisabled());
        expect(attente).toEqual([]);
        expect(lecturesAcces()).toHaveLength(3);
      });

      it('une lecture dépassée qui répond en dernier n’efface pas le choix affiché', async () => {
        const { attente, prochaine } = serveurPilote();
        render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);
        (await prochaine('GET')).repondre({ status: 200, body: EQUIPE });

        fireEvent.click(await screen.findByLabelText('Chloé (Associé)'));
        const choix = await prochaine('PUT');
        fireEvent.change(screen.getByLabelText('Rôle de b@b.com'), { target: { value: 'comptable' } });
        const lanceePendantLeChoix = await prochaine('GET');

        choix.repondre({ status: 200, body: CHLOE_COUPEE });
        const apresLeChoix = await prochaine('GET');
        apresLeChoix.repondre({ status: 200, body: CHLOE_COUPEE });
        await waitFor(() => expect(screen.getByLabelText('Chloé (Associé)')).not.toBeChecked());

        // La lecture lancée pendant le choix, plus ancienne, arrive enfin avec l'état d'avant : ignorée.
        lanceePendantLeChoix.repondre({ status: 200, body: EQUIPE });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(screen.getByLabelText('Chloé (Associé)')).not.toBeChecked();
        expect(screen.getByLabelText('Chloé (Associé)')).toHaveAccessibleDescription('Coupé par toi');
        expect(screen.getByLabelText('Chloé (Associé)')).not.toBeDisabled();
        expect(attente).toEqual([]);
      });
    });

    it('un membre ne voit pas le bloc et ne le charge pas', async () => {
      mockApiRoutes({ 'GET /projects/p1/collaborators': { status: 200, body: [MEMBRE] } });
      render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} peutGerer={false} />);
      await screen.findByText('b@b.com');
      expect(screen.queryByText(TITRE)).not.toBeInTheDocument();
      expect(lecturesAcces()).toHaveLength(0);
    });
  });

  it('les textes des rôles disent que l’accès à l’argent est automatique et se coupe', async () => {
    mockApiRoutes({ 'GET /projects/p1/collaborators': { status: 200, body: [] } });
    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);
    await screen.findByText("Aucun collaborateur pour l'instant.");

    for (const role of ['comptable', 'associe']) {
      fireEvent.change(screen.getByLabelText('Rôle de la personne invitée'), { target: { value: role } });
      expect(screen.getByText(/accès automatique, que tu peux couper à tout moment/)).toBeInTheDocument();
    }
    fireEvent.change(screen.getByLabelText('Rôle de la personne invitée'), { target: { value: 'salarie' } });
    expect(screen.queryByText(/accès automatique, que tu peux couper/)).not.toBeInTheDocument();
  });
});
