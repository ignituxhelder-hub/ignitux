import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { BAREME, CREDITS_BIENVENUE } from '../src/credits/bareme.js';
import { CreditsInsuffisantsException } from '../src/credits/credits-insuffisants.js';
import { CreditsService, MOTIF_ORPHELIN } from '../src/credits/credits.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { api, auth, createAccount, deleteAccount, startApp, type TestAccount } from './e2e-app.js';

/**
 * LES CRÉDITS, ÉPROUVÉS SUR LA VRAIE BASE.
 *
 * Les tests unitaires du service tournent sur une fausse base qui imite le
 * verrou de ligne ; ceux-ci prouvent que Postgres fait vraiment ce que la
 * fausse base promet : `SELECT … FOR NO KEY UPDATE` met deux réservations en
 * file, l'unicité du remboursement tient sous deux appels simultanés, la
 * bienvenue ne se verse qu'une fois — et le SQL brut du rattrapage et de
 * l'exclusivité (anti-jointures, casts `::uuid`, dates) passe tel quel.
 */
describe('Crédits (e2e)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let credits: CreditsService;
  const comptes: TestAccount[] = [];
  const appelsJournalises: string[] = [];
  // Deux comptes pour toute la suite : l'inscription est limitée à 5 par
  // minute, et chaque test repart d'un journal vidé.
  let premier: TestAccount;
  let second: TestAccount;

  /** Vide le journal du compte, puis lui donne exactement `solde` crédits. */
  async function avecSolde(compte: TestAccount, solde: number): Promise<TestAccount> {
    await prisma.credit_entries.deleteMany({ where: { owner_id: compte.userId } });
    await prisma.credit_entries.create({
      data: { owner_id: compte.userId, kind: 'bienvenue', credits: CREDITS_BIENVENUE, motif: 'test e2e' },
    });
    if (solde !== CREDITS_BIENVENUE) {
      await credits.crediter({
        ownerId: compte.userId,
        actorId: null,
        kind: 'ajustement_admin',
        credits: solde - CREDITS_BIENVENUE,
        motif: 'test e2e',
      });
    }
    expect(await credits.solde(compte.userId)).toBe(solde);
    return compte;
  }

  const reservation = (ownerId: string, generator: keyof typeof BAREME, projectId: string | null = null) => ({
    ownerId,
    actorId: ownerId,
    generator,
    projectId,
    appelId: randomUUID(),
  });

  beforeAll(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);
    credits = app.get(CreditsService);
    premier = await createAccount(app);
    second = await createAccount(app);
    comptes.push(premier, second);
  });

  afterAll(async () => {
    // Les lignes de coût n'ont pas de clé étrangère : on retire les nôtres.
    if (appelsJournalises.length > 0) {
      await prisma.ai_usage_events.deleteMany({ where: { id: { in: appelsJournalises } } });
    }
    // Le journal des crédits part avec chaque compte (cascade).
    for (const compte of comptes) await deleteAccount(app, compte);
    await app.close();
  });

  it('deux réservations simultanées sur un solde de 4 : une passe, l’autre reçoit 402, le solde finit à 0', async () => {
    expect(BAREME.analyser.credits).toBe(4);
    const compte = await avecSolde(premier, 4);

    const issues = await Promise.allSettled([
      credits.reserver(reservation(compte.userId, 'analyser')),
      credits.reserver(reservation(compte.userId, 'analyser')),
    ]);

    expect(issues.filter((i) => i.status === 'fulfilled')).toHaveLength(1);
    const refus = issues.filter((i): i is PromiseRejectedResult => i.status === 'rejected');
    expect(refus).toHaveLength(1);
    expect(refus[0].reason).toBeInstanceOf(CreditsInsuffisantsException);
    expect(await credits.solde(compte.userId)).toBe(0);
    expect(await prisma.credit_entries.count({ where: { owner_id: compte.userId, kind: 'debit' } })).toBe(1);
  });

  it('deux remboursements simultanés du même débit n’écrivent qu’une ligne', async () => {
    const compte = await avecSolde(second, 30);
    const debit = await credits.reserver(reservation(compte.userId, 'construire'));

    const issues = await Promise.all([credits.rembourser(debit.id), credits.rembourser(debit.id)]);

    expect(issues.sort()).toEqual([false, true]);
    expect(await prisma.credit_entries.count({ where: { owner_id: compte.userId, kind: 'remboursement' } })).toBe(1);
    expect(await credits.solde(compte.userId)).toBe(30);
  });

  it('inscription puis lectures simultanées du solde : une seule bienvenue', async () => {
    const compte = await createAccount(app);
    comptes.push(compte);

    const reponses = await Promise.all(
      Array.from({ length: 5 }, () => api(app).get('/credits').set(...auth(compte)).expect(200)),
    );

    expect(reponses.map((r) => r.body.solde)).toEqual(Array(5).fill(CREDITS_BIENVENUE));
    expect(await prisma.credit_entries.count({ where: { owner_id: compte.userId, kind: 'bienvenue' } })).toBe(1);
  });

  it('compte d’avant les crédits (sans bienvenue) et lectures simultanées : une seule bienvenue', async () => {
    const compte = premier;
    // Ce que serait un compte créé avant le 2026-10-25 : aucune ligne.
    await prisma.credit_entries.deleteMany({ where: { owner_id: compte.userId } });

    const reponses = await Promise.all(
      Array.from({ length: 5 }, () => api(app).get('/credits').set(...auth(compte)).expect(200)),
    );

    expect(reponses.map((r) => r.body.solde)).toEqual(Array(5).fill(CREDITS_BIENVENUE));
    expect(await prisma.credit_entries.count({ where: { owner_id: compte.userId, kind: 'bienvenue' } })).toBe(1);
  });

  it('deux demandes exclusives simultanées (statuts) : une seule est débitée, l’autre reçoit 409', async () => {
    const compte = await avecSolde(second, 30);
    const projet = await api(app)
      .post('/projects')
      .set(...auth(compte))
      .send({ title: 'Projet pour l’exclusivité' })
      .expect(201);
    const projectId = projet.body.id as string;

    const issues = await Promise.allSettled([
      credits.reserver({ ...reservation(compte.userId, 'statuts', projectId), exclusif: true }),
      credits.reserver({ ...reservation(compte.userId, 'statuts', projectId), exclusif: true }),
    ]);

    expect(issues.filter((i) => i.status === 'fulfilled')).toHaveLength(1);
    const refus = issues.filter((i): i is PromiseRejectedResult => i.status === 'rejected');
    expect(refus[0].reason).toMatchObject({ status: 409, message: 'Déjà en cours.' });
    expect(await credits.solde(compte.userId)).toBe(30 - BAREME.statuts.credits);

    // La réponse arrivée (ligne de coût) libère : une nouvelle demande passe.
    const premiere = (issues.find((i) => i.status === 'fulfilled') as PromiseFulfilledResult<{ id: string }>).value;
    const debit = await prisma.credit_entries.findUniqueOrThrow({ where: { id: premiere.id } });
    await prisma.ai_usage_events.create({
      data: {
        id: debit.ai_usage_event_id as string,
        user_id: compte.userId,
        project_id: projectId,
        generator: 'statuts',
        model: 'claude-opus-5',
        input_tokens: 1,
        output_tokens: 1,
        duration_ms: 1,
      },
    });
    appelsJournalises.push(debit.ai_usage_event_id as string);
    await expect(
      credits.reserver({ ...reservation(compte.userId, 'statuts', projectId), exclusif: true }),
    ).resolves.toBeDefined();
  });

  it('le rattrapage rend un débit orphelin de plus de 15 minutes, une seule fois, et pas un appel qui a répondu', async () => {
    const compte = await avecSolde(second, 30);
    const ilYa20Minutes = new Date(Date.now() - 20 * 60_000);
    const orphelin = await prisma.credit_entries.create({
      data: {
        owner_id: compte.userId,
        actor_id: compte.userId,
        kind: 'debit',
        credits: -BAREME.analyser.credits,
        generator: 'analyser',
        ai_usage_event_id: randomUUID(),
        created_at: ilYa20Minutes,
      },
    });
    const repondu = await prisma.credit_entries.create({
      data: {
        owner_id: compte.userId,
        actor_id: compte.userId,
        kind: 'debit',
        credits: -BAREME.financer.credits,
        generator: 'financer',
        ai_usage_event_id: randomUUID(),
        created_at: ilYa20Minutes,
      },
    });
    await prisma.ai_usage_events.create({
      data: {
        id: repondu.ai_usage_event_id as string,
        user_id: compte.userId,
        generator: 'financer',
        model: 'claude-opus-5',
        input_tokens: 1,
        output_tokens: 1,
        duration_ms: 1,
      },
    });
    appelsJournalises.push(repondu.ai_usage_event_id as string);

    await credits.rattraperDebitsOrphelins();
    await credits.rattraperDebitsOrphelins();

    const rendus = await prisma.credit_entries.findMany({ where: { owner_id: compte.userId, kind: 'remboursement' } });
    expect(rendus).toHaveLength(1);
    expect(rendus[0]).toMatchObject({
      ai_usage_event_id: orphelin.ai_usage_event_id,
      credits: BAREME.analyser.credits,
      motif: MOTIF_ORPHELIN,
    });
    expect(await credits.solde(compte.userId)).toBe(30 - BAREME.financer.credits);
  });
});
