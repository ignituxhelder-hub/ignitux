import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConstitutionService } from '../constitution/constitution.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CommunityService } from './community.service.js';

describe('CommunityService', () => {
  let service: CommunityService;
  let prisma: {
    projects: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
    community_comments: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  };
  let constitution: { guard: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      projects: { findMany: vi.fn(), findFirst: vi.fn() },
      community_comments: { findMany: vi.fn(), create: vi.fn() },
    };

    constitution = { guard: vi.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConstitutionService, useValue: constitution },
      ],
    }).compile();

    service = module.get<CommunityService>(CommunityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /**
   * CE QU'UN PROJET PUBLIC MONTRE, ET CE QU'IL NE MONTRE PAS.
   *
   * Deux articles se rencontrent ici et tirent en sens inverse. L'article 21
   * — « les créateurs conservent la reconnaissance de leurs idées » — exige
   * qu'on sache de qui vient le projet. L'article 13 — « les données privées
   * sont protégées par défaut » — interdit d'y mettre une adresse email.
   *
   * La réponse est le nom d'affichage, que la personne a choisi de donner, et
   * rien d'autre. Ces tests tiennent les deux bords : le nom passe,
   * l'adresse jamais.
   */
  describe('listPublicProjects', () => {
    it('demande le porteur sans jamais demander son adresse', async () => {
      prisma.projects.findMany.mockResolvedValue([]);

      await service.listPublicProjects();

      const appel = prisma.projects.findMany.mock.calls[0][0];
      expect(appel.where).toEqual({ is_public: true });
      expect(appel.select.owner).toBeDefined();
      // Le test le plus utile du lot : il échouerait si quelqu'un rajoutait
      // `email: true` un jour, pour une raison qui semblera bonne.
      expect(JSON.stringify(appel.select)).not.toContain('email');
    });

    it('rend le nom du porteur, et null quand il n’en a pas mis', async () => {
      prisma.projects.findMany.mockResolvedValue([
        { id: 'p1', title: 'A', description: null, created_at: new Date(0),
          owner: { profile: { display_name: 'Camille' } } },
        { id: 'p2', title: 'B', description: null, created_at: new Date(0),
          owner: { profile: { display_name: null } } },
        { id: 'p3', title: 'C', description: null, created_at: new Date(0), owner: null },
      ]);

      const projets = await service.listPublicProjects();

      expect(projets.map((p) => p.porteur)).toEqual(['Camille', null, null]);
      // `null` et non « Anonyme » : la personne n'a pas choisi l'anonymat,
      // elle n'a simplement pas rempli son nom. L'interface le dira avec ses
      // mots plutôt que d'inventer une intention.
      expect(projets.every((p) => !('owner' in p))).toBe(true);
    });

    it('soumet l’attribution à la Constitution avant de servir', async () => {
      // Article 21, règle `projet-public-sans-porteur`. Ce qui est vérifié
      // est que la requête a ramené le porteur — pas qu'il a un nom : une
      // personne sans nom d'affichage n'est pas une violation.
      prisma.projects.findMany.mockResolvedValue([
        { id: 'p1', title: 'A', description: null, created_at: new Date(0), owner: null },
      ]);

      await service.listPublicProjects();

      expect(constitution.guard).toHaveBeenCalledWith({
        kind: 'expose_public_project',
        carriesAuthor: true,
      });
    });

    it('signale à la Constitution une requête qui a perdu son porteur', async () => {
      // Le jour où quelqu'un retire la jointure de `PROJET_PUBLIC`, les
      // projets redeviennent anonymes. Sans ce contrôle, rien ne s'y
      // opposerait — et c'est précisément ce que l'article interdit.
      prisma.projects.findMany.mockResolvedValue([
        { id: 'p1', title: 'A', description: null, created_at: new Date(0) },
      ]);

      await service.listPublicProjects();

      expect(constitution.guard).toHaveBeenCalledWith({
        kind: 'expose_public_project',
        carriesAuthor: false,
      });
    });
  });

  describe('getPublicProject', () => {
    it("lève une NotFoundException si le projet n'est pas public", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.getPublicProject('p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('renvoie le projet public trouvé, avec son porteur', async () => {
      const date = new Date(0);
      prisma.projects.findFirst.mockResolvedValue({
        id: 'p1',
        title: 'Idée',
        description: 'Desc',
        created_at: date,
        owner: { profile: { display_name: 'Camille' } },
      });

      await expect(service.getPublicProject('p1')).resolves.toEqual({
        id: 'p1',
        title: 'Idée',
        description: 'Desc',
        created_at: date,
        porteur: 'Camille',
      });
    });
  });

  describe('listComments', () => {
    it("lève une NotFoundException si le projet n'est pas public", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.listComments('p1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.community_comments.findMany).not.toHaveBeenCalled();
    });

    it('liste les commentaires avec le nom de leur auteur', async () => {
      // Avant : un commentaire partait avec son `author_id`, c'est-à-dire un
      // identifiant technique que personne ne peut lire. Un encouragement
      // signé d'un UUID n'encourage personne.
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', is_public: true });
      prisma.community_comments.findMany.mockResolvedValue([
        { id: 'c1', project_id: 'p1', content: 'Bravo !', created_at: new Date(0),
          author_id: 'u1', author: { profile: { display_name: 'Camille' } } },
      ]);

      const result = await service.listComments('p1');

      const appel = prisma.community_comments.findMany.mock.calls[0][0];
      expect(appel.where).toEqual({ project_id: 'p1' });
      expect(JSON.stringify(appel.select)).not.toContain('email');
      // `author_id` reste : l'interface s'en sert pour reconnaître les siens.
      expect(result).toEqual([
        { id: 'c1', project_id: 'p1', content: 'Bravo !', created_at: new Date(0),
          author_id: 'u1', auteur: 'Camille' },
      ]);
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
      prisma.community_comments.create.mockResolvedValue({
        id: 'c1', project_id: 'p1', content: 'Bravo !', created_at: new Date(0),
        author_id: 'u1', author: { profile: { display_name: 'Camille' } },
      });

      await service.addComment('u1', 'p1', 'Bravo !');

      const appel = prisma.community_comments.create.mock.calls[0][0];
      expect(appel.data).toEqual({ project_id: 'p1', author_id: 'u1', content: 'Bravo !' });
      expect(JSON.stringify(appel.select)).not.toContain('email');
    });

    it('rend le commentaire créé dans la même forme que la liste', async () => {
      // L'interface l'ajoute à sa liste sans recharger. S'il arrivait sans
      // nom d'auteur, celui qu'on vient d'écrire serait le seul anonyme de la
      // page — jusqu'au prochain rechargement, ce qui ressemble à un bogue.
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', is_public: true });
      prisma.community_comments.create.mockResolvedValue({
        id: 'c1', project_id: 'p1', content: 'Bravo !', created_at: new Date(0),
        author_id: 'u1', author: { profile: { display_name: 'Camille' } },
      });

      await expect(service.addComment('u1', 'p1', 'Bravo !')).resolves.toEqual({
        id: 'c1', project_id: 'p1', content: 'Bravo !', created_at: new Date(0),
        author_id: 'u1', auteur: 'Camille',
      });
    });
  });
});
