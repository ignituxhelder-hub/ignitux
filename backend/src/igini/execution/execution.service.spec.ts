import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
    projects: { findFirst: ReturnType<typeof vi.fn> };
    tasks: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    compliance_requirements: { findUnique: ReturnType<typeof vi.fn> };
    project_compliance_ai_runs: {
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
  };
  let claude: { generateStructuredOutput: ReturnType<typeof vi.fn> };
  let automation: { runAfterChange: ReturnType<typeof vi.fn> };
  let compliance: { markChecked: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      projects: { findFirst: vi.fn().mockResolvedValue({ ...PROJET }) },
      tasks: {
        findFirst: vi.fn().mockResolvedValue({ ...TACHE }),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...TACHE, ...data })),
      },
      compliance_requirements: { findUnique: vi.fn().mockResolvedValue({ ...EXIGENCE }) },
      project_compliance_ai_runs: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockImplementation(({ update }) => Promise.resolve({ ...RUN, ...update })),
      },
    };
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
      ],
    }).compile();
    service = module.get(ExecutionService);
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
        usage: { userId: 'u1', projectId: 'p1', generator: 'executer' },
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

  it.each([new ForbiddenException('Quota'), new ServiceUnavailableException('Coupé')])(
    '5b. erreur 403/503 : relancée telle quelle, tâche non modifiée',
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
    const run = (statut: string | null, extra = {}) =>
      prisma.project_compliance_ai_runs.findUnique.mockResolvedValue(
        statut ? { ...RUN, status: statut, ...extra } : null,
      );

    it('C1. enregistre un résultat à valider via upsert, générateur executer', async () => {
      claude.generateStructuredOutput.mockResolvedValue({
        kind: 'instructions',
        titre: 'Immat',
        contenu: 'À faire.',
        etapes: ['Créer un compte', 'Payer'],
      });

      await service.runCompliance('u1', 'p1', 'r1');

      expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          usage: { userId: 'u1', projectId: 'p1', generator: 'executer' },
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
      claude.generateStructuredOutput.mockResolvedValue({ kind: 'livrable', titre: 'x', contenu: 'y' });

      await service.runCompliance('u1', 'p1', 'r1');

      const content = claude.generateStructuredOutput.mock.calls[0][0].userContent;
      expect(content).toContain(EXIGENCE.title);
      expect(content).toContain(EXIGENCE.description);
      expect(content).toContain(EXIGENCE.source_name);
      expect(content).toContain(EXIGENCE.source_url);
    });

    it('C2b. le prompt contient le projet et le motif de refus sous son bon intitulé', async () => {
      run('refuse', { refusal_reason: 'Trop vague' });
      claude.generateStructuredOutput.mockResolvedValue({ kind: 'livrable', titre: 'x', contenu: 'y' });

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

    it.each([new ForbiddenException('Quota'), new ServiceUnavailableException('Coupé')])(
      'C5b. 403/503 : relancée telle quelle, rien écrit',
      async (erreur) => {
        claude.generateStructuredOutput.mockRejectedValue(erreur);
        await expect(service.runCompliance('u1', 'p1', 'r1')).rejects.toBe(erreur);
        expect(prisma.project_compliance_ai_runs.upsert).not.toHaveBeenCalled();
      },
    );

    it("C5c. échec d'enregistrement : l'erreur remonte sans écriture 'echec'", async () => {
      claude.generateStructuredOutput.mockResolvedValue({ kind: 'livrable', titre: 'x', contenu: 'y' });
      const erreur = new Error('db down');
      prisma.project_compliance_ai_runs.upsert.mockRejectedValue(erreur);

      await expect(service.runCompliance('u1', 'p1', 'r1')).rejects.toBe(erreur);

      expect(prisma.project_compliance_ai_runs.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.project_compliance_ai_runs.upsert.mock.calls[0][0].update.status).toBe('a_valider');
    });

    it.each(['refuse', 'echec'])('C6. le motif de refus est transmis (statut %s)', async (st) => {
      run(st, { refusal_reason: 'Trop vague' });
      claude.generateStructuredOutput.mockResolvedValue({ kind: 'livrable', titre: 'x', contenu: 'y' });

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
