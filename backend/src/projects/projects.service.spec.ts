import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from './projects.service.js';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let prisma: {
    projects: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    prisma = { projects: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ProjectsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('create scope le projet au propriétaire', async () => {
    prisma.projects.create.mockResolvedValue({ id: 'p1', owner_id: 'u1', title: 'Idée' });

    await service.create('u1', 'Idée', 'Description');

    expect(prisma.projects.create).toHaveBeenCalledWith({
      data: { owner_id: 'u1', title: 'Idée', description: 'Description' },
    });
  });

  it("findOneForOwner lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
    prisma.projects.findFirst.mockResolvedValue(null);

    await expect(service.findOneForOwner('u1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findOneForOwner renvoie le projet trouvé', async () => {
    const project = { id: 'p1', owner_id: 'u1', title: 'Idée' };
    prisma.projects.findFirst.mockResolvedValue(project);

    await expect(service.findOneForOwner('u1', 'p1')).resolves.toEqual(project);
  });
});
