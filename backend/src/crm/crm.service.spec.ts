import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { refus, requetes } from '../equipe/visibilite.testing.js';
import { CrmService } from './crm.service.js';

type Mock = ReturnType<typeof vi.fn>;

describe('CrmService', () => {
  let service: CrmService;
  let prisma: {
    crm_companies: { create: Mock; findMany: Mock; findFirst: Mock; update: Mock; delete: Mock };
    crm_contacts: { create: Mock; findMany: Mock; findFirst: Mock; update: Mock; delete: Mock };
    crm_interactions: { create: Mock; findMany: Mock; findFirst: Mock; delete: Mock };
    projects: { findFirst: Mock };
  };

  beforeEach(async () => {
    prisma = {
      crm_companies: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      crm_contacts: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      crm_interactions: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        delete: vi.fn(),
      },
      projects: { findFirst: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CrmService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<CrmService>(CrmService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cloisonnement', () => {
    it("ne liste que les contacts de l'appelant", async () => {
      // Le carnet commercial est strictement personnel : il n'est jamais
      // partagé avec les collaborateurs d'un projet.
      await service.listContacts('u1');

      expect(prisma.crm_contacts.findMany.mock.calls[0][0].where.owner_id).toBe('u1');
    });

    it("refuse de lire le contact d'un autre utilisateur", async () => {
      prisma.crm_contacts.findFirst.mockResolvedValue(null);

      await expect(service.getContact('u2', 'c1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuse de rattacher un contact à l'entreprise d'un autre", async () => {
      prisma.crm_companies.findFirst.mockResolvedValue(null);

      await expect(
        service.createContact('u1', { firstName: 'A', lastName: 'B', companyId: 'e1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.crm_contacts.create).not.toHaveBeenCalled();
    });

    it("refuse de rattacher un contact au projet d'un autre", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(
        service.createContact('u1', { firstName: 'A', lastName: 'B', projectId: 'p1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createContact', () => {
    it('applique les valeurs par défaut prospect / nouveau', async () => {
      prisma.crm_contacts.create.mockResolvedValue({ id: 'c1' });

      await service.createContact('u1', { firstName: 'Ada', lastName: 'Lovelace' });

      expect(prisma.crm_contacts.create.mock.calls[0][0].data).toMatchObject({
        owner_id: 'u1',
        kind: 'prospect',
        stage: 'nouveau',
        company_id: null,
        project_id: null,
      });
    });
  });

  describe('listContacts', () => {
    it('exige tous les mots, dans le prénom, le nom ou l\'e-mail', async () => {
      await service.listContacts('u1', { query: 'ada love' });

      const where = prisma.crm_contacts.findMany.mock.calls[0][0].where;
      expect(where.AND).toHaveLength(2);
      expect(where.AND[0].OR).toHaveLength(3);
    });

    it('combine les filtres étape, type et entreprise', async () => {
      await service.listContacts('u1', {
        stage: 'qualifie',
        kind: 'client',
        companyId: 'e1',
      });

      const where = prisma.crm_contacts.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ stage: 'qualifie', kind: 'client', company_id: 'e1' });
    });
  });

  describe('interactions', () => {
    beforeEach(() => {
      prisma.crm_contacts.findFirst.mockResolvedValue({ id: 'c1', owner_id: 'u1' });
      prisma.crm_interactions.create.mockResolvedValue({ id: 'i1' });
    });

    it("date l'échange du jour indiqué, pas du jour de la saisie", async () => {
      // Un appel saisi le lendemain n'est pas un appel du lendemain.
      const occurred = new Date('2026-09-10T14:00:00.000Z');

      await service.logInteraction('u1', 'c1', 'appel', 'Premier contact', occurred);

      expect(prisma.crm_interactions.create.mock.calls[0][0].data.occurred_at).toEqual(occurred);
    });

    it("retombe sur maintenant quand aucune date n'est fournie", async () => {
      await service.logInteraction('u1', 'c1', 'note', 'Note rapide');

      expect(prisma.crm_interactions.create.mock.calls[0][0].data.occurred_at).toBeInstanceOf(Date);
    });

    it("refuse de journaliser sur le contact d'un autre", async () => {
      prisma.crm_contacts.findFirst.mockResolvedValue(null);

      await expect(
        service.logInteraction('u2', 'c1', 'appel', 'Tentative'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.crm_interactions.create).not.toHaveBeenCalled();
    });

    it("refuse de supprimer l'interaction d'un contact qui n'est pas à l'appelant", async () => {
      prisma.crm_interactions.findFirst.mockResolvedValue({ id: 'i1', contact_id: 'c1' });
      prisma.crm_contacts.findFirst.mockResolvedValue(null);

      await expect(service.deleteInteraction('u2', 'i1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.crm_interactions.delete).not.toHaveBeenCalled();
    });

    describe('ne dit pas à qui n’a pas accès si une interaction existe', () => {
      // Lue par son seul id puis jugée sur son contact, l'interaction d'un
      // autre répondait « Contact introuvable. », un id inconnu
      // « Interaction introuvable. » : n'importe quel compte apprenait
      // qu'elle existe. Ici, la fausse base évalue VRAIMENT le filtre.
      const INTERACTION = { id: 'i1', contact_id: 'c1' };
      const CONTACT = { id: 'c1', owner_id: 'u1' };

      beforeEach(() => {
        prisma.crm_interactions.findFirst.mockImplementation(
          async ({ where }: { where: { id: string; contact?: Record<string, unknown> } }) => {
            if (where.id !== INTERACTION.id) return null;
            if (where.contact !== undefined) {
              const { owner_id, ...reste } = where.contact;
              if (Object.keys(reste).length > 0) throw new Error(`Filtre non géré : ${JSON.stringify(where.contact)}`);
              if (CONTACT.owner_id !== owner_id) return null;
            }
            return INTERACTION;
          },
        );
        prisma.crm_contacts.findFirst.mockImplementation(
          async ({ where }: { where: { id: string; owner_id: string } }) =>
            where.id === CONTACT.id && where.owner_id === CONTACT.owner_id ? CONTACT : null,
        );
      });

      it('même 404 « Interaction introuvable. », que l’interaction existe ou non, en autant de requêtes', async () => {
        const existante = await refus(service.deleteInteraction('u2', 'i1'));
        const pourExistante = requetes(prisma);
        const absente = await refus(service.deleteInteraction('u2', 'i-absente'));

        expect(existante).toBeInstanceOf(NotFoundException);
        expect(existante.message).toBe('Interaction introuvable.');
        expect(existante.getResponse?.()).toEqual(absente.getResponse?.());
        expect(requetes(prisma) - pourExistante).toBe(pourExistante);
        expect(prisma.crm_interactions.delete).not.toHaveBeenCalled();
      });

      it('le propriétaire supprime toujours son interaction', async () => {
        await service.deleteInteraction('u1', 'i1');

        expect(prisma.crm_interactions.delete).toHaveBeenCalledWith({ where: { id: 'i1' } });
      });
    });
  });

  describe('getPipeline', () => {
    it('compte les contacts réellement présents, sans prévision', async () => {
      prisma.crm_contacts.findMany.mockResolvedValue([
        { stage: 'nouveau' },
        { stage: 'gagne' },
        { stage: 'gagne' },
      ]);

      const pipeline = await service.getPipeline('u1');

      expect(pipeline.total).toBe(3);
      expect(pipeline.stages.find((entry) => entry.stage === 'gagne')?.count).toBe(2);
      expect(pipeline).not.toHaveProperty('forecast');
    });

    it('restreint au projet demandé', async () => {
      await service.getPipeline('u1', 'p1');

      expect(prisma.crm_contacts.findMany.mock.calls[0][0].where).toEqual({
        owner_id: 'u1',
        project_id: 'p1',
      });
    });
  });

  describe('deleteCompany', () => {
    it("refuse l'entreprise d'un autre utilisateur", async () => {
      prisma.crm_companies.findFirst.mockResolvedValue(null);

      await expect(service.deleteCompany('u2', 'e1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.crm_companies.delete).not.toHaveBeenCalled();
    });

    it('supprime la fiche de son propriétaire', async () => {
      prisma.crm_companies.findFirst.mockResolvedValue({ id: 'e1', owner_id: 'u1' });

      await service.deleteCompany('u1', 'e1');

      expect(prisma.crm_companies.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
    });
  });
});
