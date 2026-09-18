import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { MemoryController } from './memory.controller.js';
import { MemoryService } from './memory.service.js';

describe('MemoryController', () => {
  let controller: MemoryController;
  let memoryService: {
    remember: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
    summarize: ReturnType<typeof vi.fn>;
    linkToProject: ReturnType<typeof vi.fn>;
  };
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    memoryService = {
      remember: vi.fn(),
      search: vi.fn(),
      summarize: vi.fn(),
      linkToProject: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MemoryController],
      providers: [{ provide: MemoryService, useValue: memoryService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MemoryController>(MemoryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('remember délègue au service avec l\'utilisateur courant', async () => {
    memoryService.remember.mockResolvedValue({ id: 'm1' });

    await controller.remember(currentUser, { category: 'fact', content: 'Contenu', projectId: 'p1' });

    expect(memoryService.remember).toHaveBeenCalledWith('u1', 'fact', 'Contenu', 'p1');
  });

  it('search délègue au service avec les filtres', async () => {
    memoryService.search.mockResolvedValue([{ id: 'm1' }]);

    const result = await controller.search(currentUser, 'texte', 'p1');

    expect(memoryService.search).toHaveBeenCalledWith('u1', 'texte', 'p1');
    expect(result).toEqual([{ id: 'm1' }]);
  });

  it('summarize enveloppe le résumé dans un objet', async () => {
    memoryService.summarize.mockResolvedValue('résumé texte');

    const result = await controller.summarize(currentUser, 'p1');

    expect(memoryService.summarize).toHaveBeenCalledWith('u1', 'p1');
    expect(result).toEqual({ summary: 'résumé texte' });
  });

  it('link délègue au service', async () => {
    memoryService.linkToProject.mockResolvedValue({ id: 'm1' });

    await controller.link(currentUser, 'm1', { projectId: 'p1' });

    expect(memoryService.linkToProject).toHaveBeenCalledWith('u1', 'm1', 'p1');
  });
});
