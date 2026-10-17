import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { api, auth, createAccount, deleteAccount, startApp, type TestAccount } from './e2e-app.js';

/**
 * SUPPRIMER OU ARCHIVER UN PROJET — avec une vraie base.
 *
 * Le refus de supprimer un projet qui a des factures émises tient dans la
 * requête de suppression elle-même (un filtre sur les documents liés) : seul
 * Postgres dit s'il bloque vraiment. Les tests unitaires ne voient qu'un
 * simulacre.
 */
describe('supprimer ou archiver un projet (e2e)', () => {
  let app: INestApplication<Server>;
  let porteur: TestAccount;

  function creerProjet(title: string) {
    return api(app).post('/projects').set(...auth(porteur)).send({ title }).expect(201);
  }

  function creerFacture(projectId: string) {
    return api(app)
      .post('/billing/documents')
      .set(...auth(porteur))
      .send({
        type: 'facture',
        clientName: 'Client Test',
        projectId,
        lines: [{ label: 'Prestation', quantityMilli: 1000, unitPriceCents: 10_000 }],
      })
      .expect(201);
  }

  async function idsDe(route: string): Promise<string[]> {
    const reponse = await api(app).get(route).set(...auth(porteur)).expect(200);
    return (reponse.body as { id: string }[]).map((p) => p.id);
  }

  beforeAll(async () => {
    app = await startApp();
    porteur = await createAccount(app);
  });

  afterAll(async () => {
    await deleteAccount(app, porteur);
    await app.close();
  });

  it('supprime un projet dont la facture est encore un brouillon', async () => {
    const projet = await creerProjet('Brouillon seulement');
    await creerFacture(projet.body.id as string);

    await api(app).delete(`/projects/${projet.body.id}`).set(...auth(porteur)).expect(204);
  });

  it('refuse de supprimer un projet qui a une facture émise, et l’archive à la place', async () => {
    const projet = await creerProjet('Avec facture');
    const id = projet.body.id as string;
    const facture = await creerFacture(id);
    await api(app)
      .patch(`/billing/documents/${facture.body.id}/status`)
      .set(...auth(porteur))
      .send({ status: 'emis' })
      .expect(200);

    const refus = await api(app).delete(`/projects/${id}`).set(...auth(porteur)).expect(409);
    expect(refus.body.message).toMatch(/factures émises/);
    expect(await idsDe('/projects')).toContain(id);

    const archive = await api(app).post(`/projects/${id}/archiver`).set(...auth(porteur)).expect(200);
    expect(archive.body.archived_at).not.toBeNull();
    expect(await idsDe('/projects')).not.toContain(id);
    expect(await idsDe('/projects/archives')).toContain(id);
    // Rien n'est perdu : le projet s'ouvre toujours, sa facture aussi.
    await api(app).get(`/projects/${id}`).set(...auth(porteur)).expect(200);
    await api(app).get(`/billing/documents/${facture.body.id}`).set(...auth(porteur)).expect(200);

    await api(app).post(`/projects/${id}/restaurer`).set(...auth(porteur)).expect(200);
    expect(await idsDe('/projects')).toContain(id);
    expect(await idsDe('/projects/archives')).not.toContain(id);
  });
});
