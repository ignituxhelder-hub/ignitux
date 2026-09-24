import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { EcritureDepasseeGuard } from '../../hors-ligne/ecriture-depassee.guard.js';
import { WorkflowController } from './workflow.controller.js';
import { WorkflowService } from './workflow.service.js';

describe('WorkflowController', () => {
  let controller: WorkflowController;
  let workflowService: {
    createTask: ReturnType<typeof vi.fn>;
    listTasks: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
  };
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    workflowService = { createTask: vi.fn(), listTasks: vi.fn(), updateStatus: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowController],
      providers: [{ provide: WorkflowService, useValue: workflowService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      // Ces tests portent sur la délégation au service, pas sur les gardes.
      // Que celui-ci soit bien monté est vérifié là où ça se voit :
      // test/hors-ligne.e2e-spec.ts, qui passe par la vraie pile HTTP.
      .overrideGuard(EcritureDepasseeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WorkflowController>(WorkflowController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('createTask délègue au service', async () => {
    workflowService.createTask.mockResolvedValue({ id: 't1' });

    await controller.createTask(currentUser, 'p1', { title: 'Titre', description: 'Desc', assignee: 'igini' });

    expect(workflowService.createTask).toHaveBeenCalledWith('u1', 'p1', 'Titre', 'Desc', 'igini');
  });

  it('listTasks délègue au service', async () => {
    workflowService.listTasks.mockResolvedValue([{ id: 't1' }]);

    const result = await controller.listTasks(currentUser, 'p1');

    expect(workflowService.listTasks).toHaveBeenCalledWith('u1', 'p1');
    expect(result).toEqual([{ id: 't1' }]);
  });

  it('updateStatus délègue au service', async () => {
    workflowService.updateStatus.mockResolvedValue({ id: 't1', status: 'done' });

    await controller.updateStatus(currentUser, 't1', { status: 'done' });

    expect(workflowService.updateStatus).toHaveBeenCalledWith('u1', 't1', 'done');
  });
});
