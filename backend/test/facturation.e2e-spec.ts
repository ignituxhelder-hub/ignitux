import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { api, auth, createAccount, deleteAccount, startApp, type TestAccount } from './e2e-app.js';

/**
 * FACTURATION — les règles qui viennent du droit, pas du goût.
 *
 * Trois contraintes structurent ce module : numérotation séquentielle
 * sans trou par type et par année, impossibilité de modifier un document
 * émis, correction uniquement par avoir. Elles sont testées unitairement
 * sur des fonctions pures ; ce fichier les éprouve à travers l'API, avec
 * une vraie base — c'est-à-dire là où une contrainte d'unicité, une
 * transaction ou un oubli de garde se manifeste vraiment.
 *
 * Ce n'est pas pour autant un logiciel de facturation certifié : voir
 * l'avertissement que l'API renvoie avec chaque liste.
 */
describe('facturation (e2e)', () => {
  let app: INestApplication<Server>;
  let account: TestAccount;

  const ligne = { label: 'Prestation', quantityMilli: 1000, unitPriceCents: 10_000 };

  // Volontairement NON async : on doit renvoyer l objet supertest, qui
  // porte .expect(). Une fonction async le remplacerait par une Promise,
  // et .expect() n existerait plus — les requetes partiraient alors sans
  // etre attendues, en se marchant dessus.
  function creerDocument(type: string, extra: Record<string, unknown> = {}) {
    return api(app)
      .post('/billing/documents')
      .set(...auth(account))
      .send({ type, clientName: 'Client Test', lines: [ligne], ...extra });
  }

  beforeAll(async () => {
    app = await startApp();
    account = await createAccount(app);
  });

  afterAll(async () => {
    await deleteAccount(app, account);
    await app.close();
  });

  describe('numérotation', () => {
    it('numérote séquentiellement, sans trou, et par type', async () => {
      const facture1 = await creerDocument('facture').expect(201);
      const facture2 = await creerDocument('facture').expect(201);
      const devis1 = await creerDocument('devis').expect(201);

      const annee = new Date().getFullYear();
      expect(facture1.body.number).toBe(`FAC-${annee}-0001`);
      expect(facture2.body.number).toBe(`FAC-${annee}-0002`);
      // Le devis repart à 1 : les séquences sont indépendantes par type,
      // comme l'exige la règle.
      expect(devis1.body.number).toBe(`DEV-${annee}-0001`);
    });

    it('refuse un document sans aucune ligne', async () => {
      await api(app)
        .post('/billing/documents')
        .set(...auth(account))
        .send({ type: 'facture', clientName: 'Client', lines: [] })
        .expect(400);
    });

    it('refuse une quantité nulle ou négative', async () => {
      await api(app)
        .post('/billing/documents')
        .set(...auth(account))
        .send({
          type: 'facture',
          clientName: 'Client',
          lines: [{ label: 'X', quantityMilli: 0, unitPriceCents: 100 }],
        })
        .expect(400);
    });

    it("refuse un taux de TVA qui ne peut être qu'une erreur de saisie", async () => {
      await api(app)
        .post('/billing/documents')
        .set(...auth(account))
        .send({
          type: 'facture',
          clientName: 'Client',
          lines: [{ ...ligne, vatRateBasisPoints: 99_999 }],
        })
        .expect(400);
    });
  });

  describe('un document émis est figé', () => {
    let id: string;

    beforeAll(async () => {
      const created = await creerDocument('facture').expect(201);
      id = created.body.id as string;
      await api(app)
        .patch(`/billing/documents/${id}/status`)
        .set(...auth(account))
        .send({ status: 'emis' })
        .expect(200);
    });

    it('ne se modifie plus', async () => {
      await api(app)
        .patch(`/billing/documents/${id}`)
        .set(...auth(account))
        .send({ clientName: 'Nom changé après émission' })
        .expect(400);
    });

    it('ne se supprime plus', async () => {
      // Supprimer une facture émise ferait un trou dans la numérotation,
      // ce que la règle interdit précisément.
      await api(app)
        .delete(`/billing/documents/${id}`)
        .set(...auth(account))
        .expect(400);
    });

    it('accepte un règlement et suit le reste à payer', async () => {
      const paiement = await api(app)
        .post(`/billing/documents/${id}/payments`)
        .set(...auth(account))
        .send({ amountCents: 4000, method: 'virement', receivedAt: '2026-09-20T10:00:00.000Z' })
        .expect(201);

      expect(paiement.body).toBeDefined();

      const relu = await api(app)
        .get(`/billing/documents/${id}`)
        .set(...auth(account))
        .expect(200);

      // 10 000 centimes de ligne, 4 000 réglés : il reste 6 000.
      expect(relu.body.remainingCents).toBe(6000);
    });
  });

  describe('avoirs', () => {
    it("refuse un avoir qui ne référence aucun document", async () => {
      await creerDocument('avoir').expect(400);
    });

    it('refuse de corriger un brouillon par un avoir', async () => {
      // Un brouillon se modifie : le corriger par un avoir n'aurait
      // aucun sens et créerait un document de plus pour rien.
      const brouillon = await creerDocument('facture').expect(201);

      await creerDocument('avoir', { correctsId: brouillon.body.id }).expect(400);
    });

    it('accepte un avoir sur une facture émise', async () => {
      const facture = await creerDocument('facture').expect(201);
      await api(app)
        .patch(`/billing/documents/${facture.body.id}/status`)
        .set(...auth(account))
        .send({ status: 'emis' })
        .expect(200);

      const avoir = await creerDocument('avoir', { correctsId: facture.body.id }).expect(201);

      expect(avoir.body.corrects_id).toBe(facture.body.id);
      expect(avoir.body.number).toMatch(/^AV-/);
    });
  });

  describe('transitions de statut', () => {
    it('refuse un statut inconnu', async () => {
      const doc = await creerDocument('facture').expect(201);

      await api(app)
        .patch(`/billing/documents/${doc.body.id}/status`)
        .set(...auth(account))
        .send({ status: 'inventé' })
        .expect(400);
    });

    it("refuse de revenir en brouillon après émission", async () => {
      const doc = await creerDocument('facture').expect(201);
      await api(app)
        .patch(`/billing/documents/${doc.body.id}/status`)
        .set(...auth(account))
        .send({ status: 'emis' })
        .expect(200);

      await api(app)
        .patch(`/billing/documents/${doc.body.id}/status`)
        .set(...auth(account))
        .send({ status: 'brouillon' })
        .expect(400);
    });
  });

  describe('export et avertissement', () => {
    it("l'export CSV contient les documents", async () => {
      const response = await api(app)
        .get('/billing/documents/export')
        .set(...auth(account))
        .expect(200);

      expect(response.text).toContain('FAC-');
    });

    it("la liste porte toujours son avertissement", async () => {
      const response = await api(app)
        .get('/billing/documents')
        .set(...auth(account))
        .expect(200);

      expect(response.body.disclaimer).toContain('certifié');
    });
  });
});
