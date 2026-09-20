import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { AiUsageService } from '../src/igini/usage/ai-usage.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { api, auth, createAccount, deleteAccount, startApp, type TestAccount } from './e2e-app.js';

/**
 * LE JOURNAL DES COÛTS IA, ÉPROUVÉ SUR LA VRAIE BASE.
 *
 * Ce qui est vérifié ici et nulle part ailleurs : qu'une ligne écrite par
 * le service arrive réellement dans Postgres, avec ses colonnes, et qu'elle
 * ressorte correctement totalisée par l'API HTTP. Les tests unitaires
 * prouvent que le service appelle Prisma ; seul celui-ci prouve que la
 * table existe, que les types passent, et que l'index sert.
 *
 * Ce qui n'est PAS vérifié ici, et il faut le dire : le trajet depuis un
 * vrai appel à l'API Anthropic. `IGINI_AI_ENABLED` reste à `false` et rien
 * dans cette suite ne le change — la consigne est de ne pas rallumer l'IA.
 * L'extraction des champs depuis la réponse du SDK est donc couverte par
 * les tests unitaires de ClaudeService, pas par celui-ci. C'est le seul
 * maillon du parcours qui n'a pas été éprouvé en conditions réelles, et il
 * le restera tant que les générateurs seront éteints.
 */
describe('Coûts IA (e2e)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let usage: AiUsageService;
  let compte: TestAccount;
  let projectId: string;

  beforeAll(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);
    usage = app.get(AiUsageService);
    compte = await createAccount(app);

    const projet = await api(app)
      .post('/projects')
      .set(...auth(compte))
      .send({ title: 'Projet pour le journal des coûts' })
      .expect(201);
    projectId = projet.body.id as string;
  });

  afterAll(async () => {
    // Les lignes du journal n'ont pas de clé étrangère : la suppression du
    // compte les anonymise mais ne les efface pas. C'est voulu en
    // production, mais dans la base de test ce sont des restes — on les
    // retire nous-mêmes pour ne pas polluer les exécutions suivantes.
    await prisma.ai_usage_events.deleteMany({ where: { project_id: projectId } });
    await deleteAccount(app, compte);
    await app.close();
  });

  it('refuse de dire quoi que ce soit sans jeton', async () => {
    await api(app).get('/igini/usage/mois-en-cours').expect(401);
  });

  it('rend un mois vide sans mentir dessus', async () => {
    const reponse = await api(app)
      .get('/igini/usage/mois-en-cours')
      .set(...auth(compte))
      .expect(200);

    expect(reponse.body.appels).toBe(0);
    // Zéro appel coûte zéro : c'est un vrai total, pas une absence de
    // total. La distinction compte, parce que `null` veut dire « je ne sais
    // pas » et apparaîtra pour de bon si un modèle échappe à la grille.
    expect(reponse.body.cout.euros).toBe(0);
    expect(reponse.body.par_generateur).toEqual([]);
  });

  it('écrit une dépense dans Postgres et la retrouve totalisée par HTTP', async () => {
    await usage.record({
      context: { userId: compte.userId, projectId, generator: 'analyser' },
      model: 'claude-opus-5',
      usage: {
        input_tokens: 1200,
        output_tokens: 900,
        output_tokens_details: { thinking_tokens: 300 },
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
      },
      durationMs: 41_000,
    });

    // D'abord la ligne elle-même, telle que la base la contient.
    const lignes = await prisma.ai_usage_events.findMany({ where: { project_id: projectId } });
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({
      user_id: compte.userId,
      generator: 'analyser',
      model: 'claude-opus-5',
      input_tokens: 1200,
      output_tokens: 900,
      thinking_tokens: 300,
      duration_ms: 41_000,
    });
    expect(lignes[0].created_at).toBeInstanceOf(Date);

    // Puis ce que l'API en dit.
    const reponse = await api(app)
      .get('/igini/usage/mois-en-cours')
      .set(...auth(compte))
      .expect(200);

    expect(reponse.body.appels).toBe(1);
    expect(reponse.body.tokens).toEqual({ entree: 1200, sortie: 900, dont_reflexion: 300 });
    expect(reponse.body.cout.euros).toBeCloseTo(0.02622, 10);
    // Le montant ne sort jamais sans la date de sa grille : il est dérivé,
    // pas facturé, et un chiffre pareil sans sa source est invérifiable.
    expect(reponse.body.cout.grille_du).toBe('2026-06-24');
    expect(reponse.body.cout.estimation).toBe(true);
    expect(reponse.body.par_generateur).toEqual([
      {
        generateur: 'analyser',
        appels: 1,
        tokens_entree: 1200,
        tokens_sortie: 900,
        dont_reflexion: 300,
        cout_euros: expect.closeTo(0.02622, 10),
      },
    ]);
  });

  it("ne montre jamais la dépense de quelqu'un d'autre", async () => {
    // Le test qui protège contre la fuite la plus banale : un `where`
    // oublié sur `user_id`. Sans lui, chaque personne verrait la
    // consommation de tout le monde — et, en creux, le chiffre d'affaires.
    const autre = await createAccount(app);

    const reponse = await api(app)
      .get('/igini/usage/mois-en-cours')
      .set(...auth(autre))
      .expect(200);

    expect(reponse.body.appels).toBe(0);
    expect(reponse.body.cout.euros).toBe(0);

    await deleteAccount(app, autre);
  });

  it("garde la dépense après la suppression du compte, mais sans le nom", async () => {
    // L'enjeu est comptable autant que juridique. Ces tokens ont été
    // facturés par Anthropic et le restent : si la suppression d'un compte
    // effaçait la ligne, le total d'un mois déjà clos changerait
    // rétroactivement, et deux relevés du même mois ne diraient plus la
    // même chose. On retire donc la personne, pas le fait.
    const ephemere = await createAccount(app);
    const projet = await api(app)
      .post('/projects')
      .set(...auth(ephemere))
      .send({ title: 'Projet éphémère' })
      .expect(201);

    await usage.record({
      context: { userId: ephemere.userId, projectId: projet.body.id as string, generator: 'financer' },
      model: 'claude-opus-5',
      usage: { input_tokens: 500, output_tokens: 700 },
      durationMs: 39_000,
    });

    await deleteAccount(app, ephemere);

    const restantes = await prisma.ai_usage_events.findMany({
      where: { project_id: projet.body.id as string },
    });
    expect(restantes).toHaveLength(1);
    expect(restantes[0].user_id).toBeNull();
    expect(restantes[0].input_tokens).toBe(500);
    expect(restantes[0].output_tokens).toBe(700);

    await prisma.ai_usage_events.deleteMany({ where: { project_id: projet.body.id as string } });
  });
});
