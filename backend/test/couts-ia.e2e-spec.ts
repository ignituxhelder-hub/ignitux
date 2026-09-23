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

  describe('le plafond mensuel', () => {
    // ── Deux plafonds, et un seul chiffre à l'écran ────────────────────
    //
    // Ces tests disaient « 5 analyses », parce qu'à l'époque le produit
    // n'avait qu'une offre, à 20 €/mois pour 5 analyses. Le catalogue est
    // arrivé depuis — 3 en Découverte, 30 en Entrepreneur, 150 en
    // Construction — et le 5 lui a survécu, dans une constante technique
    // que plus personne ne relisait. Il serait tombé **avant** l'offre pour
    // tout abonné payant : coupé à la cinquième analyse après en avoir
    // acheté trente.
    //
    // Ce qui suit vérifie que c'est désormais l'offre qui compte les
    // analyses, et que l'écran affiche le plafond qui arrêtera vraiment la
    // personne — pas l'autre.

    it('annonce ce que l’offre inclut, pas un chiffre technique', async () => {
      const reponse = await api(app)
        .get('/igini/usage/mois-en-cours')
        .set(...auth(compte))
        .expect(200);

      expect(reponse.body.quota.autorise).toBe(true);
      // Découverte : trois analyses. C'est le chiffre du catalogue, celui
      // que la personne a lu avant de s'inscrire.
      expect(reponse.body.quota.plafonds.analyses_par_mois).toBe(3);
      expect(reponse.body.quota.plafonds.analyses_selon).toBe('offre decouverte');
      expect(reponse.body.quota.plafonds.euros_par_mois).toBe(2);
      // Un appel a déjà été enregistré par le test précédent : il en reste
      // deux, et le compteur le sait.
      expect(reponse.body.quota.restant.analyses).toBe(2);
    });

    it('prévient au dernier appel restant', async () => {
      // Un appel de plus, soit deux en tout : il en reste un. C'est le
      // moment d'avertir — assez tôt pour s'organiser, assez tard pour que
      // ce ne soit pas un décor qu'on n'aperçoit plus.
      await usage.record({
        context: { userId: compte.userId, projectId, generator: 'analyser' },
        model: 'claude-opus-5',
        usage: { input_tokens: 100, output_tokens: 100 },
        durationMs: 1000,
      });

      const reponse = await api(app)
        .get('/igini/usage/mois-en-cours')
        .set(...auth(compte))
        .expect(200);

      expect(reponse.body.quota.restant.analyses).toBe(1);
      expect(reponse.body.quota.bientot_atteint).toBe(true);
    });

    it('dit zéro quand l’offre est consommée, sans attendre de s’y cogner', async () => {
      await usage.record({
        context: { userId: compte.userId, projectId, generator: 'analyser' },
        model: 'claude-opus-5',
        usage: { input_tokens: 100, output_tokens: 100 },
        durationMs: 1000,
      });

      const reponse = await api(app)
        .get('/igini/usage/mois-en-cours')
        .set(...auth(compte))
        .expect(200);

      expect(reponse.body.quota.restant.analyses).toBe(0);
      expect(reponse.body.quota.bientot_atteint).toBe(true);
    });

    it('ne coupe plus un abonné payant à la cinquième analyse', async () => {
      // LE TEST QUI MANQUAIT. Le plafond technique valait 5 : un compte
      // Entrepreneur, qui achète trente analyses, en aurait obtenu cinq.
      // Le plafond d'appels ne vit plus là ; seul le coût y reste.
      const limites = usage.limits();
      expect(limites.callsPerMonth).toBeNull();
      expect(limites.costMicroEurPerMonth).not.toBeNull();

      // Et le garde-fou technique laisse passer bien au-delà de cinq.
      for (let i = 0; i < 6; i += 1) {
        await usage.record({
          context: { userId: compte.userId, projectId, generator: 'analyser' },
          model: 'claude-opus-5',
          usage: { input_tokens: 10, output_tokens: 10 },
          durationMs: 100,
        });
      }

      const verdict = await usage.quotaFor(compte.userId);
      expect(verdict.allowed).toBe(true);
      expect(verdict.breach).toBeNull();
    });

    it('refuse quand même quand le budget est dépassé', async () => {
      // L'axe qui reste, et celui qui protège vraiment : le coût. Un seul
      // appel très gros suffit à franchir les 2 € — c'est exactement le cas
      // que compter les appels ne voyait pas.
      await usage.record({
        context: { userId: compte.userId, projectId, generator: 'analyser' },
        model: 'claude-opus-5',
        usage: { input_tokens: 2_000_000, output_tokens: 200_000 },
        durationMs: 5000,
      });

      const verdict = await usage.quotaFor(compte.userId);
      expect(verdict.allowed).toBe(false);
      expect(verdict.breach).toBe('cout');

      // 402 Payment Required : les autres codes du produit sont pris et
      // voudraient dire autre chose. 503 dirait « éteint » alors que ça
      // marche, 422 « la Constitution refuse » alors qu'elle n'y est pour
      // rien, 429 est celui du limiteur de débit, et 401 déconnecterait.
      await expect(usage.assertWithinQuota(compte.userId)).rejects.toMatchObject({
        status: 402,
      });
    });

    it('ne pénalise personne d’autre', async () => {
      // Le plafond est mensuel ET personnel. Un compte qui n'a rien
      // consommé ne doit pas se retrouver bloqué parce qu'un autre l'a été.
      const voisin = await createAccount(app);

      const verdict = await usage.quotaFor(voisin.userId);
      expect(verdict.allowed).toBe(true);
      // `null` sur cet axe : ce n'est pas « illimité », c'est « ce n'est
      // pas ici qu'on compte les analyses ».
      expect(verdict.remaining.calls).toBeNull();

      const reponse = await api(app)
        .get('/igini/usage/mois-en-cours')
        .set(...auth(voisin))
        .expect(200);
      expect(reponse.body.quota.restant.analyses).toBe(3);

      await deleteAccount(app, voisin);
    });
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
