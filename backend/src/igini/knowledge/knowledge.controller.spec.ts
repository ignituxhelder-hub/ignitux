import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { KnowledgeController } from './knowledge.controller.js';
import { KnowledgeService } from './knowledge.service.js';

describe('KnowledgeController (traversée et recherche)', () => {
  let controller: KnowledgeController;
  let knowledgeService: Record<string, ReturnType<typeof vi.fn>>;
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    knowledgeService = {
      createConcept: vi.fn(),
      listConcepts: vi.fn(),
      link: vi.fn(),
      getGraph: vi.fn(),
      searchConcepts: vi.fn().mockResolvedValue([]),
      listCategories: vi.fn().mockResolvedValue([]),
      getNeighbourhood: vi.fn().mockResolvedValue({}),
      findPath: vi.fn().mockResolvedValue({}),
      deleteConcept: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [KnowledgeController],
      providers: [{ provide: KnowledgeService, useValue: knowledgeService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<KnowledgeController>(KnowledgeController);
  });

  it('searchConcepts transmet requête, catégorie et projet', async () => {
    await controller.searchConcepts(currentUser, 'atelier', 'marché', 'p1');

    expect(knowledgeService.searchConcepts).toHaveBeenCalledWith('u1', {
      query: 'atelier',
      category: 'marché',
      projectId: 'p1',
    });
  });

  it('getNeighbourhood retombe sur une profondeur de 1 si le paramètre est illisible', async () => {
    // Une profondeur mal formée dans l'URL ne doit pas faire échouer la
    // requête sous les yeux de l'utilisateur.
    await controller.getNeighbourhood(currentUser, 'c1', 'beaucoup');

    expect(knowledgeService.getNeighbourhood).toHaveBeenCalledWith('u1', 'c1', 1);
  });

  it('getNeighbourhood transmet une profondeur valide', async () => {
    await controller.getNeighbourhood(currentUser, 'c1', '2');

    expect(knowledgeService.getNeighbourhood).toHaveBeenCalledWith('u1', 'c1', 2);
  });

  it('findPath, deleteConcept et unlink délèguent au service', async () => {
    await controller.findPath(currentUser, 'c1', 'c2');
    await controller.deleteConcept(currentUser, 'c1');
    await controller.unlink(currentUser, 'l1');

    expect(knowledgeService.findPath).toHaveBeenCalledWith('u1', 'c1', 'c2');
    expect(knowledgeService.deleteConcept).toHaveBeenCalledWith('u1', 'c1');
    expect(knowledgeService.unlink).toHaveBeenCalledWith('u1', 'l1');
  });

  it('listCategories délègue au service', async () => {
    await controller.listCategories(currentUser, 'p1');

    expect(knowledgeService.listCategories).toHaveBeenCalledWith('u1', 'p1');
  });
});

describe('KnowledgeController', () => {
  let controller: KnowledgeController;
  let knowledgeService: {
    createConcept: ReturnType<typeof vi.fn>;
    listConcepts: ReturnType<typeof vi.fn>;
    link: ReturnType<typeof vi.fn>;
    getGraph: ReturnType<typeof vi.fn>;
  };
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    knowledgeService = {
      createConcept: vi.fn(),
      listConcepts: vi.fn(),
      link: vi.fn(),
      getGraph: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [KnowledgeController],
      providers: [{ provide: KnowledgeService, useValue: knowledgeService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<KnowledgeController>(KnowledgeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('createConcept délègue au service', async () => {
    knowledgeService.createConcept.mockResolvedValue({ id: 'c1' });

    await controller.createConcept(currentUser, {
      name: 'Concept',
      description: 'Desc',
      category: 'marché',
      projectId: 'p1',
    });

    expect(knowledgeService.createConcept).toHaveBeenCalledWith('u1', 'Concept', 'Desc', 'marché', 'p1');
  });

  it('listConcepts délègue au service', async () => {
    knowledgeService.listConcepts.mockResolvedValue([{ id: 'c1' }]);

    const result = await controller.listConcepts(currentUser, 'p1');

    expect(knowledgeService.listConcepts).toHaveBeenCalledWith('u1', 'p1');
    expect(result).toEqual([{ id: 'c1' }]);
  });

  it('link délègue au service', async () => {
    knowledgeService.link.mockResolvedValue({ id: 'l1' });

    await controller.link(currentUser, 'c1', { toConceptId: 'c2', relationType: 'depend_de' });

    expect(knowledgeService.link).toHaveBeenCalledWith('u1', 'c1', 'c2', 'depend_de');
  });

  it('getGraph délègue au service', async () => {
    knowledgeService.getGraph.mockResolvedValue({ nodes: [], edges: [] });

    const result = await controller.getGraph(currentUser, 'p1');

    expect(knowledgeService.getGraph).toHaveBeenCalledWith('u1', 'p1');
    expect(result).toEqual({ nodes: [], edges: [] });
  });
});
