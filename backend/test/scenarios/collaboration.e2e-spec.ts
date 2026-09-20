import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { api, auth, createAccount, deleteAccount, startApp, type TestAccount } from '../e2e-app.js';

/**
 * SCÉNARIO — COLLABORATEUR → PERMISSIONS.
 *
 * ── Ce que ce fichier ajoute ────────────────────────────────────────────
 *
 * `acces.e2e-spec.ts` attaque le produit avec le jeton d'un **intrus** : le
 * cas facile, où tout doit être refusé. Le cas difficile est celui d'un
 * collaborateur **légitime**, qui doit pouvoir lire beaucoup et n'écrire
 * rien. C'est là que les frontières se brouillent, parce qu'un « oui » y est
 * la réponse normale.
 *
 * Le parcours suit l'arc complet : invitation, lecture de **toutes** les
 * ressources du projet, refus de **toutes** les écritures, retrait, et perte
 * d'accès.
 *
 * Les deux listes ci-dessous sont des garde-fous, pas des exemples. Une
 * route de lecture ajoutée demain sans autoriser le collaborateur le rendra
 * aveugle sans que rien ne le signale ; une route d'écriture ajoutée sans
 * contrôle de propriété lui donnera la main sur le projet de quelqu'un
 * d'autre. Les deux cas se voient ici, et nulle part ailleurs.
 */
