import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { api, auth, createAccount, deleteAccount, startApp, type TestAccount } from './e2e-app.js';

/**
 * QUI A FAIT QUOI, ET CE QU'ON EN DIT.
 *
 * Deux articles se rencontrent sur cet écran et tirent en sens inverse.
 *
 * L'article 21 — « les créateurs conservent la reconnaissance de leurs
 * idées » — exige qu'on sache de qui vient un projet public. Jusqu'au
 * 25 septembre 2026, la communauté n'en montrait rien : titre, description,
 * date, et voilà. Une idée exposée sans son porteur ne lui laisse aucune
 * reconnaissance, et personne ne l'avait vu parce que rien ne regardait.
 *
 * L'article 13 — « les données privées sont protégées par défaut » — interdit
 * d'y mettre une adresse email. La réponse est le nom d'affichage, que la
 * personne a choisi de donner, et rien d'autre.
 *
 * ── Pourquoi ces tests-ci, et pas seulement des tests unitaires ──────────
 *
 * Parce que les tests unitaires n'ont pas vu la faute. La relation s'appelle
 * `owner` sur `projects` ; la première version écrivait `user`. Les tests
 * unitaires simulent Prisma : ils vérifiaient donc consciencieusement la
 * forme que la faute venait d'inventer, et passaient tous au vert pendant que
 * la communauté entière répondait 500.
 *
 * Ce qui l'a attrapé est un appel contre une vraie base. Ces tests en font
 * une garantie permanente, et dans la CI plutôt que dans une commande qu'il
 * faut penser à lancer.
 */
describe('communauté : attribution et vie privée (e2e)', () => {
  let app: INestApplication<Server>;
  let porteur: TestAccount;
  let lecteur: TestAccount;
  let projectId: string;

  const NOM = 'Camille du harnais';

  beforeAll(async () => {
    app = await startApp();
    porteur = await createAccount(app);
    lecteur = await createAccount(app);

    await api(app)
      .put('/profil')
      .set(...auth(porteur))
      .send({ values: { display_name: NOM } })
      .expect(200);

    const projet = await api(app)
      .post('/projects')
      .set(...auth(porteur))
      .send({ title: 'Idée partagée', description: 'Visible de tous.' })
      .expect(201);
    projectId = projet.body.id as string;

    await api(app)
      .patch(`/projects/${projectId}/visibility`)
      .set(...auth(porteur))
      .send({ isPublic: true })
      .expect(200);
  });

  afterAll(async () => {
    await deleteAccount(app, porteur);
    await deleteAccount(app, lecteur);
    await app.close();
  });

  it('la liste publique porte le nom du porteur', async () => {
    const reponse = await api(app)
      .get('/community/projects')
      .set(...auth(lecteur))
      .expect(200);

    const mien = reponse.body.find((p: { id: string }) => p.id === projectId);
    expect(mien).toBeDefined();
    expect(mien.porteur).toBe(NOM);
  });

  it('le détail d’un projet public porte le nom du porteur', async () => {
    const reponse = await api(app)
      .get(`/community/projects/${projectId}`)
      .set(...auth(lecteur))
      .expect(200);

    expect(reponse.body.porteur).toBe(NOM);
  });

  it('rien de tout cela ne laisse filtrer une adresse email', async () => {
    // Le test qui compte le plus ici. Il échouerait le jour où quelqu'un
    // rajoute l'email « pour déboguer » et oublie de le retirer.
    const [liste, detail] = await Promise.all([
      api(app).get('/community/projects').set(...auth(lecteur)).expect(200),
      api(app).get(`/community/projects/${projectId}`).set(...auth(lecteur)).expect(200),
    ]);

    expect(JSON.stringify(liste.body)).not.toContain('@');
    expect(JSON.stringify(detail.body)).not.toContain('@');
  });

  it('un encouragement est signé d’un nom, pas d’un identifiant', async () => {
    await api(app)
      .put('/profil')
      .set(...auth(lecteur))
      .send({ values: { display_name: 'Lecteur attentif' } })
      .expect(200);

    const ecrit = await api(app)
      .post(`/community/projects/${projectId}/comments`)
      .set(...auth(lecteur))
      .send({ content: 'Bravo pour ce projet.' })
      .expect(201);

    // Le commentaire créé revient dans la même forme que la liste :
    // l'interface l'ajoute sans recharger, et il serait le seul anonyme de la
    // page s'il arrivait sans nom.
    expect(ecrit.body.auteur).toBe('Lecteur attentif');

    const liste = await api(app)
      .get(`/community/projects/${projectId}/comments`)
      .set(...auth(porteur))
      .expect(200);

    expect(liste.body[0].auteur).toBe('Lecteur attentif');
    expect(JSON.stringify(liste.body)).not.toContain('@');
  });

  it('l’annuaire de la place de marché ne distribue pas les adresses', async () => {
    // Il renvoyait l'adresse de chaque inscrit à n'importe quelle personne
    // connectée — une requête, tout l'annuaire — et l'interface ne l'affichait
    // nulle part. Une exposition sans le moindre usage.
    await api(app)
      .post('/marketplace/profile')
      .set(...auth(porteur))
      .send({ role: 'mentor', headline: 'Mentor du harnais', bio: null, expertise: ['tests'] })
      .expect(201);

    const annuaire = await api(app)
      .get('/marketplace/profiles')
      .set(...auth(lecteur))
      .expect(200);

    expect(annuaire.body.length).toBeGreaterThan(0);
    expect(JSON.stringify(annuaire.body)).not.toContain('@');
    // Le nom, lui, doit passer : sans lui l'annuaire ne dit plus qui est qui.
    expect(JSON.stringify(annuaire.body)).toContain(NOM);
  });

  it('un projet privé reste absent de la communauté', async () => {
    // Le bord opposé de l'article 13, et il n'a pas bougé : rendre visible
    // reste une décision explicite.
    const prive = await api(app)
      .post('/projects')
      .set(...auth(lecteur))
      .send({ title: 'Gardé pour moi', description: 'Rien à montrer.' })
      .expect(201);

    const liste = await api(app)
      .get('/community/projects')
      .set(...auth(porteur))
      .expect(200);

    expect(liste.body.some((p: { id: string }) => p.id === prive.body.id)).toBe(false);
  });
});
