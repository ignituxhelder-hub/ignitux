import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CreditsInsuffisantsException } from '../credits/credits-insuffisants.js';
import { Prisma } from '../generated/prisma/client.js';
import { EvaluationService } from './evaluation.service.js';

// Seule l'adresse du site sert ici (le lien de l'email aux administrateurs).
vi.mock('../config/env.js', () => ({ getEnv: () => ({ FRONTEND_URL: 'https://ignitux.test' }) }));
import { rapport } from './evaluation.fixture.js';

const PROJET = { id: 'p1', owner_id: 'u1', title: 'Ma boulangerie', description: 'Levain' };
const MAINTENANT = new Date('2026-10-11T10:00:00Z');
const il_y_a = (minutes: number) => new Date(MAINTENANT.getTime() - minutes * 60_000);

function ligne(partiel: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    project_id: 'p1',
    requested_by: 'u1',
    status: 'en_preparation',
    verdict: null,
    report: null,
    ai_draft: null,
    admin_note: null,
    refusal_reason: null,
    redo_instruction: null,
    failure_reason: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: il_y_a(1),
    updated_at: il_y_a(1),
    ...partiel,
  };
}

function monter() {
  const prisma = {
    projects: { findFirst: vi.fn().mockResolvedValue(PROJET), findUnique: vi.fn().mockResolvedValue(PROJET) },
    financing_evaluations: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(ligne()),
      create: vi.fn().mockResolvedValue(ligne()),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve(ligne(data))),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user_roles: {
      findMany: vi.fn().mockResolvedValue([
        { user: { email: 'admin1@exemple.fr' } },
        { user: { email: 'admin2@exemple.fr' } },
      ]),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
  const claude = { generateStructuredOutput: vi.fn().mockResolvedValue(rapport()) };
  const credits = {
    exigerSolde: vi.fn().mockResolvedValue(undefined),
    rendreResultatNonEnregistre: vi.fn().mockResolvedValue(undefined),
    rembourserAppel: vi.fn().mockResolvedValue(true),
  };
  const projects = {
    contexteEvaluation: vi
      .fn()
      .mockResolvedValue({ titre: 'Ma boulangerie', description: 'Levain', contexte: 'Analyse : marché porteur' }),
  };
  const financeAudit = { projectAudit: vi.fn().mockResolvedValue({ findings: [], clean: true }) };
  const compliance = {
    listForProject: vi.fn().mockResolvedValue({ requirements: [{ completed: true }, { completed: false }] }),
  };
  const mail = { send: vi.fn().mockResolvedValue('sent') };
  const service = new EvaluationService(
    prisma as never,
    claude as never,
    credits as never,
    projects as never,
    financeAudit as never,
    compliance as never,
    mail as never,
  );
  service.maintenant = () => MAINTENANT;
  return { service, prisma, claude, credits, projects, mail };
}

/** Les écritures de la génération : conditionnées à « encore en préparation ». */
function ecritures(prisma: ReturnType<typeof monter>['prisma']) {
  return prisma.financing_evaluations.updateMany.mock.calls
    .map(([arg]) => arg)
    .filter((arg) => arg.where?.id === 'e1');
}

/** Laisse la génération lancée en arrière-plan se terminer. */
const finirArrierePlan = () => new Promise((r) => setTimeout(r, 0));

describe('EvaluationService — demande et génération', () => {
  const flagInitial = process.env.IGINI_AI_ENABLED;
  beforeEach(() => {
    process.env.IGINI_AI_ENABLED = 'true';
  });
  afterAll(() => {
    if (flagInitial === undefined) delete process.env.IGINI_AI_ENABLED;
    else process.env.IGINI_AI_ENABLED = flagInitial;
  });

  it('crée une évaluation en préparation et rend la main avant la fin de la génération', async () => {
    const { service, prisma, claude } = monter();
    claude.generateStructuredOutput.mockReturnValue(new Promise(() => {}));

    const vue = await service.demander('u1', 'p1');

    expect(vue.status).toBe('en_preparation');
    expect(prisma.financing_evaluations.create).toHaveBeenCalledWith({
      data: { project_id: 'p1', requested_by: 'u1', status: 'en_preparation' },
    });
    expect(ecritures(prisma)).toHaveLength(0);
  });

  it('passe en revue avec ai_draft = report quand IGINI répond', async () => {
    const { service, prisma, claude } = monter();

    await service.demander('u1', 'p1');
    await finirArrierePlan();

    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({ usage: { userId: 'u1', actorId: 'u1', projectId: 'p1', generator: 'evaluer' } }),
    );
    const [ecriture] = ecritures(prisma);
    expect(ecriture.where).toEqual({ id: 'e1', status: 'en_preparation' });
    const data = ecriture.data;
    expect(data.status).toBe('en_revue');
    expect(data.verdict).toBe('financable_apres_corrections');
    expect(data.report).toEqual(data.ai_draft);
  });

  it('donne à IGINI le contexte du projet, l’audit financier et la conformité', async () => {
    const { service, claude } = monter();

    await service.demander('u1', 'p1');
    await finirArrierePlan();

    const contenu: string = claude.generateStructuredOutput.mock.calls[0][0].userContent;
    expect(contenu).toContain('Analyse : marché porteur');
    expect(contenu).toContain('1 démarche(s) de conformité sur 2');
    expect(contenu).toMatch(/aucune anomalie/i);
    // Sans données financières, « aucune anomalie » ne doit pas sonner comme un bon point.
    expect(contenu).toMatch(/ne dit rien/);
  });

  it('passe en échec sans montrer une erreur technique brute', async () => {
    const { service, prisma, claude } = monter();
    claude.generateStructuredOutput.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.1:5432'));

    await service.demander('u1', 'p1');
    await finirArrierePlan();

    const [ecriture] = ecritures(prisma);
    expect(ecriture.where).toEqual({ id: 'e1', status: 'en_preparation' });
    expect(ecriture.data).toEqual({ status: 'echec', failure_reason: null });
  });

  it('ne répète pas le message générique d’une erreur serveur (500) comme motif', async () => {
    const { service, prisma, claude } = monter();
    claude.generateStructuredOutput.mockRejectedValue(
      new InternalServerErrorException("L'évaluation n'a pas pu être préparée. Tu peux réessayer."),
    );

    await service.demander('u1', 'p1');
    await finirArrierePlan();

    expect(ecritures(prisma)[0].data.failure_reason).toBeNull();
  });

  it('garde le message d’un refus lisible (solde consommé entre-temps) comme motif d’échec', async () => {
    const { service, prisma, claude } = monter();
    claude.generateStructuredOutput.mockRejectedValue(new CreditsInsuffisantsException(6, 1));

    await service.demander('u1', 'p1');
    await finirArrierePlan();

    expect(ecritures(prisma)[0].data.failure_reason).toBe('Crédits insuffisants : il te faut 6 crédits, tu en as 1.');
  });

  it('n’écrase pas une évaluation qui n’est plus en préparation (génération tardive)', async () => {
    const { service, prisma } = monter();
    prisma.financing_evaluations.updateMany.mockResolvedValue({ count: 0 });

    await service.demander('u1', 'p1');
    await finirArrierePlan();

    // Une seule tentative conditionnelle, puis rien : ni passage en revue, ni échec écrit par-dessus.
    expect(ecritures(prisma)).toHaveLength(1);
    expect(prisma.financing_evaluations.update).not.toHaveBeenCalled();
  });

  it('refuse en 409 une seconde demande tant qu’une évaluation est active', async () => {
    const { service, prisma } = monter();
    prisma.financing_evaluations.findMany.mockResolvedValue([ligne({ status: 'en_revue' })]);

    await expect(service.demander('u1', 'p1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.financing_evaluations.create).not.toHaveBeenCalled();
  });

  it('réessaie une fois un conflit de sérialisation passager avant de répondre 409', async () => {
    const { service, prisma } = monter();
    const conflit = new Prisma.PrismaClientKnownRequestError('conflit', { code: 'P2034', clientVersion: '7' });
    const normal = prisma.$transaction.getMockImplementation();
    prisma.$transaction.mockRejectedValueOnce(conflit).mockImplementation(normal!);

    const vue = await service.demander('u1', 'p1');

    expect(vue.status).toBe('en_preparation');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('traduit un conflit de sérialisation (double clic) en 409', async () => {
    const { service, prisma } = monter();
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('conflit', { code: 'P2034', clientVersion: '7' }),
    );

    await expect(service.demander('u1', 'p1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('accepte une nouvelle demande quand l’active est bloquée en préparation depuis 11 minutes', async () => {
    const { service, prisma } = monter();
    prisma.financing_evaluations.findMany.mockResolvedValue([
      ligne({ status: 'en_preparation', created_at: il_y_a(11), updated_at: il_y_a(11) }),
    ]);

    await service.demander('u1', 'p1');

    expect(prisma.financing_evaluations.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'echec' }) }),
    );
    expect(prisma.financing_evaluations.create).toHaveBeenCalled();
  });

  it('ne crée rien quand le solde ne couvre pas l’évaluation (402 tout de suite, pas un échec plus tard)', async () => {
    const { service, prisma, credits, claude } = monter();
    credits.exigerSolde.mockRejectedValue(new CreditsInsuffisantsException(6, 2));

    await expect(service.demander('u1', 'p1')).rejects.toBeInstanceOf(CreditsInsuffisantsException);
    expect(credits.exigerSolde).toHaveBeenCalledWith('u1', 'evaluer');
    expect(prisma.financing_evaluations.create).not.toHaveBeenCalled();
    expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
  });

  it('ne crée rien quand les générateurs sont éteints (503)', async () => {
    const { service, prisma } = monter();
    process.env.IGINI_AI_ENABLED = 'false';

    await expect(service.demander('u1', 'p1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.financing_evaluations.create).not.toHaveBeenCalled();
  });

  it('renvoie 404 pour le projet d’un autre', async () => {
    const { service, prisma } = monter();
    prisma.projects.findFirst.mockResolvedValue(null);

    await expect(service.demander('u2', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.lister('u2', 'p1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

/**
 * La génération tourne en arrière-plan, et le monde bouge pendant ce temps :
 * ce qui n'arrive pas en revue ne se paie pas.
 */
describe('EvaluationService — les crédits de l’évaluation', () => {
  const flagInitial = process.env.IGINI_AI_ENABLED;
  beforeEach(() => {
    process.env.IGINI_AI_ENABLED = 'true';
  });
  afterAll(() => {
    if (flagInitial === undefined) delete process.env.IGINI_AI_ENABLED;
    else process.env.IGINI_AI_ENABLED = flagInitial;
  });

  /** Claude réserve le prix, puis répond (comme le vrai ClaudeService). */
  function reserveEtRepond(claude: ReturnType<typeof monter>['claude'], reponse: unknown = rapport()) {
    claude.generateStructuredOutput.mockImplementation(
      async (requete: { surReservation?: (r: { id: string; credits: number; soldeApres: number }) => void }) => {
        requete.surReservation?.({ id: 'debit-eval', credits: 6, soldeApres: 24 });
        return reponse;
      },
    );
  }

  it('un membre demande : le propriétaire du projet paie, le membre reste l’acteur', async () => {
    const { service, prisma, claude, projects } = monter();
    prisma.financing_evaluations.findUnique.mockResolvedValue(ligne({ requested_by: 'u2' }));

    await service.generer('e1');

    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({ usage: { userId: 'u1', actorId: 'u2', projectId: 'p1', generator: 'evaluer' } }),
    );
    // Le contexte se lit chez le propriétaire, comme le paiement.
    expect(projects.contexteEvaluation).toHaveBeenCalledWith('u1', 'p1');
  });

  it('le débit porte l’identifiant de l’évaluation, pour être retrouvé si elle est interrompue', async () => {
    const { service, claude } = monter();

    await service.generer('e1');

    expect(claude.generateStructuredOutput.mock.calls[0][0].appelId).toBe('e1');
  });

  it('rend les crédits d’un rapport arrivé trop tard (l’évaluation n’est plus en préparation)', async () => {
    const { service, prisma, claude, credits } = monter();
    reserveEtRepond(claude);
    prisma.financing_evaluations.updateMany.mockResolvedValue({ count: 0 });

    await service.generer('e1');

    expect(credits.rendreResultatNonEnregistre).toHaveBeenCalledTimes(1);
    expect(credits.rendreResultatNonEnregistre).toHaveBeenCalledWith('debit-eval');
  });

  it('rend les crédits quand le rapport ne peut pas être enregistré', async () => {
    const { service, prisma, claude, credits } = monter();
    reserveEtRepond(claude);
    prisma.financing_evaluations.updateMany
      .mockRejectedValueOnce(new Error('base indisponible'))
      .mockResolvedValue({ count: 1 });

    await service.generer('e1');

    expect(credits.rendreResultatNonEnregistre).toHaveBeenCalledWith('debit-eval');
    expect(ecritures(prisma).at(-1)?.data).toMatchObject({ status: 'echec' });
  });

  it('ne rend rien quand le rapport passe en revue', async () => {
    const { service, claude, credits } = monter();
    reserveEtRepond(claude);

    await service.generer('e1');

    expect(credits.rendreResultatNonEnregistre).not.toHaveBeenCalled();
  });

  it('un échec de l’appel lui-même est déjà rendu par ClaudeService : pas une seconde fois ici', async () => {
    const { service, claude, credits } = monter();
    claude.generateStructuredOutput.mockRejectedValue(new InternalServerErrorException('panne'));

    await service.generer('e1');

    expect(credits.rendreResultatNonEnregistre).not.toHaveBeenCalled();
  });

  it('une préparation interrompue (serveur redémarré) est rendue quand on la range en échec', async () => {
    const { service, prisma, credits } = monter();
    prisma.financing_evaluations.findMany.mockResolvedValue([
      ligne({ id: 'e-perdue', status: 'en_preparation', created_at: il_y_a(11), updated_at: il_y_a(11) }),
    ]);
    prisma.financing_evaluations.create.mockResolvedValue(ligne({ id: 'e2' }));

    await service.demander('u1', 'p1');

    expect(credits.rembourserAppel).toHaveBeenCalledTimes(1);
    expect(credits.rembourserAppel).toHaveBeenCalledWith('e-perdue', expect.stringContaining('interrompu'));
  });

  it('ne rend pas une évaluation qui avait déjà son rapport (nouvelle version offerte interrompue)', async () => {
    const { service, prisma, credits } = monter();
    prisma.financing_evaluations.findMany.mockResolvedValue([
      ligne({
        id: 'e-refaite',
        status: 'en_preparation',
        ai_draft: rapport(),
        redo_instruction: 'Reprends le marché.',
        created_at: il_y_a(60),
        updated_at: il_y_a(11),
      }),
    ]);
    prisma.financing_evaluations.create.mockResolvedValue(ligne({ id: 'e2' }));

    await service.demander('u1', 'p1');

    expect(credits.rembourserAppel).not.toHaveBeenCalled();
  });
});

describe('EvaluationService — prévenir les administrateurs', () => {
  const flagInitial = process.env.IGINI_AI_ENABLED;
  beforeEach(() => {
    process.env.IGINI_AI_ENABLED = 'true';
  });
  afterAll(() => {
    if (flagInitial === undefined) delete process.env.IGINI_AI_ENABLED;
    else process.env.IGINI_AI_ENABLED = flagInitial;
  });

  it('envoie un email à chaque administrateur quand une évaluation passe en revue', async () => {
    const { service, prisma, mail } = monter();

    await service.demander('u1', 'p1');
    await finirArrierePlan();

    expect(prisma.user_roles.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: 'administrateur' } }),
    );
    expect(mail.send).toHaveBeenCalledTimes(2);
    const [{ to, subject, text }] = mail.send.mock.calls[0];
    expect(to).toBe('admin1@exemple.fr');
    expect(subject).toContain('Ma boulangerie');
    expect(text).toContain('/evaluations/revue');
  });

  it('ne prévient personne quand la génération échoue ou arrive trop tard', async () => {
    const tardive = monter();
    tardive.prisma.financing_evaluations.updateMany.mockResolvedValue({ count: 0 });
    await tardive.service.demander('u1', 'p1');
    await finirArrierePlan();
    expect(tardive.mail.send).not.toHaveBeenCalled();

    const echec = monter();
    echec.claude.generateStructuredOutput.mockRejectedValue(new Error('panne'));
    await echec.service.demander('u1', 'p1');
    await finirArrierePlan();
    expect(echec.mail.send).not.toHaveBeenCalled();
  });

  it('un email qui ne part pas ne remet pas l’évaluation en échec', async () => {
    const { service, prisma, mail } = monter();
    mail.send.mockRejectedValue(new Error('SMTP injoignable'));

    await service.demander('u1', 'p1');
    await finirArrierePlan();

    expect(ecritures(prisma).map((e) => e.data.status)).toEqual(['en_revue']);
  });
});

describe('EvaluationService — nouvelle version demandée par l’administrateur', () => {
  it('est offerte : l’entrepreneur ne paie pas une version qu’Ignitux a demandée', async () => {
    const { service, claude } = monter();

    await service.generer('e1', 'Reprends le marché.');

    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: { userId: 'u1', actorId: 'u1', projectId: 'p1', generator: 'evaluer', offert: true },
      }),
    );
    // Offerte : pas de débit, donc pas l'identifiant de l'évaluation comme appel
    // (il porte déjà la ligne de coût de la première version).
    expect(claude.generateStructuredOutput.mock.calls[0][0].appelId).toBeUndefined();
  });

  it('une nouvelle version qui échoue laisse l’évaluation en revue, avec une alerte pour l’administrateur', async () => {
    const { service, prisma, claude } = monter();
    claude.generateStructuredOutput.mockRejectedValue(new Error('panne'));

    await service.generer('e1', 'Reprends le marché.');

    expect(ecritures(prisma)[0].data).toEqual({
      status: 'en_revue',
      failure_reason: 'La nouvelle version n’a pas pu être préparée. Le rapport précédent est toujours là.',
    });
  });
});

describe('EvaluationService — lecture par l’entrepreneur', () => {
  it('masque verdict, rapport et note tant que l’évaluation n’est pas validée', async () => {
    const { service, prisma } = monter();
    prisma.financing_evaluations.findMany.mockResolvedValue([
      ligne({ status: 'en_revue', verdict: 'financable', report: rapport(), admin_note: 'note' }),
    ]);

    const [vue] = await service.lister('u1', 'p1');

    expect(vue.status).toBe('en_revue');
    expect(vue.verdict).toBeNull();
    expect(vue.rapport).toBeNull();
    expect(vue.noteIgnitux).toBeNull();
  });

  it('montre tout une fois validée', async () => {
    const { service, prisma } = monter();
    prisma.financing_evaluations.findMany.mockResolvedValue([
      ligne({ status: 'validee', verdict: 'financable', report: rapport(), admin_note: 'note', reviewed_at: MAINTENANT }),
    ]);

    const [vue] = await service.lister('u1', 'p1');

    expect(vue.verdict).toBe('financable');
    expect(vue.rapport).toEqual(rapport());
    expect(vue.noteIgnitux).toBe('note');
  });

  it('montre « en revue » pendant une nouvelle version demandée par l’administrateur', async () => {
    const { service, prisma } = monter();
    prisma.financing_evaluations.findMany.mockResolvedValue([
      ligne({ status: 'en_preparation', redo_instruction: 'reprends le marché' }),
    ]);

    const [vue] = await service.lister('u1', 'p1');

    expect(vue.status).toBe('en_revue');
  });

  it('montre le motif d’un refus et la raison d’un échec', async () => {
    const { service, prisma } = monter();
    prisma.financing_evaluations.findMany.mockResolvedValue([
      ligne({ id: 'a', status: 'refusee', refusal_reason: 'Projet trop flou' }),
      ligne({ id: 'b', status: 'en_preparation', created_at: il_y_a(30), updated_at: il_y_a(30) }),
    ]);

    const [refusee, perdue] = await service.lister('u1', 'p1');

    expect(refusee.motifRefus).toBe('Projet trop flou');
    expect(perdue.status).toBe('echec');
    expect(perdue.motifEchec).toBeTruthy();
  });

  it('refuse le PDF (404) d’une évaluation non validée', async () => {
    const { service, prisma } = monter();
    prisma.financing_evaluations.findFirst.mockResolvedValue(ligne({ status: 'en_revue' }));

    await expect(service.pdf('u1', 'p1', 'e1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('produit le PDF d’une évaluation validée, nommé d’après le projet', async () => {
    const { service, prisma } = monter();
    prisma.financing_evaluations.findFirst.mockResolvedValue(
      ligne({ status: 'validee', verdict: 'financable', report: rapport(), reviewed_at: MAINTENANT }),
    );

    const { fichier, nom } = await service.pdf('u1', 'p1', 'e1');

    expect(fichier.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(nom).toBe('dossier-financement-ma-boulangerie.pdf');
  });
});
