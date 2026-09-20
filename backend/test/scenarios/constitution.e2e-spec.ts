import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { api, auth, createAccount, deleteAccount, startApp, type TestAccount } from '../e2e-app.js';

interface LigneAudit {
  slug: string;
  title: string;
  enforcement: string;
  measured: string | null;
  violationsLast30Days: number;
}

const article22 = (audit: LigneAudit[]) =>
  audit.find((l) => l.slug === 'v1-22-financement-ethique')!;

/**
 * SCÉNARIO — CONSTITUTION → VIOLATIONS → AUDIT.
 *
 * ── La chaîne que personne ne suit ──────────────────────────────────────
 *
 * Trois choses sont testées séparément aujourd'hui : les règles refusent ce
 * qu'elles doivent refuser, le journal enregistre, l'audit répond. Chacune
 * passe. Mais **rien ne vérifie qu'elles sont reliées** : un refus pourrait
 * très bien ne jamais atteindre le journal, ou l'audit compter autre chose
 * que ce que le journal contient, sans qu'aucune suite ne bronche.
 *
 * Ici on tire le fil : une action est refusée, on la retrouve dans le
 * journal **de la personne concernée**, et on vérifie que l'audit de
 * l'article a bougé **d'exactement un**.
 *
 * Le dernier acte est le plus important. Après la suppression du compte, le
 * refus doit rester compté : une Constitution dont on peut effacer
 * l'historique en fermant son compte ne prouve rien.
 */
