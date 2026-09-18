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
    updateForOwner: ReturnType<typeof vi.fn>;
    deleteForOwner: ReturnType<typeof vi.fn>;
  };
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    projectsService = {
      create: vi.fn(),
      findAllForOwner: vi.fn(),
      findOneForOwner: vi.fn(),
      updateForOwner: vi.fn(),
      deleteForOwner: vi.fn(),
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

  it('findOne délègue au service avec le propriétaire courant', async () => {
    projectsService.findOneForOwner.mockResolvedValue({ id: 'p1' });

    await controller.findOne(currentUser, 'p1');

    expect(projectsService.findOneForOwner).toHaveBeenCalledWith('u1', 'p1');
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
});
