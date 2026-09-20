import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { FinanceAuditService, type FinanceAudit } from '../src/finance-audit/finance-audit.service.js';
import { InvestorsService } from '../src/investors/investors.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { api, auth, createAccount, deleteAccount, startApp, type TestAccount } from './e2e-app.js';

const compte = (audit: FinanceAudit, code: string) =>
  audit.findings.find((f) => f.code === code)?.count ?? -1;

/**
 * L'AUDIT FINANCIER, ÉPROUVÉ SUR LA VRAIE BASE.
 *
 * ── Pourquoi un audit, puisque les tests passent ────────────────────────
 *
 * Les tests disent que le code refuse ce qu'il doit refuser **au moment où
 * il écrit**. Ils ne disent rien de l'état de la base. Une migration
 * bâclée, un script lancé à la main, une version antérieure du code, un
 * import de données : rien de tout cela ne passe par les contrôles
 * d'écriture.
 *
 * Cette suite fait donc ce qu'aucune autre ne fait : elle **introduit
 * délibérément l'incohérence en SQL brut**, en contournant le service, et
 * vérifie que l'audit la trouve. Un audit qu'on ne teste que sur une base
 * saine ne prouve rien — il renverrait « tout va bien » même débranché.
 *
 * Les comptes sont pris en écart d'un point de départ, jamais en absolu :
 * la base de test est partagée avec les autres suites.
 */
