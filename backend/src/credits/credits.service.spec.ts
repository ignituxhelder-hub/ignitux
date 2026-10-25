import { BadRequestException, ConflictException, HttpStatus, NotFoundException } from '@nestjs/common';
import { BAREME, CREDITS_BIENVENUE } from './bareme.js';
import { CreditsInsuffisantsException } from './credits-insuffisants.js';
import { CreditsService, MOTIF_ORPHELIN } from './credits.service.js';
import { FausseBaseCredits } from './credits.testing.js';

const PROPRIO = '11111111-1111-4111-8111-111111111111';
const MEMBRE = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const ANCIEN = '44444444-4444-4444-8444-444444444444';
const PROJET = '55555555-5555-4555-8555-555555555555';
const PROJET_AUTRE = '66666666-6666-4666-8666-666666666666';

const PRIX_ANALYSE = BAREME.analyser.credits;

function base(lignes: NonNullable<ConstructorParameters<typeof FausseBaseCredits>[0]>['lignes'] = []) {
  return new FausseBaseCredits({
    comptes: [
      { id: PROPRIO, email: 'proprio@exemple.fr', display_name: 'Camille' },
      { id: MEMBRE, email: 'membre@exemple.fr', display_name: '  ' },
      { id: ADMIN, email: 'admin@ignitux.com', display_name: 'Helder' },
      // Un compte d'avant les crédits : aucune ligne, pas même la bienvenue.
      { id: ANCIEN, email: 'ancien@exemple.fr' },
    ],
    projets: [
      { id: PROJET, title: 'Boulangerie', owner_id: PROPRIO, membres: [MEMBRE] },
      { id: PROJET_AUTRE, title: 'Projet de quelqu’un d’autre', owner_id: ANCIEN },
    ],
    lignes,
  });
}

/** Un compte déjà servi : la bienvenue versée, puis `solde - 30` crédits en plus ou en moins. */
function avecSolde(solde: number) {
  return base([
    { owner_id: PROPRIO, kind: 'bienvenue', credits: CREDITS_BIENVENUE },
    ...(solde === CREDITS_BIENVENUE
      ? []
      : [{ owner_id: PROPRIO, kind: 'ajustement_admin', credits: solde - CREDITS_BIENVENUE, actor_id: ADMIN, motif: 'test' }]),
  ]);
}

const reservation = (generator: keyof typeof BAREME = 'analyser', appelId = 'appel-1') => ({
  ownerId: PROPRIO,
  actorId: PROPRIO,
  generator,
  projectId: PROJET,
  appelId,
});

describe('CreditsService — le solde', () => {
  it('est la somme du journal', async () => {
    const db = base([
      { owner_id: PROPRIO, kind: 'bienvenue', credits: 30 },
      { owner_id: PROPRIO, kind: 'debit', credits: -4, generator: 'analyser' },
      { owner_id: PROPRIO, kind: 'remboursement', credits: 4, generator: 'analyser' },
      { owner_id: PROPRIO, kind: 'debit', credits: -5, generator: 'construire' },
      { owner_id: MEMBRE, kind: 'bienvenue', credits: 30 },
    ]);
    expect(await new CreditsService(db.client()).solde(PROPRIO)).toBe(25);
  });

  it('verse les 30 crédits de bienvenue à un compte existant, à la première lecture, une seule fois', async () => {
    const db = base();
    const credits = new CreditsService(db.client());

    expect(await credits.solde(ANCIEN)).toBe(30);
    expect(await credits.solde(ANCIEN)).toBe(30);

    const bienvenues = db.de(ANCIEN, 'bienvenue');
    expect(bienvenues).toHaveLength(1);
    expect(bienvenues[0]).toMatchObject({ credits: 30, actor_id: null });
  });

  it('ne verse jamais deux bienvenues, même à deux lectures simultanées', async () => {
    const db = base();
    const credits = new CreditsService(db.client());

    const soldes = await Promise.all([credits.solde(ANCIEN), credits.solde(ANCIEN), credits.solde(ANCIEN)]);

    expect(soldes).toEqual([30, 30, 30]);
    expect(db.de(ANCIEN, 'bienvenue')).toHaveLength(1);
  });

  it('ne verse pas de bienvenue à un compte qui l’a déjà reçue (à l’inscription)', async () => {
    const db = avecSolde(12);
    expect(await new CreditsService(db.client()).solde(PROPRIO)).toBe(12);
    expect(db.de(PROPRIO, 'bienvenue')).toHaveLength(1);
  });

  it('exigerSolde refuse en 402 quand le solde ne couvre pas le prix, sans rien écrire', async () => {
    const db = avecSolde(PRIX_ANALYSE - 1);
    const avant = db.lignes.length;
    await expect(new CreditsService(db.client()).exigerSolde(PROPRIO, 'analyser')).rejects.toBeInstanceOf(
      CreditsInsuffisantsException,
    );
    expect(db.lignes).toHaveLength(avant);
  });
});

