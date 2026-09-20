import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { InvestorsService } from '../src/investors/investors.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { api, auth, createAccount, deleteAccount, startApp, type TestAccount } from './e2e-app.js';

/**
 * LE MOTEUR D'INVESTISSEMENT, ÉPROUVÉ SUR LA VRAIE BASE.
 *
 * Le décor est celui de la spécification, au centime près :
 *
 *   Projet A — investisseur 1 : 1 000 €, investisseur 2 : 500 €
 *   Projet B — investisseur 1 : 3 000 €
 *
 * Ce que cette suite cherche à faire échouer, c'est la promesse : « les
 * remboursements du projet A ne doivent jamais apparaître dans le projet B ».
 * Elle vérifie donc qu'un investisseur voit bien ses deux projets **séparés**,
 * qu'un remboursement ne touche que les investisseurs du projet remboursé, et
 * qu'aucun centime ne se perd ni ne s'invente en chemin.
 */
describe('Investisseurs et remboursements (e2e)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let investorsService: InvestorsService;

  /** Deux porteurs : chacun son projet, pour que rien ne partage un propriétaire. */
  let porteurA: TestAccount;
  let porteurB: TestAccount;
  /** Deux investisseurs. Le premier met dans les deux projets. */
  let investisseur1: TestAccount;
  let investisseur2: TestAccount;

  let investisseur1Id: string;
  let investisseur2Id: string;
  let projetA: string;
  let projetB: string;
  let partA1: string;
  let partA2: string;

  beforeAll(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);
    investorsService = app.get(InvestorsService);

    [porteurA, porteurB, investisseur1, investisseur2] = await Promise.all([
      createAccount(app),
      createAccount(app),
      createAccount(app),
      createAccount(app),
    ]);

    // Les deux investisseurs se déclarent.
    const i1 = await api(app)
      .post('/investisseurs')
      .set(...auth(investisseur1))
      .send({ displayName: 'Marie Dubois' })
      .expect(201);
    investisseur1Id = i1.body.id as string;

    const i2 = await api(app)
      .post('/investisseurs')
      .set(...auth(investisseur2))
      .send({ displayName: 'Karim Benali' })
      .expect(201);
    investisseur2Id = i2.body.id as string;

    // Deux projets, ouverts au financement par deux porteurs différents.
    const ouvrir = async (compte: TestAccount, titre: string) => {
      const projet = await api(app)
        .post('/projects')
        .set(...auth(compte))
        .send({ title: titre })
        .expect(201);
      const finance = await api(app)
        .post('/projets-finances')
        .set(...auth(compte))
        .send({ projectId: projet.body.id, openedOn: '2026-01-10' })
        .expect(201);
      return finance.body.id as string;
    };

    projetA = await ouvrir(porteurA, 'Projet A — atelier de reliure');
    projetB = await ouvrir(porteurB, 'Projet B — ferme maraîchère');
  });

  afterAll(async () => {
    // Rien ne se supprime par le produit dans ce module — c'est la règle —
    // donc la suite nettoie elle-même ce qu'elle a créé en base.
    const financedIds = [projetA, projetB].filter(Boolean);
    await prisma.investor_movements.deleteMany({
      where: { financed_project_id: { in: financedIds } },
    });
    await prisma.participations.deleteMany({
      where: { financed_project_id: { in: financedIds } },
    });
    await prisma.financed_projects.deleteMany({ where: { id: { in: financedIds } } });
    await prisma.investors.deleteMany({
      where: { id: { in: [investisseur1Id, investisseur2Id].filter(Boolean) } },
    });

    for (const compte of [porteurA, porteurB, investisseur1, investisseur2]) {
      const encore = await prisma.users.findUnique({ where: { id: compte.userId } });
      if (encore) await deleteAccount(app, compte);
    }
    await app.close();
  });

  it('ne dit rien sans jeton', async () => {
    await api(app).get('/investisseurs/moi/portefeuille').expect(401);
    await api(app).post('/projets-finances').send({}).expect(401);
  });

  describe('les apports', () => {
    it('enregistre les trois participations de la spécification', async () => {
      const apport = async (compte: TestAccount, finance: string, investorId: string, cents: number) => {
        const r = await api(app)
          .post(`/projets-finances/${finance}/participations`)
          .set(...auth(compte))
          .send({ investorId, investedCents: cents, occurredOn: '2026-01-15' })
          .expect(201);
        return r.body.id as string;
      };

      partA1 = await apport(porteurA, projetA, investisseur1Id, 100000); // 1 000 €
      partA2 = await apport(porteurA, projetA, investisseur2Id, 50000); //   500 €
      await apport(porteurB, projetB, investisseur1Id, 300000); //          3 000 €

      expect(partA1).toBeTruthy();
      expect(partA2).toBeTruthy();
    });

    it("crée le mouvement d'apport dans la même transaction que la participation", async () => {
      // Une participation sans son mouvement serait de l'argent placé dont
      // le portefeuille ne dirait rien.
      const mouvements = await prisma.investor_movements.findMany({
        where: { participation_id: partA1 },
      });
      expect(mouvements).toHaveLength(1);
      // Négatif : du point de vue de l'investisseur, l'argent sort.
      expect(mouvements[0].amount_cents).toBe(-100000);
      expect(mouvements[0].kind).toBe('investissement');
    });

    it("refuse qu'un autre que le porteur enregistre un apport", async () => {
      await api(app)
        .post(`/projets-finances/${projetA}/participations`)
        .set(...auth(porteurB))
        .send({ investorId: investisseur1Id, investedCents: 10000, occurredOn: '2026-01-15' })
        .expect(404);
    });
  });

  describe('un remboursement ne touche que son projet', () => {
    it('répartit 900 € du projet A entre ses deux investisseurs, au prorata', async () => {
      // 1 000 / 1 500 et 500 / 1 500 : deux tiers, un tiers.
      const r = await api(app)
        .post(`/projets-finances/${projetA}/remboursements`)
        .set(...auth(porteurA))
        .send({ amountCents: 90000, occurredOn: '2026-06-30', reference: 'VIR-001' })
        .expect(201);

      expect(r.body.distributedCents).toBe(90000);
      const parInvestisseur = Object.fromEntries(
        r.body.allocations.map((a: { investorId: string; amountCents: number }) => [
          a.investorId,
          a.amountCents,
        ]),
      );
      expect(parInvestisseur[investisseur1Id]).toBe(60000);
      expect(parInvestisseur[investisseur2Id]).toBe(30000);
    });

    it("dit clairement qu'aucun euro n'a bougé", async () => {
      // Le produit enregistre une répartition, il n'émet aucun virement :
      // aucun fournisseur bancaire n'est branché. Le laisser croire serait
      // la pire des promesses à moitié tenue.
      const r = await api(app)
        .post(`/projets-finances/${projetA}/remboursements`)
        .set(...auth(porteurA))
        .send({ amountCents: 1500, occurredOn: '2026-07-01' })
        .expect(201);

      expect(String(r.body.notice)).toContain("n'émet aucun virement");
    });

    it("n'a rien écrit dans le projet B", async () => {
      // LE test de la séparation. Le projet B n'a reçu aucun remboursement ;
      // son registre ne doit en porter aucune trace.
      const mouvementsB = await prisma.investor_movements.findMany({
        where: { financed_project_id: projetB, kind: 'remboursement_capital' },
      });
      expect(mouvementsB).toEqual([]);
    });
  });

  describe('un dividende va au bon investisseur', () => {
    it("verse 200 € sur le projet B, où seul l'investisseur 1 a mis", async () => {
      const r = await api(app)
        .post(`/projets-finances/${projetB}/dividendes`)
        .set(...auth(porteurB))
        .send({ amountCents: 20000, occurredOn: '2026-07-15', applyPerpetualShare: true })
        .expect(201);

      // Les 5 % d'Ignitux sortent d'abord : 1 000 centimes.
      expect(r.body.ignituxCents).toBe(1000);
      expect(r.body.distributedCents).toBe(19000);
      expect(r.body.allocations).toHaveLength(1);
      expect(r.body.allocations[0].investorId).toBe(investisseur1Id);
      // Et rien ne s'est perdu entre le prélèvement et le partage.
      expect(r.body.ignituxCents + r.body.distributedCents).toBe(20000);
    });

    it("n'a rien versé à l'investisseur 2, qui n'est pas sur ce projet", async () => {
      const recus = await prisma.investor_movements.findMany({
        where: { investor_id: investisseur2Id, financed_project_id: projetB },
      });
      expect(recus).toEqual([]);
    });

    it('exige que la règle des 5 % soit dite explicitement', async () => {
      // Pas de défaut à `true` : tous les projets financés ne sont pas
      // entrés au capital selon le modèle 51/49. Prélever par défaut
      // reviendrait à décider à la place du porteur.
      await api(app)
        .post(`/projets-finances/${projetB}/dividendes`)
        .set(...auth(porteurB))
        .send({ amountCents: 10000, occurredOn: '2026-07-15' })
        .expect(400);
    });
  });

  describe('le portefeuille', () => {
    it("montre les deux projets de l'investisseur 1, séparés", async () => {
      const r = await api(app)
        .get('/investisseurs/moi/portefeuille')
        .set(...auth(investisseur1))
        .expect(200);

      expect(r.body.parProjet).toHaveLength(2);

      const parId = Object.fromEntries(
        r.body.parProjet.map((l: { financedProjectId: string }) => [l.financedProjectId, l]),
      );

      // Projet A : 1 000 € mis, 600 € + 10 € rendus, aucun dividende.
      expect(parId[projetA].totals.investedCents).toBe(100000);
      expect(parId[projetA].totals.repaidCents).toBe(61000);
      expect(parId[projetA].totals.dividendsCents).toBe(0);

      // Projet B : 3 000 € mis, aucun remboursement, 190 € de dividende.
      expect(parId[projetB].totals.investedCents).toBe(300000);
      expect(parId[projetB].totals.repaidCents).toBe(0);
      expect(parId[projetB].totals.dividendsCents).toBe(19000);
    });

    it('donne un global qui est exactement la somme des lignes', async () => {
      // Un total calculé à part finirait par donner une seconde réponse.
      const r = await api(app)
        .get('/investisseurs/moi/portefeuille')
        .set(...auth(investisseur1))
        .expect(200);

      const sommeDesLignes = r.body.parProjet.reduce(
        (total: number, l: { totals: { netCents: number } }) => total + l.totals.netCents,
        0,
      );
      expect(r.body.global.netCents).toBe(sommeDesLignes);
      expect(r.body.global.investedCents).toBe(400000);
    });

    it("ne montre à l'investisseur 2 que le projet où il a mis", async () => {
      const r = await api(app)
        .get('/investisseurs/moi/portefeuille')
        .set(...auth(investisseur2))
        .expect(200);

      expect(r.body.parProjet).toHaveLength(1);
      expect(r.body.parProjet[0].financedProjectId).toBe(projetA);
      expect(r.body.global.investedCents).toBe(50000);
    });

    it("refuse à l'investisseur 2 le détail d'une participation qui n'est pas la sienne", async () => {
      await api(app)
        .get(`/investisseurs/moi/participations/${partA1}`)
        .set(...auth(investisseur2))
        .expect(403);
    });

    it("permet de consulter UN projet indépendamment", async () => {
      const r = await api(app)
        .get(`/investisseurs/moi/projets/${projetB}`)
        .set(...auth(investisseur1))
        .expect(200);

      expect(r.body.totals.investedCents).toBe(300000);
      // Et rien du projet A ne s'y glisse.
      expect(r.body.totals.repaidCents).toBe(0);
    });
  });

  describe("ce qui ne s'efface pas", () => {
    it("n'expose aucune route de suppression", async () => {
      const mouvement = await prisma.investor_movements.findFirst({
        where: { financed_project_id: projetA },
      });

      // 404 : la route n'existe pas. Ce n'est pas un refus, c'est une
      // absence — un historique d'investissement qu'on peut réécrire ne
      // prouve rien.
      await api(app)
        .delete(`/mouvements-investisseurs/${mouvement!.id}`)
        .set(...auth(porteurA))
        .expect(404);
    });

    it('corrige par une écriture qui désigne celle qu\'elle rectifie', async () => {
      const mouvement = await prisma.investor_movements.findFirst({
        where: { financed_project_id: projetA, kind: 'remboursement_capital' },
        orderBy: { created_at: 'asc' },
      });

      const correction = await api(app)
        .post(`/mouvements-investisseurs/${mouvement!.id}/correction`)
        .set(...auth(porteurA))
        .send({ amountCents: -1000, occurredOn: '2026-07-02', note: 'Doublon de saisie sur VIR-001.' })
        .expect(201);

      expect(correction.body.corrects_movement_id).toBe(mouvement!.id);
      expect(correction.body.kind).toBe('correction');

      // L'original est toujours là.
      const original = await prisma.investor_movements.findUnique({ where: { id: mouvement!.id } });
      expect(original).not.toBeNull();
    });

    it('exige un motif de correction', async () => {
      const mouvement = await prisma.investor_movements.findFirst({
        where: { financed_project_id: projetA, kind: 'remboursement_capital' },
      });

      await api(app)
        .post(`/mouvements-investisseurs/${mouvement!.id}/correction`)
        .set(...auth(porteurA))
        .send({ amountCents: -100, occurredOn: '2026-07-02', note: '' })
        .expect(400);
    });

    it('rattache la correction au poste du mouvement rectifié', async () => {
      // Une correction rangée à part laisserait le montant erroné visible
      // dans son poste d'origine.
      const r = await api(app)
        .get(`/investisseurs/moi/projets/${projetA}`)
        .set(...auth(investisseur1))
        .expect(200);

      // 61 000 rendus, moins la correction de 1 000.
      expect(r.body.totals.repaidCents).toBe(60000);
    });
  });

  describe('le registre du porteur', () => {
    it('montre au porteur A ses investisseurs et ses mouvements', async () => {
      const r = await api(app)
        .get(`/projets-finances/${projetA}`)
        .set(...auth(porteurA))
        .expect(200);

      expect(r.body.raisedCents).toBe(150000);
      expect(r.body.participations).toHaveLength(2);
    });

    it("refuse au porteur B le registre du projet A", async () => {
      await api(app)
        .get(`/projets-finances/${projetA}`)
        .set(...auth(porteurB))
        .expect(404);
    });

    it("refuse à un investisseur de répartir lui-même", async () => {
      // Il consulte, il ne répartit pas.
      await api(app)
        .post(`/projets-finances/${projetA}/remboursements`)
        .set(...auth(investisseur1))
        .send({ amountCents: 100000, occurredOn: '2026-08-01' })
        .expect(404);
    });
  });

  describe("la suppression d'un compte détache au lieu d'effacer", () => {
    it("garde la participation de l'investisseur 2, sans son nom", async () => {
      // L'argent est réellement entré chez le porteur A et devra en
      // ressortir. Effacer la participation falsifierait son registre ;
      // garder le nom conserverait une donnée personnelle après effacement.
      await deleteAccount(app, investisseur2);

      const investisseur = await prisma.investors.findUnique({ where: { id: investisseur2Id } });
      expect(investisseur).not.toBeNull();
      expect(investisseur!.user_id).toBeNull();
      expect(investisseur!.display_name).toBe('Investisseur retiré');

      const participation = await prisma.participations.findUnique({ where: { id: partA2 } });
      expect(participation).not.toBeNull();
      expect(participation!.invested_cents).toBe(50000);
    });

    it("laisse le porteur A voir qu'il doit toujours cet argent", async () => {
      const r = await api(app)
        .get(`/projets-finances/${projetA}`)
        .set(...auth(porteurA))
        .expect(200);

      expect(r.body.raisedCents).toBe(150000);
      const anonyme = r.body.participations.find(
        (p: { investor: { display_name: string } }) => p.investor.display_name === 'Investisseur retiré',
      );
      expect(anonyme).toBeDefined();
    });
  });

  it('laisse le registre sans aucun défaut de séparation', async () => {
    // Le contrôle qui ne vise aucun chemin en particulier : il relit tout
    // le registre en SQL et cherche les trois défauts qui rendraient la
    // séparation fausse — un mouvement attribué au mauvais projet, un signe
    // qui contredit sa nature, une correction qui ne corrige rien.
    const audit = await investorsService.separationAudit();

    expect(audit.crossProjectMovementIds).toEqual([]);
    expect(audit.wrongSignMovementIds).toEqual([]);
    expect(audit.orphanCorrectionIds).toEqual([]);
    expect(audit.clean).toBe(true);
  });
});
