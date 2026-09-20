import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConstitutionService } from '../constitution/constitution.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ComplianceService } from './compliance.service.js';

describe('ComplianceService', () => {
  let service: ComplianceService;
  let prisma: {
    compliance_requirements: {
      upsert: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
    };
    project_compliance_checks: {
      findMany: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    projects: { findFirst: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
    user_profiles: { findUnique: ReturnType<typeof vi.fn> };
    constitution_violations: { createMany: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      compliance_requirements: {
        upsert: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        groupBy: vi.fn(),
      },
      project_compliance_checks: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
      projects: { findFirst: vi.fn(), findUnique: vi.fn().mockResolvedValue(null) },
      user_profiles: { findUnique: vi.fn().mockResolvedValue(null) },
      constitution_violations: { createMany: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ComplianceService,
        ConstitutionService,
        { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ComplianceService>(ComplianceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listCoveredCountries', () => {
    it('ne liste que les pays réellement présents en base', async () => {
      // Laisser croire qu'un autre pays est couvert présenterait une
      // lacune comme une absence d'obligations.
      prisma.compliance_requirements.groupBy.mockResolvedValue([{ country: 'FR' }]);

      await expect(service.listCoveredCountries()).resolves.toEqual(['FR']);
    });

    it("renvoie une liste vide si rien n'est semé", async () => {
      prisma.compliance_requirements.groupBy.mockResolvedValue([]);

      await expect(service.listCoveredCountries()).resolves.toEqual([]);
    });
  });

  it('onModuleInit sème la liste de référence via upsert (idempotent)', async () => {
    prisma.compliance_requirements.upsert.mockResolvedValue({});

    await service.onModuleInit();

    expect(prisma.compliance_requirements.upsert).toHaveBeenCalled();
    const firstCall = prisma.compliance_requirements.upsert.mock.calls[0][0];
    expect(firstCall.where).toHaveProperty('slug');
  });

  describe('listRequirements', () => {
    it('renvoie le disclaimer et la liste pour un pays', async () => {
      prisma.compliance_requirements.findMany.mockResolvedValue([{ id: 'r1', country: 'FR' }]);

      const result = await service.listRequirements('FR');

      expect(prisma.compliance_requirements.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { country: 'FR' } }),
      );
      expect(result.disclaimer).toContain('ne remplacent pas');
      expect(result.requirements).toEqual([{ id: 'r1', country: 'FR' }]);
    });
  });

  describe('listForProject', () => {
    it("lève une NotFoundException si l'utilisateur n'a pas accès au projet", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.listForProject('u1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('marque completed=true pour les exigences déjà cochées sur ce projet', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.compliance_requirements.findMany.mockResolvedValue([
        { id: 'r1', title: 'A' },
        { id: 'r2', title: 'B' },
      ]);
      prisma.project_compliance_checks.findMany.mockResolvedValue([{ requirement_id: 'r1' }]);

      const result = await service.listForProject('u2-collaborateur', 'p1');

      expect(result.requirements).toEqual([
        { id: 'r1', title: 'A', completed: true },
        { id: 'r2', title: 'B', completed: false },
      ]);
    });

    // Le champ « Pays d'activité » promet d'ouvrir la section Conformité.
    // Tant que la requête forçait FR, cette promesse n'était pas tenue.
    it('liste les démarches du pays déclaré au profil', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.user_profiles.findUnique.mockResolvedValue({ activity_country: 'France' });
      prisma.compliance_requirements.findMany.mockResolvedValue([]);
      prisma.project_compliance_checks.findMany.mockResolvedValue([]);

      const result = await service.listForProject('u1', 'p1');

      expect(prisma.compliance_requirements.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { country: 'FR' } }),
      );
      expect(result.country).toBe('FR');
      expect(result.countryDeclared).toBe(true);
    });

    // Sans déclaration, on affiche quand même quelque chose — mais on dit
    // que c'est une supposition. Présenter les obligations d'un pays comme
    // celles du projet serait une erreur qu'aucun avertissement général ne
    // rattrape.
    it('signale que la France est une supposition quand rien n’est déclaré', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.user_profiles.findUnique.mockResolvedValue(null);
      prisma.compliance_requirements.findMany.mockResolvedValue([]);
      prisma.project_compliance_checks.findMany.mockResolvedValue([]);

      const result = await service.listForProject('u1', 'p1');

      expect(result.country).toBe('FR');
      expect(result.countryDeclared).toBe(false);
    });

    // Un libellé que le référentiel ne connaît pas ne doit pas se traduire
    // au hasard : on retombe sur le défaut, et on le dit.
    it('traite un pays inconnu du référentiel comme non déclaré', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.user_profiles.findUnique.mockResolvedValue({ activity_country: 'Belgique' });
      prisma.compliance_requirements.findMany.mockResolvedValue([]);
      prisma.project_compliance_checks.findMany.mockResolvedValue([]);

      const result = await service.listForProject('u1', 'p1');

      expect(result.countryDeclared).toBe(false);
    });

    // Le tri par secteur ne doit jamais devenir un filtre : une
    // obligation qu'on ne voit pas est une obligation qu'on croit ne pas
    // avoir, et c'est Ignitux qui aurait produit ce silence.
    it('groupe par secteur sans jamais retirer une démarche', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.projects.findUnique.mockResolvedValue({ sector: 'Restauration' });
      prisma.compliance_requirements.findMany.mockResolvedValue([
        { id: 'r1', title: 'Hygiène', sectors: ['Restauration'] },
        { id: 'r2', title: 'Statut juridique', sectors: [] },
        { id: 'r3', title: 'Carte de transport', sectors: ['Transport'] },
      ]);
      prisma.project_compliance_checks.findMany.mockResolvedValue([]);

      const result = await service.listForProject('u1', 'p1');

      expect(result.requirements).toHaveLength(3);
      const idsGroupes = result.groupes.flatMap((g) => g.requirementIds);
      expect(idsGroupes.sort()).toEqual(['r1', 'r2', 'r3']);
      expect(result.groupes.map((g) => g.cle)).toEqual([
        'secteur',
        'toute-activite',
        'autres-secteurs',
      ]);
      expect(result.sector).toBe('Restauration');
    });

    it('ne relègue rien tant que le projet n’a pas de secteur', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.projects.findUnique.mockResolvedValue({ sector: null });
      prisma.compliance_requirements.findMany.mockResolvedValue([
        { id: 'r1', title: 'Hygiène', sectors: ['Restauration'] },
        { id: 'r2', title: 'Statut juridique', sectors: [] },
      ]);
      prisma.project_compliance_checks.findMany.mockResolvedValue([]);

      const result = await service.listForProject('u1', 'p1');

      expect(result.sector).toBeNull();
      expect(result.groupes.map((g) => g.cle)).toEqual(['toute-activite']);
    });

    it('un pays demandé explicitement prime sur le profil', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.user_profiles.findUnique.mockResolvedValue({ activity_country: 'France' });
      prisma.compliance_requirements.findMany.mockResolvedValue([]);
      prisma.project_compliance_checks.findMany.mockResolvedValue([]);

      const result = await service.listForProject('u1', 'p1', 'BE');

      expect(prisma.compliance_requirements.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { country: 'BE' } }),
      );
      expect(result.country).toBe('BE');
    });
  });

  describe('markChecked', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.markChecked('u1', 'p1', 'r1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it("lève une NotFoundException si l'exigence n'existe pas", async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.compliance_requirements.findUnique.mockResolvedValue(null);

      await expect(service.markChecked('u1', 'p1', 'r1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.project_compliance_checks.upsert).not.toHaveBeenCalled();
    });

    it('coche une exigence pour le projet', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.compliance_requirements.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.project_compliance_checks.upsert.mockResolvedValue({ id: 'c1' });

      await service.markChecked('u1', 'p1', 'r1');

      expect(prisma.project_compliance_checks.upsert).toHaveBeenCalledWith({
        where: { project_id_requirement_id: { project_id: 'p1', requirement_id: 'r1' } },
        update: {},
        create: { project_id: 'p1', requirement_id: 'r1' },
      });
    });
  });

  describe('unmarkChecked', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.unmarkChecked('u1', 'p1', 'r1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('décoche une exigence', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });

      await service.unmarkChecked('u1', 'p1', 'r1');

      expect(prisma.project_compliance_checks.deleteMany).toHaveBeenCalledWith({
        where: { project_id: 'p1', requirement_id: 'r1' },
      });
    });
  });
});
