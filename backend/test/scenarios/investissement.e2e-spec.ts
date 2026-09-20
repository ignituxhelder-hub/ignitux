import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { InvestorsService } from '../../src/investors/investors.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { api, auth, createAccount, deleteAccount, startApp, type TestAccount } from '../e2e-app.js';

/**
 * SCÉNARIO — ENTREPRENEUR → INVESTISSEUR → PARTICIPATION → DIVIDENDES.
 *
 * ── L'angle, qui n'est testé nulle part ailleurs ─────────────────────────
 *
 * La suite du module investisseurs vérifie que deux projets ne se mélangent
 * pas. Elle suppose, sans le dire, que chaque personne n'a qu'un rôle.
 *
 * Or le cas normal est l'inverse : **Camille porte son projet et investit
 * dans celui de Bruno ; Bruno fait de même.** Chacun est donc, pour le même
 * compte, porteur d'un côté et investisseur de l'autre. Si le produit
 * confond les deux rôles, ce qu'elle a reçu comme porteuse apparaîtra dans
 * son portefeuille d'investisseuse — et son rendement sera faux.
 *
 * Le parcours suit l'argent dans les deux sens et vérifie, à la fin, que
 * chaque rôle ne voit que ce qui le concerne.
 */
describe('SCÉNARIO — porteuse chez elle, investisseuse chez lui', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let investorsService: InvestorsService;

  let camille: TestAccount;
  let bruno: TestAccount;

  /** Camille et Bruno, vus comme investisseurs. */
  let camilleInvestisseur = '';
  let brunoInvestisseur = '';
  /** Le projet de Camille, et celui de Bruno. */
  let chezCamille = '';
  let chezBruno = '';

  beforeAll(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);
    investorsService = app.get(InvestorsService);
    camille = await createAccount(app);
    bruno = await createAccount(app);
  });

  afterAll(async () => {
    // Rien ne se supprime par le produit dans ce module : la suite range
    // elle-même ce qu'elle a posé.
    const financedIds = [chezCamille, chezBruno].filter(Boolean);
    if (financedIds.length > 0) {
      await prisma.investor_movements.deleteMany({
        where: { financed_project_id: { in: financedIds } },
      });
      await prisma.participations.deleteMany({
        where: { financed_project_id: { in: financedIds } },
      });
      await prisma.financed_projects.deleteMany({ where: { id: { in: financedIds } } });
    }
    await prisma.investors.deleteMany({
      where: { id: { in: [camilleInvestisseur, brunoInvestisseur].filter(Boolean) } },
    });

    for (const compte of [camille, bruno]) {
      const encore = await prisma.users.findUnique({ where: { id: compte.userId } });
      if (encore) await deleteAccount(app, compte);
    }
    await app.close();
  });

  describe('1. chacun ouvre son projet au financement', () => {
    it('le porteur déclare ce qu’il cherche à lever', async () => {
      const ouvrir = async (compte: TestAccount, titre: string, cible: number) => {
        const projet = await api(app)
          .post('/projects')
          .set(...auth(compte))
          .send({ title: titre })
          .expect(201);

        const finance = await api(app)
          .post('/projets-finances')
          .set(...auth(compte))
          .send({ projectId: projet.body.id, openedOn: '2026-01-10', targetCents: cible })
          .expect(201);

        // Le titre est recopié à l'ouverture : le registre doit rester
        // lisible le jour où le projet n'existera plus.
        expect(finance.body.project_title).toBe(titre);
        return finance.body.id as string;
      };

      chezCamille = await ouvrir(camille, 'Ateliers Boussole', 2_000_000);
      chezBruno = await ouvrir(bruno, 'Menuiserie Martel', 5_000_000);
    });

    it('un projet ne s’ouvre pas deux fois', async () => {
      const projets = await api(app)
        .get('/projects')
        .set(...auth(camille))
        .expect(200);

      await api(app)
        .post('/projets-finances')
        .set(...auth(camille))
        .send({ projectId: projets.body[0].id, openedOn: '2026-01-10' })
        .expect(400);
    });
  });

  describe('2. chacun se déclare investisseur de l’autre', () => {
    it('la déclaration est un acte volontaire, pas un effet de bord', async () => {
      // On n'est pas investisseur parce qu'on a un compte : on le devient
      // parce qu'on le dit.
      await api(app)
        .get('/investisseurs/moi')
        .set(...auth(camille))
        .expect(404);

      const c = await api(app)
        .post('/investisseurs')
        .set(...auth(camille))
        .send({ displayName: 'Camille Rousseau' })
        .expect(201);
      camilleInvestisseur = c.body.id as string;

      const b = await api(app)
        .post('/investisseurs')
        .set(...auth(bruno))
        .send({ displayName: 'Bruno Martel' })
        .expect(201);
      brunoInvestisseur = b.body.id as string;
    });

    it('on ne se déclare pas deux fois', async () => {
      await api(app)
        .post('/investisseurs')
        .set(...auth(camille))
        .send({ displayName: 'Camille encore' })
        .expect(400);
    });
  });

  describe('3. l’argent circule dans les deux sens', () => {
    it('Bruno met 2 000 € chez Camille, Camille met 1 000 € chez Bruno', async () => {
      await api(app)
        .post(`/projets-finances/${chezCamille}/participations`)
        .set(...auth(camille))
        .send({ investorId: brunoInvestisseur, investedCents: 200000, occurredOn: '2026-02-01' })
        .expect(201);

      await api(app)
        .post(`/projets-finances/${chezBruno}/participations`)
        .set(...auth(bruno))
        .send({ investorId: camilleInvestisseur, investedCents: 100000, occurredOn: '2026-02-05' })
        .expect(201);
    });

    it('c’est le porteur qui enregistre l’apport, pas l’investisseur', async () => {
      // Bruno a beau être l'investisseur chez Camille, il n'écrit pas dans
      // le registre de Camille.
      await api(app)
        .post(`/projets-finances/${chezCamille}/participations`)
        .set(...auth(bruno))
        .send({ investorId: brunoInvestisseur, investedCents: 999999, occurredOn: '2026-02-01' })
        .expect(404);
    });
  });

  describe('4. les dividendes tombent, chacun de son côté', () => {
    it('Camille verse 500 € sur SON projet — Bruno les reçoit', async () => {
      const versement = await api(app)
        .post(`/projets-finances/${chezCamille}/dividendes`)
        .set(...auth(camille))
        .send({ amountCents: 50000, occurredOn: '2026-09-30', applyPerpetualShare: true })
        .expect(201);

      expect(versement.body.ignituxCents).toBe(2500);
      expect(versement.body.allocations).toHaveLength(1);
      expect(versement.body.allocations[0].investorId).toBe(brunoInvestisseur);
      expect(versement.body.allocations[0].amountCents).toBe(47500);
    });

    it('Bruno verse 300 € sur LE SIEN — Camille les reçoit', async () => {
      const versement = await api(app)
        .post(`/projets-finances/${chezBruno}/dividendes`)
        .set(...auth(bruno))
        .send({ amountCents: 30000, occurredOn: '2026-09-30', applyPerpetualShare: false })
        .expect(201);

      // Pas de prélèvement ici : Bruno a dit que la règle ne s'applique pas
      // à son projet, et le produit ne devine pas.
      expect(versement.body.ignituxCents).toBe(0);
      expect(versement.body.allocations[0].investorId).toBe(camilleInvestisseur);
      expect(versement.body.allocations[0].amountCents).toBe(30000);
    });
  });

  describe('5. LE test — les deux rôles ne se confondent pas', () => {
    it('le portefeuille d’investisseuse de Camille ne parle QUE du projet de Bruno', async () => {
      // Si les rôles se mélangeaient, elle verrait ici les 500 € qu'elle a
      // versés comme porteuse, ou les 2 000 € que Bruno a mis chez elle. Son
      // rendement serait faux, et faux dans le sens flatteur.
      const portefeuille = await api(app)
        .get('/investisseurs/moi/portefeuille')
        .set(...auth(camille))
        .expect(200);

      expect(portefeuille.body.parProjet).toHaveLength(1);
      expect(portefeuille.body.parProjet[0].financedProjectId).toBe(chezBruno);
      expect(portefeuille.body.parProjet[0].projectTitle).toBe('Menuiserie Martel');

      // Elle a mis 1 000 € et reçu 300 € de dividende. Rien d'autre.
      expect(portefeuille.body.global.investedCents).toBe(100000);
      expect(portefeuille.body.global.dividendsCents).toBe(30000);
      expect(portefeuille.body.global.repaidCents).toBe(0);
    });

    it('et son registre de porteuse ne parle QUE de ce que Bruno a mis chez elle', async () => {
      const registre = await api(app)
        .get(`/projets-finances/${chezCamille}`)
        .set(...auth(camille))
        .expect(200);

      expect(registre.body.raisedCents).toBe(200000);
      expect(registre.body.participations).toHaveLength(1);
      expect(registre.body.participations[0].investor.display_name).toBe('Bruno Martel');
    });

    it('symétriquement pour Bruno, sans exception', async () => {
      const portefeuille = await api(app)
        .get('/investisseurs/moi/portefeuille')
        .set(...auth(bruno))
        .expect(200);

      expect(portefeuille.body.parProjet).toHaveLength(1);
      expect(portefeuille.body.parProjet[0].financedProjectId).toBe(chezCamille);
      expect(portefeuille.body.global.investedCents).toBe(200000);
      expect(portefeuille.body.global.dividendsCents).toBe(47500);
    });

    it('aucun des deux ne lit le registre de l’autre', async () => {
      await api(app)
        .get(`/projets-finances/${chezBruno}`)
        .set(...auth(camille))
        .expect(404);
    });
  });

  describe('6. une erreur se corrige, elle ne s’efface pas', () => {
    it('la correction se rattache au poste qu’elle rectifie', async () => {
      const dividende = await prisma.investor_movements.findFirst({
        where: { financed_project_id: chezBruno, kind: 'dividende' },
      });

      await api(app)
        .post(`/mouvements-investisseurs/${dividende!.id}/correction`)
        .set(...auth(bruno))
        .send({
          amountCents: -5000,
          occurredOn: '2026-10-01',
          note: 'Dividende surévalué de 50 € : erreur de saisie.',
        })
        .expect(201);

      // Camille voit son dividende corrigé, pas une ligne « correction »
      // posée à côté qui laisserait le montant faux visible.
      const portefeuille = await api(app)
        .get('/investisseurs/moi/portefeuille')
        .set(...auth(camille))
        .expect(200);

      expect(portefeuille.body.global.dividendsCents).toBe(25000);

      // Et l'original est toujours là.
      const original = await prisma.investor_movements.findUnique({
        where: { id: dividende!.id },
      });
      expect(original).not.toBeNull();
    });
  });

  it('le registre entier est sans défaut de séparation', async () => {
    const audit = await investorsService.separationAudit();
    expect(audit.clean).toBe(true);
  });
});
