/**
 * Les droits de l'équipe dans les modules du projet (tâches, mémoire,
 * conformité, exécution par IGINI). Chaque service est monté avec le minimum :
 * seul le contrôle d'accès est éprouvé ici.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ComplianceService } from '../compliance/compliance.service.js';
import { ExecutionService } from '../igini/execution/execution.service.js';
import { MemoryService } from '../igini/memory/memory.service.js';
import { WorkflowService } from '../igini/workflow/workflow.service.js';

const projetAvec = (role: string | null) =>
  role === null ? null : { id: 'p1', owner_id: 'proprio', title: 'Idée', collaborators: [{ role }] };

function prismaPour(role: string | null) {
  return {
    projects: {
      findFirst: vi.fn().mockResolvedValue(projetAvec(role)),
      findUnique: vi.fn().mockResolvedValue({ id: 'p1', owner_id: 'proprio', title: 'Idée' }),
    },
    tasks: {
      findFirst: vi.fn().mockResolvedValue({ id: 't1', project_id: 'p1', status: 'todo', source: 'manuel' }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 't1', project_id: 'p1', ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({ id: 't2' }),
    },
    memories: { create: vi.fn().mockResolvedValue({ id: 'm1' }) },
    compliance_requirements: { findUnique: vi.fn().mockResolvedValue({ id: 'r1' }), findMany: vi.fn().mockResolvedValue([]) },
    project_compliance_checks: { upsert: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
  };
}

const workflow = (role: string | null) =>
  new WorkflowService(prismaPour(role) as never, { runAfterChange: vi.fn() } as never);
const memoire = (role: string | null) =>
  new MemoryService(prismaPour(role) as never, { guard: vi.fn() } as never);
const conformite = (role: string | null) =>
  new ComplianceService(prismaPour(role) as never, { guard: vi.fn() } as never);

describe('droits de l’équipe — tâches', () => {
  it('un salarié coche une tâche', async () => {
    await expect(workflow('salarie').updateStatus('u2', 't1', 'done')).resolves.toMatchObject({ status: 'done' });
  });

  it('un observateur ne coche rien', async () => {
    await expect(workflow('observateur').updateStatus('u2', 't1', 'done')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un comptable ne voit pas les tâches', async () => {
    await expect(workflow('comptable').listTasks('u2', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('quelqu’un sans accès reçoit 404', async () => {
    await expect(workflow(null).listTasks('x', 'p1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('droits de l’équipe — mémoire et conformité', () => {
  it('un salarié ne modifie pas la mémoire du projet', async () => {
    await expect(
      memoire('salarie').remember('u2', 'decision' as never, 'x', 'p1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un comptable ne voit pas la conformité ; un salarié ne la coche pas', async () => {
    await expect(conformite('comptable').listForProject('u2', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(conformite('salarie').markChecked('u2', 'p1', 'r1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un associé coche une démarche de conformité', async () => {
    await expect(conformite('associe').markChecked('u2', 'p1', 'r1')).resolves.toBeDefined();
  });
});

describe('droits de l’équipe — exécution par IGINI', () => {
  function execution(role: string) {
    const claude = {
      generateStructuredOutput: vi.fn().mockResolvedValue({ kind: 'livrable', titre: 'x', contenu: 'y', etapes: [] }),
    };
    const service = new ExecutionService(
      prismaPour(role) as never,
      claude as never,
      { runAfterChange: vi.fn() } as never,
      {} as never,
      { rendreResultatNonEnregistre: vi.fn() } as never,
    );
    return { service, claude };
  }

  it('un salarié ne lance pas IGINI sur une tâche', async () => {
    await expect(execution('salarie').service.runTask('u2', 'p1', 't1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un associé lance IGINI sur une tâche : les crédits du propriétaire paient, l’associé reste l’acteur', async () => {
    const { service, claude } = execution('associe');
    await service.runTask('u2', 'p1', 't1').catch(() => undefined);
    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({ usage: { userId: 'proprio', actorId: 'u2', projectId: 'p1', generator: 'executer' } }),
    );
  });
});
