import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { api, auth, createAccount, startApp, type TestAccount } from '../e2e-app.js';

/**
 * SCÉNARIO — INSCRIPTION → PROJET → ANALYSE → FACTURATION → SUPPRESSION.
 *
 * ── Ce que ce fichier fait, et que les autres ne font pas ────────────────
 *
 * Les suites par domaine vérifient chacune leur morceau : la facturation
 * numérote juste, la suppression efface bien les tables qu'elle connaît.
 * Chacune passe, et pourtant la question « est-ce que le produit tient
 * debout d'un bout à l'autre ? » reste sans réponse — parce que personne ne
 * la pose.
 *
 * Ici, chaque étape **consomme ce que la précédente a produit** : le projet
 * naît du compte, la facture naît du projet et du contact, et la suppression
 * doit emporter tout ce que le parcours a semé en chemin.
 *
 * Le vrai test est le dernier. Il relit **chaque identifiant collecté le
 * long du parcours** et vérifie ce qu'il est devenu — disparu, ou détaché.
 * C'est la seule façon de s'apercevoir qu'une table ajoutée l'an prochain
 * échappe à la suppression : aucune suite par domaine ne peut le voir,
 * puisqu'aucune ne connaît les autres.
 */
describe('SCÉNARIO — du compte créé au compte effacé', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let camille: TestAccount;

  /**
   * Tout ce que le parcours sème, ramassé au passage. C'est cette liste que
   * le bilan final interroge.
   */
  const trace = {
    projectId: '',
    memoryId: '',
    conceptId: '',
    taskId: '',
    companyId: '',
    contactId: '',
    documentId: '',
    ledgerAccountId: '',
    bankAccountId: '',
    violationId: '',
  };

  beforeAll(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);
    camille = await createAccount(app);
  });

  afterAll(async () => {
    // Le compte est supprimé par le parcours lui-même. S'il survit — parce
    // qu'une étape a échoué avant —, on nettoie pour ne pas laisser de
    // reste derrière nous.
    const encore = await prisma.users.findUnique({ where: { id: camille.userId } });
    if (encore) {
      await api(app)
        .delete('/users/me')
        .set(...auth(camille))
        .send({ password: camille.password });
    }
    await app.close();
  });

  describe('1. elle s’inscrit et crée son projet', () => {
    it('le projet naît privé, sans qu’elle ait rien à faire', async () => {
      const projet = await api(app)
        .post('/projects')
        .set(...auth(camille))
        .send({
          title: 'Ateliers Boussole',
          description: 'Un atelier itinérant pour aider les artisans sur leurs prix.',
        })
        .expect(201);

      trace.projectId = projet.body.id as string;
      expect(projet.body.is_public).not.toBe(true);
    });
  });

  describe('2. elle demande une analyse à IGINI', () => {
    it('le refus est net, et il dit que c’est volontaire', async () => {
      // L'étape la plus importante du parcours pour une raison inattendue :
      // elle échoue, et le parcours doit continuer quand même. Un produit
      // dont une fonctionnalité est coupée n'est pas un produit cassé — à
      // condition qu'il le dise.
      const refus = await api(app)
        .post(`/projects/${trace.projectId}/analyze`)
        .set(...auth(camille))
        .send({})
        .expect(503);

      expect(String(refus.body.message)).toContain('IA non disponible');
    });

    it('l’historique reste consultable, et vide', async () => {
      const historique = await api(app)
        .get(`/projects/${trace.projectId}/analyses`)
        .set(...auth(camille))
        .expect(200);

      expect(historique.body).toEqual([]);
    });

    it('elle avance sans l’IA : un souvenir, un concept, une tâche', async () => {
      const souvenir = await api(app)
        .post('/memory')
        .set(...auth(camille))
        .send({
          category: 'learning',
          content: 'Les artisans ne répondent pas au téléphone avant 18 h.',
          projectId: trace.projectId,
        })
        .expect(201);
      trace.memoryId = souvenir.body.id as string;

      const concept = await api(app)
        .post('/knowledge/concepts')
        .set(...auth(camille))
        .send({ name: 'Prix de vente', projectId: trace.projectId })
        .expect(201);
      trace.conceptId = concept.body.id as string;

      const tache = await api(app)
        .post(`/projects/${trace.projectId}/tasks`)
        .set(...auth(camille))
        .send({ title: 'Appeler dix artisans après 18 h', assignee: 'human' })
        .expect(201);
      trace.taskId = tache.body.id as string;
    });
  });

  describe('3. elle facture son premier atelier', () => {
    it('le client vient du CRM, pas d’une saisie libre', async () => {
      const entreprise = await api(app)
        .post('/crm/companies')
        .set(...auth(camille))
        .send({ name: 'Menuiserie Vaillant', sector: 'Bois' })
        .expect(201);
      trace.companyId = entreprise.body.id as string;

      const contact = await api(app)
        .post('/crm/contacts')
        .set(...auth(camille))
        .send({
          firstName: 'Sophie',
          lastName: 'Vaillant',
          kind: 'client',
          companyId: trace.companyId,
          projectId: trace.projectId,
        })
        .expect(201);
      trace.contactId = contact.body.id as string;
    });

    it('la facture chaîne le projet, le contact et les montants', async () => {
      const facture = await api(app)
        .post('/billing/documents')
        .set(...auth(camille))
        .send({
          type: 'facture',
          clientName: 'Menuiserie Vaillant',
          contactId: trace.contactId,
          projectId: trace.projectId,
          lines: [
            {
              label: 'Atelier comptabilité — 2 jours',
              quantityMilli: 2000,
              unitPriceCents: 45000,
              vatRateBasisPoints: 2000,
            },
          ],
        })
        .expect(201);

      trace.documentId = facture.body.id as string;
      expect(facture.body.number).toMatch(/^FAC-\d{4}-\d{4}$/);

      const relue = await api(app)
        .get(`/billing/documents/${trace.documentId}`)
        .set(...auth(camille))
        .expect(200);

      expect(relue.body.totals.subtotalCents).toBe(90000);
      expect(relue.body.totals.vatCents).toBe(18000);
      expect(relue.body.totals.totalCents).toBe(108000);
      // Le chaînage, qui est tout l'intérêt de ce scénario : la facture sait
      // de quel projet et de quel contact elle vient.
      expect(relue.body.project_id).toBe(trace.projectId);
      expect(relue.body.contact_id).toBe(trace.contactId);
    });

    it('émise, elle ne se modifie plus, et l’encaissement la suit', async () => {
      await api(app)
        .patch(`/billing/documents/${trace.documentId}/status`)
        .set(...auth(camille))
        .send({ status: 'emis' })
        .expect(200);

      await api(app)
        .patch(`/billing/documents/${trace.documentId}`)
        .set(...auth(camille))
        .send({ clientName: 'Quelqu’un d’autre' })
        .expect(400);

      await api(app)
        .post(`/billing/documents/${trace.documentId}/payments`)
        .set(...auth(camille))
        .send({ amountCents: 108000, method: 'virement' })
        .expect(201);
    });

    it('elle l’enregistre aussi dans sa comptabilité', async () => {
      const banque = await api(app)
        .post('/comptabilite/comptes')
        .set(...auth(camille))
        .send({ code: '512', label: 'Banque', kind: 'actif' })
        .expect(201);
      trace.ledgerAccountId = banque.body.id as string;

      const produits = await api(app)
        .post('/comptabilite/comptes')
        .set(...auth(camille))
        .send({ code: '706', label: 'Ateliers', kind: 'produit' })
        .expect(201);

      await api(app)
        .post('/comptabilite/ecritures')
        .set(...auth(camille))
        .send({
          occurredOn: '2026-09-20',
          label: 'Atelier Vaillant réglé',
          reference: 'FAC-2026',
          lines: [
            { accountId: trace.ledgerAccountId, debitCents: 108000, creditCents: 0 },
            { accountId: produits.body.id, debitCents: 0, creditCents: 108000 },
          ],
        })
        .expect(201);

      const compteBancaire = await api(app)
        .post('/banque/comptes')
        .set(...auth(camille))
        .send({ label: 'Compte pro', kind: 'courant', ibanLast4: '0189', ledgerAccountCode: '512' })
        .expect(201);
      trace.bankAccountId = compteBancaire.body.id as string;
    });
  });

  describe('4. elle se heurte à une limite, et ça laisse une trace', () => {
    it('céder la majorité lui est refusé, et le refus est journalisé', async () => {
      // Une étape qui échoue exprès : le parcours doit contenir au moins une
      // rencontre avec une limite, sinon il ne dit rien de ce qui arrive
      // quand le produit refuse.
      const moi = await api(app)
        .post(`/projects/${trace.projectId}/financing/holders`)
        .set(...auth(camille))
        .send({ name: 'Camille Rousseau', isFounder: true })
        .expect(201);

      const eux = await api(app)
        .post(`/projects/${trace.projectId}/financing/holders`)
        .set(...auth(camille))
        .send({ name: 'Investisseur', isFounder: false })
        .expect(201);

      await api(app)
        .post(`/financing/holders/${moi.body.id}/equity-events`)
        .set(...auth(camille))
        .send({ shareBasisPoints: 4000, reason: 'Cession', occurredAt: '2026-02-01T00:00:00.000Z' })
        .expect(201);

      await api(app)
        .post(`/financing/holders/${eux.body.id}/equity-events`)
        .set(...auth(camille))
        .send({ shareBasisPoints: 6000, reason: 'Entrée', occurredAt: '2026-02-01T00:00:00.000Z' })
        .expect(422);

      const journal = await api(app)
        .get('/constitution/violations')
        .set(...auth(camille))
        .expect(200);

      const refus = journal.body.find((v: { rule_id: string }) => v.rule_id === 'majorite-du-porteur');
      expect(refus).toBeDefined();
      trace.violationId = refus.id as string;
    });
  });

  describe('5. elle s’en va', () => {
    it('on lui annonce d’abord ce qui va disparaître', async () => {
      const apercu = await api(app)
        .get('/users/me/deletion-preview')
        .set(...auth(camille))
        .expect(200);

      // L'aperçu doit décrire CE parcours, pas des généralités.
      expect(apercu.body.resume.projets).toBe(1);
      expect(apercu.body.resume.souvenirs).toBe(1);
      expect(apercu.body.resume.documents_de_facturation_emis).toBe(1);
    });

    it('elle récupère tout ce qu’Ignitux détient sur elle', async () => {
      const exporte = await api(app)
        .get('/users/me/export')
        .set(...auth(camille))
        .expect(200);

      const brut = JSON.stringify(exporte.body);
      // Chaque étape du parcours doit se retrouver dans le fichier.
      expect(brut).toContain('Ateliers Boussole');
      expect(brut).toContain('avant 18 h');
      expect(brut).toContain('Prix de vente');
      expect(brut).toContain('Menuiserie Vaillant');
      expect(brut).toContain('Atelier Vaillant réglé');
      // Et jamais le hash du mot de passe.
      expect(brut).not.toContain('password_hash');
    });

    it('la suppression exige son mot de passe', async () => {
      await api(app)
        .delete('/users/me')
        .set(...auth(camille))
        .send({ password: 'pas-le-bon' })
        .expect(403);

      await api(app)
        .delete('/users/me')
        .set(...auth(camille))
        .send({ password: camille.password })
        .expect(204);
    });

    it('son jeton cesse aussitôt de valoir quoi que ce soit', async () => {
      await api(app)
        .get('/projects')
        .set(...auth(camille))
        .expect(401);
    });
  });

  describe('6. le bilan — ce que la suppression a réellement couvert', () => {
    /**
     * Le test qui justifie tout le fichier.
     *
     * Il relit chaque identifiant ramassé le long du parcours et vérifie ce
     * qu'il est devenu. Aucune suite par domaine ne peut faire ça : aucune
     * ne connaît les autres. Le jour où une table s'ajoute et échappe à la
     * suppression, c'est ici qu'on l'apprendra.
     */
    it('tout ce qui lui appartenait a disparu', async () => {
      const restes = {
        compte: await prisma.users.count({ where: { id: camille.userId } }),
        projet: await prisma.projects.count({ where: { id: trace.projectId } }),
        souvenir: await prisma.memories.count({ where: { id: trace.memoryId } }),
        concept: await prisma.concepts.count({ where: { id: trace.conceptId } }),
        tache: await prisma.tasks.count({ where: { id: trace.taskId } }),
        entreprise: await prisma.crm_companies.count({ where: { id: trace.companyId } }),
        contact: await prisma.crm_contacts.count({ where: { id: trace.contactId } }),
        facture: await prisma.billing_documents.count({ where: { id: trace.documentId } }),
        compteComptable: await prisma.ledger_accounts.count({ where: { id: trace.ledgerAccountId } }),
        compteBancaire: await prisma.bank_accounts.count({ where: { id: trace.bankAccountId } }),
      };

      expect(restes).toEqual({
        compte: 0,
        projet: 0,
        souvenir: 0,
        concept: 0,
        tache: 0,
        entreprise: 0,
        contact: 0,
        facture: 0,
        compteComptable: 0,
        compteBancaire: 0,
      });
    });

    it('et ce qui devait survivre a survécu, sans son nom', async () => {
      // Tout ne disparaît pas, et c'est délibéré : le journal des refus rend
      // l'article 8 vérifiable, et l'effacer reviendrait à pouvoir réécrire
      // l'histoire de ce qui a été refusé. Le fait reste, l'identité part.
      const violation = await prisma.constitution_violations.findUnique({
        where: { id: trace.violationId },
      });

      expect(violation).not.toBeNull();
      expect(violation!.user_id).toBeNull();
      expect(violation!.rule_id).toBe('majorite-du-porteur');
    });

    it('aucune ligne comptable orpheline ne traîne derrière elle', async () => {
      // Le cas que la suppression a failli manquer : `ledger_accounts` et
      // `bank_accounts` n'ont aucune clé étrangère vers `users` — voulu,
      // pour des raisons comptables — donc rien ne les emporte tout seul.
      const orphelines = await prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*) AS n
        FROM ledger_accounts a
        LEFT JOIN users u ON u.id = a.owner_id
        WHERE a.owner_type = 'user' AND u.id IS NULL
      `;
      expect(Number(orphelines[0].n)).toBe(0);
    });
  });
});
