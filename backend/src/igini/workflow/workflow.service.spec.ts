import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AutomationService } from '../automation/automation.service.js';
import { WorkflowService } from './workflow.service.js';

describe('WorkflowService', () => {
  let service: WorkflowService;
  // Interrogeable depuis les tests : l'orchestration relancée après chaque
  // mutation manuelle est un comportement, pas un détail de câblage.
  const automation = { runAfterChange: vi.fn().mockResolvedValue(undefined) };
  let prisma: {
    tasks: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      createManyAndReturn: ReturnType<typeof vi.fn>;
    };
    projects: { findFirst: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      tasks: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        createManyAndReturn: vi.fn(),
      },
      projects: { findFirst: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        { provide: PrismaService, useValue: prisma },
        // L'orchestration est relancée après chaque mutation manuelle. Un
        // faux suffit ici : ces tests éprouvent la mutation elle-même, pas
        // ce que l'orchestration en fait — vérifié dans son propre test.
        { provide: AutomationService, useValue: automation },
      ],
    }).compile();

    service = module.get<WorkflowService>(WorkflowService);
    automation.runAfterChange.mockClear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTask', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.createTask('u1', 'p1', 'Titre')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.tasks.create).not.toHaveBeenCalled();
    });

    it('crée la tâche avec les valeurs par défaut', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.tasks.create.mockResolvedValue({ id: 't1' });

      await service.createTask('u1', 'p1', 'Titre', 'Desc');

      expect(prisma.tasks.create).toHaveBeenCalledWith({
        data: { project_id: 'p1', title: 'Titre', description: 'Desc', assignee: 'human', source: 'manual' },
      });
    });
  });

  describe('listTasks', () => {
    it("lève une NotFoundException si l'utilisateur n'a pas accès au projet", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.listTasks('u1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.tasks.findMany).not.toHaveBeenCalled();
    });

    it('un collaborateur (pas seulement le propriétaire) peut lister les tâches', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.tasks.findMany.mockResolvedValue([{ id: 't1' }]);

      const result = await service.listTasks('u2-collaborateur', 'p1');

      expect(prisma.tasks.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        orderBy: { created_at: 'asc' },
      });
      expect(result).toEqual([{ id: 't1' }]);
    });
  });

  describe('updateStatus', () => {
    it('lève une NotFoundException si la tâche est introuvable', async () => {
      prisma.tasks.findFirst.mockResolvedValue(null);

      await expect(service.updateStatus('u1', 't1', 'done')).rejects.toBeInstanceOf(NotFoundException);
    });

    it("lève une NotFoundException si le projet de la tâche n'appartient pas à l'utilisateur", async () => {
      prisma.tasks.findFirst.mockResolvedValue({ id: 't1', project_id: 'p1' });
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.updateStatus('u1', 't1', 'done')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.tasks.update).not.toHaveBeenCalled();
    });

    it('met à jour le statut une fois la propriété vérifiée', async () => {
      prisma.tasks.findFirst.mockResolvedValue({ id: 't1', project_id: 'p1' });
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.tasks.update.mockResolvedValue({ id: 't1', status: 'done' });

      await service.updateStatus('u1', 't1', 'done');

      expect(prisma.tasks.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'done' } });
    });
  });

  describe('updateNote', () => {
    it('lève une NotFoundException si la tâche est introuvable', async () => {
      prisma.tasks.findFirst.mockResolvedValue(null);

      await expect(service.updateNote('u1', 't1', 'bloqué')).rejects.toBeInstanceOf(NotFoundException);
    });

    it("n'écrit rien si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.tasks.findFirst.mockResolvedValue({ id: 't1', project_id: 'p1' });
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.updateNote('u1', 't1', 'bloqué')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.tasks.update).not.toHaveBeenCalled();
    });

    it('enregistre la note sans toucher au statut ni au score', async () => {
      prisma.tasks.findFirst.mockResolvedValue({ id: 't1', project_id: 'p1' });
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.tasks.update.mockResolvedValue({ id: 't1', note: 'à faire par téléphone' });

      await service.updateNote('u1', 't1', '  à faire par téléphone ');

      expect(prisma.tasks.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { note: 'à faire par téléphone' } });
      expect(automation.runAfterChange).not.toHaveBeenCalled();
    });

    it('efface la note quand le texte est vide', async () => {
      prisma.tasks.findFirst.mockResolvedValue({ id: 't1', project_id: 'p1' });
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.tasks.update.mockResolvedValue({ id: 't1', note: null });

      await service.updateNote('u1', 't1', '   ');

      expect(prisma.tasks.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { note: null } });
    });
  });

  describe('createTasksFromSuggestions', () => {
    it('ne fait aucun appel si la liste est vide', async () => {
      const result = await service.createTasksFromSuggestions('p1', [], 'analysis');

      expect(result).toEqual([]);
      expect(prisma.tasks.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('crée une tâche par suggestion, assignée à human', async () => {
      prisma.tasks.createManyAndReturn.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);

      await service.createTasksFromSuggestions('p1', ['Étape 1', 'Étape 2'], 'analysis');

      expect(prisma.tasks.createManyAndReturn).toHaveBeenCalledWith({
        data: [
          { project_id: 'p1', title: 'Étape 1', assignee: 'human', source: 'analysis' },
          { project_id: 'p1', title: 'Étape 2', assignee: 'human', source: 'analysis' },
        ],
      });
    });
  });

  describe('orchestration relancée après une action manuelle', () => {
    // Avant, il fallait cliquer « Actualiser » pour que le produit
    // s'aperçoive de ce qu'on venait de lui dire. Une tâche ajoutée ne
    // bougeait ni les tâches d'étape, ni les liens de concepts, ni le score.
    it("se relance quand une tâche est créée à la main", async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.tasks.create.mockResolvedValue({ id: 't1', project_id: 'p1' });

      await service.createTask('u1', 'p1', 'Trouver un local');

      expect(automation.runAfterChange).toHaveBeenCalledWith('p1');
    });

    // Le score Construction est le rapport des tâches terminées : le laisser
    // figé jusqu'au prochain rechargement ferait douter du chiffre plutôt
    // que de la tâche.
    it('se relance quand une tâche change de statut', async () => {
      prisma.tasks.findFirst.mockResolvedValue({ id: 't1', project_id: 'p1' });
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.tasks.update.mockResolvedValue({ id: 't1', status: 'done' });

      await service.updateStatus('u1', 't1', 'done');

      expect(automation.runAfterChange).toHaveBeenCalledWith('p1');
    });
  });

  describe('ne dit pas à qui n’a pas accès si une tâche existe', () => {
    // Les routes `tasks/:taskId/...` ne reçoivent que l'id de la tâche. Lue
    // seule, puis le droit vérifié sur son projet, elle répondait « Tâche
    // introuvable. » à un id inconnu et « Projet introuvable. » à la tâche
    // d'un autre : n'importe quel compte apprenait ainsi qu'elle existe.
    // Ici, la fausse base évalue VRAIMENT le filtre de la lecture.
    const PROPRIO = 'proprio';
    const INCONNU = 'inconnu';
    const TACHE = { id: 't1', project_id: 'p1', status: 'pending' };
    const PROJET = { id: 'p1', owner_id: PROPRIO };
    const EQUIPE = [
      { user_id: 'observateur', role: 'observateur' },
      { user_id: 'salarie', role: 'salarie' },
    ];

    /** Le filtre « propriétaire OU membre de l'équipe », et lui seul. */
    function equipeDe(filtre: unknown): string {
      const userId = (filtre as { OR?: [{ owner_id?: string }] } | undefined)?.OR?.[0]?.owner_id;
      const attendu = { OR: [{ owner_id: userId }, { collaborators: { some: { user_id: userId } } }] };
      if (!userId || JSON.stringify(filtre) !== JSON.stringify(attendu)) {
        throw new Error(`Filtre de projet non géré : ${JSON.stringify(filtre)}`);
      }
      return userId;
    }
    const voitLeProjet = (userId: string) => PROJET.owner_id === userId || EQUIPE.some((m) => m.user_id === userId);

    beforeEach(() => {
      prisma.tasks.findFirst.mockImplementation(
        async ({ where }: { where: { id: string; project?: unknown } }) => {
          if (where.id !== TACHE.id) return null;
          if (where.project !== undefined && !voitLeProjet(equipeDe(where.project))) return null;
          return TACHE;
        },
      );
      // La lecture d'`accesProjet` : `{ id, OR: [propriétaire, membre] }`.
      prisma.projects.findFirst.mockImplementation(async ({ where }: { where: { id: string; OR: unknown } }) => {
        const userId = equipeDe({ OR: where.OR });
        if (where.id !== PROJET.id || !voitLeProjet(userId)) return null;
        return {
          owner_id: PROJET.owner_id,
          collaborators: EQUIPE.filter((m) => m.user_id === userId).map((m) => ({ role: m.role })),
        };
      });
      prisma.tasks.update.mockResolvedValue({ ...TACHE, status: 'done' });
    });

    const refus = (promesse: Promise<unknown>) =>
      promesse.then(
        () => {
          throw new Error('la modification aurait dû être refusée');
        },
        (e: unknown) => e as NotFoundException,
      );

    const MODIFICATIONS: [string, (s: WorkflowService, userId: string, taskId: string) => Promise<unknown>][] = [
      ['updateStatus', (s, userId, taskId) => s.updateStatus(userId, taskId, 'done')],
      ['updateNote', (s, userId, taskId) => s.updateNote(userId, taskId, 'rappeler')],
    ];

    it.each(MODIFICATIONS)(
      '%s : même 404 « Tâche introuvable. », que la tâche existe ou non',
      async (_nom, modifier) => {
        const existante = await refus(modifier(service, INCONNU, 't1'));
        const absente = await refus(modifier(service, INCONNU, 't-absente'));

        expect(existante).toBeInstanceOf(NotFoundException);
        expect(existante.getResponse()).toEqual(absente.getResponse());
        expect(existante.message).toBe('Tâche introuvable.');
        expect(prisma.tasks.update).not.toHaveBeenCalled();
      },
    );

    it.each(MODIFICATIONS)('%s : un observateur garde son 403, il voit déjà la tâche', async (_nom, modifier) => {
      await expect(modifier(service, 'observateur', 't1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.tasks.update).not.toHaveBeenCalled();
    });

    it.each(MODIFICATIONS)('%s : le propriétaire et un salarié modifient toujours', async (_nom, modifier) => {
      await modifier(service, PROPRIO, 't1');
      await modifier(service, 'salarie', 't1');

      expect(prisma.tasks.update).toHaveBeenCalledTimes(2);
    });
  });
});
