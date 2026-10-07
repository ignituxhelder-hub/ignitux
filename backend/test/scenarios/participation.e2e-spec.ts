import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { OffresService } from '../../src/offres/offres.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { api, auth, createAccount, deleteAccount, startApp, type TestAccount } from '../e2e-app.js';

/**
 * SCÉNARIO — LA PARTICIPATION IGNITUX, DE 51/49 À 100/0, PUIS LES DIVIDENDES.
 *
 * Trois couches, vérifiées séparément contre une vraie base :
 *   1. le capital (qui détient quelle part, et son historique) ;
 *   2. le droit économique (un pourcentage des dividendes distribués, qui ne
 *      commence qu'à 100/0 et n'est jamais écrit dans le capital) ;
 *   3. l'accès à l'écosystème (porté par l'accord, indépendant du capital).
 *
 * Les pourcentages intermédiaires de ce scénario (64/36, 88/12) ne sont PAS
 * ceux de l'exemple du modèle : chaque accord porte les siens, et le test
 * existe aussi pour le prouver. Aucun palier n'a de date ni de durée.
 *
 * Ce scénario éprouve aussi ce que les tests unitaires ne peuvent pas : les
 * clés étrangères (détenteurs en NoAction), et la suppression d'un compte qui
 * emporte l'accord avec le projet.
 */
