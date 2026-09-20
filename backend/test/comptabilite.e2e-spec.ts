import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { IGNITUX_ACCOUNTS } from '../src/ledger/chart-of-accounts.js';
import { IGNITUX, ownerWhere, userOwner } from '../src/ledger/ledger-owner.js';
import { LedgerService } from '../src/ledger/ledger.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { api, auth, createAccount, deleteAccount, startApp, type TestAccount } from './e2e-app.js';

/**
 * LA SÉPARATION DES CAISSES, ÉPROUVÉE SUR LA VRAIE BASE.
 *
 * Ce que cette suite cherche à faire échouer, c'est la promesse elle-même :
 * « l'argent d'IGNITUX n'est jamais l'argent de la personne ». Elle tente
 * donc le mélange par les trois portes qui existent — une écriture à cheval,
 * un rapprochement bancaire croisé, la lecture des livres d'autrui — et
 * vérifie qu'aucune ne s'ouvre.
 *
 * Le contrôle final, `separationAudit()`, relit toute la base en SQL : c'est
 * lui qui dirait qu'une porte a cédé quelque part, même par un chemin que
 * personne n'a pensé à tester.
 */
describe('Séparation des caisses (e2e)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let ledger: LedgerService;
  let alice: TestAccount;
  let bob: TestAccount;
  /** Les identifiants des comptes d'Alice, par code. */
  const comptesAlice = new Map<string, string>();
  let compteBanqueIgnitux: string;

  beforeAll(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);
    ledger = app.get(LedgerService);

    await ledger.ensureIgnituxChart();
    const banque = await prisma.ledger_accounts.findFirst({
      where: { ...ownerWhere(IGNITUX), code: IGNITUX_ACCOUNTS.banque },
    });
    compteBanqueIgnitux = banque!.id;

    alice = await createAccount(app);
    bob = await createAccount(app);

    for (const [code, label, kind] of [
      ['512', 'Banque', 'actif'],
      ['706', 'Prestations', 'produit'],
      ['164', 'Financement reçu', 'passif'],
    ] as const) {
      const reponse = await api(app)
        .post('/comptabilite/comptes')
        .set(...auth(alice))
        .send({ code, label, kind })
        .expect(201);
      comptesAlice.set(code, reponse.body.id as string);
    }
  });

  afterAll(async () => {
    // Les livres d'IGNITUX ne cascadent depuis rien : c'est voulu en
    // production, donc c'est à la suite de nettoyer derrière elle.
    const ignituxEntries = await prisma.ledger_entries.findMany({
      where: ownerWhere(IGNITUX),
      select: { id: true },
    });
    const ids = ignituxEntries.map((entry) => entry.id);
    await prisma.ledger_lines.deleteMany({ where: { entry_id: { in: ids } } });
    await prisma.ledger_entries.deleteMany({ where: ownerWhere(IGNITUX) });
    await prisma.bank_accounts.deleteMany({ where: ownerWhere(IGNITUX) });
    await prisma.ledger_accounts.deleteMany({ where: ownerWhere(IGNITUX) });

    for (const compte of [alice, bob]) {
      const encore = await prisma.users.findUnique({ where: { id: compte.userId } });
      if (encore) await deleteAccount(app, compte);
    }
    await app.close();
  });

  it('ne dit rien sans jeton', async () => {
    await api(app).get('/comptabilite/comptes').expect(401);
    await api(app).get('/comptabilite/balance').expect(401);
    await api(app).get('/banque/comptes').expect(401);
  });

  describe('une comptabilité ordinaire', () => {
    it('enregistre une écriture équilibrée et la retrouve en balance', async () => {
      await api(app)
        .post('/comptabilite/ecritures')
        .set(...auth(alice))
        .send({
          occurredOn: '2026-09-20',
          label: 'Facture client réglée',
          lines: [
            { accountId: comptesAlice.get('512'), debitCents: 120000, creditCents: 0 },
            { accountId: comptesAlice.get('706'), debitCents: 0, creditCents: 120000 },
          ],
        })
        .expect(201);

      const balance = await api(app)
        .get('/comptabilite/balance')
        .set(...auth(alice))
        .expect(200);

      expect(balance.body.balanced).toBe(true);
      expect(balance.body.totalDebitCents).toBe(120000);
      const banque = balance.body.lines.find((l: { code: string }) => l.code === '512');
      expect(banque.balanceCents).toBe(120000);
    });

    it('refuse une écriture déséquilibrée en 400', async () => {
      // 400 et non 422 : c'est une saisie fautive, pas une limite du
      // produit. La distinction compte, parce que 422 est réservé aux refus
      // constitutionnels et que les confondre rendrait les deux illisibles.
      await api(app)
        .post('/comptabilite/ecritures')
        .set(...auth(alice))
        .send({
          occurredOn: '2026-09-20',
          label: 'Déséquilibrée',
          lines: [
            { accountId: comptesAlice.get('512'), debitCents: 100, creditCents: 0 },
            { accountId: comptesAlice.get('706'), debitCents: 0, creditCents: 90 },
          ],
        })
        .expect(400);
    });

    it('refuse un montant négatif dès la validation du corps', async () => {
      await api(app)
        .post('/comptabilite/ecritures')
        .set(...auth(alice))
        .send({
          occurredOn: '2026-09-20',
          label: 'Signe négatif',
          lines: [
            { accountId: comptesAlice.get('512'), debitCents: -100, creditCents: 0 },
            { accountId: comptesAlice.get('706'), debitCents: 0, creditCents: -100 },
          ],
        })
        .expect(400);
    });
  });

  describe('les portes par lesquelles le mélange pourrait passer', () => {
    it("refuse en 422 une écriture d'Alice qui touche un compte d'IGNITUX", async () => {
      // LE test. L'écriture ci-dessous est parfaitement équilibrée : elle
      // ferait entrer 500 € de la trésorerie d'IGNITUX dans le chiffre
      // d'affaires d'Alice sans qu'aucun contrôle comptable ne bronche.
      // L'identifiant du compte d'IGNITUX est fourni exprès : le refus ne
      // doit pas reposer sur le fait qu'il soit difficile à deviner.
      const avant = await prisma.constitution_violations.count({
        where: { rule_id: 'caisses-separees' },
      });

      const refus = await api(app)
        .post('/comptabilite/ecritures')
        .set(...auth(alice))
        .send({
          occurredOn: '2026-09-20',
          label: 'Tentative de mélange',
          lines: [
            { accountId: comptesAlice.get('512'), debitCents: 50000, creditCents: 0 },
            { accountId: compteBanqueIgnitux, debitCents: 0, creditCents: 50000 },
          ],
        })
        .expect(422);

      expect(String(refus.body.message)).toContain('IGNITUX');

      // Et la tentative laisse une trace : c'est ce qui distingue un refus
      // constitutionnel d'une simple erreur de saisie.
      const apres = await prisma.constitution_violations.count({
        where: { rule_id: 'caisses-separees' },
      });
      expect(apres).toBe(avant + 1);

      // Rien n'a été écrit.
      const ecritures = await prisma.ledger_entries.findMany({
        where: { label: 'Tentative de mélange' },
      });
      expect(ecritures).toHaveLength(0);
    });

    it("ne montre jamais à Alice les comptes de Bob", async () => {
      await api(app)
        .post('/comptabilite/comptes')
        .set(...auth(bob))
        .send({ code: '512', label: 'Banque de Bob', kind: 'actif' })
        .expect(201);

      const vus = await api(app)
        .get('/comptabilite/comptes')
        .set(...auth(alice))
        .expect(200);

      const libelles = vus.body.map((compte: { label: string }) => compte.label);
      expect(libelles).not.toContain('Banque de Bob');
      expect(vus.body).toHaveLength(3);
    });

    it("ne montre à personne les comptes d'IGNITUX", async () => {
      // Le plan comptable d'IGNITUX existe en base depuis `beforeAll`. Aucune
      // route ne doit le rendre : ce serait donner la trésorerie d'IGNITUX à
      // lire à n'importe quel compte.
      const vus = await api(app)
        .get('/comptabilite/comptes')
        .set(...auth(alice))
        .expect(200);

      const ids = vus.body.map((compte: { id: string }) => compte.id);
      expect(ids).not.toContain(compteBanqueIgnitux);
    });
  });

  describe('le virement entre deux comptabilités', () => {
    it('écrit des deux côtés, équilibré chacun chez soi, et les relie', async () => {
      // La seule opération autorisée à concerner deux propriétaires — et
      // elle ne produit justement pas d'écriture commune.
      const virement = await ledger.recordTransfer({
        from: {
          owner: IGNITUX,
          debitedAccountCode: IGNITUX_ACCOUNTS.participations,
          creditedAccountCode: IGNITUX_ACCOUNTS.banque,
        },
        to: { owner: userOwner(alice.userId), debitedAccountCode: '512', creditedAccountCode: '164' },
        amountCents: 500000,
        occurredOn: new Date('2026-09-20'),
        label: 'Apport Ignitux au projet',
      });

      expect(virement.from.counterpart_entry_id).toBe(virement.to.id);
      expect(virement.to.counterpart_entry_id).toBe(virement.from.id);

      const debits = (lines: Array<{ debit_cents: number }>) =>
        lines.reduce((total, line) => total + line.debit_cents, 0);
      expect(debits(virement.from.lines)).toBe(500000);
      expect(debits(virement.to.lines)).toBe(500000);

      // Chaque comptabilité équilibre séparément : c'est la preuve qu'aucune
      // écriture n'est à cheval.
      const chezAlice = await ledger.trialBalance(userOwner(alice.userId));
      const chezIgnitux = await ledger.trialBalance(IGNITUX);
      expect(chezAlice.balanced).toBe(true);
      expect(chezIgnitux.balanced).toBe(true);
    });

    it("refuse un virement vers un compte dans une autre devise", async () => {
      // recordTransfer construit ses lignes lui-même et ne passe donc pas
      // par validateEntry. Propriété et équilibre y sont tenus par
      // construction ; la devise ne l’était pas. Un compte en dollars
      // recevant un virement déclaré en euros aurait produit une écriture
      // fausse qu’aucun audit ne rattrape, puisqu’elle équilibre.
      await api(app)
        .post("/comptabilite/comptes")
        .set(...auth(alice))
        .send({ code: "512-USD", label: "Banque dollars", kind: "actif", currency: "USD" })
        .expect(201);

      await expect(
        ledger.recordTransfer({
          from: {
            owner: IGNITUX,
            debitedAccountCode: IGNITUX_ACCOUNTS.participations,
            creditedAccountCode: IGNITUX_ACCOUNTS.banque,
          },
          to: {
            owner: userOwner(alice.userId),
            debitedAccountCode: "512-USD",
            creditedAccountCode: "164",
          },
          amountCents: 10000,
          occurredOn: new Date("2026-09-20"),
          label: "Virement en devise mêlée",
        }),
      ).rejects.toThrow(/ne convertit rien/);
    });

    it("refuse un virement d'une comptabilité vers elle-même", async () => {
      await expect(
        ledger.recordTransfer({
          from: { owner: IGNITUX, debitedAccountCode: '512', creditedAccountCode: '706' },
          to: { owner: IGNITUX, debitedAccountCode: '706', creditedAccountCode: '512' },
          amountCents: 100,
          occurredOn: new Date('2026-09-20'),
          label: 'Boucle',
        }),
      ).rejects.toThrow(/deux comptabilités différentes/);
    });
  });

  describe('la banque', () => {
    let compteBancaireAlice: string;
    let mouvementAlice: string;

    it('déclare un compte sans jamais avaler un IBAN entier', async () => {
      const refus = await api(app)
        .post('/banque/comptes')
        .set(...auth(alice))
        .send({
          label: 'Compte pro',
          kind: 'courant',
          ibanLast4: 'FR7630006000011234567890189',
        })
        .expect(400);
      expect(String(refus.body.message)).toContain('quatre derniers');

      const ok = await api(app)
        .post('/banque/comptes')
        .set(...auth(alice))
        .send({ label: 'Compte pro', kind: 'courant', ibanLast4: '0189', ledgerAccountCode: '512' })
        .expect(201);

      expect(ok.body.iban_last4).toBe('0189');
      expect(ok.body.provider).toBeNull();
      compteBancaireAlice = ok.body.id as string;
    });

    it('enregistre un mouvement et calcule ce qui reste à rapprocher', async () => {
      const mouvement = await api(app)
        .post(`/banque/comptes/${compteBancaireAlice}/mouvements`)
        .set(...auth(alice))
        .send({ amountCents: 120000, occurredOn: '2026-09-20', label: 'Virement client' })
        .expect(201);
      mouvementAlice = mouvement.body.id as string;

      const solde = await api(app)
        .get(`/banque/comptes/${compteBancaireAlice}/solde`)
        .set(...auth(alice))
        .expect(200);

      expect(solde.body.balanceCents).toBe(120000);
      expect(solde.body.unreconciledCount).toBe(1);
    });

    it("refuse en 422 de rapprocher le mouvement d'Alice d'une écriture d'IGNITUX", async () => {
      // Le trou que le contrôle du journal ne verrait pas : sans écriture à
      // cheval, l'argent passerait d'une comptabilité à l'autre par la porte
      // de service.
      const ecritureIgnitux = await prisma.ledger_entries.findFirst({
        where: ownerWhere(IGNITUX),
      });

      await api(app)
        .post(`/banque/mouvements/${mouvementAlice}/rapprochement`)
        .set(...auth(alice))
        .send({ entryId: ecritureIgnitux!.id })
        .expect(422);

      const inchange = await prisma.bank_transactions.findUnique({ where: { id: mouvementAlice } });
      expect(inchange!.reconciled_entry_id).toBeNull();
    });

    it("refuse en 403 un compte bancaire qui n'est pas le sien", async () => {
      // 403 et non 404 : la ressource existe. Et surtout pas 401, qui
      // déconnecterait Bob côté interface pour une erreur d'aiguillage.
      await api(app)
        .get(`/banque/comptes/${compteBancaireAlice}/mouvements`)
        .set(...auth(bob))
        .expect(403);
    });

    it('rapproche un mouvement de sa propre écriture', async () => {
      const ecritureAlice = await prisma.ledger_entries.findFirst({
        where: { ...ownerWhere(userOwner(alice.userId)), label: 'Facture client réglée' },
      });

      await api(app)
        .post(`/banque/mouvements/${mouvementAlice}/rapprochement`)
        .set(...auth(alice))
        .send({ entryId: ecritureAlice!.id })
        .expect(201);

      const solde = await api(app)
        .get(`/banque/comptes/${compteBancaireAlice}/solde`)
        .set(...auth(alice))
        .expect(200);
      expect(solde.body.unreconciledCount).toBe(0);
    });
  });

  describe("l'export et la suppression", () => {
    it('remet à Bob sa comptabilité, et seulement la sienne', async () => {
      const exportBob = await api(app)
        .get('/users/me/export')
        .set(...auth(bob))
        .expect(200);

      const facturation = exportBob.body.donnees.facturation;
      expect(facturation.comptabilite_plan_de_comptes).toHaveLength(1);
      expect(facturation.comptabilite_plan_de_comptes[0].label).toBe('Banque de Bob');
      // Ni les comptes d'Alice, ni ceux d'IGNITUX.
      expect(JSON.stringify(facturation)).not.toContain('Prestations');
      expect(JSON.stringify(facturation)).not.toContain('Abonnements Ignitux');
    });

    it("efface les livres d'Alice, garde ceux d'IGNITUX, et coupe le lien", async () => {
      // La comptabilité d'une personne lui appartient : elle part. Celle
      // d'IGNITUX reste, et l'écriture qui désignait celle d'Alice perd
      // simplement sa contrepartie. Le fait reste, l'identité part.
      const avant = await prisma.ledger_entries.count({ where: ownerWhere(IGNITUX) });

      await deleteAccount(app, alice);

      const restantAlice = await prisma.ledger_accounts.count({
        where: ownerWhere(userOwner(alice.userId)),
      });
      const ecrituresAlice = await prisma.ledger_entries.count({
        where: ownerWhere(userOwner(alice.userId)),
      });
      expect(restantAlice).toBe(0);
      expect(ecrituresAlice).toBe(0);

      const apres = await prisma.ledger_entries.count({ where: ownerWhere(IGNITUX) });
      expect(apres).toBe(avant);

      const orphelines = await prisma.ledger_entries.findMany({
        where: { ...ownerWhere(IGNITUX), label: 'Apport Ignitux au projet' },
      });
      expect(orphelines[0].counterpart_entry_id).toBeNull();
    });
  });

  it('laisse la base sans aucun défaut de séparation', async () => {
    // Le contrôle qui ne vise aucun chemin en particulier : il relit toute
    // la base en SQL et cherche les trois défauts qui rendraient la
    // séparation fausse — une écriture à cheval, une écriture
    // déséquilibrée, une contrepartie qui ne répond pas. Il attraperait un
    // trou que personne n'a pensé à tester.
    const audit = await ledger.separationAudit();

    expect(audit.mixedEntryIds).toEqual([]);
    expect(audit.unbalancedEntryIds).toEqual([]);
    expect(audit.danglingCounterpartIds).toEqual([]);
    expect(audit.clean).toBe(true);
  });
});
