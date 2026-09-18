import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CommunityController } from './community.controller.js';
import { CommunityService } from './community.service.js';

describe('CommunityController', () => {
  let controller: CommunityController;
  let communityService: {
    listPublicProjects: ReturnType<typeof vi.fn>;
    getPublicProject: ReturnType<typeof vi.fn>;
    listComments: ReturnType<typeof vi.fn>;
    addComment: ReturnType<typeof vi.fn>;
  };
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    communityService = {
      listPublicProjects: vi.fn(),
      getPublicProject: vi.fn(),
      listComments: vi.fn(),
      addComment: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommunityController],
      providers: [{ provide: CommunityService, useValue: communityService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CommunityController>(CommunityController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('listPublicProjects délègue au service', async () => {
    communityService.listPublicProjects.mockResolvedValue([{ id: 'p1' }]);

    const result = await controller.listPublicProjects();

    expect(communityService.listPublicProjects).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'p1' }]);
  });

  it('getPublicProject délègue au service', async () => {
    communityService.getPublicProject.mockResolvedValue({ id: 'p1' });

    const result = await controller.getPublicProject('p1');

    expect(communityService.getPublicProject).toHaveBeenCalledWith('p1');
    expect(result).toEqual({ id: 'p1' });
  });

  it('listComments délègue au service', async () => {
    communityService.listComments.mockResolvedValue([{ id: 'c1' }]);

    const result = await controller.listComments('p1');

    expect(communityService.listComments).toHaveBeenCalledWith('p1');
    expect(result).toEqual([{ id: 'c1' }]);
  });

  it('addComment délègue au service avec l\'utilisateur courant', async () => {
    communityService.addComment.mockResolvedValue({ id: 'c1' });

    await controller.addComment(currentUser, 'p1', { content: 'Bravo !' });

    expect(communityService.addComment).toHaveBeenCalledWith('u1', 'p1', 'Bravo !');
  });
});