describe('SCÉNARIO — un refus, son journal, son audit', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let porteuse: TestAccount;
  let temoin: TestAccount;
  let projectId: string;
  let compteIgnitux = '';
  let compteAmoi = '';

  /** Le compte de violations de l'article 22 avant que le parcours ne commence. */
  let depart = 0;
  /**
   * Les identifiants des deux refus provoqués par le parcours.
   *
   * Retenus maintenant parce qu'après la suppression du compte il n'y aura
   * plus rien pour les retrouver : `user_id` passe à null, et le refus venu
   * de la comptabilité n'a pas de projet — le grand livre n'est pas
   * rattaché à un projet, c'est voulu.
   */
  const refusDuParcours: string[] = [];

  beforeAll(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);
    porteuse = await createAccount(app);
    temoin = await createAccount(app);

    const projet = await api(app)
      .post('/projects')
      .set(...auth(porteuse))
      .send({ title: 'Projet sous Constitution' })
      .expect(201);
    projectId = projet.body.id as string;
  });

  afterAll(async () => {
    const encore = await prisma.users.findUnique({ where: { id: porteuse.userId } });
    if (encore) await deleteAccount(app, porteuse);
    await deleteAccount(app, temoin);
    await app.close();
  });

  describe('1. le texte se lit avant même d’avoir un compte', () => {
    it('préambule, articles et règles sont publics', async () => {
      // Quelqu'un qui hésite à s'inscrire doit pouvoir lire ce qui gouverne
      // le produit auquel il va confier son projet.
      await api(app).get('/constitution/preamble').expect(200);

      const articles = await api(app).get('/constitution/articles').expect(200);
      expect(articles.body).toHaveLength(24);

      const regles = await api(app).get('/constitution/rules').expect(200);
      expect(regles.body.length).toBeGreaterThan(0);
    });

    it('mais l’audit et le journal, non', async () => {
      // L'audit compte sur toute la base : le volume d'activité d'Ignitux
      // n'est pas à rendre à qui passe.
      await api(app).get('/constitution/audit').expect(401);
      await api(app).get('/constitution/violations').expect(401);
    });

    it('chaque article « appliqué » nomme une règle qui l’applique', async () => {
      const articles = await api(app).get('/constitution/articles').expect(200);
      const regles = await api(app).get('/constitution/rules').expect(200);

      const couverts = new Set(regles.body.map((r: { articleSlug: string }) => r.articleSlug));
      const appliques = articles.body.filter(
        (a: { enforcement: string }) => a.enforcement === 'enforced',
      );

      expect(appliques.length).toBeGreaterThan(0);
      for (const article of appliques) {
        // L'article 24 (Constitution Suprême) est la seule exception, et
        // elle est assumée dans le code : il porte sur le corpus lui-même,
        // pas sur une action. C'est le test de couverture qui le vérifie,
        // pas une règle d'exécution — il n'y a aucune action à intercepter.
        if (article.slug === 'v1-24-constitution-supreme') continue;
        expect(couverts.has(article.slug)).toBe(true);
      }
    });
  });

  describe('2. l’audit dit où l’on en est, avant tout incident', () => {
    it('il ne fabrique aucun pourcentage global', async () => {
      // Agréger des articles hétérogènes en un « 87 % constitutionnel »
      // serait précisément le score inventé que l'article 10 interdit.
      const audit = await api(app)
        .get('/constitution/audit')
        .set(...auth(porteuse))
        .expect(200);

      expect(Array.isArray(audit.body)).toBe(true);
      expect(audit.body).toHaveLength(24);
      expect(audit.body).not.toHaveProperty('score');
      expect(audit.body).not.toHaveProperty('pourcentage');

      depart = article22(audit.body).violationsLast30Days;
    });

    it('et il écrit « non mesurable » plutôt qu’un chiffre rassurant', async () => {
      const audit = await api(app)
        .get('/constitution/audit')
        .set(...auth(porteuse))
        .expect(200);

      // Certains articles sont déclarés sans être vérifiables : leur ligne
      // `measured` vaut null, et c'est une réponse honnête, pas un trou.
      const declares = audit.body.filter(
        (l: LigneAudit) => l.enforcement === 'declared' && l.measured === null,
      );
      expect(declares.length).toBeGreaterThan(0);
    });
  });

  describe('3. la porteuse se heurte à une limite', () => {
    it('céder la majorité lui est refusé en 422', async () => {
      const moi = await api(app)
        .post(`/projects/${projectId}/financing/holders`)
        .set(...auth(porteuse))
        .send({ name: 'La porteuse', isFounder: true })
        .expect(201);

      const eux = await api(app)
        .post(`/projects/${projectId}/financing/holders`)
        .set(...auth(porteuse))
        .send({ name: 'Un investisseur', isFounder: false })
        .expect(201);

      await api(app)
        .post(`/financing/holders/${moi.body.id}/equity-events`)
        .set(...auth(porteuse))
        .send({ shareBasisPoints: 4000, reason: 'Cession', occurredAt: '2026-02-01T00:00:00.000Z' })
        .expect(201);

      const refus = await api(app)
        .post(`/financing/holders/${eux.body.id}/equity-events`)
        .set(...auth(porteuse))
        .send({ shareBasisPoints: 6000, reason: 'Entrée', occurredAt: '2026-02-01T00:00:00.000Z' })
        .expect(422);

      // Un 422, pas un 400 : ce n'est pas une saisie malformée, c'est une
      // limite du produit. Confondre les deux les rendrait illisibles.
      expect(String(refus.body.message)).toContain('Constitution');
    });

    it('le refus atterrit dans SON journal', async () => {
      const journal = await api(app)
        .get('/constitution/violations')
        .set(...auth(porteuse))
        .expect(200);

      const refus = journal.body.find(
        (v: { rule_id: string }) => v.rule_id === 'majorite-du-porteur',
      );
      expect(refus).toBeDefined();
      expect(refus.severity).toBe('blocking');
      expect(refus.project_id).toBe(projectId);
      refusDuParcours.push(refus.id as string);
    });

    it('et dans celui de personne d’autre', async () => {
      const journalDuTemoin = await api(app)
        .get('/constitution/violations')
        .set(...auth(temoin))
        .expect(200);

      expect(journalDuTemoin.body).toEqual([]);
    });

    it('l’audit de l’article 22 a bougé d’exactement un', async () => {
      // LE maillon que rien ne testait. Le journal pourrait très bien
      // enregistrer sans que l'audit compte, ou l'audit compter autre chose
      // que ce que le journal contient.
      const audit = await api(app)
        .get('/constitution/audit')
        .set(...auth(porteuse))
        .expect(200);

      expect(article22(audit.body).violationsLast30Days).toBe(depart + 1);
    });
  });

  describe('4. une seconde limite, d’une autre règle, sur le même article', () => {
    it('mélanger les caisses est refusé aussi', async () => {
      const banque = await api(app)
        .post('/comptabilite/comptes')
        .set(...auth(porteuse))
        .send({ code: '512', label: 'Banque', kind: 'actif' })
        .expect(201);
      compteAmoi = banque.body.id as string;

      // Un compte d'Ignitux, dont l'identifiant est donné exprès : le refus
      // ne doit pas reposer sur le fait qu'il soit difficile à deviner.
      const ignitux = await prisma.ledger_accounts.findFirst({
        where: { owner_type: 'ignitux', code: '512' },
      });
      compteIgnitux = ignitux!.id;

      await api(app)
        .post('/comptabilite/ecritures')
        .set(...auth(porteuse))
        .send({
          occurredOn: '2026-09-20',
          label: 'Tentative de mélange',
          lines: [
            { accountId: compteAmoi, debitCents: 50000, creditCents: 0 },
            { accountId: compteIgnitux, debitCents: 0, creditCents: 50000 },
          ],
        })
        .expect(422);
    });

    it('l’audit compte maintenant deux refus sur cet article', async () => {
      const audit = await api(app)
        .get('/constitution/audit')
        .set(...auth(porteuse))
        .expect(200);

      expect(article22(audit.body).violationsLast30Days).toBe(depart + 2);
    });

    it('et le journal les distingue par leur règle', async () => {
      const journal = await api(app)
        .get('/constitution/violations')
        .set(...auth(porteuse))
        .expect(200);

      const regles = journal.body.map((v: { rule_id: string }) => v.rule_id);
      expect(regles).toContain('majorite-du-porteur');
      expect(regles).toContain('caisses-separees');

      const melange = journal.body.find(
        (v: { rule_id: string }) => v.rule_id === 'caisses-separees',
      );
      // Ce refus-là n'a pas de projet, et c'est normal : le grand livre
      // appartient à une personne, pas à un projet.
      expect(melange.project_id).toBeNull();
      refusDuParcours.push(melange.id as string);
    });
  });

  describe('5. elle ferme son compte — et l’histoire reste', () => {
    it('ses refus survivent, sans son nom', async () => {
      await deleteAccount(app, porteuse);

      // On interroge par identifiant, retenu avant la suppression : après
      // elle, plus rien ne permettrait de les retrouver.
      const refus = await prisma.constitution_violations.findMany({
        where: { id: { in: refusDuParcours } },
      });

      // Deux refus, toujours là.
      expect(refusDuParcours).toHaveLength(2);
      expect(refus).toHaveLength(2);
      // Et plus personne derrière.
      for (const ligne of refus) {
        expect(ligne.user_id).toBeNull();
      }
    });

    it('l’audit compte toujours les deux', async () => {
      // Le test qui donne son sens à tout le fichier : une Constitution dont
      // on peut effacer l'historique en fermant son compte ne prouve rien.
      const audit = await api(app)
        .get('/constitution/audit')
        .set(...auth(temoin))
        .expect(200);

      expect(article22(audit.body).violationsLast30Days).toBe(depart + 2);
    });

    it('mais plus personne ne peut les lire depuis un compte', async () => {
      // Anonymisés, ils n'appartiennent plus à personne : le journal
      // personnel du témoin reste vide.
      const journal = await api(app)
        .get('/constitution/violations')
        .set(...auth(temoin))
        .expect(200);

      expect(journal.body).toEqual([]);
    });
  });
});
