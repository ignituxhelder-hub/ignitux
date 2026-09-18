import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { CommunityService } from './community.service.js';

describe('CommunityService', () => {
  let service: CommunityService;
  let prisma: {
    projects: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
    community_comments: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      projects: { findMany: vi.fn(), findFirst: vi.fn() },
      community_comments: { findMany: vi.fn(), create: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CommunityService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<CommunityService>(CommunityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listPublicProjects', () => {
    it('ne renvoie que les champs publics, sans owner_id', async () => {
      prisma.projects.findMany.mockResolvedValue([]);

      await service.listPublicProjects();

      expect(prisma.projects.findMany).toHaveBeenCalledWith({
        where: { is_public: true },
        select: { id: true, title: true, description: true, created_at: true },
        orderBy: { created_at: 'desc' },
      });
    });
  });

  describe('getPublicProject', () => {
    it("lève une NotFoundException si le projet n'est pas public", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.getPublicProject('p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('renvoie le projet public trouvé', async () => {
      const project = { id: 'p1', title: 'Idée', description: 'Desc', created_at: new Date() };
      prisma.projects.findFirst.mockResolvedValue(project);

      await expect(service.getPublicProject('p1')).resolves.toEqual(project);
    });
  });

  describe('listComments', () => {
    it("lève une NotFoundException si le projet n'est pas public", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.listComments('p1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.community_comments.findMany).not.toHaveBeenCalled();
    });

    it('liste les commentaires du projet public', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', is_public: true });
      prisma.community_comments.findMany.mockResolvedValue([{ id: 'c1' }]);

      const result = await service.listComments('p1');

      expect(prisma.community_comments.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        orderBy: { created_at: 'desc' },
      });
      expect(result).toEqual([{ id: 'c1' }]);
    });
  });

  describe('addComment', () => {
    it("lève une NotFoundException si le projet n'est pas public", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.addComment('u1', 'p1', 'Bravo !')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.community_comments.create).not.toHaveBeenCalled();
    });

    it('crée le commentaire une fois le projet vérifié public', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', is_public: true });
      prisma.community_comments.create.mockResolvedValue({ id: 'c1' });

      await service.addComment('u1', 'p1', 'Bravo !');

      expect(prisma.community_comments.create).toHaveBeenCalledWith({
        data: { project_id: 'p1', author_id: 'u1', content: 'Bravo !' },
      });
    });
  });
});
