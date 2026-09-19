import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { api, auth, createAccount, deleteAccount, startApp, type TestAccount } from './e2e-app.js';

/**
 * LA CONSTITUTION VUE DEPUIS L'EXTÉRIEUR.
 *
 * Les tests unitaires vérifient que chaque règle refuse ce qu'elle doit
 * refuser. Ils ne disent rien de ce qu'un client HTTP obtient réellement :
 * une règle branchée au mauvais endroit, ou pas branchée du tout, les
 * laisse tous verts. Ici on interroge l'application comme le ferait le
 * frontend.
 */
describe('Constitution et données personnelles (e2e)', () => {
  let app: INestApplication<Server>;
  let account: TestAccount;
  let projectId: string;

  beforeAll(async () => {
    app = await startApp();
    account = await createAccount(app);
    const project = await api(app)
      .post('/projects')
      .set(...auth(account))
      .send({ title: 'Projet constitutionnel' })
      .expect(201);
    projectId = project.body.id as string;
  });

  afterAll(async () => {
    await deleteAccount(app, account);
    await app.close();
  });

  describe('le corpus est réellement semé', () => {
    it('expose les 24 articles de la V1, et seulement eux', async () => {
      const response = await api(app)
        .get('/constitution/articles')
        .set(...auth(account))
        .expect(200);

      expect(response.body).toHaveLength(24);
      expect([...new Set(response.body.map((a: { version: string }) => a.version))]).toEqual(['v1']);
    });

    it('déclare 11 articles appliqués, chacun couvert par une règle', async () => {
      const [articles, rules] = await Promise.all([
        api(app).get('/constitution/articles').set(...auth(account)).expect(200),
        api(app).get('/constitution/rules').set(...auth(account)).expect(200),
      ]);

      const enforced = articles.body.filter(
        (a: { enforcement: string }) => a.enforcement === 'enforced',
      );
      const covered = new Set(rules.body.map((r: { articleSlug: string }) => r.articleSlug));

      expect(enforced).toHaveLength(11);
      for (const article of enforced) {
        // L'article 24 se vérifie par un test du corpus, pas par une
        // règle d'exécution : il porte sur la Constitution elle-même.
        if (article.slug === 'v1-24-constitution-supreme') continue;
        expect(covered.has(article.slug)).toBe(true);
      }
    });

    it('expose le préambule', async () => {
      const response = await api(app)
        .get('/constitution/preamble')
        .set(...auth(account))
        .expect(200);

      expect(response.body.preamble).toContain('découvrir');
    });
  });

  describe('article 7 — aucune indication sans son avertissement', () => {
    const indications = [
      ['facturation (notice légale)', '/billing/legal-notice', 'disclaimer'],
      ['facturation (documents)', '/billing/documents', 'disclaimer'],
      ['financement (périmètre)', '/financing/scope', 'notice'],
    ] as const;

    it.each(indications)('%s porte son avertissement', async (_quoi, route, champ) => {
      const response = await api(app)
        .get(route)
        .set(...auth(account))
        .expect(200);

      expect(typeof response.body[champ]).toBe('string');
      expect(response.body[champ].length).toBeGreaterThan(30);
    });

    it.each([
      ['conformité', `/compliance?country=FR`, 'disclaimer'],
      ['répartition du capital', `/financing/cap-table`, 'notice'],
      ['rachat progressif', `/financing/buyback`, 'notice'],
    ] as const)('%s porte son avertissement', async (_quoi, suffixe, champ) => {
      const response = await api(app)
        .get(`/projects/${projectId}${suffixe}`)
        .set(...auth(account))
        .expect(200);

      expect(response.body[champ].length).toBeGreaterThan(30);
    });
  });

  describe('article 22 — le porteur reste majoritaire', () => {
    it('refuse une répartition qui le ferait passer sous la majorité', async () => {
      const porteur = await api(app)
        .post(`/projects/${projectId}/financing/holders`)
        .set(...auth(account))
        .send({ name: 'Porteur', isFounder: true })
        .expect(201);
      const ignitux = await api(app)
        .post(`/projects/${projectId}/financing/holders`)
        .set(...auth(account))
        .send({ name: 'Ignitux', isFounder: false })
        .expect(201);

      await api(app)
        .post(`/financing/holders/${porteur.body.id}/equity-events`)
        .set(...auth(account))
        .send({ shareBasisPoints: 4000, reason: 'Entrée', occurredAt: '2026-01-01T00:00:00.000Z' })
        .expect(201);

      // Celle-ci ferme la répartition à 100 % en laissant le porteur à
      // 40 % : le moteur doit la refuser, y compris à sa propre demande.
      const refus = await api(app)
        .post(`/financing/holders/${ignitux.body.id}/equity-events`)
        .set(...auth(account))
        .send({ shareBasisPoints: 6000, reason: 'Entrée', occurredAt: '2026-01-01T00:00:00.000Z' })
        .expect(422);

      expect(refus.body.message).toContain('Constitution');
      expect(refus.body.message).toContain('majorité');
    });

    it('journalise le refus au lieu de le passer sous silence', async () => {
      const response = await api(app)
        .get('/constitution/violations')
        .set(...auth(account))
        .expect(200);

      const violation = response.body.find(
        (v: { rule_id: string }) => v.rule_id === 'majorite-du-porteur',
      );
      expect(violation).toBeDefined();
      expect(violation.severity).toBe('blocking');
    });
  });

  describe('rachat progressif', () => {
    it("refuse de déclarer atteinte une condition jamais définie", async () => {
      await api(app)
        .patch(`/projects/${projectId}/financing/buyback/autonomie`)
        .set(...auth(account))
        .send({ reachedAt: '2026-06-01T00:00:00.000Z' })
        .expect(400);
    });

    it('remet la condition à non atteinte quand on réécrit sa définition', async () => {
      await api(app)
        .put(`/projects/${projectId}/financing/buyback`)
        .set(...auth(account))
        .send({ kind: 'rentabilite', definition: 'Trois mois de résultat positif.' })
        .expect(200);
      await api(app)
        .patch(`/projects/${projectId}/financing/buyback/rentabilite`)
        .set(...auth(account))
        .send({ reachedAt: '2026-06-01T00:00:00.000Z' })
        .expect(200);

      await api(app)
        .put(`/projects/${projectId}/financing/buyback`)
        .set(...auth(account))
        .send({ kind: 'rentabilite', definition: 'Six mois, finalement.' })
        .expect(200);

      const progress = await api(app)
        .get(`/projects/${projectId}/financing/buyback`)
        .set(...auth(account))
        .expect(200);

      expect(progress.body.reachedCount).toBe(0);
      // Deux conditions restent à écrire : on ne se prononce pas.
      expect(progress.body.allReached).toBeNull();
    });
  });

  describe("droit d'accès et droit à l'effacement", () => {
    it("l'export porte les huit catégories et aucun secret", async () => {
      const response = await api(app)
        .get('/users/me/export')
        .set(...auth(account))
        .expect(200);

      expect(Object.keys(response.body.donnees)).toHaveLength(8);
      expect(Object.keys(response.body.donnees.compte).sort()).toEqual([
        'compte_cree_le',
        'email',
        'email_verifie_le',
        'id',
      ]);
      expect(JSON.stringify(response.body)).not.toContain('$2b$');
      expect(response.body.non_inclus.length).toBeGreaterThan(0);
    });

    it("l'aperçu de suppression annonce ce qui disparaîtra", async () => {
      const response = await api(app)
        .get('/users/me/deletion-preview')
        .set(...auth(account))
        .expect(200);

      expect(response.body.resume.projets).toBe(1);
      expect(response.body.journal_constitutionnel).toContain('anonymes');
    });

    it('refuse la suppression sans le bon mot de passe', async () => {
      await api(app)
        .delete('/users/me')
        .set(...auth(account))
        .send({ password: 'ce-n-est-pas-le-bon' })
        .expect(403);
    });
  });
});