describe('SCÉNARIO — ce qu’un collaborateur peut, et ce qu’il ne peut pas', () => {
  let app: INestApplication<Server>;
  let porteuse: TestAccount;
  let collaborateur: TestAccount;
  let projectId: string;
  let requirementId: string;

  beforeAll(async () => {
    app = await startApp();
    porteuse = await createAccount(app);
    collaborateur = await createAccount(app);

    const projet = await api(app)
      .post('/projects')
      .set(...auth(porteuse))
      .send({ title: 'Ateliers Boussole', description: 'Atelier itinérant.' })
      .expect(201);
    projectId = projet.body.id as string;

    // De quoi donner à lire : une tâche, un plan de financement réel, une
    // démarche de conformité.
    await api(app)
      .post(`/projects/${projectId}/tasks`)
      .set(...auth(porteuse))
      .send({ title: 'Appeler dix artisans', assignee: 'human' })
      .expect(201);

    await api(app)
      .post(`/projects/${projectId}/financing/rounds`)
      .set(...auth(porteuse))
      .send({
        source: 'porteur',
        amountCents: 800000,
        occurredAt: '2026-01-15T00:00:00.000Z',
      })
      .expect(201);

    const demarches = await api(app)
      .get('/compliance/requirements?country=FR')
      .set(...auth(porteuse))
      .expect(200);
    requirementId = demarches.body.requirements[0].id as string;
  });

  afterAll(async () => {
    await deleteAccount(app, collaborateur);
    await deleteAccount(app, porteuse);
    await app.close();
  });

  describe('1. avant l’invitation, il ne voit rien', () => {
    it('le projet lui est invisible, pas « interdit »', async () => {
      // 404 et non 403 : répondre « interdit » confirmerait l'existence du
      // projet à qui le cherche.
      await api(app)
        .get(`/projects/${projectId}`)
        .set(...auth(collaborateur))
        .expect(404);
    });
  });

  describe('2. la porteuse l’invite', () => {
    it('par son adresse, pas par un identifiant qu’elle n’a pas', async () => {
      await api(app)
        .post(`/projects/${projectId}/collaborators`)
        .set(...auth(porteuse))
        .send({ email: collaborateur.email })
        .expect(201);
    });

    it('inviter quelqu’un qui n’existe pas est refusé proprement', async () => {
      await api(app)
        .post(`/projects/${projectId}/collaborators`)
        .set(...auth(porteuse))
        .send({ email: 'personne@e2e.test' })
        .expect(404);
    });

    it('un collaborateur ne peut pas en inviter un autre', async () => {
      await api(app)
        .post(`/projects/${projectId}/collaborators`)
        .set(...auth(collaborateur))
        .send({ email: porteuse.email })
        .expect(404);
    });
  });

  describe('3. il lit tout ce qu’un collaborateur doit pouvoir lire', () => {
    /**
     * La liste des lectures autorisées. Un garde-fou : une route ajoutée
     * demain sans y figurer rendra le collaborateur aveugle, et personne ne
     * s'en apercevra avant qu'il le dise.
     */
    const lectures = [
      'le projet lui-même',
      "l'historique des analyses",
      'les plans de construction',
      'les plans de financement',
      'les plans de développement',
      'les plans de transmission',
      'les tâches',
      'le tableau de bord',
      'les démarches de conformité',
      'la liste des collaborateurs',
      'les processus',
      "les exécutions de l'automatisation",
      'les apports',
      'la table de capitalisation',
      'les conditions de rachat',
    ] as const;

    const chemin = (projet: string): Record<(typeof lectures)[number], string> => ({
      'le projet lui-même': `/projects/${projet}`,
      "l'historique des analyses": `/projects/${projet}/analyses`,
      'les plans de construction': `/projects/${projet}/plans`,
      'les plans de financement': `/projects/${projet}/financing-plans`,
      'les plans de développement': `/projects/${projet}/development-plans`,
      'les plans de transmission': `/projects/${projet}/transmission-plans`,
      'les tâches': `/projects/${projet}/tasks`,
      'le tableau de bord': `/projects/${projet}/scores`,
      'les démarches de conformité': `/projects/${projet}/compliance`,
      'la liste des collaborateurs': `/projects/${projet}/collaborators`,
      'les processus': `/projects/${projet}/workflows`,
      "les exécutions de l'automatisation": `/projects/${projet}/automation/runs`,
      'les apports': `/projects/${projet}/financing/rounds`,
      'la table de capitalisation': `/projects/${projet}/financing/cap-table`,
      'les conditions de rachat': `/projects/${projet}/financing/buyback`,
    });

    it.each(lectures)('il peut lire %s', async (quoi) => {
      await api(app)
        .get(chemin(projectId)[quoi])
        .set(...auth(collaborateur))
        .expect(200);
    });

    it('et il voit bien le contenu, pas une coquille vide', async () => {
      const taches = await api(app)
        .get(`/projects/${projectId}/tasks`)
        .set(...auth(collaborateur))
        .expect(200);
      expect(taches.body).toHaveLength(1);

      const apports = await api(app)
        .get(`/projects/${projectId}/financing/rounds`)
        .set(...auth(collaborateur))
        .expect(200);
      expect(apports.body.rounds).toHaveLength(1);
    });
  });

  describe('4. il n’écrit rien, nulle part', () => {
    /**
     * L'autre garde-fou, et le plus important des deux. Une route d'écriture
     * ajoutée sans contrôle de propriété donnerait la main sur le projet de
     * quelqu'un d'autre — le genre de défaut qu'aucun test unitaire ne voit,
     * puisqu'une route sans contrôle n'a rien à tester.
     */
    /**
     * Chaque entrée porte **son** corps valide, et c'est nécessaire : un
     * corps générique envoyé à toutes les routes déclencherait la validation
     * (`forbidNonWhitelisted`) avant le contrôle de propriété. On mesurerait
     * alors la validation du corps, pas la permission — un test qui passe en
     * vérifiant autre chose que ce qu'il annonce.
     */
    const ecritures = [
      ['renommer le projet', 'patch', '', { title: 'Détourné' }],
      ['le rendre public', 'patch', '/visibility', { isPublic: true }],
      ['le supprimer', 'delete', '', {}],
      ['lancer une analyse', 'post', '/analyze', {}],
      ['lancer un plan de construction', 'post', '/plan', {}],
      ['lancer un plan de financement', 'post', '/financing-plan', {}],
      ['lancer un plan de développement', 'post', '/development-plan', {}],
      ['lancer un plan de transmission', 'post', '/transmission-plan', {}],
      ['ajouter une tâche', 'post', '/tasks', { title: 'Tâche imposée' }],
      ['déclencher l’automatisation', 'post', '/automation/run', {}],
      [
        'créer un processus',
        'post',
        '/workflows',
        {
          name: 'Processus imposé',
          steps: [{ title: 'Étape', conditionType: 'always', actionType: 'none' }],
        },
      ],
      [
        'enregistrer un apport',
        'post',
        '/financing/rounds',
        { source: 'porteur', amountCents: 1, occurredAt: '2026-01-01T00:00:00.000Z' },
      ],
      ['ajouter un détenteur de parts', 'post', '/financing/holders', { name: 'Intrus' }],
      [
        'définir une condition de rachat',
        'put',
        '/financing/buyback',
        { kind: 'rentabilite', definition: 'Ce que je décide à sa place' },
      ],
    ] as const;

    it.each(ecritures)('il ne peut pas %s', async (_quoi, methode, suffixe, corps) => {
      const reponse = await api(app)
        [methode](`/projects/${projectId}${suffixe}`)
        .set(...auth(collaborateur))
        .send(corps);

      // 404 partout : la propriété est vérifiée avant tout le reste, et le
      // produit ne confirme même pas que le projet existe. Un 503 ici
      // voudrait dire que l'interrupteur IA passe AVANT le contrôle d'accès
      // — le collaborateur apprendrait alors que le projet existe.
      expect(reponse.status).toBe(404);
    });

    it('il ne peut pas cocher une démarche de conformité', async () => {
      await api(app)
        .post(`/projects/${projectId}/compliance/${requirementId}/check`)
        .set(...auth(collaborateur))
        .send({})
        .expect(404);
    });

    it('il ne peut pas ouvrir le projet au financement', async () => {
      await api(app)
        .post('/projets-finances')
        .set(...auth(collaborateur))
        .send({ projectId, openedOn: '2026-01-10' })
        .expect(404);
    });
  });

  describe('5. la porteuse le retire', () => {
    it('le retrait est immédiat', async () => {
      const liste = await api(app)
        .get(`/projects/${projectId}/collaborators`)
        .set(...auth(porteuse))
        .expect(200);

      const lui = liste.body.find(
        (c: { user_id: string }) => c.user_id === collaborateur.userId,
      );
      expect(lui).toBeDefined();

      await api(app)
        .delete(`/projects/${projectId}/collaborators/${collaborateur.userId}`)
        .set(...auth(porteuse))
        .expect(204);
    });

    it('et il redevient aveugle, sur toutes les ressources à la fois', async () => {
      // Le point que seul un parcours peut vérifier : le retrait doit couper
      // l'accès partout, pas seulement sur la route du projet.
      for (const chemin of [
        `/projects/${projectId}`,
        `/projects/${projectId}/tasks`,
        `/projects/${projectId}/financing/cap-table`,
        `/projects/${projectId}/scores`,
      ]) {
        await api(app)
          .get(chemin)
          .set(...auth(collaborateur))
          .expect(404);
      }
    });

    it('rien de ce qu’il a lu n’a laissé de trace chez lui', async () => {
      // Un collaborateur retiré ne doit pas garder le projet dans sa propre
      // liste : la lecture n'était pas une appropriation.
      const siens = await api(app)
        .get('/projects')
        .set(...auth(collaborateur))
        .expect(200);

      expect(siens.body).toEqual([]);
    });
  });
});
