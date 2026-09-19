import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { api, auth, createAccount, deleteAccount, startApp, type TestAccount } from './e2e-app.js';

/**
 * LE PARCOURS COMPLET, CONTRE UNE VRAIE BASE.
 *
 * Ces vérifications existaient déjà, mais sous forme de scripts jetables
 * réécrits à chaque session puis perdus. Les voici committées : elles se
 * relancent, elles cassent quand quelque chose casse, et personne n'a
 * plus à se souvenir de ce qui avait été éprouvé la fois d'avant.
 */
describe('parcours complet (e2e)', () => {
  let app: INestApplication<Server>;
  let account: TestAccount;
  let projectId: string;

  beforeAll(async () => {
    app = await startApp();
    account = await createAccount(app);
  });

  afterAll(async () => {
    await deleteAccount(app, account);
    await app.close();
  });

  describe('compte', () => {
    it('refuse une inscription en double', async () => {
      await api(app)
        .post('/users/signup')
        .send({ email: account.email, password: account.password })
        .expect(409);
    });

    it('refuse un mot de passe trop court', async () => {
      // Vérifie aussi, en creux, que le ValidationPipe est bien branché
      // dans ces tests : sans lui, le DTO ne serait jamais validé.
      await api(app)
        .post('/users/signup')
        .send({ email: `court.${Date.now()}@e2e.test`, password: 'court' })
        .expect(400);
    });

    it('refuse un mot de passe faux à la connexion', async () => {
      await api(app)
        .post('/auth/login')
        .send({ email: account.email, password: 'ce-n-est-pas-le-bon' })
        .expect(401);
    });
  });

  describe('projet', () => {
    it('crée un projet, et il naît privé', async () => {
      const response = await api(app)
        .post('/projects')
        .set(...auth(account))
        .send({ title: 'Atelier de réparation', description: 'Projet de bout en bout.' })
        .expect(201);

      projectId = response.body.id as string;
      expect(response.body.is_public).toBe(false);
    });

    it('retrouve le projet dans la liste de son porteur', async () => {
      const response = await api(app)
        .get('/projects')
        .set(...auth(account))
        .expect(200);

      expect(response.body.map((project: { id: string }) => project.id)).toContain(projectId);
    });

    it('refuse une lecture sans jeton', async () => {
      await api(app).get('/projects').expect(401);
    });
  });

  describe('moteurs transverses', () => {
    it('la fiche de score ne fabrique aucun chiffre sans donnée', async () => {
      const response = await api(app)
        .get(`/projects/${projectId}/scores`)
        .set(...auth(account))
        .expect(200);

      // Le cœur de l'article 10 : sans donnée, la réponse est `null`,
      // jamais zéro. Un zéro se lirait comme une mesure.
      expect(response.body.etincelle).toBeNull();
      expect(response.body.confiance).toBeNull();
    });

    it('enregistre une tâche et la relit', async () => {
      await api(app)
        .post(`/projects/${projectId}/tasks`)
        .set(...auth(account))
        .send({ title: 'Appeler le bailleur' })
        .expect(201);

      const list = await api(app)
        .get(`/projects/${projectId}/tasks`)
        .set(...auth(account))
        .expect(200);

      expect(list.body).toHaveLength(1);
    });

    it('enregistre un souvenir et le relit', async () => {
      await api(app)
        .post('/memory')
        .set(...auth(account))
        .send({ projectId, category: 'decision', content: 'On démarre par la réparation.' })
        .expect(201);

      const list = await api(app)
        .get(`/memory?projectId=${projectId}`)
        .set(...auth(account))
        .expect(200);

      expect(list.body).toHaveLength(1);
    });

    it('enregistre un concept et rend le graphe', async () => {
      await api(app)
        .post('/knowledge/concepts')
        .set(...auth(account))
        .send({ projectId, name: 'Atelier de quartier', category: 'lieu' })
        .expect(201);

      const graph = await api(app)
        .get(`/knowledge/graph?projectId=${projectId}`)
        .set(...auth(account))
        .expect(200);

      expect(graph.body.nodes).toHaveLength(1);
    });
  });

  describe('les 5 générateurs IGINI', () => {
    const generators = [
      ['Analyser', 'analyze'],
      ['Construire', 'plan'],
      ['Financer', 'financing-plan'],
      ['Développer', 'development-plan'],
      ['Transmettre', 'transmission-plan'],
    ] as const;

    it.each(generators)('%s répond « indisponible » et non « en panne »', async (_nom, route) => {
      // 503 et non 500 : la fonctionnalité est éteinte, pas cassée. Un
      // testeur qui voit une erreur croit que le produit est en panne.
      const response = await api(app)
        .post(`/projects/${projectId}/${route}`)
        .set(...auth(account))
        .expect(503);

      expect(response.body.message).toContain('non disponible');
    });

    it('annonce son état avant même qu\'on clique', async () => {
      const response = await api(app).get('/igini/status').expect(200);

      expect(response.body.generatorsEnabled).toBe(false);
      expect(response.body.unavailableReason).toContain('non disponible');
    });
  });
});
