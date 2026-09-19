import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { api, auth, createAccount, deleteAccount, startApp, type TestAccount } from './e2e-app.js';

/**
 * CE QU'UNE PERSONNE NE DOIT PAS POUVOIR ATTEINDRE.
 *
 * Les tests unitaires vérifient que `assertOwnsProject` est appelé. Ils
 * ne vérifient pas qu'il l'est **partout** : une route ajoutée sans son
 * contrôle passe tous les tests unitaires du monde, parce qu'elle n'en a
 * aucun. Ces tests-ci attaquent l'application entière avec le jeton de
 * quelqu'un d'autre, ce qui est la seule façon de s'en apercevoir.
 *
 * Un 404 plutôt qu'un 403 est volontaire côté produit : répondre
 * « interdit » confirmerait l'existence du projet à qui le cherche.
 */
describe('contrôle d\'accès (e2e)', () => {
  let app: INestApplication<Server>;
  let porteur: TestAccount;
  let intrus: TestAccount;
  let projectId: string;

  beforeAll(async () => {
    app = await startApp();
    porteur = await createAccount(app);
    intrus = await createAccount(app);

    const project = await api(app)
      .post('/projects')
      .set(...auth(porteur))
      .send({ title: 'Projet privé', description: 'Ne regarde pas.' })
      .expect(201);
    projectId = project.body.id as string;
  });

  afterAll(async () => {
    await deleteAccount(app, porteur);
    await deleteAccount(app, intrus);
    await app.close();
  });

  describe('sans jeton du tout', () => {
    const routes = [
      ['GET', '/projects'],
      ['GET', '/memory'],
      ['GET', '/crm/contacts'],
      ['GET', '/billing/documents'],
      ['GET', '/users/me/export'],
      ['GET', '/users/me/deletion-preview'],
      ['GET', '/constitution/articles'],
      ['GET', '/marketplace/profiles'],
    ] as const;

    it.each(routes)('%s %s est refusé', async (method, route) => {
      const response = await api(app)[method === 'GET' ? 'get' : 'post'](route);
      expect(response.status).toBe(401);
    });

    it('les routes publiques restent publiques', async () => {
      // /health et /igini/status n'exposent rien de personnel : les
      // fermer n'apporterait rien et casserait la supervision.
      await api(app).get('/health').expect(200);
      await api(app).get('/igini/status').expect(200);
    });
  });

  describe("avec le jeton de quelqu'un d'autre", () => {
    it('ne voit pas le projet', async () => {
      await api(app)
        .get(`/projects/${projectId}`)
        .set(...auth(intrus))
        .expect(404);
    });

    it('ne peut pas le modifier', async () => {
      await api(app)
        .patch(`/projects/${projectId}`)
        .set(...auth(intrus))
        .send({ title: 'Détourné' })
        .expect(404);
    });

    it('ne peut pas le supprimer', async () => {
      await api(app)
        .delete(`/projects/${projectId}`)
        .set(...auth(intrus))
        .expect(404);
    });

    it('ne peut pas le rendre public', async () => {
      await api(app)
        .patch(`/projects/${projectId}/visibility`)
        .set(...auth(intrus))
        .send({ isPublic: true })
        .expect(404);
    });

    const lectures = [
      ['le score', `/scores`],
      ['les tâches', `/tasks`],
      ['la conformité', `/compliance`],
      ['la répartition du capital', `/financing/cap-table`],
      ['les conditions de rachat', `/financing/buyback`],
      ['les processus', `/workflows`],
      ['le journal d\'automatisation', `/automation/runs`],
      ['les collaborateurs', `/collaborators`],
    ] as const;

    it.each(lectures)('ne lit pas %s', async (_quoi, suffixe) => {
      const response = await api(app)
        .get(`/projects/${projectId}${suffixe}`)
        .set(...auth(intrus));

      expect(response.status).toBe(404);
    });

    it('ne peut pas y écrire une tâche', async () => {
      await api(app)
        .post(`/projects/${projectId}/tasks`)
        .set(...auth(intrus))
        .send({ title: 'Tâche intruse' })
        .expect(404);
    });

    it('ne peut pas y définir une condition de rachat', async () => {
      await api(app)
        .put(`/projects/${projectId}/financing/buyback`)
        .set(...auth(intrus))
        .send({ kind: 'rentabilite', definition: 'Condition posée par un tiers.' })
        .expect(404);
    });

    it('ne peut pas déclencher ses générateurs', async () => {
      // 404 : le contrôle de propriété passe AVANT le verrou IA. Un 503
      // ici confirmerait que le projet existe.
      await api(app)
        .post(`/projects/${projectId}/analyze`)
        .set(...auth(intrus))
        .expect(404);
    });
  });

  describe('les données personnelles ne franchissent pas les comptes', () => {
    it("l'export ne contient que ses propres données", async () => {
      await api(app)
        .post('/crm/contacts')
        .set(...auth(porteur))
        .send({ firstName: 'Camille', lastName: 'Secrete', email: 'camille@exemple.test' })
        .expect(201);

      const exportIntrus = await api(app)
        .get('/users/me/export')
        .set(...auth(intrus))
        .expect(200);

      // Le contact du porteur ne doit apparaître nulle part dans
      // l'export de l'autre compte.
      expect(JSON.stringify(exportIntrus.body)).not.toContain('Secrete');
      expect(exportIntrus.body.donnees.relations_professionnelles.contacts).toHaveLength(0);
      expect(exportIntrus.body.donnees.compte.email).toBe(intrus.email);
    });

    it("l'aperçu de suppression ne compte que ses propres données", async () => {
      const preview = await api(app)
        .get('/users/me/deletion-preview')
        .set(...auth(intrus))
        .expect(200);

      expect(preview.body.resume.projets).toBe(0);
      expect(preview.body.resume.contacts_crm).toBe(0);
    });

    it("on ne supprime pas un compte avec le mot de passe d'un autre", async () => {
      await api(app)
        .delete('/users/me')
        .set(...auth(intrus))
        .send({ password: porteur.password })
        .expect(403);
    });
  });
});
