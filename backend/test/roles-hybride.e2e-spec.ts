import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { api, auth, createAccount, deleteAccount, startApp, type TestAccount } from './e2e-app.js';

/**
 * UNE MÊME PERSONNE, DEUX CASQUETTES, AUCUN MÉLANGE.
 *
 * Le cas hybride est celui que personne ne teste et que tout le monde finira
 * par être : quelqu'un qui porte ses propres projets **et** qui a placé de
 * l'argent dans ceux des autres.
 *
 * ── Pourquoi ces tests existent ──────────────────────────────────────────
 *
 * La règle constitutionnelle `roles-separes` (article 13) refuse déjà de
 * servir une vue contenant les domaines d'un autre rôle, et le catalogue
 * garantit que deux rôles n'en partagent aucun. C'est solide.
 *
 * Mais **rien ne le constatait**. Un audit du 25 septembre 2026 l'a relevé :
 * la règle dit que le mélange ne peut pas arriver, et aucun test ne fait
 * tenir les deux rôles à la même personne pour le vérifier. Une garantie que
 * personne n'exerce est une garantie qu'on découvre cassée le jour où elle
 * servait.
 *
 * ── Ce que le mélange donnerait, s'il arrivait ───────────────────────────
 *
 * Le tableau de bord que personne ne peut lire : ses propres projets et
 * l'argent placé chez d'autres additionnés dans le même total. La personne ne
 * saurait plus ce qu'elle possède ni ce qu'elle a prêté — et c'est
 * précisément la question qu'elle vient poser.
 */
describe('rôles hybrides : entrepreneur et investisseur (e2e)', () => {
  let app: INestApplication<Server>;
  let hybride: TestAccount;
  /** L'autre porteur : celui dans le projet duquel la personne a investi. */
  let autre: TestAccount;
  let projectId: string;
  let investorId: string;
  let projetFinanceAutrui: string;

  beforeAll(async () => {
    app = await startApp();
    hybride = await createAccount(app);

    // Les deux casquettes, sur le même compte.
    await api(app)
      .put('/roles/moi')
      .set(...auth(hybride))
      .send({ roles: ['entrepreneur', 'investisseur'] })
      .expect(200);

    // Un projet qu'elle porte.
    const projet = await api(app)
      .post('/projects')
      .set(...auth(hybride))
      .send({ title: 'Mon propre projet', description: 'Celui que je porte.' })
      .expect(201);
    projectId = projet.body.id as string;

    // Et une déclaration d'investisseur, pour qu'elle existe des deux côtés.
    const declaration = await api(app)
      .post('/investisseurs')
      .set(...auth(hybride))
      .send({ displayName: 'Moi, investisseur' });
    if (declaration.status >= 400) {
      throw new Error(`déclaration investisseur HTTP ${declaration.status}`);
    }
    investorId = declaration.body.id as string;

    // ── Un VRAI investissement, dans le projet de quelqu'un d'autre ───────
    //
    // Sans lui, ces tests ne prouveraient qu'un vide : un portefeuille à zéro
    // reste à zéro même si la séparation est cassée. Ce qui se vérifie ici,
    // c'est que deux choses réelles ne se mélangent pas.
    autre = await createAccount(app);
    const projetAutrui = await api(app)
      .post('/projects')
      .set(...auth(autre))
      .send({ title: 'Le projet d’en face', description: 'Celui où j’ai mis de l’argent.' })
      .expect(201);

    const registre = await api(app)
      .post('/projets-finances')
      .set(...auth(autre))
      .send({
        projectId: projetAutrui.body.id,
        openedOn: '2026-01-15',
        targetCents: 5_000_00,
      })
      .expect(201);
    projetFinanceAutrui = registre.body.id as string;

    await api(app)
      .post(`/projets-finances/${projetFinanceAutrui}/participations`)
      .set(...auth(autre))
      .send({ investorId, investedCents: 2_000_00, occurredOn: '2026-02-01' })
      .expect(201);
  });

  afterAll(async () => {
    await deleteAccount(app, hybride);
    await deleteAccount(app, autre);
    await app.close();
  });

  it('les deux espaces sont ouverts à la même personne', async () => {
    await api(app)
      .get('/espaces/entrepreneur')
      .set(...auth(hybride))
      .expect(200);

    await api(app)
      .get('/espaces/investisseur')
      .set(...auth(hybride))
      .expect(200);
  });

  it('l’espace entrepreneur ne montre aucun chiffre d’investissement', async () => {
    const espace = await api(app)
      .get('/espaces/entrepreneur')
      .set(...auth(hybride))
      .expect(200);

    expect(espace.body.role).toBe('entrepreneur');
    expect(espace.body.projects.some((p: { id: string }) => p.id === projectId)).toBe(true);

    // Aucun des mots du portefeuille ne doit apparaître dans cet espace.
    const brut = JSON.stringify(espace.body);
    for (const interdit of ['investedCents', 'repaidCents', 'dividendsCents', 'netCents']) {
      expect(brut).not.toContain(interdit);
    }
  });

  it('l’espace investisseur ne montre pas les projets qu’elle porte', async () => {
    const espace = await api(app)
      .get('/espaces/investisseur')
      .set(...auth(hybride))
      .expect(200);

    expect(espace.body.role).toBe('investisseur');
    // Le projet qu'elle porte n'est pas un investissement : il n'a rien à
    // faire ici, ni dans les lignes, ni dans le décompte.
    expect(JSON.stringify(espace.body)).not.toContain(projectId);
    expect(JSON.stringify(espace.body)).not.toContain('Mon propre projet');
  });

  it('le portefeuille compte l’investissement, et lui seul', async () => {
    // Le mélange le plus vraisemblable, et le plus coûteux : compter ses
    // propres projets comme des investissements. Elle en porte un et a investi
    // dans un autre — le portefeuille doit en voir **un**, pas deux.
    const espace = await api(app)
      .get('/espaces/investisseur')
      .set(...auth(hybride))
      .expect(200);

    expect(espace.body.global.projectCount).toBe(1);
    expect(espace.body.global.investedCents).toBe(200000);
    expect(espace.body.lines).toHaveLength(1);
    expect(espace.body.lines[0].financedProjectId).toBe(projetFinanceAutrui);
  });

  it('l’espace entrepreneur ne compte pas le projet où elle a investi', async () => {
    // Le miroir du précédent, et le plus discret : gonfler le nombre de
    // projets portés avec ceux qu'on a seulement financés ferait croire à
    // quelqu'un qu'il dirige ce qu'il a seulement soutenu.
    const espace = await api(app)
      .get('/espaces/entrepreneur')
      .set(...auth(hybride))
      .expect(200);

    expect(espace.body.counts.projects).toBe(1);
    expect(espace.body.projects).toHaveLength(1);
    expect(espace.body.projects[0].id).toBe(projectId);
    expect(JSON.stringify(espace.body)).not.toContain('Le projet d’en face');
  });

  it('chaque espace dit lui-même que les deux ne s’additionnent pas', async () => {
    // Le produit ne se contente pas de séparer : il l'explique. Une
    // séparation silencieuse laisse la personne chercher ailleurs le total
    // qu'elle attendait.
    const espace = await api(app)
      .get('/espaces/entrepreneur')
      .set(...auth(hybride))
      .expect(200);

    expect(espace.body.notice).toMatch(/Investisseur/i);
    expect(espace.body.notice).toMatch(/additionnent/i);
  });
});
