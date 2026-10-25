import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CreditsInsuffisantsException } from '../../credits/credits-insuffisants.js';
import { CreditsService } from '../../credits/credits.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ComplianceService } from '../../compliance/compliance.service.js';
import { AutomationService } from '../automation/automation.service.js';
import { ClaudeService } from '../claude/claude.service.js';
import { ExecutionService } from './execution.service.js';

const TACHE = {
  id: 't1',
  project_id: 'p1',
  title: 'Rédiger les CGV',
  description: 'Conditions générales de vente',
  status: 'todo',
  ai_status: null,
  ai_result_kind: null,
  ai_result: null,
  ai_refusal_reason: null,
  ai_run_at: null,
  source: 'manual',
};

const PROJET = {
  id: 'p1',
  owner_id: 'u1',
  title: 'Boulangerie Soleil',
  description: 'Une boulangerie bio de quartier',
  sector: 'Alimentation',
};

const EXIGENCE = {
  id: 'r1',
  title: 'Immatriculer la société',
  description: "Déclarer l'entreprise au guichet unique",
  source_name: 'Service-Public',
  source_url: 'https://www.service-public.fr/x',
  country: 'FR',
  category: 'juridique',
};
const RUN = {
  id: 'run1',
  project_id: 'p1',
  requirement_id: 'r1',
  status: 'a_valider',
  result_kind: null,
  result: null,
  refusal_reason: null,
};