describe('Audit financier (e2e)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let audit: FinanceAuditService;
  let investors: InvestorsService;

  let porteur: TestAccount;
  let investisseur: TestAccount;
  let projectId = '';
  let financedId = '';
  let investorId = '';
  let holderId = '';

  /** L'état du monde avant que cette suite n'y touche. */
  let depart: FinanceAudit;

  beforeAll(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);
    audit = app.get(FinanceAuditService);
    investors = app.get(InvestorsService);

    depart = await audit.globalAudit();

    porteur = await createAccount(app);
    investisseur = await createAccount(app);

    const projet = await api(app)
      .post('/projects')
      .set(...auth(porteur))
      .send({ title: 'Projet sous audit' })
      .expect(201);
    projectId = projet.body.id as string;

    const finance = await api(app)
      .post('/projets-finances')
      .set(...auth(porteur))
      .send({ projectId, openedOn: '2026-01-10' })
      .expect(201);
    financedId = finance.body.id as string;

    const inv = await api(app)
      .post('/investisseurs')
      .set(...auth(investisseur))
      .send({ displayName: 'Investisseuse auditée' })
      .expect(201);
    investorId = inv.body.id as string;

    // Le même humain est investisseur ET détenteur de parts : c'est le seul
    // cas où les deux vues du dividende se rencontrent.
    const holder = await api(app)
      .post(`/projects/${projectId}/financing/holders`)
      .set(...auth(porteur))
      .send({ name: 'Investisseuse auditée', isFounder: false })
      .expect(201);
    holderId = holder.body.id as string;

    await api(app)
      .post(`/projets-finances/${financedId}/participations`)
      .set(...auth(porteur))
      .send({
        investorId,
        investedCents: 300000,
        occurredOn: '2026-02-01',
        equityHolderId: holderId,
      })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.dividend_distributions.deleteMany({ where: { project_id: projectId } });
    await prisma.investor_movements.deleteMany({ where: { financed_project_id: financedId } });
    await prisma.participations.deleteMany({ where: { financed_project_id: financedId } });
    await prisma.financed_projects.deleteMany({ where: { id: financedId } });
    await prisma.investors.deleteMany({ where: { id: investorId } });

    for (const c of [porteur, investisseur]) {
      const encore = await prisma.users.findUnique({ where: { id: c.userId } });
      if (encore) await deleteAccount(app, c);
    }
    await app.close();
  });

  describe('la consolidation des deux vues du dividende', () => {
    it('un seul versement écrit les deux tables, et les relie', async () => {
      // Avant la consolidation, deux tables enregistraient un dividende sans
      // se connaître : la vue par détenteur pouvait dériver de la vue par
      // investisseur sans que rien ne le dise.
      const versement = await api(app)
        .post(`/projets-finances/${financedId}/dividendes`)
        .set(...auth(porteur))
        .send({ amountCents: 100000, occurredOn: '2026-09-30', applyPerpetualShare: false })
        .expect(201);

      expect(versement.body.distributedCents).toBe(100000);

      const mouvements = await prisma.investor_movements.findMany({
        where: { financed_project_id: financedId, kind: 'dividende' },
      });
      expect(mouvements).toHaveLength(1);

      const projections = await prisma.dividend_distributions.findMany({
        where: { project_id: projectId },
      });
      expect(projections).toHaveLength(1);

      // Le lien, qui est tout l'intérêt : la ligne au capital sait de quel
      // mouvement elle est la projection.
      expect(projections[0].investor_movement_id).toBe(mouvements[0].id);
      expect(projections[0].amount_cents).toBe(mouvements[0].amount_cents);
      expect(projections[0].holder_id).toBe(holderId);
    });

    it('les deux vues disent le même montant', async () => {
      const parInvestisseur = await api(app)
        .get('/investisseurs/moi/portefeuille')
        .set(...auth(investisseur))
        .expect(200);

      const parDetenteur = await api(app)
        .get(`/projects/${projectId}/financing/dividends`)
        .set(...auth(porteur))
        .expect(200);

      expect(parInvestisseur.body.global.dividendsCents).toBe(100000);
      const total = (parDetenteur.body.dividends ?? parDetenteur.body ?? []).reduce(
        (somme: number, d: { amount_cents: number }) => somme + d.amount_cents,
        0,
      );
      expect(total).toBe(100000);
    });

    it('et l’audit ne trouve rien à redire', async () => {
      const resultat = await audit.globalAudit();

      expect(compte(resultat, 'dividende-sans-projection')).toBe(
        compte(depart, 'dividende-sans-projection'),
      );
      expect(compte(resultat, 'double-projection')).toBe(compte(depart, 'double-projection'));
    });
  });

  describe('l’audit trouve ce qu’on lui cache', () => {
    it('une projection manquante, écrite en contournant le service', async () => {
      // On casse en SQL brut, exprès. C'est le seul moyen de savoir si
      // l'audit sert à quelque chose : sur une base saine, un audit
      // débranché renverrait « tout va bien » exactement pareil.
      const mouvement = await prisma.investor_movements.findFirst({
        where: { financed_project_id: financedId, kind: 'dividende' },
      });
      await prisma.dividend_distributions.deleteMany({
        where: { investor_movement_id: mouvement!.id },
      });

      const resultat = await audit.globalAudit();
      expect(compte(resultat, 'dividende-sans-projection')).toBe(
        compte(depart, 'dividende-sans-projection') + 1,
      );
      expect(resultat.clean).toBe(false);

      // On remet en état, en dupliquant cette fois.
      await prisma.dividend_distributions.createMany({
        data: [
          {
            project_id: projectId,
            holder_id: holderId,
            amount_cents: 100000,
            occurred_at: new Date('2026-09-30'),
            investor_movement_id: mouvement!.id,
          },
          {
            project_id: projectId,
            holder_id: holderId,
            amount_cents: 100000,
            occurred_at: new Date('2026-09-30'),
            investor_movement_id: mouvement!.id,
          },
        ],
      });
    });

    it('une double projection, que rien en base n’empêche', async () => {
      // L'unicité n'est pas posée en index : la poser exigerait un drapeau
      // de migration réservé à un consentement explicite du porteur. Cet
      // audit est donc le seul filet, et il faut vérifier qu'il tient.
      const resultat = await audit.globalAudit();
      expect(compte(resultat, 'double-projection')).toBe(compte(depart, 'double-projection') + 1);

      await prisma.dividend_distributions.deleteMany({ where: { project_id: projectId } });
    });

    it('une répartition du capital qui ne boucle pas à 100 %', async () => {
      // Le produit autorise cet état pendant la saisie, et le signale déjà
      // dans la table de capitalisation. Ce que personne ne disait, c'est
      // COMBIEN de projets y sont restés — et tant qu'ils y sont, la
      // garantie des 51 % est en sommeil sans que personne ne l'ait décidé.
      await api(app)
        .post(`/financing/holders/${holderId}/equity-events`)
        .set(...auth(porteur))
        .send({ shareBasisPoints: 4900, reason: 'Entrée', occurredAt: '2026-02-01T00:00:00.000Z' })
        .expect(201);

      const resultat = await audit.globalAudit();
      expect(compte(resultat, 'capital-incomplet')).toBe(compte(depart, 'capital-incomplet') + 1);
    });
  });

  describe('l’audit d’un projet, rendu à qui a le droit de le lire', () => {
    it('le porteur voit la cohérence de son projet', async () => {
      const resultat = await api(app)
        .get(`/projects/${projectId}/audit-financier`)
        .set(...auth(porteur))
        .expect(200);

      const incomplet = resultat.body.findings.find(
        (f: { code: string }) => f.code === 'capital-incomplet',
      );
      expect(incomplet.count).toBe(1);
      // Chaque contrôle dit POURQUOI c'est un défaut : un audit qui
      // énumère des codes sans les expliquer n'est lu par personne.
      expect(String(incomplet.why).length).toBeGreaterThan(20);
    });

    it('et il montre aussi les contrôles qui ne trouvent rien', async () => {
      // Un audit qui ne montre que les défauts ne dit pas ce qu'il a
      // regardé : on ne saurait pas distinguer « tout va bien » de « ce
      // contrôle n'existe pas ».
      const resultat = await api(app)
        .get(`/projects/${projectId}/audit-financier`)
        .set(...auth(porteur))
        .expect(200);

      const zeros = resultat.body.findings.filter((f: { count: number }) => f.count === 0);
      expect(zeros.length).toBeGreaterThan(0);
    });

    it('un inconnu n’y a pas accès', async () => {
      const intrus = await createAccount(app);
      await api(app)
        .get(`/projects/${projectId}/audit-financier`)
        .set(...auth(intrus))
        .expect(404);
      await deleteAccount(app, intrus);
    });

    it('il n’existe aucune route pour l’audit global', async () => {
      // Il parcourt les livres d'Ignitux et les registres de tous les
      // porteurs. Le publier derrière une simple authentification donnerait
      // à n'importe quel compte une vue sur l'activité de tout le monde.
      await api(app)
        .get('/audit-financier')
        .set(...auth(porteur))
        .expect(404);
    });
  });

  it('remis en état, le module ne porte plus aucun défaut de cette suite', async () => {
    // On répare ce que les tests précédents ont cassé exprès : une seule
    // projection pour le seul mouvement de dividende.
    const mouvement = await prisma.investor_movements.findFirst({
      where: { financed_project_id: financedId, kind: 'dividende' },
    });
    await prisma.dividend_distributions.create({
      data: {
        project_id: projectId,
        holder_id: holderId,
        amount_cents: mouvement!.amount_cents,
        occurred_at: new Date('2026-09-30'),
        investor_movement_id: mouvement!.id,
      },
    });

    // Et le capital : 49 % pour l'investisseuse, 51 % pour le porteur.
    const porteurHolder = await api(app)
      .post(`/projects/${projectId}/financing/holders`)
      .set(...auth(porteur))
      .send({ name: 'Le porteur', isFounder: true })
      .expect(201);

    await api(app)
      .post(`/financing/holders/${porteurHolder.body.id}/equity-events`)
      .set(...auth(porteur))
      .send({ shareBasisPoints: 5100, reason: 'Modèle 51/49', occurredAt: '2026-02-02T00:00:00.000Z' })
      .expect(201);

    const resultat = await audit.globalAudit();

    for (const code of [
      'capital-incomplet',
      'dividende-sans-projection',
      'double-projection',
      'projection-sans-mouvement',
    ]) {
      expect({ code, count: compte(resultat, code) }).toEqual({
        code,
        count: compte(depart, code),
      });
    }

    // Et les contrôles de séparation, eux, n'ont jamais bougé.
    const separation = await investors.separationAudit();
    expect(separation.clean).toBe(true);
  });
});
