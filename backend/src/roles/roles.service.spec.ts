import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConstitutionService } from '../constitution/constitution.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RolesService } from './roles.service.js';

type Mock = ReturnType<typeof vi.fn>;

describe('RolesService', () => {
  let service: RolesService;
  let module: TestingModule;
  let prisma: {
    user_roles: { findMany: Mock; findFirst: Mock; create: Mock; deleteMany: Mock };
    users: { findUnique: Mock; update: Mock };
    projects: { count: Mock };
    investors: { findMany: Mock };
    participations: { count: Mock };
    constitution_violations: { createMany: Mock };
    $transaction: Mock;
  };

  beforeEach(async () => {
    prisma = {
      user_roles: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
      users: {
        findUnique: vi.fn().mockResolvedValue({ active_role: null }),
        update: vi.fn().mockResolvedValue({}),
      },
      projects: { count: vi.fn().mockResolvedValue(0) },
      investors: { findMany: vi.fn().mockResolvedValue([]) },
      participations: { count: vi.fn().mockResolvedValue(0) },
      constitution_violations: { createMany: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([]),
    };

    module = await Test.createTestingModule({
      providers: [
        RolesService,
        ConstitutionService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(RolesService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('prendre des rôles', () => {
    it('accorde les rôles ouverts', async () => {
      await service.setRoles('u1', ['entrepreneur', 'investisseur']);

      const crees = prisma.user_roles.create.mock.calls.map((call) => call[0].data.role);
      expect(crees).toEqual(['entrepreneur', 'investisseur']);
    });

    // Accorder un rôle sans espace derrière serait une promesse vide.
    it('refuse un rôle déclaré mais pas encore ouvert, en disant pourquoi', async () => {
      await expect(service.setRoles('u1', ['mentor'])).rejects.toThrow(/pas encore ouvert/);
      expect(prisma.user_roles.create).not.toHaveBeenCalled();
    });

    it('refuse un rôle qui n’existe pas', async () => {
      await expect(service.setRoles('u1', ['banquier'])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuse de tout retirer : sans rôle, plus rien à montrer', async () => {
      await expect(service.setRoles('u1', [])).rejects.toThrow(/au moins un rôle/);
    });

    it('ne recrée pas un rôle déjà tenu', async () => {
      prisma.user_roles.findMany.mockResolvedValue([{ role: 'entrepreneur' }]);

      await service.setRoles('u1', ['entrepreneur', 'investisseur']);

      const crees = prisma.user_roles.create.mock.calls.map((call) => call[0].data.role);
      expect(crees).toEqual(['investisseur']);
    });
  });

  describe('retirer un rôle', () => {
    it('laisse partir un rôle qui ne retient aucune donnée', async () => {
      prisma.user_roles.findMany.mockResolvedValue([
        { role: 'entrepreneur' },
        { role: 'investisseur' },
      ]);

      await service.setRoles('u1', ['entrepreneur']);

      expect(prisma.user_roles.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'u1', role: { in: ['investisseur'] } },
      });
    });

    // Retirer le rôle n'efface rien — c'est bien le problème : l'argent
    // resterait, invisible. Mieux vaut refuser et le dire.
    it('refuse de retirer un rôle qui tient encore des données réelles', async () => {
      prisma.user_roles.findMany.mockResolvedValue([
        { role: 'entrepreneur' },
        { role: 'investisseur' },
      ]);
      prisma.investors.findMany.mockResolvedValue([{ id: 'i1' }]);
      prisma.participations.count.mockResolvedValue(3);

      await expect(service.setRoles('u1', ['entrepreneur'])).rejects.toThrow(
        /3 participation\(s\) sont enregistrées à ton nom/,
      );
      expect(prisma.user_roles.deleteMany).not.toHaveBeenCalled();
    });

    it('refuse de retirer entrepreneur tant que des projets existent', async () => {
      prisma.user_roles.findMany.mockResolvedValue([
        { role: 'entrepreneur' },
        { role: 'investisseur' },
      ]);
      prisma.projects.count.mockResolvedValue(2);

      await expect(service.setRoles('u1', ['investisseur'])).rejects.toThrow(
        /2 projet\(s\) t'appartiennent/,
      );
    });
  });

  describe('mode actif', () => {
    it('refuse de basculer vers un rôle non tenu', async () => {
      prisma.user_roles.findFirst.mockResolvedValue(null);

      await expect(service.setActiveRole('u1', 'investisseur')).rejects.toThrow(
        /Tu ne tiens pas le rôle/,
      );
      expect(prisma.users.update).not.toHaveBeenCalled();
    });

    it('bascule vers un rôle tenu', async () => {
      prisma.user_roles.findFirst.mockResolvedValue({ id: 'r1' });
      prisma.user_roles.findMany.mockResolvedValue([{ role: 'investisseur' }]);

      await service.setActiveRole('u1', 'investisseur');

      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { active_role: 'investisseur' },
      });
    });

    // Un mode actif resté sur un rôle rendu n'est pas une erreur à afficher.
    it('tait un mode actif qui ne correspond plus à un rôle tenu', async () => {
      prisma.user_roles.findMany.mockResolvedValue([{ role: 'entrepreneur' }]);
      prisma.users.findUnique.mockResolvedValue({ active_role: 'investisseur' });

      const mine = await service.myRoles('u1');

      expect(mine.activeRole).toBeNull();
      expect(mine.roles).toEqual(['entrepreneur']);
    });
  });

  describe('suggestions', () => {
    // Des participations peuvent exister avant que la personne ait coché la
    // case : le porteur du projet les a enregistrées. On le dit, on ne
    // l'accorde pas d'office.
    it("signale un rôle non pris pour lequel des données existent", async () => {
      prisma.user_roles.findMany.mockResolvedValue([{ role: 'entrepreneur' }]);
      prisma.investors.findMany.mockResolvedValue([{ id: 'i1' }]);
      prisma.participations.count.mockResolvedValue(2);

      const mine = await service.myRoles('u1');

      expect(mine.suggestions).toEqual([
        {
          role: 'investisseur',
          count: 2,
          detail: '2 participation(s) sont enregistrées à ton nom',
        },
      ]);
    });

    it('ne suggère rien quand aucune donnée ne le justifie', async () => {
      prisma.user_roles.findMany.mockResolvedValue([{ role: 'entrepreneur' }]);

      expect((await service.myRoles('u1')).suggestions).toEqual([]);
    });

    it('ne suggère pas un rôle déjà tenu', async () => {
      prisma.user_roles.findMany.mockResolvedValue([
        { role: 'entrepreneur' },
        { role: 'investisseur' },
      ]);
      prisma.investors.findMany.mockResolvedValue([{ id: 'i1' }]);
      prisma.participations.count.mockResolvedValue(2);

      expect((await service.myRoles('u1')).suggestions).toEqual([]);
    });
  });

  describe('séparation constitutionnelle', () => {
    it('laisse passer une vue qui reste dans ses domaines', async () => {
      await expect(
        service.assertViewIsSeparated('u1', 'investisseur', ['portefeuille']),
      ).resolves.toBeUndefined();
      expect(prisma.constitution_violations.createMany).not.toHaveBeenCalled();
    });

    // Le garde protège aussi contre ma propre distraction : ajouter les
    // projets au tableau de bord investisseur ne passerait pas en silence.
    it('refuse une vue qui mélange les rôles, et journalise', async () => {
      await expect(
        service.assertViewIsSeparated('u1', 'investisseur', ['portefeuille', 'projets']),
      ).rejects.toThrow(/ne relèvent pas de ce rôle/);
      expect(prisma.constitution_violations.createMany).toHaveBeenCalled();
    });
  });
});