describe('SCÉNARIO — participation IGNITUX', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let offres: OffresService;

  let porteuse: TestAccount;
  let ignitux: TestAccount;
  let operateursInitiaux: string | undefined;

  let projectId = '';
  const milestoneIds: string[] = [];

  beforeAll(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);
    offres = app.get(OffresService);
    porteuse = await createAccount(app);
    ignitux = await createAccount(app);

    // IGNITUX = la liste d'e-mails, lue à chaque appel.
    operateursInitiaux = process.env.IGNITUX_OPERATEURS;
    process.env.IGNITUX_OPERATEURS = ignitux.email;

    const projet = await api(app)
      .post('/projects')
      .set(...auth(porteuse))
      .send({ title: 'Ateliers Boussole' })
      .expect(201);
    projectId = projet.body.id;
  });

  afterAll(async () => {
    if (operateursInitiaux === undefined) delete process.env.IGNITUX_OPERATEURS;
    else process.env.IGNITUX_OPERATEURS = operateursInitiaux;

    // Supprimer le compte emporte le projet, donc l'accord, ses paliers et ses
    // lignes — malgré les clés étrangères des détenteurs en NoAction.
    for (const compte of [porteuse, ignitux]) {
      const encore = await prisma.users.findUnique({ where: { id: compte.userId } });
      if (encore) await deleteAccount(app, compte);
    }
    await app.close();
  });

  const lireParticipation = () =>
    api(app)
      .get(`/projects/${projectId}/participation`)
      .set(...auth(porteuse))
      .expect(200);

  const partsActuelles = async () => {
    const { body } = await lireParticipation();
    const part = (estPorteur: boolean) =>
      body.capital.holders.find((h: { isFounder: boolean }) => h.isFounder === estPorteur)
        .shareBasisPoints as number;
    return { porteur: part(true), ignitux: part(false) };
  };

  describe('1. l’accord', () => {
    it('sans accord, le projet n’a rien de plus qu’avant', async () => {
      const { body } = await lireParticipation();
      expect(body.agreement).toBeNull();
    });

    it('l’entrepreneur ne s’écrit pas son propre accord', async () => {
      await api(app)
        .post(`/projects/${projectId}/participation/agreement`)
        .set(...auth(porteuse))
        .send({ founderName: 'Camille', effectiveOn: '2026-10-01' })
        .expect(403);
    });

    it('IGNITUX crée l’accord : 51/49, 5 % et l’offre construction, par défaut', async () => {
      const { body } = await api(app)
        .post(`/projects/${projectId}/participation/agreement`)
        .set(...auth(ignitux))
        .send({ founderName: 'Camille Porteuse', effectiveOn: '2026-10-01' })
        .expect(201);

      expect(body).toMatchObject({
        initial_founder_bps: 5100,
        initial_ignitux_bps: 4900,
        dividend_right_bps: 500,
        ecosystem_offre: 'construction',
        status: 'actif',
      });
      await expect(partsActuelles()).resolves.toEqual({ porteur: 5100, ignitux: 4900 });
    });

    it('un second accord sur le même projet est refusé', async () => {
      await api(app)
        .post(`/projects/${projectId}/participation/agreement`)
        .set(...auth(ignitux))
        .send({ founderName: 'Camille Porteuse', effectiveOn: '2026-10-01' })
        .expect(409);
    });

    it('le porteur ne peut pas contourner l’accord en saisissant les parts à la main', async () => {
      const { body } = await api(app)
        .get(`/projects/${projectId}/financing/cap-table`)
        .set(...auth(porteuse))
        .expect(200);
      const ignituxHolder = body.holders.find((h: { isFounder: boolean }) => !h.isFounder);

      await api(app)
        .post(`/financing/holders/${ignituxHolder.holderId}/equity-events`)
        .set(...auth(porteuse))
        .send({ shareBasisPoints: 0, reason: 'Je sors IGNITUX', occurredAt: '2026-11-01T00:00:00.000Z' })
        .expect(400);
      await api(app)
        .delete(`/financing/holders/${ignituxHolder.holderId}`)
        .set(...auth(porteuse))
        .expect(400);

      await expect(partsActuelles()).resolves.toEqual({ porteur: 5100, ignitux: 4900 });
    });
  });

  describe('2. les paliers — jamais le temps, toujours IGNITUX', () => {
    it('IGNITUX prévoit trois paliers avec des pourcentages libres', async () => {
      for (const [cible, condition] of [
        [3600, 'Première condition écrite pour ce projet'],
        [1200, 'Deuxième condition'],
        [0, 'Troisième condition'],
      ] as const) {
        const { body } = await api(app)
          .post(`/projects/${projectId}/participation/milestones`)
          .set(...auth(ignitux))
          .send({ targetIgnituxBasisPoints: cible, conditions: [condition] })
          .expect(201);
        milestoneIds.push(body.id);
      }
      expect(milestoneIds).toHaveLength(3);
    });

    it('un palier qui ferait remonter la part d’IGNITUX est refusé', async () => {
      await api(app)
        .post(`/projects/${projectId}/participation/milestones`)
        .set(...auth(ignitux))
        .send({ targetIgnituxBasisPoints: 3000 })
        .expect(400);
    });

    it('l’entrepreneur ne peut ni ajouter, ni valider, ni exécuter un palier', async () => {
      await api(app)
        .post(`/projects/${projectId}/participation/milestones`)
        .set(...auth(porteuse))
        .send({ targetIgnituxBasisPoints: 100 })
        .expect(403);
      await api(app)
        .post(`/participation/milestones/${milestoneIds[0]}/validate`)
        .set(...auth(porteuse))
        .send({})
        .expect(403);
      await api(app)
        .post(`/participation/milestones/${milestoneIds[0]}/execute`)
        .set(...auth(porteuse))
        .send({ effectiveOn: '2027-01-01' })
        .expect(403);
    });

    it('prendre connaissance d’un palier ne le valide pas', async () => {
      await api(app)
        .post(`/participation/milestones/${milestoneIds[0]}/acknowledge`)
        .set(...auth(porteuse))
        .expect(200);

      await api(app)
        .post(`/participation/milestones/${milestoneIds[0]}/execute`)
        .set(...auth(ignitux))
        .send({ effectiveOn: '2027-01-01' })
        .expect(400);
      await expect(partsActuelles()).resolves.toEqual({ porteur: 5100, ignitux: 4900 });
    });

    it('on ne saute pas un palier', async () => {
      await api(app)
        .post(`/participation/milestones/${milestoneIds[1]}/validate`)
        .set(...auth(ignitux))
        .send({ note: 'Trop tôt' })
        .expect(400);
    });

    it('51/49 → 64/36 → 88/12 → 100/0, chaque palier validé puis exécuté par IGNITUX', async () => {
      const attendu = [
        { porteur: 6400, ignitux: 3600 },
        { porteur: 8800, ignitux: 1200 },
        { porteur: 10000, ignitux: 0 },
      ];

      for (const [index, id] of milestoneIds.entries()) {
        await api(app)
          .post(`/participation/milestones/${id}/validate`)
          .set(...auth(ignitux))
          .send({ note: 'Conditions constatées' })
          .expect(200);
        await api(app)
          .post(`/participation/milestones/${id}/execute`)
          .set(...auth(ignitux))
          .send({ effectiveOn: `2027-0${index + 1}-15` })
          .expect(200);

        await expect(partsActuelles()).resolves.toEqual(attendu[index]);
      }
    });

    it('l’historique du capital est complet : rien n’a été écrasé', async () => {
      const { body } = await lireParticipation();

      expect(body.phase).toBe('transmise');
      // 2 événements de départ + 3 paliers × 2.
      expect(body.history).toHaveLength(8);
      expect(body.agreement.status).toBe('transmis');
      expect(body.agreement.transmitted_on).not.toBeNull();
    });
  });

  describe('3. le droit économique — séparé du capital', () => {
    it('un dividende distribué donne 500 € à IGNITUX sur 10 000 €, et rien dans le capital', async () => {
      const avant = await prisma.equity_events.count({ where: { project_id: projectId } });

      const { body } = await api(app)
        .post(`/projects/${projectId}/participation/dividends`)
        .set(...auth(porteuse))
        .send({ distributedCents: 1_000_000, occurredOn: '2031-12-31' })
        .expect(201);

      expect(body).toMatchObject({ distributed_cents: 1_000_000, right_bps: 500, due_cents: 50_000, status: 'du' });
      // Le droit n'est jamais une part de capital.
      expect(await prisma.equity_events.count({ where: { project_id: projectId } })).toBe(avant);
      await expect(partsActuelles()).resolves.toEqual({ porteur: 10000, ignitux: 0 });
    });

    it('un dividende nul ne produit aucune ligne', async () => {
      await api(app)
        .post(`/projects/${projectId}/participation/dividends`)
        .set(...auth(porteuse))
        .send({ distributedCents: 0, occurredOn: '2032-01-01' })
        .expect(400);
    });

    it('le règlement est réservé à IGNITUX', async () => {
      const { body } = await lireParticipation();
      const ligne = body.dividendRight.entries[0];

      await api(app)
        .post(`/participation/dividend-rights/${ligne.id}/settle`)
        .set(...auth(porteuse))
        .send({ settledOn: '2032-01-15' })
        .expect(403);
      await api(app)
        .post(`/participation/dividend-rights/${ligne.id}/settle`)
        .set(...auth(ignitux))
        .send({ settledOn: '2032-01-15' })
        .expect(200);
    });
  });

  describe('4. l’accès à l’écosystème — indépendant du capital', () => {
    it('à 0 % du capital, l’entrepreneur garde l’offre de son accord', async () => {
      await expect(partsActuelles()).resolves.toEqual({ porteur: 10000, ignitux: 0 });
      await expect(offres.offreDe(porteuse.userId)).resolves.toBe('construction');

      const { body } = await lireParticipation();
      expect(body.ecosystem).toMatchObject({ offre: 'construction', active: true });
    });
  });

  describe('5. la suppression du compte', () => {
    it('emporte l’accord avec le projet, sans buter sur les clés des détenteurs', async () => {
      await deleteAccount(app, porteuse);

      expect(await prisma.participation_agreements.count({ where: { project_id: projectId } })).toBe(0);
      expect(await prisma.equity_holders.count({ where: { project_id: projectId } })).toBe(0);
      expect(await prisma.participation_milestones.count({ where: { id: { in: milestoneIds } } })).toBe(0);
    });
  });
});
