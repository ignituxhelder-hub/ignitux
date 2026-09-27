import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { AgendaService } from './agenda.service.js';

type Mock = ReturnType<typeof vi.fn>;

describe('AgendaService', () => {
  let service: AgendaService;
  let prisma: {
    agenda_events: { create: Mock; findMany: Mock; findFirst: Mock; update: Mock; delete: Mock };
    tasks: { findMany: Mock };
    projects: { findFirst: Mock };
    crm_contacts: { findFirst: Mock };
  };

  beforeEach(async () => {
    prisma = {
      agenda_events: {
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
      tasks: { findMany: vi.fn().mockResolvedValue([]) },
      projects: { findFirst: vi.fn() },
      crm_contacts: { findFirst: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AgendaService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AgendaService>(AgendaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cloisonnement', () => {
    it("ne liste que les événements de l'appelant", async () => {
      await service.list('u1');

      expect(prisma.agenda_events.findMany.mock.calls[0][0].where.owner_id).toBe('u1');
    });

    it("ne liste que les échéances des projets de l'appelant", async () => {
      await service.list('u1');

      expect(prisma.tasks.findMany.mock.calls[0][0].where.project.owner_id).toBe('u1');
    });

    it("refuse de modifier le rendez-vous d'un autre utilisateur", async () => {
      prisma.agenda_events.findFirst.mockResolvedValue(null);

      await expect(
        service.updateEvent('u2', 'e1', { title: 'Réunion' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuse de rattacher un rendez-vous au projet de quelqu’un d’autre', async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(
        service.createEvent('u1', {
          title: 'Réunion',
          projectId: 'p-autrui',
          occurredAt: new Date('2026-10-01T09:00:00Z'),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuse de rattacher un rendez-vous au contact de quelqu’un d’autre', async () => {
      prisma.crm_contacts.findFirst.mockResolvedValue(null);

      await expect(
        service.createEvent('u1', {
          title: 'Réunion',
          contactId: 'c-autrui',
          occurredAt: new Date('2026-10-01T09:00:00Z'),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('fusion des rendez-vous et des échéances', () => {
    it('mélange les deux sources dans une seule liste triée par date', async () => {
      prisma.agenda_events.findMany.mockResolvedValue([
        { id: 'e1', title: 'Rendez-vous', occurred_at: new Date('2026-10-05'), location: null, note: null, project_id: null, contact_id: null },
      ]);
      prisma.tasks.findMany.mockResolvedValue([
        { id: 't1', title: 'Échéance', due_date: new Date('2026-10-01'), project_id: 'p1', status: 'pending' },
      ]);

      const items = await service.list('u1');

      expect(items.map((i) => i.id)).toEqual(['t1', 'e1']);
      expect(items[0].type).toBe('echeance');
      expect(items[1].type).toBe('evenement');
    });

    it("ne considère que les tâches ayant une échéance", async () => {
      await service.list('u1');

      expect(prisma.tasks.findMany.mock.calls[0][0].where.due_date).toEqual({ not: null });
    });

    it('transmet la fenêtre de dates aux deux sources', async () => {
      const depuis = new Date('2026-10-01');
      const jusqua = new Date('2026-10-31');

      await service.list('u1', { depuis, jusqua });

      expect(prisma.agenda_events.findMany.mock.calls[0][0].where.occurred_at).toEqual({
        gte: depuis,
        lte: jusqua,
      });
      expect(prisma.tasks.findMany.mock.calls[0][0].where.due_date).toEqual({
        not: null,
        gte: depuis,
        lte: jusqua,
      });
    });
  });
});
