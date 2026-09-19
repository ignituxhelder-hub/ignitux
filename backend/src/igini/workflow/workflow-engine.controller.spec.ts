import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { WorkflowEngineController } from './workflow-engine.controller.js';
import { WorkflowEngineService } from './workflow-engine.service.js';

describe('WorkflowEngineController', () => {
  let controller: WorkflowEngineController;
  let engine: Record<string, ReturnType<typeof vi.fn>>;
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    engine = {
      listTemplates: vi.fn().mockReturnValue([]),
      listWorkflows: vi.fn().mockResolvedValue([]),
      createWorkflow: vi.fn().mockResolvedValue({}),
      createFromTemplate: vi.fn().mockResolvedValue({}),
      deleteWorkflow: vi.fn().mockResolvedValue(undefined),
      startRun: vi.fn().mockResolvedValue({}),
      advanceRun: vi.fn().mockResolvedValue({}),
      confirmStep: vi.fn().mockResolvedValue({}),
      listEvents: vi.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowEngineController],
      providers: [{ provide: WorkflowEngineService, useValue: engine }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WorkflowEngineController>(WorkflowEngineController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('createWorkflow transmet le projet, le nom et les étapes', async () => {
    const steps = [{ title: 'A', conditionType: 'always', actionType: 'none' }];

    await controller.createWorkflow(currentUser, 'p1', {
      name: 'Mon processus',
      description: 'Desc',
      steps,
    });

    expect(engine.createWorkflow).toHaveBeenCalledWith('u1', 'p1', 'Mon processus', 'Desc', steps);
  });

  it('createFromTemplate transmet le slug du modèle', async () => {
    await controller.createFromTemplate(currentUser, 'p1', { slug: 'methode-ignitux' });

    expect(engine.createFromTemplate).toHaveBeenCalledWith('u1', 'p1', 'methode-ignitux');
  });

  it('confirmStep transmet la position de l\'étape', async () => {
    await controller.confirmStep(currentUser, 'r1', 2);

    expect(engine.confirmStep).toHaveBeenCalledWith('u1', 'r1', 2);
  });

  it('startRun et advanceRun délèguent au moteur', async () => {
    await controller.startRun(currentUser, 'w1');
    await controller.advanceRun(currentUser, 'r1');

    expect(engine.startRun).toHaveBeenCalledWith('u1', 'w1');
    expect(engine.advanceRun).toHaveBeenCalledWith('u1', 'r1');
  });

  it('listTemplates, listWorkflows et listEvents délèguent au moteur', async () => {
    controller.listTemplates();
    await controller.listWorkflows(currentUser, 'p1');
    await controller.listEvents(currentUser, 'r1');

    expect(engine.listTemplates).toHaveBeenCalled();
    expect(engine.listWorkflows).toHaveBeenCalledWith('u1', 'p1');
    expect(engine.listEvents).toHaveBeenCalledWith('u1', 'r1');
  });

  it('deleteWorkflow délègue au moteur', async () => {
    await controller.deleteWorkflow(currentUser, 'w1');

    expect(engine.deleteWorkflow).toHaveBeenCalledWith('u1', 'w1');
  });
});