describe('CreditsService — réserver avant l’appel IA', () => {
  it('écrit un débit négatif au prix du barème, avec générateur, projet, acteur et appel', async () => {
    const db = avecSolde(30);
    const credits = new CreditsService(db.client());

    const r = await credits.reserver({ ...reservation('construire', 'appel-42'), actorId: MEMBRE });

    expect(r).toEqual({ id: expect.any(String), credits: BAREME.construire.credits, soldeApres: 30 - BAREME.construire.credits });
    expect(db.de(PROPRIO, 'debit')).toEqual([
      expect.objectContaining({
        id: r.id,
        owner_id: PROPRIO,
        actor_id: MEMBRE,
        kind: 'debit',
        credits: -BAREME.construire.credits,
        generator: 'construire',
        project_id: PROJET,
        ai_usage_event_id: 'appel-42',
      }),
    ]);
    expect(db.solde(PROPRIO)).toBe(30 - BAREME.construire.credits);
  });

  it('refuse en 402 avec le prix et le solde, et n’écrit rien, quand le solde est insuffisant', async () => {
    const db = avecSolde(1);
    const avant = db.lignes.length;

    const erreur = await new CreditsService(db.client())
      .reserver(reservation('analyser'))
      .then(() => null, (e: unknown) => e);

    expect(erreur).toBeInstanceOf(CreditsInsuffisantsException);
    const http = erreur as CreditsInsuffisantsException;
    expect(http.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    expect(http.getResponse()).toEqual({
      statusCode: 402,
      code: 'credits_insuffisants',
      message: `Crédits insuffisants : il te faut ${PRIX_ANALYSE} crédits, tu en as 1.`,
      requis: PRIX_ANALYSE,
      disponible: 1,
    });
    expect(db.lignes).toHaveLength(avant);
  });

  it('accorde d’abord la bienvenue à un compte d’avant les crédits, sous le même verrou', async () => {
    const db = base();
    const credits = new CreditsService(db.client());

    await credits.reserver({ ...reservation('analyser'), ownerId: ANCIEN, actorId: ANCIEN, projectId: PROJET_AUTRE });

    expect(db.de(ANCIEN, 'bienvenue')).toHaveLength(1);
    expect(db.solde(ANCIEN)).toBe(30 - PRIX_ANALYSE);
  });

  it('un solde qui tombe juste passe, et laisse 0', async () => {
    const db = avecSolde(PRIX_ANALYSE);
    await new CreditsService(db.client()).reserver(reservation('analyser'));
    expect(db.solde(PROPRIO)).toBe(0);
  });

  it('deux générations simultanées avec un solde pour une seule : une passe, l’autre reçoit 402, jamais de négatif', async () => {
    const db = avecSolde(PRIX_ANALYSE);
    const credits = new CreditsService(db.client());

    const issues = await Promise.allSettled([
      credits.reserver(reservation('analyser', 'appel-a')),
      credits.reserver(reservation('analyser', 'appel-b')),
    ]);

    expect(issues.filter((i) => i.status === 'fulfilled')).toHaveLength(1);
    const refus = issues.filter((i): i is PromiseRejectedResult => i.status === 'rejected');
    expect(refus).toHaveLength(1);
    expect(refus[0].reason).toBeInstanceOf(CreditsInsuffisantsException);
    expect(db.de(PROPRIO, 'debit')).toHaveLength(1);
    expect(db.solde(PROPRIO)).toBe(0);
  });

  it('dix générations simultanées ne descendent jamais sous zéro', async () => {
    const db = avecSolde(3 * PRIX_ANALYSE + 1);
    const credits = new CreditsService(db.client());

    const issues = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => credits.reserver(reservation('analyser', `appel-${i}`))),
    );

    expect(issues.filter((i) => i.status === 'fulfilled')).toHaveLength(3);
    expect(db.solde(PROPRIO)).toBe(1);
  });

  it('témoin : sans le verrou, la même course rend le solde négatif (le test ci-dessus prouve donc quelque chose)', async () => {
    const db = avecSolde(PRIX_ANALYSE);
    db.verrouActif = false;
    const credits = new CreditsService(db.client());

    await Promise.allSettled([
      credits.reserver(reservation('analyser', 'appel-a')),
      credits.reserver(reservation('analyser', 'appel-b')),
    ]);

    expect(db.solde(PROPRIO)).toBeLessThan(0);
  });

  it('verrouille la ligne users du propriétaire (FOR NO KEY UPDATE), dans la transaction', async () => {
    const db = avecSolde(30);
    await new CreditsService(db.client()).reserver({ ...reservation('analyser'), actorId: MEMBRE });

    expect(db.sql).toHaveLength(1);
    const [{ texte, valeurs }] = db.sql;
    expect(texte.replace(/\s+/g, ' ')).toMatch(/SELECT id FROM users WHERE id = \$::uuid FOR NO KEY UPDATE/);
    // Le propriétaire, jamais l'acteur : c'est son solde qui bouge.
    expect(valeurs).toEqual([PROPRIO]);
  });

  it('refuse un compte qui n’existe plus (404), sans écrire', async () => {
    const db = base();
    await expect(
      new CreditsService(db.client()).reserver({ ...reservation(), ownerId: '99999999-9999-4999-8999-999999999999' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.lignes).toHaveLength(0);
  });
});

describe('CreditsService — rembourser un échec', () => {
  it('rend exactement le débit, une seule fois', async () => {
    const db = avecSolde(30);
    const credits = new CreditsService(db.client());
    const r = await credits.reserver({ ...reservation('financer', 'appel-9'), actorId: MEMBRE });

    expect(await credits.rembourser(r.id)).toBe(true);
    expect(await credits.rembourser(r.id)).toBe(false);

    expect(db.de(PROPRIO, 'remboursement')).toEqual([
      expect.objectContaining({
        kind: 'remboursement',
        credits: BAREME.financer.credits,
        generator: 'financer',
        project_id: PROJET,
        actor_id: MEMBRE,
        ai_usage_event_id: 'appel-9',
      }),
    ]);
    expect(db.solde(PROPRIO)).toBe(30);
  });

  it('deux remboursements simultanés du même débit n’en écrivent qu’un', async () => {
    const db = avecSolde(30);
    const credits = new CreditsService(db.client());
    const r = await credits.reserver(reservation('analyser'));

    const issues = await Promise.all([credits.rembourser(r.id), credits.rembourser(r.id)]);

    expect(issues.sort()).toEqual([false, true]);
    expect(db.de(PROPRIO, 'remboursement')).toHaveLength(1);
    expect(db.solde(PROPRIO)).toBe(30);
  });

  it('ne rembourse que des débits : un identifiant inconnu ou une bienvenue ne rendent rien', async () => {
    const db = avecSolde(30);
    const credits = new CreditsService(db.client());
    const bienvenue = db.de(PROPRIO, 'bienvenue')[0];

    expect(await credits.rembourser('inconnu')).toBe(false);
    expect(await credits.rembourser(bienvenue.id)).toBe(false);
    expect(db.de(PROPRIO, 'remboursement')).toHaveLength(0);
  });

  it('écrit le motif demandé (résultat non enregistré, appel interrompu)', async () => {
    const db = avecSolde(30);
    const credits = new CreditsService(db.client());
    const r = await credits.reserver(reservation('statuts'));

    expect(await credits.rembourser(r.id, { motif: 'Résultat non enregistré : crédits rendus.' })).toBe(true);

    expect(db.de(PROPRIO, 'remboursement')[0].motif).toBe('Résultat non enregistré : crédits rendus.');
  });
});

/**
 * Le serveur redémarre (déploiement, plantage) pendant un appel IA : le débit
 * est écrit, l'appel ne revient jamais, et aucun `catch` ne le rend. Le
 * rattrapage le rend après coup.
 */
describe('CreditsService — rattraper les débits orphelins', () => {
  // Les lignes de la fausse base sont datées du 2026-10-25 à 12:00.
  const T_DEBIT = new Date(Date.UTC(2026, 9, 25, 12, 0, 0));
  const minutesApres = (minutes: number) => new Date(T_DEBIT.getTime() + minutes * 60_000);

  it('rend un débit de plus de 15 minutes sans ligne de coût ni remboursement', async () => {
    const db = avecSolde(30);
    const credits = new CreditsService(db.client());
    const r = await credits.reserver(reservation('analyser', 'appel-perdu'));

    expect(await credits.rattraperDebitsOrphelins(minutesApres(16))).toBe(1);

    expect(db.de(PROPRIO, 'remboursement')).toEqual([
      expect.objectContaining({ credits: r.credits, ai_usage_event_id: 'appel-perdu', motif: MOTIF_ORPHELIN }),
    ]);
    expect(db.solde(PROPRIO)).toBe(30);
  });

  it('ne touche pas un débit récent : son appel est peut-être encore en cours', async () => {
    const db = avecSolde(30);
    const credits = new CreditsService(db.client());
    await credits.reserver(reservation('analyser'));

    expect(await credits.rattraperDebitsOrphelins(minutesApres(14))).toBe(0);
    expect(db.de(PROPRIO, 'remboursement')).toHaveLength(0);
  });

  it('ne touche pas un débit dont l’appel a obtenu sa réponse (ligne de coût présente)', async () => {
    const db = avecSolde(30);
    const credits = new CreditsService(db.client());
    await credits.reserver(reservation('analyser', 'appel-reussi'));
    db.appelsJournalises.add('appel-reussi');

    expect(await credits.rattraperDebitsOrphelins(minutesApres(60))).toBe(0);
    expect(db.solde(PROPRIO)).toBe(30 - PRIX_ANALYSE);
  });

  it('ne rend jamais deux fois : ni un débit déjà remboursé, ni sous deux passages simultanés', async () => {
    const db = avecSolde(30);
    const credits = new CreditsService(db.client());
    const deja = await credits.reserver(reservation('analyser', 'appel-a'));
    await credits.rembourser(deja.id);
    await credits.reserver(reservation('construire', 'appel-b'));

    const rendus = await Promise.all([
      credits.rattraperDebitsOrphelins(minutesApres(20)),
      credits.rattraperDebitsOrphelins(minutesApres(20)),
    ]);

    expect(rendus.sort()).toEqual([0, 1]);
    expect(db.de(PROPRIO, 'remboursement')).toHaveLength(2);
    expect(db.solde(PROPRIO)).toBe(30);
  });

  it('ne rend pas un appel journalisé entre la recherche et le verrou', async () => {
    // L'appel très lent qui revient pendant le passage : relu sous le verrou.
    const db = avecSolde(30);
    const credits = new CreditsService(db.client());
    const r = await credits.reserver(reservation('analyser', 'appel-lent'));
    db.appelsJournalises.add('appel-lent');

    expect(await credits.rembourser(r.id, { motif: MOTIF_ORPHELIN, siAucunAppelJournalise: true })).toBe(false);
    expect(db.de(PROPRIO, 'remboursement')).toHaveLength(0);
  });

  it('ne remonte pas au-delà de 30 jours', async () => {
    const db = avecSolde(30);
    const credits = new CreditsService(db.client());
    await credits.reserver(reservation('analyser'));

    expect(await credits.rattraperDebitsOrphelins(minutesApres(31 * 24 * 60))).toBe(0);
  });

  it('un remboursement qui échoue n’empêche pas les suivants, et sera retenté au prochain passage', async () => {
    const db = avecSolde(30);
    const credits = new CreditsService(db.client());
    const premier = await credits.reserver(reservation('analyser', 'appel-1'));
    await credits.reserver(reservation('construire', 'appel-2'));
    const original = credits.rembourser.bind(credits);
    const espion = vi
      .spyOn(credits, 'rembourser')
      .mockImplementation((id, options) =>
        id === premier.id ? Promise.reject(new Error('base indisponible')) : original(id, options),
      );

    expect(await credits.rattraperDebitsOrphelins(minutesApres(20))).toBe(1);

    espion.mockRestore();
    expect(await credits.rattraperDebitsOrphelins(minutesApres(30))).toBe(1);
    expect(db.solde(PROPRIO)).toBe(30);
  });

  it('au démarrage : un passage sans attendre, puis toutes les 10 minutes ; arrêté avec le module', async () => {
    vi.useFakeTimers();
    try {
      const credits = new CreditsService(avecSolde(30).client());
      const passage = vi.spyOn(credits, 'rattraperDebitsOrphelins').mockResolvedValue(0);
      credits.rattrapageAutomatique = true;

      credits.onModuleInit();
      expect(passage).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(passage).toHaveBeenCalledTimes(2);

      credits.onModuleDestroy();
      await vi.advanceTimersByTimeAsync(30 * 60_000);
      expect(passage).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('un passage qui lève ne fait pas tomber le serveur', async () => {
    const credits = new CreditsService(avecSolde(30).client());
    vi.spyOn(credits, 'rattraperDebitsOrphelins').mockRejectedValue(new Error('base indisponible'));
    credits.rattrapageAutomatique = true;

    expect(() => credits.onModuleInit()).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    credits.onModuleDestroy();
  });
});

describe('CreditsService — ajustement par un administrateur', () => {
  it('ajoute des crédits avec le motif et l’administrateur comme acteur', async () => {
    const db = avecSolde(30);
    const vu = await new CreditsService(db.client()).crediter({
      ownerId: PROPRIO,
      actorId: ADMIN,
      kind: 'ajustement_admin',
      credits: 50,
      motif: '  geste commercial  ',
    });

    expect(vu.solde).toBe(80);
    expect(db.de(PROPRIO, 'ajustement_admin').at(-1)).toMatchObject({
      credits: 50,
      actor_id: ADMIN,
      motif: 'geste commercial',
    });
  });

  it('retire des crédits tant que le solde reste positif ou nul', async () => {
    const db = avecSolde(30);
    const credits = new CreditsService(db.client());
    const vu = await credits.crediter({ ownerId: PROPRIO, actorId: ADMIN, kind: 'ajustement_admin', credits: -30, motif: 'test' });
    expect(vu.solde).toBe(0);
  });

  it('refuse un retrait qui rendrait le solde négatif (409), sans rien écrire', async () => {
    const db = avecSolde(30);
    const avant = db.lignes.length;
    await expect(
      new CreditsService(db.client()).crediter({ ownerId: PROPRIO, actorId: ADMIN, kind: 'ajustement_admin', credits: -31, motif: 'test' }),
    ).rejects.toThrow(new ConflictException('Ce retrait rendrait le solde négatif : ce compte a 30 crédits.'));
    expect(db.lignes).toHaveLength(avant);
  });

  it('un ajustement sur un compte d’avant les crédits verse d’abord sa bienvenue', async () => {
    const db = base();
    const vu = await new CreditsService(db.client()).crediter({
      ownerId: ANCIEN,
      actorId: ADMIN,
      kind: 'ajustement_admin',
      credits: -10,
      motif: 'test',
    });
    expect(vu.solde).toBe(20);
    expect(db.de(ANCIEN, 'bienvenue')).toHaveLength(1);
  });

  it.each([
    [0, 'test', 'Le nombre de crédits doit être un entier non nul, entre -10000 et 10000.'],
    [10_001, 'test', 'Le nombre de crédits doit être un entier non nul, entre -10000 et 10000.'],
    [-10_001, 'test', 'Le nombre de crédits doit être un entier non nul, entre -10000 et 10000.'],
    [2.5, 'test', 'Le nombre de crédits doit être un entier non nul, entre -10000 et 10000.'],
    [10, '  a ', 'Le motif est obligatoire (3 à 200 caractères).'],
    [10, 'x'.repeat(201), 'Le motif est obligatoire (3 à 200 caractères).'],
  ])('refuse %s crédits avec le motif « %s » (400)', async (nombre, motif, message) => {
    const db = avecSolde(30);
    const avant = db.lignes.length;
    await expect(
      new CreditsService(db.client()).crediter({ ownerId: PROPRIO, actorId: ADMIN, kind: 'ajustement_admin', credits: nombre, motif }),
    ).rejects.toThrow(new BadRequestException(message));
    expect(db.lignes).toHaveLength(avant);
  });

  it('refuse un compte inconnu (404)', async () => {
    const db = base();
    await expect(
      new CreditsService(db.client()).crediter({
        ownerId: '99999999-9999-4999-8999-999999999999',
        actorId: ADMIN,
        kind: 'ajustement_admin',
        credits: 5,
        motif: 'test',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CreditsService — ce que voit la personne', () => {
  it('rend le solde, le barème et l’historique : projet visible, acteur quand c’est un autre', async () => {
    const db = base([
      { owner_id: PROPRIO, kind: 'bienvenue', credits: 30, motif: 'Cadeau de bienvenue' },
      { owner_id: PROPRIO, actor_id: PROPRIO, kind: 'debit', credits: -4, generator: 'analyser', project_id: PROJET, ai_usage_event_id: 'a1' },
      { owner_id: PROPRIO, actor_id: MEMBRE, kind: 'debit', credits: -5, generator: 'construire', project_id: PROJET, ai_usage_event_id: 'a2' },
      { owner_id: PROPRIO, actor_id: MEMBRE, kind: 'remboursement', credits: 5, generator: 'construire', project_id: PROJET, ai_usage_event_id: 'a2' },
      // Un projet que la personne ne voit pas (cas théorique) : son titre ne sort pas.
      { owner_id: PROPRIO, actor_id: PROPRIO, kind: 'debit', credits: -4, generator: 'analyser', project_id: PROJET_AUTRE, ai_usage_event_id: 'a3' },
      { owner_id: PROPRIO, actor_id: ADMIN, kind: 'ajustement_admin', credits: 10, motif: 'geste commercial' },
      { owner_id: PROPRIO, actor_id: PROPRIO, kind: 'debit', credits: -1, generator: 'discuter', ai_usage_event_id: 'a4' },
      { owner_id: MEMBRE, kind: 'bienvenue', credits: 30 },
    ]);

    const vu = await new CreditsService(db.client()).vue(PROPRIO);

    expect(vu.solde).toBe(31);
    expect(vu.bareme.actions).toHaveLength(Object.keys(BAREME).length);
    expect(vu.historique.map((l) => [l.kind, l.credits, l.generateur, l.projet?.titre ?? null, l.acteur])).toEqual([
      ['debit', -1, 'discuter', null, null],
      // L'administrateur n'est pas nommé : c'est Ignitux qui ajuste.
      ['ajustement_admin', 10, null, null, null],
      ['debit', -4, 'analyser', null, null],
      // Le membre sans nom affiché est désigné par son adresse.
      ['remboursement', 5, 'construire', 'Boulangerie', 'membre@exemple.fr'],
      ['debit', -5, 'construire', 'Boulangerie', 'membre@exemple.fr'],
      ['debit', -4, 'analyser', 'Boulangerie', null],
      ['bienvenue', 30, null, null, null],
    ]);
    const premier = vu.historique[0];
    expect(premier).toEqual({
      id: expect.any(String),
      date: expect.any(String),
      kind: 'debit',
      credits: -1,
      generateur: 'discuter',
      libelle: BAREME.discuter.libelle,
      projet: null,
      acteur: null,
      motif: null,
    });
    expect(vu.historique[1].motif).toBe('geste commercial');
  });

  it('borne l’historique aux 100 dernières lignes', async () => {
    const db = base([
      { owner_id: PROPRIO, kind: 'bienvenue', credits: 30 },
      ...Array.from({ length: 120 }, (_, i) => ({
        owner_id: PROPRIO,
        kind: 'ajustement_admin',
        credits: 1,
        actor_id: ADMIN,
        motif: `ligne ${i}`,
      })),
    ]);
    const vu = await new CreditsService(db.client()).vue(PROPRIO);
    expect(vu.historique).toHaveLength(100);
    expect(vu.solde).toBe(150);
  });
});

describe('CreditsService — la liste des comptes (administration)', () => {
  it('rend email, solde et bienvenue versée ou non, paginé', async () => {
    const db = base([
      { owner_id: PROPRIO, kind: 'bienvenue', credits: 30 },
      { owner_id: PROPRIO, kind: 'debit', credits: -4, generator: 'analyser' },
    ]);
    const credits = new CreditsService(db.client());

    const page1 = await credits.comptes({ page: 1, parPage: 2 });
    expect(page1).toEqual({
      page: 1,
      parPage: 2,
      total: 4,
      comptes: [
        { id: PROPRIO, email: 'proprio@exemple.fr', creeLe: null, solde: 26, bienvenueVersee: true },
        { id: MEMBRE, email: 'membre@exemple.fr', creeLe: null, solde: 0, bienvenueVersee: false },
      ],
    });

    const page2 = await credits.comptes({ page: 2, parPage: 2 });
    expect(page2.comptes.map((c) => c.id)).toEqual([ADMIN, ANCIEN]);
  });

  it('cherche par adresse, et borne la pagination', async () => {
    const db = base();
    const credits = new CreditsService(db.client());

    const trouves = await credits.comptes({ recherche: 'ANCIEN' });
    expect(trouves.comptes.map((c) => c.email)).toEqual(['ancien@exemple.fr']);
    expect(trouves.total).toBe(1);

    const borne = await credits.comptes({ page: -3, parPage: 5000 });
    expect(borne.page).toBe(1);
    expect(borne.parPage).toBe(100);
  });
});
