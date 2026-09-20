import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { api, auth, createAccount, deleteAccount, startApp, type TestAccount } from '../e2e-app.js';

/**
 * SCÉNARIO — MÉMOIRE → WORKFLOW → GRAPHE DE CONNAISSANCE.
 *
 * ── Ce que ce parcours cherche ──────────────────────────────────────────
 *
 * Les quatre moteurs transverses d'IGINI sont testés chacun de son côté :
 * la mémoire enregistre, le graphe relie, le processus avance, le tableau de
 * bord calcule. Quatre suites vertes, et toujours pas de réponse à la seule
 * question qui compte : **est-ce qu'ils se parlent ?**
 *
 * Le parcours suit une chaîne où chaque maillon consomme le précédent. Un
 * souvenir devient du contexte rappelable. Deux concepts reliés deviennent
 * un chemin. Un processus lancé **s'arrête et attend** une confirmation
 * humaine (article 8), puis avance en laissant une trace. Et le tableau de
 * bord ne compte que ce qui existe vraiment.
 *
 * Les générateurs IA sont éteints. C'est une contrainte du parcours, pas un
 * obstacle : tout ce qui suit fonctionne sans eux, et c'est précisément ce
 * qu'on veut savoir.
 */
describe('SCÉNARIO — les moteurs d’IGINI, reliés', () => {
  let app: INestApplication<Server>;
  let porteuse: TestAccount;
  let projectId: string;

  let prixId = '';
  let coutId = '';
  let workflowId = '';
  let runId = '';
  let methodeRunId = '';

  beforeAll(async () => {
    app = await startApp();
    porteuse = await createAccount(app);

    const projet = await api(app)
      .post('/projects')
      .set(...auth(porteuse))
      .send({ title: 'Ateliers Boussole', description: 'Aider les artisans sur leurs prix.' })
      .expect(201);
    projectId = projet.body.id as string;
  });

  afterAll(async () => {
    await deleteAccount(app, porteuse);
    await app.close();
  });

  describe('1. le tableau de bord, avant que rien n’existe', () => {
    it('ne fabrique aucun chiffre : null partout', async () => {
      // Le point de départ qui donne son sens à la fin du parcours. Un
      // tableau de bord qui afficherait 0 laisserait croire à une mesure ;
      // `null` dit « rien à mesurer », ce qui est la vérité.
      const scores = await api(app)
        .get(`/projects/${projectId}/scores`)
        .set(...auth(porteuse))
        .expect(200);

      expect(Object.values(scores.body).every((v) => v === null)).toBe(true);
    });
  });

  describe('2. la mémoire — ce qu’IGINI apprend d’elle', () => {
    it('elle confie quatre choses, chacune d’une nature différente', async () => {
      const souvenirs = [
        ['decision', 'Pas de formation en ligne la première année : je veux voir les ateliers.'],
        ['preference', 'Je ne me déplace pas le mercredi.'],
        ['learning', 'Les artisans ne répondent pas au téléphone avant 18 h.'],
        ['fact', 'Six participants maximum par atelier.'],
      ] as const;

      for (const [category, content] of souvenirs) {
        await api(app)
          .post('/memory')
          .set(...auth(porteuse))
          .send({ category, content, projectId })
          .expect(201);
      }
    });

    it('IGINI sait les rappeler, rattachés à CE projet', async () => {
      // Le maillon : un souvenir n'est pas qu'une ligne stockée, c'est du
      // contexte qu'un moteur peut réclamer.
      const rappel = await api(app)
        .get(`/memory/recall/${projectId}`)
        .set(...auth(porteuse))
        .expect(200);

      expect(rappel.body).toHaveLength(4);
      expect(JSON.stringify(rappel.body)).toContain('avant 18 h');
    });

    it('et il sait dire ce qu’il sait, par nature', async () => {
      const resume = await api(app)
        .get('/memory/summary')
        .set(...auth(porteuse))
        .expect(200);

      expect(resume.body.summary).toContain('4 souvenir');
    });

    it('un souvenir se rattache à un projet après coup', async () => {
      const libre = await api(app)
        .post('/memory')
        .set(...auth(porteuse))
        .send({ category: 'fact', content: 'Souvenir sans projet au départ.' })
        .expect(201);

      await api(app)
        .post(`/memory/${libre.body.id}/link`)
        .set(...auth(porteuse))
        .send({ projectId })
        .expect(201);

      const rappel = await api(app)
        .get(`/memory/recall/${projectId}`)
        .set(...auth(porteuse))
        .expect(200);
      expect(rappel.body).toHaveLength(5);
    });
  });

  describe('3. le graphe — ce qu’elle relie', () => {
    it('deux concepts, et le lien qui les tient', async () => {
      const prix = await api(app)
        .post('/knowledge/concepts')
        .set(...auth(porteuse))
        .send({ name: 'Prix de vente', description: 'Ce que l’artisan facture.', projectId })
        .expect(201);
      prixId = prix.body.id as string;

      const cout = await api(app)
        .post('/knowledge/concepts')
        .set(...auth(porteuse))
        .send({ name: 'Coût de revient', description: 'Ce que ça lui coûte vraiment.', projectId })
        .expect(201);
      coutId = cout.body.id as string;

      await api(app)
        .post(`/knowledge/concepts/${prixId}/links`)
        .set(...auth(porteuse))
        .send({ toConceptId: coutId, relationType: 'depends_on' })
        .expect(201);
    });

    it('le graphe rend les deux nœuds et leur arête', async () => {
      const graphe = await api(app)
        .get(`/knowledge/graph?projectId=${projectId}`)
        .set(...auth(porteuse))
        .expect(200);

      const noeuds = graphe.body.concepts ?? graphe.body.nodes ?? [];
      expect(noeuds).toHaveLength(2);
    });

    it('et surtout : il sait aller de l’un à l’autre', async () => {
      // La différence entre stocker un lien et avoir un graphe. Sans
      // chemin, ce ne sont que deux lignes et une troisième qui les cite.
      const chemin = await api(app)
        .get(`/knowledge/path?from=${prixId}&to=${coutId}`)
        .set(...auth(porteuse))
        .expect(200);

      expect(JSON.stringify(chemin.body)).toContain(coutId);
    });

    it('le voisinage d’un concept se lit', async () => {
      const voisinage = await api(app)
        .get(`/knowledge/concepts/${prixId}/neighbourhood`)
        .set(...auth(porteuse))
        .expect(200);

      expect(JSON.stringify(voisinage.body)).toContain('Coût de revient');
    });

    it('et la recherche les retrouve', async () => {
      const trouve = await api(app)
        .get('/knowledge/concepts/search?q=revient')
        .set(...auth(porteuse))
        .expect(200);

      expect(JSON.stringify(trouve.body)).toContain('Coût de revient');
    });
  });

  describe('4. le processus — deux façons de s’arrêter, toutes deux justes', () => {
    it('partie d’un modèle, la méthode attend une analyse qui n’existe pas', async () => {
      const modeles = await api(app)
        .get('/workflows/templates')
        .set(...auth(porteuse))
        .expect(200);

      const methode = modeles.body.find(
        (m: { slug: string }) => m.slug === 'methode-ignitux',
      );
      expect(methode).toBeDefined();

      const cree = await api(app)
        .post(`/projects/${projectId}/workflows/from-template`)
        .set(...auth(porteuse))
        .send({ slug: methode.slug })
        .expect(201);
      workflowId = cree.body.id as string;

      const lance = await api(app)
        .post(`/workflows/${workflowId}/runs`)
        .set(...auth(porteuse))
        .send({})
        .expect(201);

      // La première étape de la méthode est conditionnée à l'existence
      // d'une analyse. L'IA est éteinte, donc aucune analyse n'existe, donc
      // le processus ne bouge pas — et c'est exactement ce qu'on veut : il
      // refuse de faire semblant qu'une étape a eu lieu.
      expect(lance.body.run.status).toBe('blocked');
      expect(lance.body.run.current_position).toBe(0);
      expect(lance.body.stepsCompleted).toEqual([]);
      expect(String(lance.body.blockedReason).toLowerCase()).toContain('analyse');
      methodeRunId = lance.body.run.id as string;
    });

    it('confirmer ne suffit pas à inventer l’étape manquante', async () => {
      // On reprend l'exécution déjà lancée : le moteur n'en autorise qu'une
      // active à la fois par processus, et il a raison — deux exécutions
      // concurrentes du même processus se marcheraient dessus.
      const confirme = await api(app)
        .post(`/workflow-runs/${methodeRunId}/steps/0/confirm`)
        .set(...auth(porteuse))
        .send({})
        .expect(201);

      // Une confirmation humaine lève une attente de confirmation, pas une
      // condition de réalité. Si elle suffisait ici, le produit
      // enregistrerait qu'une analyse a eu lieu alors qu'aucune n'existe.
      expect(confirme.body.run.current_position).toBe(0);
      expect(confirme.body.run.status).toBe('blocked');
    });

    it('sur un processus dont l’étape attend une personne, la confirmation débloque', async () => {
      // L'autre moitié de la vérité, et l'article 8 rendu visible : quand
      // l'attente EST une attente humaine, la confirmation la lève et le
      // processus repart.
      const cree = await api(app)
        .post(`/projects/${projectId}/workflows`)
        .set(...auth(porteuse))
        .send({
          name: 'Préparer le premier atelier',
          steps: [
            { title: 'Valider la date avec l’artisan', conditionType: 'manual', actionType: 'none' },
            { title: 'Envoyer le programme', conditionType: 'always', actionType: 'none' },
          ],
        })
        .expect(201);

      const lance = await api(app)
        .post(`/workflows/${cree.body.id}/runs`)
        .set(...auth(porteuse))
        .send({})
        .expect(201);

      expect(lance.body.run.status).toBe('blocked');
      expect(lance.body.run.current_position).toBe(0);
      runId = lance.body.run.id as string;

      const apres = await api(app)
        .post(`/workflow-runs/${runId}/steps/0/confirm`)
        .set(...auth(porteuse))
        .send({})
        .expect(201);

      // Confirmée, l'étape passe — et la suivante, qui ne dépend de rien,
      // passe dans la foulée : le processus va jusqu'où il peut aller.
      expect(apres.body.run.current_position).toBe(2);
      expect(apres.body.run.status).toBe('completed');
      expect(apres.body.stepsCompleted).toHaveLength(2);
    });

    it('et chaque pas a laissé une trace motivée', async () => {
      const evenements = await api(app)
        .get(`/workflow-runs/${runId}/events`)
        .set(...auth(porteuse))
        .expect(200);

      expect(evenements.body.length).toBeGreaterThan(0);
      // Article 11 : le moteur ne franchit une étape que s'il peut dire
      // pourquoi. Chaque trace porte donc un motif.
      for (const evenement of evenements.body) {
        expect(String(evenement.detail ?? '').length).toBeGreaterThan(0);
      }
    });
  });

  describe('5. l’automatisation — le moteur qui agit sans demander', () => {
    it('elle le déclenche, et il journalise', async () => {
      // Le seul moteur autorisé à agir sans confirmation. En échange, il
      // doit tout consigner : c'est la condition posée par l'article 8, et
      // la règle `automatisation-non-journalisee` la fait respecter.
      await api(app)
        .post(`/projects/${projectId}/automation/run`)
        .set(...auth(porteuse))
        .send({})
        .expect(201);

      const executions = await api(app)
        .get(`/projects/${projectId}/automation/runs`)
        .set(...auth(porteuse))
        .expect(200);

      expect(executions.body.length).toBeGreaterThan(0);
    });
  });

  describe('6. le tableau de bord, maintenant qu’il y a de quoi mesurer', () => {
    it('il a changé — et uniquement là où quelque chose existe', async () => {
      // Le bilan du parcours. Le tableau de bord n'est pas alimenté à la
      // main : il dérive de ce que les autres moteurs ont produit. S'il
      // n'avait pas bougé, c'est que la chaîne serait rompue quelque part.
      const scores = await api(app)
        .get(`/projects/${projectId}/scores`)
        .set(...auth(porteuse))
        .expect(200);

      const mesures = Object.entries(scores.body).filter(([, v]) => v !== null);
      expect(mesures.length).toBeGreaterThan(0);

      // Et il reste honnête là où rien n'a été produit : aucune analyse
      // n'a eu lieu (l'IA est éteinte), donc rien ne doit prétendre le
      // contraire.
      const analyses = await api(app)
        .get(`/projects/${projectId}/analyses`)
        .set(...auth(porteuse))
        .expect(200);
      expect(analyses.body).toEqual([]);
    });

    it('tout cela a tenu sans que l’IA soit allumée une seule fois', async () => {
      const etat = await api(app).get('/igini/status').expect(200);
      expect(etat.body.generatorsEnabled).toBe(false);

      // Cinq souvenirs, deux concepts, un processus avancé, une
      // automatisation journalisée — et pas un appel à un modèle.
      const consommation = await api(app)
        .get('/igini/usage/mois-en-cours')
        .set(...auth(porteuse))
        .expect(200);

      expect(consommation.body.appels).toBe(0);
      expect(consommation.body.cout.euros).toBe(0);
    });
  });
});
