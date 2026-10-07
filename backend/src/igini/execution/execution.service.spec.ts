import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service.js';
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
};

describe('ExecutionService', () => {
  let service: ExecutionService;
  let prisma: {
    projects: { findFirst: ReturnType<typeof vi.fn> };
    tasks: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  };
  let claude: { generateStructuredOutput: ReturnType<typeof vi.fn> };
  let automation: { runAfterChange: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      projects: { findFirst: vi.fn().mockResolvedValue({ id: 'p1' }) },
      tasks: {
        findFirst: vi.fn().mockResolvedValue({ ...TACHE }),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...TACHE, ...data })),
      },
    };
    claude = { generateStructuredOutput: vi.fn() };
    automation = { runAfterChange: vi.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        ExecutionService,
        { provide: PrismaService, useValue: prisma },
        { provide: ClaudeService, useValue: claude },
        { provide: AutomationService, useValue: automation },
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
});