describe('ExecutionService', () => {
  let service: ExecutionService;
  let prisma: {
    projects: { findFirst: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
    tasks: {
      findFirst: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    compliance_requirements: { findUnique: ReturnType<typeof vi.fn> };
    project_compliance_ai_runs: {
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };
  let credits: { rendreResultatNonEnregistre: ReturnType<typeof vi.fn> };
  let claude: { generateStructuredOutput: ReturnType<typeof vi.fn> };
  let automation: { runAfterChange: ReturnType<typeof vi.fn> };
  let compliance: { markChecked: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      projects: {
        findFirst: vi.fn().mockResolvedValue({ ...PROJET }),
        findUnique: vi.fn().mockResolvedValue({ ...PROJET }),
      },
      tasks: {
        findFirst: vi.fn().mockResolvedValue({ ...TACHE }),
        findUnique: vi.fn().mockResolvedValue({ ...TACHE, ai_status: 'en_cours' }),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...TACHE, ...data })),
        // La prise « en cours » : conditionnelle, gagnée par défaut.
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      compliance_requirements: { findUnique: vi.fn().mockResolvedValue({ ...EXIGENCE }) },
      project_compliance_ai_runs: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockImplementation(({ update }) => Promise.resolve({ ...RUN, ...update })),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...RUN, ...data })),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    credits = { rendreResultatNonEnregistre: vi.fn().mockResolvedValue(undefined) };
    compliance = { markChecked: vi.fn().mockResolvedValue({}) };
    claude = { generateStructuredOutput: vi.fn() };
    automation = { runAfterChange: vi.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        ExecutionService,
        { provide: PrismaService, useValue: prisma },
        { provide: ClaudeService, useValue: claude },
        { provide: AutomationService, useValue: automation },
        { provide: ComplianceService, useValue: compliance },
        { provide: CreditsService, useValue: credits },
      ],
    }).compile();
    service = module.get(ExecutionService);
  });

  it('un associé fait faire une tâche : les crédits du propriétaire paient, l’associé reste l’acteur', async () => {
    prisma.projects.findFirst.mockResolvedValue({ ...PROJET, collaborators: [{ role: 'associe' }] });
    claude.generateStructuredOutput.mockResolvedValue({ kind: 'livrable', titre: 'CGV', contenu: 'x' });

    await service.runTask('u2', 'p1', 't1');

    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: { userId: 'u1', actorId: 'u2', projectId: 'p1', generator: 'executer' },
      }),
    );
  });

  it('1. enregistre un livrable à valider, attribué au générateur executer', async () => {
    claude.generateStructuredOutput.mockResolvedValue({
      kind: 'livrable',
      titre: 'CGV',
      contenu: 'Article 1 ...',
    });

    const res = await service.runTask('u1', 'p1', 't1');

    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: { userId: 'u1', actorId: 'u1', projectId: 'p1', generator: 'executer' },
      }),
    );
    const data = prisma.tasks.update.mock.calls[0][0].data;
    expect(data.ai_status).toBe('a_valider');
    expect(data.ai_result_kind).toBe('livrable');
    expect(data.ai_result).toBe('Article 1 ...');
    expect(data.ai_run_at).toBeInstanceOf(Date);
    expect(res.ai_status).toBe('a_valider');
  });

  it('2. rend les étapes en liste numérotée dans ai_result', async () => {
    claude.generateStructuredOutput.mockResolvedValue({
      kind: 'instructions',
      titre: 'Immatriculation',
      contenu: 'À faire en ligne.',
      etapes: ['Créer un compte', 'Payer les frais'],
    });

    await service.runTask('u1', 'p1', 't1');

    const data = prisma.tasks.update.mock.calls[0][0].data;
    expect(data.ai_result_kind).toBe('instructions');
    expect(data.ai_result).toContain('1. Créer un compte');
    expect(data.ai_result).toContain('2. Payer les frais');
  });

  it.each(['a_valider', 'valide'])(
    '3. idempotence : une tâche déjà %s est renvoyée telle quelle sans appel Claude',
    async (aiStatus) => {
      const deja = { ...TACHE, ai_status: aiStatus };
      prisma.tasks.findFirst.mockResolvedValue(deja);

      const res = await service.runTask('u1', 'p1', 't1');

      expect(res).toBe(deja);
      expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
    },
  );

  it("4. tâche d'un autre projet : NotFoundException sans appel Claude", async () => {
    prisma.tasks.findFirst.mockResolvedValue(null);

    await expect(service.runTask('u1', 'p1', 't1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.tasks.findFirst).toHaveBeenCalledWith({
      where: { id: 't1', project_id: 'p1' },
    });
    expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
  });

  it('4b. non-propriétaire : erreur de assertOwnsProject, Claude non appelé', async () => {
    prisma.projects.findFirst.mockResolvedValue(null);

    await expect(service.runTask('autre', 'p1', 't1')).rejects.toBeInstanceOf(NotFoundException);
    expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
  });

  it("5. si Claude échoue (erreur non limite), enregistre 'echec' puis relance", async () => {
    const erreur = new InternalServerErrorException('boom');
    claude.generateStructuredOutput.mockRejectedValue(erreur);

    await expect(service.runTask('u1', 'p1', 't1')).rejects.toBe(erreur);

    expect(prisma.tasks.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ai_status: 'echec' }) }),
    );
  });

  // 402 : crédits insuffisants (refusé avant tout appel IA). IGINI n'a rien
  // tenté : la tâche ne doit pas passer « en échec ».
  it.each([
    new CreditsInsuffisantsException(4, 1),
    new ForbiddenException('Quota'),
    new ServiceUnavailableException('Coupé'),
  ])(
    '5b. erreur 402/403/503 : relancée telle quelle, tâche non modifiée',
    async (erreur) => {
      claude.generateStructuredOutput.mockRejectedValue(erreur);

      await expect(service.runTask('u1', 'p1', 't1')).rejects.toBe(erreur);

      expect(prisma.tasks.update).not.toHaveBeenCalled();
    },
  );

  it("5c. si l'enregistrement du résultat échoue, l'erreur remonte sans écriture 'echec'", async () => {
    claude.generateStructuredOutput.mockResolvedValue({ kind: 'livrable', titre: 'x', contenu: 'y' });
    const erreur = new Error('db down');
    prisma.tasks.update.mockRejectedValue(erreur);

    await expect(service.runTask('u1', 'p1', 't1')).rejects.toBe(erreur);

    expect(prisma.tasks.update).toHaveBeenCalledTimes(1);
    expect(prisma.tasks.update.mock.calls[0][0].data.ai_status).toBe('a_valider');
  });

  /** Claude réserve le prix, puis répond (comme le vrai ClaudeService). */
  function reserveEtRepond(reponse: unknown) {
    claude.generateStructuredOutput.mockImplementation(
      async (requete: { surReservation?: (r: { id: string; credits: number; soldeApres: number }) => void }) => {
        requete.surReservation?.({ id: 'debit-tache', credits: 4, soldeApres: 26 });
        return reponse;
      },
    );
  }

  describe('une seule exécution à la fois (deux clics ne paient pas deux fois)', () => {
    it('prend la tâche « en cours » AVANT l’appel, par une écriture conditionnelle', async () => {
      const ordre: string[] = [];
      prisma.tasks.updateMany.mockImplementation(async () => {
        ordre.push('prise');
        return { count: 1 };
      });
      claude.generateStructuredOutput.mockImplementation(async () => {
        ordre.push('appel');
        return { kind: 'livrable', titre: 'x', contenu: 'y' };
      });

      await service.runTask('u1', 'p1', 't1');

      expect(ordre).toEqual(['prise', 'appel']);
      const prise = prisma.tasks.updateMany.mock.calls[0][0];
      expect(prise.where).toEqual({
        id: 't1',
        OR: [
          { ai_status: null },
          { ai_status: { notIn: ['en_cours', 'a_valider', 'valide'] } },
          { ai_status: 'en_cours', OR: [{ ai_run_at: null }, { ai_run_at: { lt: expect.any(Date) } }] },
        ],
      });
      expect(prise.data).toEqual({ ai_status: 'en_cours', ai_run_at: expect.any(Date) });
      // Une prise de plus de 15 minutes est tenue pour abandonnée (serveur arrêté).
      const limite: Date = prise.where.OR[2].OR[1].ai_run_at.lt;
      expect(prise.data.ai_run_at.getTime() - limite.getTime()).toBe(15 * 60_000);
    });

    it('prise perdue : 409 « Déjà en cours. », sans appel ni débit', async () => {
      prisma.tasks.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.runTask('u1', 'p1', 't1')).rejects.toMatchObject({
        status: 409,
        message: 'Déjà en cours.',
      });
      expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
    });

    it('prise perdue face à une exécution qui vient de finir : la tâche est rendue telle quelle', async () => {
      prisma.tasks.updateMany.mockResolvedValue({ count: 0 });
      const finie = { ...TACHE, ai_status: 'a_valider' };
      prisma.tasks.findUnique.mockResolvedValue(finie);

      await expect(service.runTask('u1', 'p1', 't1')).resolves.toBe(finie);
      expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
    });

    it('deux exécutions simultanées de la même tâche : un seul appel, donc un seul débit', async () => {
      // La base : une seule ligne, et l'écriture conditionnelle de Postgres.
      let aiStatus: string | null = null;
      prisma.tasks.updateMany.mockImplementation(async ({ where, data }) => {
        await new Promise((r) => setImmediate(r));
        const libre = where.OR ? aiStatus === null || !['en_cours', 'a_valider', 'valide'].includes(aiStatus) : where.ai_status === aiStatus;
        if (!libre) return { count: 0 };
        aiStatus = data.ai_status;
        return { count: 1 };
      });
      prisma.tasks.findUnique.mockImplementation(async () => ({ ...TACHE, ai_status: aiStatus }));
      claude.generateStructuredOutput.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 5));
        return { kind: 'livrable', titre: 'x', contenu: 'y' };
      });

      const issues = await Promise.allSettled([service.runTask('u1', 'p1', 't1'), service.runTask('u1', 'p1', 't1')]);

      expect(claude.generateStructuredOutput).toHaveBeenCalledTimes(1);
      const refus = issues.filter((i): i is PromiseRejectedResult => i.status === 'rejected');
      expect(refus).toHaveLength(1);
      expect(refus[0].reason).toBeInstanceOf(ConflictException);
    });

    it.each([
      new CreditsInsuffisantsException(4, 1),
      new ForbiddenException('Quota'),
      new ServiceUnavailableException('Coupé'),
    ])('refus avant l’appel (402/403/503) : la prise est rendue, la tâche retrouve son état', async (erreur) => {
      prisma.tasks.findFirst.mockResolvedValue({ ...TACHE, ai_status: 'refuse', ai_run_at: new Date('2026-10-01') });
      claude.generateStructuredOutput.mockRejectedValue(erreur);

      await expect(service.runTask('u1', 'p1', 't1')).rejects.toBe(erreur);

      expect(prisma.tasks.updateMany).toHaveBeenLastCalledWith({
        where: { id: 't1', ai_status: 'en_cours' },
        data: { ai_status: 'refuse', ai_run_at: new Date('2026-10-01') },
      });
    });

    it('résultat obtenu mais pas enregistré : les crédits sont rendus', async () => {
      reserveEtRepond({ kind: 'livrable', titre: 'x', contenu: 'y' });
      prisma.tasks.update.mockRejectedValue(new Error('tâche supprimée entre-temps'));

      await expect(service.runTask('u1', 'p1', 't1')).rejects.toThrow('tâche supprimée');

      expect(credits.rendreResultatNonEnregistre).toHaveBeenCalledWith('debit-tache');
    });

    it('résultat enregistré : rien n’est rendu', async () => {
      reserveEtRepond({ kind: 'livrable', titre: 'x', contenu: 'y' });

      await service.runTask('u1', 'p1', 't1');

      expect(credits.rendreResultatNonEnregistre).not.toHaveBeenCalled();
    });
  });

  it("6c. le prompt de la tâche contient le projet (titre, description, secteur) et la tâche", async () => {
    claude.generateStructuredOutput.mockResolvedValue({ kind: 'livrable', titre: 'x', contenu: 'y' });

    await service.runTask('u1', 'p1', 't1');

    const content = claude.generateStructuredOutput.mock.calls[0][0].userContent;
    expect(content).toContain(PROJET.title);
    expect(content).toContain(PROJET.description);
    expect(content).toContain('Alimentation');
    expect(content).toContain('Tâche à faire');
    expect(content).toContain(TACHE.title);
    expect(content).not.toContain('Remarque du propriétaire');
  });

  it('6d. le motif de refus est présenté comme la remarque du propriétaire', async () => {
    prisma.tasks.findFirst.mockResolvedValue({ ...TACHE, ai_status: 'refuse', ai_refusal_reason: 'Trop vague' });
    claude.generateStructuredOutput.mockResolvedValue({ kind: 'livrable', titre: 'x', contenu: 'y' });

    await service.runTask('u1', 'p1', 't1');

    const content = claude.generateStructuredOutput.mock.calls[0][0].userContent;
    expect(content).toContain('Remarque du propriétaire sur la version précédente :\nTrop vague');
    expect(content).not.toContain("Ce qu'IGINI sait déjà");
  });

  it("6e. une tâche issue de l'automatisation est refusée avant tout appel Claude", async () => {
    prisma.tasks.findFirst.mockResolvedValue({ ...TACHE, source: 'automation' });

    await expect(service.runTask('u1', 'p1', 't1')).rejects.toBeInstanceOf(BadRequestException);

    expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
    expect(prisma.tasks.update).not.toHaveBeenCalled();
  });

  it('6b. refus puis échec puis relance : le motif reste dans le prompt', async () => {
    prisma.tasks.findFirst.mockResolvedValue({
      ...TACHE,
      ai_status: 'echec',
      ai_refusal_reason: 'Trop vague',
    });
    claude.generateStructuredOutput.mockResolvedValue({ kind: 'livrable', titre: 'x', contenu: 'y' });

    await service.runTask('u1', 'p1', 't1');

    expect(claude.generateStructuredOutput.mock.calls[0][0].userContent).toContain('Trop vague');
  });

  it('6. une tâche refusée avec motif transmet le motif à Claude', async () => {
    prisma.tasks.findFirst.mockResolvedValue({
      ...TACHE,
      ai_status: 'refuse',
      ai_refusal_reason: 'Trop vague, cite les clauses de retour',
    });
    claude.generateStructuredOutput.mockResolvedValue({
      kind: 'livrable',
      titre: 'CGV',
      contenu: 'v2',
    });

    await service.runTask('u1', 'p1', 't1');

    const appel = claude.generateStructuredOutput.mock.calls[0][0];
    expect(appel.userContent).toContain('Trop vague, cite les clauses de retour');
  });

  it("7. validateTask refuse sans résultat à valider, sinon passe la tâche en done", async () => {
    await expect(service.validateTask('u1', 'p1', 't1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.tasks.update).not.toHaveBeenCalled();

    prisma.tasks.findFirst.mockResolvedValue({ ...TACHE, ai_status: 'a_valider' });
    const res = await service.validateTask('u1', 'p1', 't1');

    expect(prisma.tasks.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'done', ai_status: 'valide' } }),
    );
    expect(res.status).toBe('done');
    expect(automation.runAfterChange).toHaveBeenCalledWith('p1');
  });

  it("8. refuseTask n'altère pas status", async () => {
    prisma.tasks.findFirst.mockResolvedValue({ ...TACHE, ai_status: 'a_valider' });

    await service.refuseTask('u1', 'p1', 't1', 'Pas adapté');

    const data = prisma.tasks.update.mock.calls[0][0].data;
    expect(data).toEqual({ ai_status: 'refuse', ai_refusal_reason: 'Pas adapté' });
    expect(data).not.toHaveProperty('status');
  });

  it.each([null, 'valide', 'echec'])('8b. refuseTask rejette si ai_status vaut %s', async (aiStatus) => {
    prisma.tasks.findFirst.mockResolvedValue({ ...TACHE, ai_status: aiStatus });

    await expect(service.refuseTask('u1', 'p1', 't1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tasks.update).not.toHaveBeenCalled();
  });

  describe('conformité', () => {
    // Une réponse de ClaudeService pour la conformité : sortie structurée + pages réellement lues.
    const REPONSE = { kind: 'livrable', titre: 'x', contenu: 'y', ce_que_dit_la_source: [], pagesLues: [] };
    const run = (statut: string | null, extra = {}) =>
      prisma.project_compliance_ai_runs.findUnique.mockResolvedValue(
        statut ? { ...RUN, status: statut, ...extra } : null,
      );

    it('C1. enregistre un résultat à valider via upsert, générateur conformite (son propre prix)', async () => {
      claude.generateStructuredOutput.mockResolvedValue({
        kind: 'instructions',
        titre: 'Immat',
        contenu: 'À faire.',
        etapes: ['Créer un compte', 'Payer'],
        ce_que_dit_la_source: [],
        pagesLues: [],
      });

      await service.runCompliance('u1', 'p1', 'r1');

      expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          usage: { userId: 'u1', actorId: 'u1', projectId: 'p1', generator: 'conformite' },
        }),
      );
      const arg = prisma.project_compliance_ai_runs.upsert.mock.calls[0][0];
      expect(arg.where).toEqual({
        project_id_requirement_id: { project_id: 'p1', requirement_id: 'r1' },
      });
      expect(arg.update.status).toBe('a_valider');
      expect(arg.update.result_kind).toBe('instructions');
      expect(arg.update.result).toContain('1. Créer un compte');
      expect(arg.update.result).toContain('2. Payer');
      expect(arg.create).toMatchObject({ project_id: 'p1', requirement_id: 'r1', status: 'a_valider' });
    });

    it("C2. le prompt contient titre, description, source_name et source_url de l'exigence", async () => {
      claude.generateStructuredOutput.mockResolvedValue({ ...REPONSE });

      await service.runCompliance('u1', 'p1', 'r1');

      const content = claude.generateStructuredOutput.mock.calls[0][0].userContent;
      expect(content).toContain(EXIGENCE.title);
      expect(content).toContain(EXIGENCE.description);
      expect(content).toContain(EXIGENCE.source_name);
      expect(content).toContain(EXIGENCE.source_url);
    });

    it('C2b. le prompt contient le projet et le motif de refus sous son bon intitulé', async () => {
      run('refuse', { refusal_reason: 'Trop vague' });
      claude.generateStructuredOutput.mockResolvedValue({ ...REPONSE });

      await service.runCompliance('u1', 'p1', 'r1');

      const content = claude.generateStructuredOutput.mock.calls[0][0].userContent;
      expect(content).toContain(PROJET.title);
      expect(content).toContain(PROJET.description);
      expect(content).toContain('Exigence de conformité');
      expect(content).toContain('Remarque du propriétaire sur la version précédente :\nTrop vague');
    });

    it.each(['a_valider', 'valide'])('C3. déjà %s : renvoyé tel quel sans appel Claude', async (st) => {
      run(st);
      const res = await service.runCompliance('u1', 'p1', 'r1');
      expect(res.status).toBe(st);
      expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
    });

    it('C4. exigence inconnue : NotFoundException sans appel Claude', async () => {
      prisma.compliance_requirements.findUnique.mockResolvedValue(null);
      await expect(service.runCompliance('u1', 'p1', 'r1')).rejects.toBeInstanceOf(NotFoundException);
      expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
    });

    it('C4b. non-propriétaire : rejeté, Claude non appelé', async () => {
      prisma.projects.findFirst.mockResolvedValue(null);
      await expect(service.runCompliance('autre', 'p1', 'r1')).rejects.toBeInstanceOf(NotFoundException);
      expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
    });

    it("C5. erreur Claude non limite : écrit 'echec' puis relance", async () => {
      const erreur = new InternalServerErrorException('boom');
      claude.generateStructuredOutput.mockRejectedValue(erreur);

      await expect(service.runCompliance('u1', 'p1', 'r1')).rejects.toBe(erreur);

      const arg = prisma.project_compliance_ai_runs.upsert.mock.calls[0][0];
      expect(arg.update.status).toBe('echec');
      expect(arg.create.status).toBe('echec');
    });

    it.each([
      new CreditsInsuffisantsException(7, 2),
      new ForbiddenException('Quota'),
      new ServiceUnavailableException('Coupé'),
    ])(
      'C5b. 402/403/503 : relancée telle quelle, rien écrit',
      async (erreur) => {
        claude.generateStructuredOutput.mockRejectedValue(erreur);
        await expect(service.runCompliance('u1', 'p1', 'r1')).rejects.toBe(erreur);
        expect(prisma.project_compliance_ai_runs.upsert).not.toHaveBeenCalled();
      },
    );

    it("C5c. échec d'enregistrement : l'erreur remonte sans écriture 'echec'", async () => {
      claude.generateStructuredOutput.mockResolvedValue({ ...REPONSE });
      const erreur = new Error('db down');
      prisma.project_compliance_ai_runs.upsert.mockRejectedValue(erreur);

      await expect(service.runCompliance('u1', 'p1', 'r1')).rejects.toBe(erreur);

      expect(prisma.project_compliance_ai_runs.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.project_compliance_ai_runs.upsert.mock.calls[0][0].update.status).toBe('a_valider');
    });

    describe('une seule exécution à la fois', () => {
      it('sans ligne : la prise crée la ligne « en cours » avant l’appel', async () => {
        claude.generateStructuredOutput.mockResolvedValue({ ...REPONSE });

        await service.runCompliance('u1', 'p1', 'r1');

        expect(prisma.project_compliance_ai_runs.create).toHaveBeenCalledWith({
          data: { project_id: 'p1', requirement_id: 'r1', status: 'en_cours', updated_at: expect.any(Date) },
        });
        expect(prisma.project_compliance_ai_runs.create.mock.invocationCallOrder[0]).toBeLessThan(
          claude.generateStructuredOutput.mock.invocationCallOrder[0],
        );
      });

      it('création concurrente (P2002) : 409 « Déjà en cours. », sans appel', async () => {
        prisma.project_compliance_ai_runs.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
        prisma.project_compliance_ai_runs.findUnique
          .mockResolvedValueOnce(null)
          .mockResolvedValue({ ...RUN, status: 'en_cours' });

        await expect(service.runCompliance('u1', 'p1', 'r1')).rejects.toMatchObject({ status: 409, message: 'Déjà en cours.' });
        expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
      });

      it('avec ligne : prise conditionnelle (libre, ou « en cours » depuis plus de 15 minutes)', async () => {
        run('echec');
        claude.generateStructuredOutput.mockResolvedValue({ ...REPONSE });

        await service.runCompliance('u1', 'p1', 'r1');

        const prise = prisma.project_compliance_ai_runs.updateMany.mock.calls[0][0];
        expect(prise.where).toEqual({
          id: 'run1',
          OR: [
            { status: { notIn: ['en_cours', 'a_valider', 'valide'] } },
            { status: 'en_cours', OR: [{ updated_at: null }, { updated_at: { lt: expect.any(Date) } }] },
          ],
        });
        expect(prise.data).toEqual({ status: 'en_cours', updated_at: expect.any(Date) });
      });

      it('prise perdue sur une ligne existante : 409, sans appel', async () => {
        run('echec');
        prisma.project_compliance_ai_runs.updateMany.mockResolvedValue({ count: 0 });

        await expect(service.runCompliance('u1', 'p1', 'r1')).rejects.toBeInstanceOf(ConflictException);
        expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
      });

      it('402 : la ligne créée par la prise est retirée', async () => {
        claude.generateStructuredOutput.mockRejectedValue(new CreditsInsuffisantsException(7, 2));

        await expect(service.runCompliance('u1', 'p1', 'r1')).rejects.toBeInstanceOf(CreditsInsuffisantsException);

        expect(prisma.project_compliance_ai_runs.deleteMany).toHaveBeenCalledWith({
          where: { project_id: 'p1', requirement_id: 'r1', status: 'en_cours' },
        });
      });

      it('402 : une ligne existante retrouve son statut', async () => {
        run('refuse', { refusal_reason: 'Trop vague' });
        claude.generateStructuredOutput.mockRejectedValue(new CreditsInsuffisantsException(7, 2));

        await expect(service.runCompliance('u1', 'p1', 'r1')).rejects.toBeInstanceOf(CreditsInsuffisantsException);

        expect(prisma.project_compliance_ai_runs.updateMany).toHaveBeenLastCalledWith({
          where: { id: 'run1', status: 'en_cours' },
          data: { status: 'refuse' },
        });
        expect(prisma.project_compliance_ai_runs.deleteMany).not.toHaveBeenCalled();
      });

      it('deux exécutions simultanées : un seul appel, donc un seul débit', async () => {
        let ligne: { status: string } | null = null;
        prisma.project_compliance_ai_runs.findUnique.mockImplementation(async () => (ligne ? { ...RUN, ...ligne } : null));
        prisma.project_compliance_ai_runs.create.mockImplementation(async ({ data }) => {
          await new Promise((r) => setImmediate(r));
          if (ligne) throw Object.assign(new Error('unique'), { code: 'P2002' });
          ligne = { status: data.status };
          return { ...RUN, ...data };
        });
        claude.generateStructuredOutput.mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 5));
          return { ...REPONSE };
        });

        const issues = await Promise.allSettled([
          service.runCompliance('u1', 'p1', 'r1'),
          service.runCompliance('u1', 'p1', 'r1'),
        ]);

        expect(claude.generateStructuredOutput).toHaveBeenCalledTimes(1);
        expect(issues.filter((i) => i.status === 'rejected')).toHaveLength(1);
      });

      it('résultat obtenu mais pas enregistré : les crédits sont rendus', async () => {
        claude.generateStructuredOutput.mockImplementation(
          async (requete: { surReservation?: (r: { id: string; credits: number; soldeApres: number }) => void }) => {
            requete.surReservation?.({ id: 'debit-conformite', credits: 7, soldeApres: 23 });
            return { ...REPONSE };
          },
        );
        prisma.project_compliance_ai_runs.upsert.mockRejectedValue(new Error('db down'));

        await expect(service.runCompliance('u1', 'p1', 'r1')).rejects.toThrow('db down');

        expect(credits.rendreResultatNonEnregistre).toHaveBeenCalledWith('debit-conformite');
      });
    });

    it('C9. IGINI lit la source : web_fetch limité au seul site de la source', async () => {
      claude.generateStructuredOutput.mockResolvedValue({ ...REPONSE });

      await service.runCompliance('u1', 'p1', 'r1');

      expect(claude.generateStructuredOutput.mock.calls[0][0].webFetch).toEqual({
        allowedDomains: ['www.service-public.fr'],
        maxUses: 2,
        maxContentTokens: 20000,
      });
      expect(claude.generateStructuredOutput.mock.calls[0][0].webSearch).toBeUndefined();
    });

    it('C10. page lue : ce que dit la source en tête, puis le travail, puis la preuve de lecture', async () => {
      claude.generateStructuredOutput.mockResolvedValue({
        ...REPONSE,
        contenu: 'Brouillon prêt.',
        ce_que_dit_la_source: ['Le dépôt se fait en ligne', 'Un justificatif de domicile est demandé'],
        pagesLues: [
          { url: 'https://www.service-public.fr/x', titre: 'Immatriculation', luLe: '2026-10-10T08:00:00Z' },
        ],
      });

      await service.runCompliance('u1', 'p1', 'r1');

      const texte: string = prisma.project_compliance_ai_runs.upsert.mock.calls[0][0].update.result;
      expect(texte).not.toContain('n’a pas pu lire');
      expect(texte.indexOf('Ce que dit la source pour ton projet :')).toBe(0);
      expect(texte).toContain('- Le dépôt se fait en ligne');
      expect(texte.indexOf('Brouillon prêt.')).toBeGreaterThan(texte.indexOf('justificatif'));
      expect(texte).toContain('IGINI a lu :\n- Immatriculation — https://www.service-public.fr/x (le 10/10/2026)');
    });

    it("C11. aucune page lue : l'avertissement passe en tête, et aucun « ce que dit la source » de mémoire", async () => {
      // Le modèle a rempli le résumé alors que rien n'a été lu : ce résumé
      // vient de sa mémoire et ne doit pas être présenté comme la source.
      claude.generateStructuredOutput.mockResolvedValue({
        ...REPONSE,
        contenu: 'Brouillon générique.',
        ce_que_dit_la_source: ['Un point inventé'],
        pagesLues: [],
      });

      await service.runCompliance('u1', 'p1', 'r1');

      const texte: string = prisma.project_compliance_ai_runs.upsert.mock.calls[0][0].update.result;
      expect(texte.startsWith('⚠️ IGINI n’a pas pu lire la page officielle (https://www.service-public.fr/x)')).toBe(true);
      expect(texte).not.toContain('Un point inventé');
      expect(texte).not.toContain('IGINI a lu');
      expect(texte).toContain('Brouillon générique.');
    });

    it.each(['refuse', 'echec'])('C6. le motif de refus est transmis (statut %s)', async (st) => {
      run(st, { refusal_reason: 'Trop vague' });
      claude.generateStructuredOutput.mockResolvedValue({ ...REPONSE });

      await service.runCompliance('u1', 'p1', 'r1');

      expect(claude.generateStructuredOutput.mock.calls[0][0].userContent).toContain('Trop vague');
    });

    it('C7. validateCompliance exige a_valider, sinon coche via markChecked et passe à valide', async () => {
      await expect(service.validateCompliance('u1', 'p1', 'r1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(compliance.markChecked).not.toHaveBeenCalled();

      run('a_valider');
      const res = await service.validateCompliance('u1', 'p1', 'r1');

      expect(compliance.markChecked).toHaveBeenCalledWith('u1', 'p1', 'r1');
      expect(prisma.project_compliance_ai_runs.upsert.mock.calls[0][0].update).toEqual({
        status: 'valide',
      });
      expect(res.status).toBe('valide');
    });

    it('C8. refuseCompliance enregistre le motif et ne coche rien', async () => {
      run('a_valider');

      await service.refuseCompliance('u1', 'p1', 'r1', 'Pas adapté');

      expect(prisma.project_compliance_ai_runs.upsert.mock.calls[0][0].update).toEqual({
        status: 'refuse',
        refusal_reason: 'Pas adapté',
      });
      expect(compliance.markChecked).not.toHaveBeenCalled();
    });

    it.each([null, 'valide', 'echec'])('C8b. refuseCompliance rejette si statut %s', async (st) => {
      run(st);
      await expect(service.refuseCompliance('u1', 'p1', 'r1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.project_compliance_ai_runs.upsert).not.toHaveBeenCalled();
    });
  });
});
