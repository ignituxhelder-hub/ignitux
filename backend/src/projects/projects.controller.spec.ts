import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let projectsService: {
    create: ReturnType<typeof vi.fn>;
    findAllForOwner: ReturnType<typeof vi.fn>;
    findOneForOwner: ReturnType<typeof vi.fn>;
    findOneForViewer: ReturnType<typeof vi.fn>;
    updateForOwner: ReturnType<typeof vi.fn>;
    deleteForOwner: ReturnType<typeof vi.fn>;
    setVisibilityForOwner: ReturnType<typeof vi.fn>;
    listCollaborators: ReturnType<typeof vi.fn>;
    addCollaborator: ReturnType<typeof vi.fn>;
    removeCollaborator: ReturnType<typeof vi.fn>;
    analyzeForOwner: ReturnType<typeof vi.fn>;
    listAnalysesForOwner: ReturnType<typeof vi.fn>;
    createBuildPlanForOwner: ReturnType<typeof vi.fn>;
    listBuildPlansForOwner: ReturnType<typeof vi.fn>;
    createFinancingPlanForOwner: ReturnType<typeof vi.fn>;
    listFinancingPlansForOwner: ReturnType<typeof vi.fn>;
    createDevelopmentPlanForOwner: ReturnType<typeof vi.fn>;
    listDevelopmentPlansForOwner: ReturnType<typeof vi.fn>;
    createTransmissionPlanForOwner: ReturnType<typeof vi.fn>;
    listTransmissionPlansForOwner: ReturnType<typeof vi.fn>;
  };
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    projectsService = {
      create: vi.fn(),
      findAllForOwner: vi.fn(),
      findOneForOwner: vi.fn(),
      findOneForViewer: vi.fn(),
      updateForOwner: vi.fn(),
      deleteForOwner: vi.fn(),
      setVisibilityForOwner: vi.fn(),
      listCollaborators: vi.fn(),
      addCollaborator: vi.fn(),
      removeCollaborator: vi.fn(),
      analyzeForOwner: vi.fn(),
      listAnalysesForOwner: vi.fn(),
      createBuildPlanForOwner: vi.fn(),
      listBuildPlansForOwner: vi.fn(),
      createFinancingPlanForOwner: vi.fn(),
      listFinancingPlansForOwner: vi.fn(),
      createDevelopmentPlanForOwner: vi.fn(),
      listDevelopmentPlansForOwner: vi.fn(),
      createTransmissionPlanForOwner: vi.fn(),
      listTransmissionPlansForOwner: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [{ provide: ProjectsService, useValue: projectsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProjectsController>(ProjectsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create délègue au service avec le propriétaire courant', async () => {
    projectsService.create.mockResolvedValue({ id: 'p1' });

    await controller.create(currentUser, { title: 'Idée', description: 'Desc' });

    expect(projectsService.create).toHaveBeenCalledWith('u1', 'Idée', 'Desc');
  });

  it('findAll ne renvoie que les projets du propriétaire courant', async () => {
    projectsService.findAllForOwner.mockResolvedValue([{ id: 'p1' }]);

    const result = await controller.findAll(currentUser);

    expect(projectsService.findAllForOwner).toHaveBeenCalledWith('u1');
    expect(result).toEqual([{ id: 'p1' }]);
  });

  it('findOne délègue au service (propriétaire ou collaborateur)', async () => {
    projectsService.findOneForViewer.mockResolvedValue({ id: 'p1' });

    await controller.findOne(currentUser, 'p1');

    expect(projectsService.findOneForViewer).toHaveBeenCalledWith('u1', 'p1');
  });

  it('update délègue au service avec le propriétaire courant', async () => {
    projectsService.updateForOwner.mockResolvedValue({ id: 'p1', title: 'Nouveau titre' });

    await controller.update(currentUser, 'p1', { title: 'Nouveau titre' });

    expect(projectsService.updateForOwner).toHaveBeenCalledWith('u1', 'p1', 'Nouveau titre', undefined);
  });

  it('remove délègue au service avec le propriétaire courant', async () => {
    projectsService.deleteForOwner.mockResolvedValue(undefined);

    await controller.remove(currentUser, 'p1');

    expect(projectsService.deleteForOwner).toHaveBeenCalledWith('u1', 'p1');
  });

  it('updateVisibility délègue au service avec le propriétaire courant', async () => {
    projectsService.setVisibilityForOwner.mockResolvedValue({ id: 'p1', is_public: true });

    const result = await controller.updateVisibility(currentUser, 'p1', { isPublic: true });

    expect(projectsService.setVisibilityForOwner).toHaveBeenCalledWith('u1', 'p1', true);
    expect(result).toEqual({ id: 'p1', is_public: true });
  });

  it('listCollaborators délègue au service avec l\'utilisateur courant', async () => {
    projectsService.listCollaborators.mockResolvedValue([{ id: 'pc1' }]);

    const result = await controller.listCollaborators(currentUser, 'p1');

    expect(projectsService.listCollaborators).toHaveBeenCalledWith('u1', 'p1');
    expect(result).toEqual([{ id: 'pc1' }]);
  });

  it('addCollaborator délègue au service avec le propriétaire courant', async () => {
    projectsService.addCollaborator.mockResolvedValue({ id: 'pc1' });

    const result = await controller.addCollaborator(currentUser, 'p1', { email: 'b@b.com' });

    expect(projectsService.addCollaborator).toHaveBeenCalledWith('u1', 'p1', 'b@b.com');
    expect(result).toEqual({ id: 'pc1' });
  });

  it('removeCollaborator délègue au service avec le propriétaire courant', async () => {
    projectsService.removeCollaborator.mockResolvedValue(undefined);

    await controller.removeCollaborator(currentUser, 'p1', 'u2');

    expect(projectsService.removeCollaborator).toHaveBeenCalledWith('u1', 'p1', 'u2');
  });

  it('analyze délègue au service avec le propriétaire courant', async () => {
    projectsService.analyzeForOwner.mockResolvedValue({ id: 'a1' });

    const result = await controller.analyze(currentUser, 'p1');

    expect(projectsService.analyzeForOwner).toHaveBeenCalledWith('u1', 'p1');
    expect(result).toEqual({ id: 'a1' });
  });

  it('listAnalyses délègue au service avec le propriétaire courant', async () => {
    projectsService.listAnalysesForOwner.mockResolvedValue([{ id: 'a1' }]);

    const result = await controller.listAnalyses(currentUser, 'p1');

    expect(projectsService.listAnalysesForOwner).toHaveBeenCalledWith('u1', 'p1');
    expect(result).toEqual([{ id: 'a1' }]);
  });

  it('createBuildPlan délègue au service avec le propriétaire courant', async () => {
    projectsService.createBuildPlanForOwner.mockResolvedValue({ id: 'bp1' });

    const result = await controller.createBuildPlan(currentUser, 'p1');

    expect(projectsService.createBuildPlanForOwner).toHaveBeenCalledWith('u1', 'p1');
    expect(result).toEqual({ id: 'bp1' });
  });

  it('listBuildPlans délègue au service avec le propriétaire courant', async () => {
    projectsService.listBuildPlansForOwner.mockResolvedValue([{ id: 'bp1' }]);

    const result = await controller.listBuildPlans(currentUser, 'p1');

    expect(projectsService.listBuildPlansForOwner).toHaveBeenCalledWith('u1', 'p1');
    expect(result).toEqual([{ id: 'bp1' }]);
  });

  it('createFinancingPlan délègue au service avec le propriétaire courant', async () => {
    projectsService.createFinancingPlanForOwner.mockResolvedValue({ id: 'fp1' });

    const result = await controller.createFinancingPlan(currentUser, 'p1');

    expect(projectsService.createFinancingPlanForOwner).toHaveBeenCalledWith('u1', 'p1');
    expect(result).toEqual({ id: 'fp1' });
  });

  it('listFinancingPlans délègue au service avec le propriétaire courant', async () => {
    projectsService.listFinancingPlansForOwner.mockResolvedValue([{ id: 'fp1' }]);

    const result = await controller.listFinancingPlans(currentUser, 'p1');

    expect(projectsService.listFinancingPlansForOwner).toHaveBeenCalledWith('u1', 'p1');
    expect(result).toEqual([{ id: 'fp1' }]);
  });

  it('createDevelopmentPlan délègue au service avec le propriétaire courant', async () => {
    projectsService.createDevelopmentPlanForOwner.mockResolvedValue({ id: 'dp1' });

    const result = await controller.createDevelopmentPlan(currentUser, 'p1');

    expect(projectsService.createDevelopmentPlanForOwner).toHaveBeenCalledWith('u1', 'p1');
    expect(result).toEqual({ id: 'dp1' });
  });

  it('listDevelopmentPlans délègue au service avec le propriétaire courant', async () => {
    projectsService.listDevelopmentPlansForOwner.mockResolvedValue([{ id: 'dp1' }]);

    const result = await controller.listDevelopmentPlans(currentUser, 'p1');

    expect(projectsService.listDevelopmentPlansForOwner).toHaveBeenCalledWith('u1', 'p1');
    expect(result).toEqual([{ id: 'dp1' }]);
  });

  it('createTransmissionPlan délègue au service avec le propriétaire courant', async () => {
    projectsService.createTransmissionPlanForOwner.mockResolvedValue({ id: 'tp1' });

    const result = await controller.createTransmissionPlan(currentUser, 'p1');

    expect(projectsService.createTransmissionPlanForOwner).toHaveBeenCalledWith('u1', 'p1');
    expect(result).toEqual({ id: 'tp1' });
  });

  it('listTransmissionPlans délègue au service avec le propriétaire courant', async () => {
    projectsService.listTransmissionPlansForOwner.mockResolvedValue([{ id: 'tp1' }]);

    const result = await controller.listTransmissionPlans(currentUser, 'p1');

    expect(projectsService.listTransmissionPlansForOwner).toHaveBeenCalledWith('u1', 'p1');
    expect(result).toEqual([{ id: 'tp1' }]);
  });
});
