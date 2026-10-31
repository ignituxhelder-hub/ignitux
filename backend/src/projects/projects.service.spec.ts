import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConstitutionService } from '../constitution/constitution.service.js';
import { AnalysisService } from '../igini/analysis/analysis.service.js';
import { AutomationService } from '../igini/automation/automation.service.js';
import { DevelopmentService } from '../igini/development/development.service.js';
import { FinancingService } from '../igini/financing/financing.service.js';
import { PlanningService } from '../igini/planning/planning.service.js';
import { TransmissionService } from '../igini/transmission/transmission.service.js';
import { MemoryService } from '../igini/memory/memory.service.js';
import { WorkflowEngineService } from '../igini/workflow/workflow-engine.service.js';
import { WorkflowService } from '../igini/workflow/workflow.service.js';
import { CLAUDE_MODEL } from '../igini/claude/claude.service.js';
import { FormerService } from '../igini/former/former.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from './projects.service.js';

/**
 * Provenance attendue sur tout contenu généré (article 12 : un contenu
 * produit par un modèle doit être identifiable comme tel). Constante
 * partagée plutôt que recopiée dans les six assertions : si la provenance
 * change, les six tests doivent bouger ensemble ou aucun.
 */
const GENERATED_PROVENANCE = { generated_by: 'igini', generated_model: CLAUDE_MODEL };

/**
 * L'attribution que ProjectsService doit transmettre a chaque generateur :
 * le proprietaire du projet et le projet lui-meme. Sans elle, l'appel
 * facture serait anonyme dans le journal des couts.
 */
/** Le propriétaire lance lui-même : il paie, et il est l'acteur. */
const ATTRIBUTION = { userId: 'u1', actorId: 'u1', projectId: 'p1' };

describe('ProjectsService', () => {
  let service: ProjectsService;
  let prisma: {
    projects: {
      create: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    company_registrations: { findUnique: ReturnType<typeof vi.fn> };
    billing_documents: { count: ReturnType<typeof vi.fn> };
    analyses: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    analysis_sources: {
      createMany: ReturnType<typeof vi.fn>;
    };
    legal_form_recommendations: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    legal_form_assumptions: { createMany: ReturnType<typeof vi.fn> };
    legal_form_alternatives: { createMany: ReturnType<typeof vi.fn> };
    legal_form_sources: { createMany: ReturnType<typeof vi.fn> };
    build_plans: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    financing_plans: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    development_plans: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    transmission_plans: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    project_collaborators: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    users: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    user_profiles: { findUnique: ReturnType<typeof vi.fn> };
    user_experiences: { findMany: ReturnType<typeof vi.fn> };
    user_formations: { findMany: ReturnType<typeof vi.fn> };
    project_questionnaires: { findUnique: ReturnType<typeof vi.fn> };
    project_igini_questions: { findMany: ReturnType<typeof vi.fn> };
    participation_agreements: { findFirst: ReturnType<typeof vi.fn> };
    participation_milestones: { findMany: ReturnType<typeof vi.fn> };
    equity_events: { findMany: ReturnType<typeof vi.fn> };
  };
  let analysisService: { analyzeProject: ReturnType<typeof vi.fn> };
  let formerService: { recommendLegalForm: ReturnType<typeof vi.fn> };
  let planningService: { createBuildPlan: ReturnType<typeof vi.fn> };
  let financingService: { createFinancingPlan: ReturnType<typeof vi.fn> };
  let developmentService: { createDevelopmentPlan: ReturnType<typeof vi.fn> };
  let transmissionService: { createTransmissionPlan: ReturnType<typeof vi.fn> };
  let workflowService: { createTasksFromSuggestions: ReturnType<typeof vi.fn> };
  let automationService: { run: ReturnType<typeof vi.fn>; listRuns: ReturnType<typeof vi.fn> };
  let constitutionService: { guard: ReturnType<typeof vi.fn> };
  // Les droits ouverts par l'offre ont leur propre suite : ici un faux
  // permissif, pour que ces tests éprouvent le projet et pas la facturation.
  let memoryService: { recallAsContext: ReturnType<typeof vi.fn> };
  let workflowEngineService: { advanceActiveRunsForProject: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      projects: {
        create: vi.fn(),
        // Le nombre de projets deja possedes sert a la limite de l offre.
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        // Relu par le déclenchement automatique de Former (titre/description
        // du projet), séparément du findFirst qui sert à analyzeForOwner lui-même.
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'p1', title: 'Idée', description: 'Desc' }),
        update: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      // Ni société immatriculée ni facture émise par défaut : le projet se supprime.
      company_registrations: { findUnique: vi.fn().mockResolvedValue(null) },
      billing_documents: { count: vi.fn().mockResolvedValue(0) },
      analyses: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
      analysis_sources: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      legal_form_recommendations: {
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
      legal_form_assumptions: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      legal_form_alternatives: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      legal_form_sources: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      build_plans: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
      financing_plans: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
      development_plans: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
      transmission_plans: { create: vi.fn(), findMany: vi.fn() },
      project_collaborators: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
      users: { findUnique: vi.fn() },
      // Le profil alimente le contexte de chaque generation. Vide par
      // defaut : ces tests eprouvent le fil des etapes, pas la personne.
      user_profiles: { findUnique: vi.fn().mockResolvedValue(null) },
      // Le CV et le questionnaire : vides par défaut, pour la même raison.
      user_experiences: { findMany: vi.fn().mockResolvedValue([]) },
      user_formations: { findMany: vi.fn().mockResolvedValue([]) },
      project_questionnaires: { findUnique: vi.fn().mockResolvedValue(null) },
      project_igini_questions: { findMany: vi.fn().mockResolvedValue([]) },
      // Aucun accord de participation par défaut : le contexte reste ce qu'il était.
      participation_agreements: { findFirst: vi.fn().mockResolvedValue(null) },
      participation_milestones: { findMany: vi.fn().mockResolvedValue([]) },
      equity_events: { findMany: vi.fn().mockResolvedValue([]) },
    };
    // Par défaut, aucune étape précédente n'existe encore (buildProjectContext
    // doit alors renvoyer undefined) ; les tests qui veulent simuler un
    // contexte existant surchargent ces mocks explicitement.
    prisma.analyses.findFirst.mockResolvedValue(null);
    prisma.build_plans.findFirst.mockResolvedValue(null);
    prisma.financing_plans.findFirst.mockResolvedValue(null);
    prisma.development_plans.findFirst.mockResolvedValue(null);
    analysisService = { analyzeProject: vi.fn() };
    formerService = { recommendLegalForm: vi.fn().mockResolvedValue({
      recommended_form: 'micro-entreprise',
      rationale: 'r',
      assumptions: [],
      alternatives: [],
      points_to_check: [],
      sources: [],
    }) };
    planningService = { createBuildPlan: vi.fn() };
    financingService = { createFinancingPlan: vi.fn() };
    developmentService = { createDevelopmentPlan: vi.fn() };
    transmissionService = { createTransmissionPlan: vi.fn() };
    workflowService = { createTasksFromSuggestions: vi.fn() };
    automationService = { run: vi.fn(), listRuns: vi.fn() };
    constitutionService = { guard: vi.fn() };
    // Par défaut aucun souvenir : les tests de contexte existants vérifient
    // le fil des étapes, pas la mémoire.
    memoryService = { recallAsContext: vi.fn().mockResolvedValue(undefined) };
    workflowEngineService = { advanceActiveRunsForProject: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AnalysisService, useValue: analysisService },
        { provide: FormerService, useValue: formerService },
        { provide: PlanningService, useValue: planningService },
        { provide: FinancingService, useValue: financingService },
        { provide: DevelopmentService, useValue: developmentService },
        { provide: TransmissionService, useValue: transmissionService },
        { provide: WorkflowService, useValue: workflowService },
        { provide: AutomationService, useValue: automationService },
        { provide: ConstitutionService, useValue: constitutionService },
        { provide: MemoryService, useValue: memoryService },
        { provide: WorkflowEngineService, useValue: workflowEngineService },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('ne limite plus le nombre de projets : tous les outils sont gratuits depuis les crédits', async () => {
    prisma.projects.create.mockResolvedValue({ id: 'p9' });
    prisma.projects.count.mockResolvedValue(42);

    await service.create('u1', 'Idée');

    expect(prisma.projects.count).not.toHaveBeenCalled();
    expect(prisma.projects.create).toHaveBeenCalledTimes(1);
  });

  it('create scope le projet au propriétaire', async () => {
    prisma.projects.create.mockResolvedValue({ id: 'p1', owner_id: 'u1', title: 'Idée' });

    await service.create('u1', 'Idée', 'Description');

    expect(prisma.projects.create).toHaveBeenCalledWith({
      data: { owner_id: 'u1', title: 'Idée', description: 'Description' },
    });
  });

  it("findOneForOwner lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
    prisma.projects.findFirst.mockResolvedValue(null);

    await expect(service.findOneForOwner('u1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findOneForOwner renvoie le projet trouvé', async () => {
    const project = { id: 'p1', owner_id: 'u1', title: 'Idée' };
    prisma.projects.findFirst.mockResolvedValue(project);

    await expect(service.findOneForOwner('u1', 'p1')).resolves.toEqual(project);
  });

  describe('updateForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.updateForOwner('u1', 'p1', 'Nouveau titre')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.projects.update).not.toHaveBeenCalled();
    });

    it('met à jour le projet une fois la propriété vérifiée', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.projects.update.mockResolvedValue({ id: 'p1', title: 'Nouveau titre' });

      const result = await service.updateForOwner('u1', 'p1', 'Nouveau titre', undefined);

      expect(prisma.projects.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { title: 'Nouveau titre', description: undefined },
      });
      expect(result).toEqual({ id: 'p1', title: 'Nouveau titre' });
    });
  });

  describe('deleteForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.deleteForOwner('u1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.projects.deleteMany).not.toHaveBeenCalled();
    });

    it('supprime un projet sans société immatriculée ni facture émise', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });

      await service.deleteForOwner('u1', 'p1');

      expect(prisma.projects.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.projects.deleteMany.mock.calls[0][0].where.id).toBe('p1');
    });

    // La fiche d'immatriculation partirait avec le projet (cascade) : SIREN,
    // siège, lien vers l'écriture de capital. Ce sont des traces légales.
    it('refuse de supprimer un projet dont la société est immatriculée, et propose de l’archiver', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.company_registrations.findUnique.mockResolvedValue({ id: 'r1' });

      const erreur = await service.deleteForOwner('u1', 'p1').catch((e: unknown) => e);

      expect(erreur).toBeInstanceOf(ConflictException);
      expect((erreur as Error).message).toMatch(/immatricul/);
      expect((erreur as Error).message).toMatch(/archive/i);
      expect(prisma.projects.deleteMany).not.toHaveBeenCalled();
    });

    // Une facture ou un avoir émis se conserve ; un brouillon ou un devis non.
    it('refuse de supprimer un projet qui a des factures émises', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.billing_documents.count.mockResolvedValue(2);

      const erreur = await service.deleteForOwner('u1', 'p1').catch((e: unknown) => e);

      expect(erreur).toBeInstanceOf(ConflictException);
      expect((erreur as Error).message).toMatch(/factures/);
      expect(prisma.billing_documents.count).toHaveBeenCalledWith({
        where: { project_id: 'p1', type: { in: ['facture', 'avoir'] }, status: { not: 'brouillon' } },
      });
      expect(prisma.projects.deleteMany).not.toHaveBeenCalled();
    });

    // La suppression elle-même revérifie les deux conditions : une facture
    // émise entre la lecture et la suppression ne doit pas passer.
    it('ne supprime rien si une facture est émise entre la vérification et la suppression', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.projects.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.deleteForOwner('u1', 'p1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.projects.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'p1',
          company_registration: { is: null },
          billing_documents: {
            none: { type: { in: ['facture', 'avoir'] }, status: { not: 'brouillon' } },
          },
        },
      });
    });
  });

  describe('archiver un projet', () => {
    it('archive le projet sans rien effacer', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.projects.update.mockResolvedValue({ id: 'p1', archived_at: new Date() });

      await service.archiveForOwner('u1', 'p1');

      expect(prisma.projects.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { archived_at: expect.any(Date) },
      });
      expect(prisma.projects.deleteMany).not.toHaveBeenCalled();
      expect(prisma.projects.delete).not.toHaveBeenCalled();
    });

    it('le restaure', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.projects.update.mockResolvedValue({ id: 'p1', archived_at: null });

      await service.restoreForOwner('u1', 'p1');

      expect(prisma.projects.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { archived_at: null },
      });
    });

    it('un associé n’archive pas le projet et ne le restaure pas', async () => {
      prisma.projects.findFirst.mockResolvedValue({
        id: 'p1',
        owner_id: 'proprio',
        collaborators: [{ role: 'associe' }],
      });

      await expect(service.archiveForOwner('u2', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.restoreForOwner('u2', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.projects.update).not.toHaveBeenCalled();
    });

    it('la liste des projets ne montre pas les projets archivés', async () => {
      prisma.projects.findMany.mockResolvedValue([]);

      await service.findAllForOwner('u1');

      expect(prisma.projects.findMany.mock.calls[0][0].where.archived_at).toBeNull();
    });

    it('les projets archivés ont leur propre liste', async () => {
      prisma.projects.findMany.mockResolvedValue([]);

      await service.findArchivedForOwner('u1');

      const requete = prisma.projects.findMany.mock.calls[0][0];
      expect(requete.where.archived_at).toEqual({ not: null });
      expect(requete.where.OR).toEqual([
        { owner_id: 'u1' },
        { collaborators: { some: { user_id: 'u1' } } },
      ]);
    });
  });

  describe('setVisibilityForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.setVisibilityForOwner('u1', 'p1', true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.projects.update).not.toHaveBeenCalled();
    });

    it('met à jour is_public une fois la propriété vérifiée', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.projects.update.mockResolvedValue({ id: 'p1', is_public: true });

      const result = await service.setVisibilityForOwner('u1', 'p1', true);

      expect(prisma.projects.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { is_public: true },
      });
      expect(result).toEqual({ id: 'p1', is_public: true });
    });
  });

  describe('setConfirmedLegalFormForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(
        service.setConfirmedLegalFormForOwner('u1', 'p1', 'SASU'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.projects.update).not.toHaveBeenCalled();
    });

    it('confirme une forme juridique une fois la propriété vérifiée', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.projects.update.mockResolvedValue({ id: 'p1', confirmed_legal_form: 'SASU' });

      const result = await service.setConfirmedLegalFormForOwner('u1', 'p1', 'SASU');

      expect(prisma.projects.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { confirmed_legal_form: 'SASU' },
      });
      expect(result).toEqual({ id: 'p1', confirmed_legal_form: 'SASU' });
    });
  });

  describe('findOneForViewer', () => {
    it("lève une NotFoundException si l'utilisateur n'est ni propriétaire ni collaborateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.findOneForViewer('u2', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('renvoie le projet pour le propriétaire', async () => {
      const project = { id: 'p1', owner_id: 'u1' };
      prisma.projects.findFirst.mockResolvedValue(project);

      await expect(service.findOneForViewer('u1', 'p1')).resolves.toEqual(project);
    });

    it('renvoie le projet pour un collaborateur', async () => {
      const project = { id: 'p1', owner_id: 'u1' };
      prisma.projects.findFirst.mockResolvedValue(project);

      await expect(service.findOneForViewer('u2', 'p1')).resolves.toEqual(project);
      expect(prisma.projects.findFirst).toHaveBeenCalledWith(
        // Le rôle est lu en même temps (select) : seul le critère d'accès compte ici.
        expect.objectContaining({
        where: {
          id: 'p1',
          OR: [{ owner_id: 'u2' }, { collaborators: { some: { user_id: 'u2' } } }],
        },
        }),
      );
    });
  });

  describe('analyzeForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.analyzeForOwner('u1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
      expect(analysisService.analyzeProject).not.toHaveBeenCalled();
    });

    it('analyse le projet puis persiste le résultat', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      const analysis = {
        summary: 'Résumé',
        feasibility_score: 8,
        strengths: ['Force'],
        risks: ['Risque'],
        next_steps: ['Étape'],
      };
      prisma.projects.findFirst.mockResolvedValue(project);
      analysisService.analyzeProject.mockResolvedValue(analysis);
      prisma.analyses.create.mockResolvedValue({ id: 'a1', project_id: 'p1', ...analysis });

      const result = await service.analyzeForOwner('u1', 'p1');

      expect(analysisService.analyzeProject).toHaveBeenCalledWith('Idée', 'Desc', ATTRIBUTION, undefined);
      expect(prisma.analyses.create).toHaveBeenCalledWith({
        data: { project_id: 'p1', ...analysis, ...GENERATED_PROVENANCE },
      });
      // Aucune source dans ce mock : analyzeProject n'en a pas fourni, et le
      // résultat le dit honnêtement plutôt que d'omettre le champ.
      expect(result).toEqual({ id: 'a1', project_id: 'p1', ...analysis, sources: [] });
    });

    it("persiste les sources réellement consultées par la recherche web", async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      const analysis = {
        summary: 'Résumé',
        feasibility_score: 8,
        strengths: [],
        risks: [],
        next_steps: [],
        sources: [
          { title: 'Étude de marché', url: 'https://exemple.com/etude' },
          { title: 'Réglementation locale', url: 'https://exemple.com/reglement' },
        ],
      };
      prisma.projects.findFirst.mockResolvedValue(project);
      analysisService.analyzeProject.mockResolvedValue(analysis);
      prisma.analyses.create.mockResolvedValue({ id: 'a1', project_id: 'p1' });

      const result = await service.analyzeForOwner('u1', 'p1');

      expect(prisma.analysis_sources.createMany).toHaveBeenCalledWith({
        data: [
          { analysis_id: 'a1', title: 'Étude de marché', url: 'https://exemple.com/etude' },
          { analysis_id: 'a1', title: 'Réglementation locale', url: 'https://exemple.com/reglement' },
        ],
      });
      // La personne voit les sources dès le retour de l'appel, sans attendre
      // une relecture ultérieure de l'historique des analyses.
      expect(result.sources).toEqual(analysis.sources);
    });

    it("n'écrit rien dans analysis_sources quand la recherche n'a rien trouvé", async () => {
      // Le cas normal pour une idée trop tôt pour qu'aucune recherche ne la
      // départage : un createMany([]) serait un appel réseau pour rien.
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      analysisService.analyzeProject.mockResolvedValue({
        summary: 'Résumé',
        feasibility_score: 8,
        strengths: [],
        risks: [],
        next_steps: [],
        sources: [],
      });
      prisma.analyses.create.mockResolvedValue({ id: 'a1' });

      await service.analyzeForOwner('u1', 'p1');

      expect(prisma.analysis_sources.createMany).not.toHaveBeenCalled();
    });

    describe('ce qu’IGINI sait de la personne', () => {
      // Le profil se remplissait consciencieusement sans que rien ne le
      // relise jamais — le même défaut que la mémoire avait avant d'être
      // branchée ici.
      it('injecte le profil déclaré dans le contexte', async () => {
        prisma.projects.findFirst.mockResolvedValue({
          id: 'p1',
          owner_id: 'u1',
          title: 'Idée',
          description: 'Desc',
        });
        prisma.user_profiles.findUnique.mockResolvedValue({
          sectors: ['Transport'],
          activity_country: 'France',
        });
        analysisService.analyzeProject.mockResolvedValue({
          summary: 'R',
          feasibility_score: 8,
          strengths: [],
          risks: [],
          next_steps: [],
        });
        prisma.analyses.create.mockResolvedValue({ id: 'a1' });

        await service.analyzeForOwner('u1', 'p1');

        const contexte = analysisService.analyzeProject.mock.calls[0][3] as string;
        expect(contexte).toContain('Transport');
        expect(contexte).toContain('France');
      });

      // Une analyse ne doit pas échouer parce qu'un profil n'a pas pu être
      // lu : elle sera moins bien renseignée, ce qui est l'état d'avant.
      it('analyse quand même si le profil est illisible', async () => {
        prisma.projects.findFirst.mockResolvedValue({
          id: 'p1',
          owner_id: 'u1',
          title: 'Idée',
          description: 'Desc',
        });
        prisma.user_profiles.findUnique.mockRejectedValue(new Error('base injoignable'));
        analysisService.analyzeProject.mockResolvedValue({
          summary: 'R',
          feasibility_score: 8,
          strengths: [],
          risks: [],
          next_steps: [],
        });
        prisma.analyses.create.mockResolvedValue({ id: 'a1' });

        await expect(service.analyzeForOwner('u1', 'p1')).resolves.toBeTruthy();
      });
    });

    it('soumet la provenance au moteur constitutionnel avant de persister', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      analysisService.analyzeProject.mockResolvedValue({
        summary: 'Résumé',
        feasibility_score: 8,
        strengths: [],
        risks: [],
        next_steps: [],
      });
      prisma.analyses.create.mockResolvedValue({ id: 'a1' });

      await service.analyzeForOwner('u1', 'p1');

      expect(constitutionService.guard).toHaveBeenCalledWith(
        {
          kind: 'persist_generated',
          entity: 'analyses',
          generatedBy: 'igini',
          generatedModel: CLAUDE_MODEL,
        },
        { userId: 'u1', projectId: 'p1' },
      );
    });

    it('injecte la mémoire IGINI dans le contexte, dès la première analyse', async () => {
      // Le moteur Mémoire n'avait jusqu'ici aucun consommateur : IGINI
      // enregistrait des souvenirs que rien ne relisait. Ce test est ce qui
      // garantit que le branchement ne saute pas à la prochaine refonte.
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      memoryService.recallAsContext.mockResolvedValue('Mémoire : ne pas ouvrir le samedi.');
      analysisService.analyzeProject.mockResolvedValue({
        summary: 'Résumé',
        feasibility_score: 8,
        strengths: [],
        risks: [],
        next_steps: [],
      });
      prisma.analyses.create.mockResolvedValue({ id: 'a1' });

      await service.analyzeForOwner('u1', 'p1');

      expect(analysisService.analyzeProject).toHaveBeenCalledWith(
        'Idée',
        'Desc',
        ATTRIBUTION,
        'Mémoire : ne pas ouvrir le samedi.',
      );
    });

    it("n'écrit rien si le moteur constitutionnel refuse la provenance", async () => {
      // Le refus doit intervenir avant l'écriture, pas après : une ligne
      // enregistrée puis dénoncée reste une ligne enregistrée.
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      analysisService.analyzeProject.mockResolvedValue({
        summary: 'Résumé',
        feasibility_score: 8,
        strengths: [],
        risks: [],
        next_steps: [],
      });
      constitutionService.guard.mockRejectedValue(
        new UnprocessableEntityException('Action refusée par la Constitution IGNITUX.'),
      );

      await expect(service.analyzeForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(prisma.analyses.create).not.toHaveBeenCalled();
    });

    it('crée des tâches suivables à partir des prochaines étapes suggérées', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      const analysis = {
        summary: 'Résumé',
        feasibility_score: 8,
        strengths: ['Force'],
        risks: ['Risque'],
        next_steps: ['Étape 1', 'Étape 2'],
      };
      prisma.projects.findFirst.mockResolvedValue(project);
      analysisService.analyzeProject.mockResolvedValue(analysis);
      prisma.analyses.create.mockResolvedValue({ id: 'a1', project_id: 'p1', ...analysis });

      await service.analyzeForOwner('u1', 'p1');

      expect(workflowService.createTasksFromSuggestions).toHaveBeenCalledWith(
        'p1',
        ['Étape 1', 'Étape 2'],
        'analysis',
      );
    });

    it("déclenche l'automatisation après une analyse réussie", async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      analysisService.analyzeProject.mockResolvedValue({
        summary: 'Résumé',
        feasibility_score: 8,
        strengths: [],
        risks: [],
        next_steps: [],
      });
      prisma.analyses.create.mockResolvedValue({ id: 'a1' });

      await service.analyzeForOwner('u1', 'p1');

      expect(automationService.run).toHaveBeenCalledWith('p1');
    });

    it('ne lance plus la forme juridique toute seule, quelle que soit la note : c’est l’enchaînement qui s’en charge', async () => {
      // Jusqu'au 2026-10-31, une note de 8/10 et plus déclenchait Former,
      // offert. La règle des 75/100 est retirée : la forme juridique est la
      // deuxième étape de l'enchaînement IGINI, pour tous les projets.
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' });
      analysisService.analyzeProject.mockResolvedValue({
        summary: 'r',
        feasibility_score: 9,
        strengths: [],
        risks: [],
        next_steps: [],
      });
      prisma.analyses.create.mockResolvedValue({ id: 'a1', project_id: 'p1', feasibility_score: 9 });

      await service.analyzeForOwner('u1', 'p1');
      await new Promise((resolve) => setImmediate(resolve));

      expect(formerService.recommendLegalForm).not.toHaveBeenCalled();
    });
  });

  describe('listAnalysesForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.listAnalysesForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('liste les analyses du projet, les plus récentes en premier', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.analyses.findMany.mockResolvedValue([{ id: 'a1' }]);

      const result = await service.listAnalysesForOwner('u1', 'p1');

      expect(prisma.analyses.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        include: { sources: true },
        orderBy: { created_at: 'desc' },
      });
      expect(result).toEqual([{ id: 'a1' }]);
    });

    it('un collaborateur (pas seulement le propriétaire) peut lister les analyses', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.analyses.findMany.mockResolvedValue([{ id: 'a1' }]);

      await expect(service.listAnalysesForOwner('u2-collaborateur', 'p1')).resolves.toEqual([
        { id: 'a1' },
      ]);
      expect(prisma.projects.findFirst).toHaveBeenCalledWith(
        // Le rôle est lu en même temps (select) : seul le critère d'accès compte ici.
        expect.objectContaining({
        where: {
          id: 'p1',
          OR: [{ owner_id: 'u2-collaborateur' }, { collaborators: { some: { user_id: 'u2-collaborateur' } } }],
        },
        }),
      );
    });
  });

  describe('recommendLegalFormForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.recommendLegalFormForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(formerService.recommendLegalForm).not.toHaveBeenCalled();
    });

    it('demande une recommandation puis persiste le résultat, sources comprises', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      const recommandation = {
        recommended_form: 'SASU',
        rationale: 'Raisonnement',
        assumptions: [{ subject: 'associés', assumption: 'seul', how_to_correct: 'précise si tu es à plusieurs' }],
        alternatives: [{ form: 'EURL', why_not_chosen: 'moins souple pour lever des fonds' }],
        points_to_check: ['vérifier le plafond de CA en vigueur'],
        sources: [{ title: 'Source', url: 'https://exemple.com' }],
      };
      prisma.projects.findFirst.mockResolvedValue(project);
      formerService.recommendLegalForm.mockResolvedValue(recommandation);
      // Le mock reflète ce qu'un vrai `create()` Prisma renvoie : les champs
      // passés dans `data`, en écho, plus l'id généré — même convention que
      // `prisma.analyses.create.mockResolvedValue({ id: 'a1', ...analysis })`
      // plus haut dans ce fichier. `assumptions`/`alternatives`/`sources` ne
      // sont volontairement pas dedans : ce sont des tables filles, pas des
      // colonnes de `legal_form_recommendations`.
      prisma.legal_form_recommendations.create.mockResolvedValue({
        id: 'r1',
        project_id: 'p1',
        recommended_form: 'SASU',
        rationale: 'Raisonnement',
        points_to_check: ['vérifier le plafond de CA en vigueur'],
      });

      const result = await service.recommendLegalFormForOwner('u1', 'p1');

      expect(formerService.recommendLegalForm).toHaveBeenCalledWith('Idée', 'Desc', ATTRIBUTION, undefined);
      expect(prisma.legal_form_recommendations.create).toHaveBeenCalledWith({
        data: {
          project_id: 'p1',
          recommended_form: 'SASU',
          rationale: 'Raisonnement',
          points_to_check: ['vérifier le plafond de CA en vigueur'],
          ...GENERATED_PROVENANCE,
        },
      });
      expect(prisma.legal_form_assumptions.createMany).toHaveBeenCalledWith({
        data: [{ recommendation_id: 'r1', subject: 'associés', assumption: 'seul', how_to_correct: 'précise si tu es à plusieurs' }],
      });
      expect(prisma.legal_form_alternatives.createMany).toHaveBeenCalledWith({
        data: [{ recommendation_id: 'r1', form: 'EURL', why_not_chosen: 'moins souple pour lever des fonds' }],
      });
      expect(prisma.legal_form_sources.createMany).toHaveBeenCalledWith({
        data: [{ recommendation_id: 'r1', title: 'Source', url: 'https://exemple.com' }],
      });
      expect(result).toEqual({ id: 'r1', project_id: 'p1', ...recommandation });
    });

    it("n'appelle aucune table fille quand les listes sont vides", async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      formerService.recommendLegalForm.mockResolvedValue({
        recommended_form: 'micro-entreprise',
        rationale: 'r',
        assumptions: [],
        alternatives: [],
        points_to_check: [],
        sources: [],
      });
      prisma.legal_form_recommendations.create.mockResolvedValue({ id: 'r1' });

      await service.recommendLegalFormForOwner('u1', 'p1');

      expect(prisma.legal_form_assumptions.createMany).not.toHaveBeenCalled();
      expect(prisma.legal_form_alternatives.createMany).not.toHaveBeenCalled();
      expect(prisma.legal_form_sources.createMany).not.toHaveBeenCalled();
    });
  });

  describe('listLegalFormRecommendationsForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.listLegalFormRecommendationsForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('un collaborateur peut lister les recommandations, pas seulement le propriétaire', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.legal_form_recommendations.findMany.mockResolvedValue([{ id: 'r1' }]);

      await expect(
        service.listLegalFormRecommendationsForOwner('u2-collaborateur', 'p1'),
      ).resolves.toEqual([{ id: 'r1' }]);
      expect(prisma.legal_form_recommendations.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        include: { assumptions: true, alternatives: true, sources: true },
        orderBy: { created_at: 'desc' },
      });
    });
  });

  describe('droits de l’équipe sur le projet', () => {
    const projetAvec = (role: string) => ({
      id: 'p1',
      owner_id: 'proprio',
      title: 'Idée',
      description: 'Desc',
      collaborators: [{ role }],
    });

    it('un salarié voit les plans mais ne modifie pas le projet', async () => {
      prisma.projects.findFirst.mockResolvedValue(projetAvec('salarie'));
      prisma.build_plans.findMany.mockResolvedValue([]);

      await expect(service.listBuildPlansForOwner('u2', 'p1')).resolves.toEqual([]);
      await expect(service.updateForOwner('u2', 'p1', 'Nouveau titre')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.setSectorForOwner('u2', 'p1', 'commerce')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('un comptable voit le plan de financement, pas les autres plans', async () => {
      prisma.projects.findFirst.mockResolvedValue(projetAvec('comptable'));
      prisma.financing_plans.findMany.mockResolvedValue([]);

      await expect(service.listFinancingPlansForOwner('u2', 'p1')).resolves.toEqual([]);
      await expect(service.listBuildPlansForOwner('u2', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un associé lance un générateur : les crédits du propriétaire paient, l’associé reste l’acteur', async () => {
      prisma.projects.findFirst.mockResolvedValue(projetAvec('associe'));
      planningService.createBuildPlan.mockResolvedValue({
        summary: 'R',
        estimated_timeline: 'x',
        milestones: [],
        key_resources: [],
      });
      prisma.build_plans.create.mockResolvedValue({ id: 'bp1' });

      await service.createBuildPlanForOwner('u2', 'p1');

      expect(planningService.createBuildPlan).toHaveBeenCalledWith(
        'Idée',
        'Desc',
        { userId: 'proprio', actorId: 'u2', projectId: 'p1' },
        undefined,
      );
    });

    it('un associé ne supprime pas le projet ; un observateur ne lance pas IGINI', async () => {
      prisma.projects.findFirst.mockResolvedValue(projetAvec('associe'));
      await expect(service.deleteForOwner('u2', 'p1')).rejects.toBeInstanceOf(ForbiddenException);

      prisma.projects.findFirst.mockResolvedValue(projetAvec('observateur'));
      await expect(service.analyzeForOwner('u2', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(analysisService.analyzeProject).not.toHaveBeenCalled();
    });
  });

  describe('createBuildPlanForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.createBuildPlanForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(planningService.createBuildPlan).not.toHaveBeenCalled();
    });

    it('génère le plan puis persiste le résultat', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      const plan = {
        summary: 'Résumé',
        estimated_timeline: '3 à 6 mois',
        milestones: ['Jalon 1'],
        key_resources: ['Ressource 1'],
      };
      prisma.projects.findFirst.mockResolvedValue(project);
      planningService.createBuildPlan.mockResolvedValue(plan);
      prisma.build_plans.create.mockResolvedValue({ id: 'bp1', project_id: 'p1', ...plan });

      const result = await service.createBuildPlanForOwner('u1', 'p1');

      expect(planningService.createBuildPlan).toHaveBeenCalledWith('Idée', 'Desc', ATTRIBUTION, undefined);
      expect(prisma.build_plans.create).toHaveBeenCalledWith({
        data: { project_id: 'p1', ...plan, ...GENERATED_PROVENANCE },
      });
      expect(result).toEqual({ id: 'bp1', project_id: 'p1', ...plan });
    });

    it("transmet le contexte de l'analyse existante à la génération du plan", async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      prisma.analyses.findFirst.mockResolvedValue({
        summary: 'Idée prometteuse.',
        feasibility_score: 7,
      });
      planningService.createBuildPlan.mockResolvedValue({
        summary: 'Résumé',
        estimated_timeline: '3 à 6 mois',
        milestones: ['Jalon 1'],
        key_resources: ['Ressource 1'],
      });
      prisma.build_plans.create.mockResolvedValue({});

      await service.createBuildPlanForOwner('u1', 'p1');

      expect(planningService.createBuildPlan).toHaveBeenCalledWith(
        'Idée',
        'Desc',
        ATTRIBUTION,
        expect.stringContaining('Idée prometteuse.'),
      );
    });

    it('place la mémoire avant les étapes précédentes dans le contexte', async () => {
      // L'ordre n'est pas cosmétique : ce que la personne a décidé prime
      // sur ce que le système a déduit, y compris dans un prompt.
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      memoryService.recallAsContext.mockResolvedValue('SOUVENIRS');
      prisma.analyses.findFirst.mockResolvedValue({
        summary: 'ANALYSE',
        feasibility_score: 7,
      });
      planningService.createBuildPlan.mockResolvedValue({
        summary: 'Résumé',
        estimated_timeline: '3 à 6 mois',
        milestones: [],
        key_resources: [],
      });
      prisma.build_plans.create.mockResolvedValue({});

      await service.createBuildPlanForOwner('u1', 'p1');

      const context = planningService.createBuildPlan.mock.calls[0][3] as string;
      expect(context.indexOf('SOUVENIRS')).toBeLessThan(context.indexOf('ANALYSE'));
    });

    it("ne transmet jamais le contenu d'étapes ultérieures (financement, développement), même si elles existent déjà", async () => {
      // Régression : ce test échouerait avec l'ancienne implémentation, qui
      // remontait sans distinction toutes les tables existantes.
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      prisma.financing_plans.findFirst.mockResolvedValue({ summary: 'Plan de financement futur.' });
      prisma.development_plans.findFirst.mockResolvedValue({ summary: 'Plan de croissance futur.' });
      planningService.createBuildPlan.mockResolvedValue({
        summary: 'Résumé',
        estimated_timeline: '3 à 6 mois',
        milestones: ['Jalon 1'],
        key_resources: ['Ressource 1'],
      });
      prisma.build_plans.create.mockResolvedValue({});

      await service.createBuildPlanForOwner('u1', 'p1');

      const [, , , context] = planningService.createBuildPlan.mock.calls[0];
      expect(context).toBeUndefined();
    });

    it('crée des tâches suivables à partir des jalons du plan', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      planningService.createBuildPlan.mockResolvedValue({
        summary: 'Résumé',
        estimated_timeline: '3 à 6 mois',
        milestones: ['Jalon 1', 'Jalon 2'],
        key_resources: ['Ressource 1'],
      });
      prisma.build_plans.create.mockResolvedValue({});

      await service.createBuildPlanForOwner('u1', 'p1');

      expect(workflowService.createTasksFromSuggestions).toHaveBeenCalledWith(
        'p1',
        ['Jalon 1', 'Jalon 2'],
        'build_plan',
      );
    });

    it("déclenche l'automatisation après un plan de construction réussi", async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      planningService.createBuildPlan.mockResolvedValue({
        summary: 'Résumé',
        estimated_timeline: '3 à 6 mois',
        milestones: [],
        key_resources: [],
      });
      prisma.build_plans.create.mockResolvedValue({});

      await service.createBuildPlanForOwner('u1', 'p1');

      expect(automationService.run).toHaveBeenCalledWith('p1');
    });
  });

  describe('listBuildPlansForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.listBuildPlansForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('liste les plans du projet, les plus récents en premier', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.build_plans.findMany.mockResolvedValue([{ id: 'bp1' }]);

      const result = await service.listBuildPlansForOwner('u1', 'p1');

      expect(prisma.build_plans.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        orderBy: { created_at: 'desc' },
      });
      expect(result).toEqual([{ id: 'bp1' }]);
    });
  });

  describe('contexteEvaluation', () => {
    it('refuse le projet d’un autre', async () => {
      prisma.projects.findFirst.mockResolvedValue(null);
      await expect(service.contexteEvaluation('u1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rassemble titre, description et ce qu’IGINI sait déjà (analyse, plans)', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' });
      prisma.analyses.findFirst.mockResolvedValue({ feasibility_score: 7, summary: 'Marché porteur' });

      const r = await service.contexteEvaluation('u1', 'p1');

      expect(r.titre).toBe('Idée');
      expect(r.description).toBe('Desc');
      expect(r.contexte).toContain('Marché porteur');
    });
  });

  describe('createFinancingPlanForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.createFinancingPlanForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(financingService.createFinancingPlan).not.toHaveBeenCalled();
    });

    it('génère le plan de financement puis persiste le résultat', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      const plan = {
        summary: 'Résumé',
        estimated_budget: '5 000 € à 15 000 €',
        funding_sources: ['Autofinancement'],
        budget_breakdown: ['Développement'],
      };
      prisma.projects.findFirst.mockResolvedValue(project);
      financingService.createFinancingPlan.mockResolvedValue(plan);
      prisma.financing_plans.create.mockResolvedValue({ id: 'fp1', project_id: 'p1', ...plan });

      const result = await service.createFinancingPlanForOwner('u1', 'p1');

      expect(financingService.createFinancingPlan).toHaveBeenCalledWith('Idée', 'Desc', ATTRIBUTION, undefined);
      expect(prisma.financing_plans.create).toHaveBeenCalledWith({
        data: { project_id: 'p1', ...plan, ...GENERATED_PROVENANCE },
      });
      expect(result).toEqual({ id: 'fp1', project_id: 'p1', ...plan });
    });

    it('crée des tâches suivables à partir des pistes de financement', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      financingService.createFinancingPlan.mockResolvedValue({
        summary: 'Résumé',
        estimated_budget: '5 000 € à 15 000 €',
        funding_sources: ['Autofinancement', 'Prêt bancaire'],
        budget_breakdown: ['Développement'],
      });
      prisma.financing_plans.create.mockResolvedValue({});

      await service.createFinancingPlanForOwner('u1', 'p1');

      expect(workflowService.createTasksFromSuggestions).toHaveBeenCalledWith(
        'p1',
        ['Autofinancement', 'Prêt bancaire'],
        'financing_plan',
      );
    });

    it("compose le contexte à partir de l'analyse et de la construction, jamais du développement", async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      prisma.analyses.findFirst.mockResolvedValue({ summary: 'Analyse.', feasibility_score: 6 });
      prisma.build_plans.findFirst.mockResolvedValue({ summary: 'Construction.' });
      prisma.development_plans.findFirst.mockResolvedValue({ summary: 'Ne doit pas apparaître.' });
      financingService.createFinancingPlan.mockResolvedValue({
        summary: 'Résumé',
        estimated_budget: '5 000 € à 15 000 €',
        funding_sources: ['Autofinancement'],
        budget_breakdown: ['Développement'],
      });
      prisma.financing_plans.create.mockResolvedValue({});

      await service.createFinancingPlanForOwner('u1', 'p1');

      const [, , , context] = financingService.createFinancingPlan.mock.calls[0];
      expect(context).toContain('Analyse.');
      expect(context).toContain('Construction.');
      expect(context).not.toContain('Ne doit pas apparaître.');
    });

    it("déclenche l'automatisation après un plan de financement réussi", async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      financingService.createFinancingPlan.mockResolvedValue({
        summary: 'Résumé',
        estimated_budget: 'N/A',
        funding_sources: [],
        budget_breakdown: [],
      });
      prisma.financing_plans.create.mockResolvedValue({});

      await service.createFinancingPlanForOwner('u1', 'p1');

      expect(automationService.run).toHaveBeenCalledWith('p1');
    });
  });

  describe('listFinancingPlansForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.listFinancingPlansForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('liste les plans du projet, les plus récents en premier', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.financing_plans.findMany.mockResolvedValue([{ id: 'fp1' }]);

      const result = await service.listFinancingPlansForOwner('u1', 'p1');

      expect(prisma.financing_plans.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        orderBy: { created_at: 'desc' },
      });
      expect(result).toEqual([{ id: 'fp1' }]);
    });
  });

  describe('createDevelopmentPlanForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.createDevelopmentPlanForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(developmentService.createDevelopmentPlan).not.toHaveBeenCalled();
    });

    it('génère le plan de développement puis persiste le résultat', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      const plan = {
        summary: 'Résumé',
        growth_levers: ['Bouche-à-oreille'],
        key_metrics: ['Rétention'],
        scaling_risks: ['Support non préparé'],
      };
      prisma.projects.findFirst.mockResolvedValue(project);
      developmentService.createDevelopmentPlan.mockResolvedValue(plan);
      prisma.development_plans.create.mockResolvedValue({ id: 'dp1', project_id: 'p1', ...plan });

      const result = await service.createDevelopmentPlanForOwner('u1', 'p1');

      expect(developmentService.createDevelopmentPlan).toHaveBeenCalledWith('Idée', 'Desc', ATTRIBUTION, undefined);
      expect(prisma.development_plans.create).toHaveBeenCalledWith({
        data: { project_id: 'p1', ...plan, ...GENERATED_PROVENANCE },
      });
      expect(result).toEqual({ id: 'dp1', project_id: 'p1', ...plan });
    });

    it('crée des tâches suivables à partir des leviers de croissance', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      developmentService.createDevelopmentPlan.mockResolvedValue({
        summary: 'Résumé',
        growth_levers: ['Bouche-à-oreille', 'Partenariats'],
        key_metrics: ['Rétention'],
        scaling_risks: ['Support non préparé'],
      });
      prisma.development_plans.create.mockResolvedValue({});

      await service.createDevelopmentPlanForOwner('u1', 'p1');

      expect(workflowService.createTasksFromSuggestions).toHaveBeenCalledWith(
        'p1',
        ['Bouche-à-oreille', 'Partenariats'],
        'development_plan',
      );
    });

    it("compose le contexte à partir de l'analyse, de la construction et du financement", async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      prisma.analyses.findFirst.mockResolvedValue({ summary: 'Analyse.', feasibility_score: 6 });
      prisma.build_plans.findFirst.mockResolvedValue({ summary: 'Construction.' });
      prisma.financing_plans.findFirst.mockResolvedValue({ summary: 'Financement.' });
      developmentService.createDevelopmentPlan.mockResolvedValue({
        summary: 'Résumé',
        growth_levers: ['Bouche-à-oreille'],
        key_metrics: ['Rétention'],
        scaling_risks: ['Support non préparé'],
      });
      prisma.development_plans.create.mockResolvedValue({});

      await service.createDevelopmentPlanForOwner('u1', 'p1');

      const [, , , context] = developmentService.createDevelopmentPlan.mock.calls[0];
      expect(context).toContain('Analyse.');
      expect(context).toContain('Construction.');
      expect(context).toContain('Financement.');
    });

    it("déclenche l'automatisation après un plan de développement réussi", async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      developmentService.createDevelopmentPlan.mockResolvedValue({
        summary: 'Résumé',
        growth_levers: [],
        key_metrics: [],
        scaling_risks: [],
      });
      prisma.development_plans.create.mockResolvedValue({});

      await service.createDevelopmentPlanForOwner('u1', 'p1');

      expect(automationService.run).toHaveBeenCalledWith('p1');
    });
  });

  describe('listDevelopmentPlansForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.listDevelopmentPlansForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('liste les plans du projet, les plus récents en premier', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.development_plans.findMany.mockResolvedValue([{ id: 'dp1' }]);

      const result = await service.listDevelopmentPlansForOwner('u1', 'p1');

      expect(prisma.development_plans.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        orderBy: { created_at: 'desc' },
      });
      expect(result).toEqual([{ id: 'dp1' }]);
    });
  });

  describe('contexte de participation IGNITUX', () => {
    const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };

    beforeEach(() => {
      prisma.projects.findFirst.mockResolvedValue(project);
      prisma.participation_agreements.findFirst.mockResolvedValue({
        id: 'a1',
        project_id: 'p1',
        founder_holder_id: 'hf',
        ignitux_holder_id: 'hi',
        status: 'actif',
        dividend_right_bps: 500,
      });
      prisma.equity_events.findMany.mockResolvedValue([
        { holder_id: 'hf', share_basis_points: 6400, occurred_at: new Date('2026-10-01') },
        { holder_id: 'hi', share_basis_points: 3600, occurred_at: new Date('2026-10-01') },
      ]);
      prisma.participation_milestones.findMany.mockResolvedValue([
        { position: 1, label: null, target_ignitux_bps: 1200, status: 'prevu', conditions: ['Condition du projet'] },
      ]);
    });

    it('éclaire le plan de financement : où en est le capital et quel est le prochain palier', async () => {
      financingService.createFinancingPlan.mockResolvedValue({
        summary: 'R',
        estimated_budget: 'x',
        funding_sources: [],
        budget_breakdown: [],
      });
      prisma.financing_plans.create.mockResolvedValue({});

      await service.createFinancingPlanForOwner('u1', 'p1');

      const context = financingService.createFinancingPlan.mock.calls[0][3] as string;
      expect(context).toContain('64 % porteur / 36 % IGNITUX');
      expect(context).toContain('Condition du projet');
    });

    it('éclaire le plan de développement', async () => {
      developmentService.createDevelopmentPlan.mockResolvedValue({
        summary: 'R',
        growth_levers: [],
        key_metrics: [],
        scaling_risks: [],
      });
      prisma.development_plans.create.mockResolvedValue({});

      await service.createDevelopmentPlanForOwner('u1', 'p1');

      expect(developmentService.createDevelopmentPlan.mock.calls[0][3]).toContain('64 % porteur / 36 % IGNITUX');
    });

    it('éclaire le plan de transmission', async () => {
      transmissionService.createTransmissionPlan.mockResolvedValue({
        summary: 'R',
        transfer_options: [],
        key_documentation: [],
        readiness_checklist: [],
      });
      prisma.transmission_plans.create.mockResolvedValue({});

      await service.createTransmissionPlanForOwner('u1', 'p1');

      expect(transmissionService.createTransmissionPlan.mock.calls[0][3]).toContain('64 % porteur / 36 % IGNITUX');
    });

    it('éclaire le plan de construction', async () => {
      planningService.createBuildPlan.mockResolvedValue({
        summary: 'R',
        estimated_timeline: 'x',
        milestones: [],
        key_resources: [],
      });
      prisma.build_plans.create.mockResolvedValue({});

      await service.createBuildPlanForOwner('u1', 'p1');

      expect(planningService.createBuildPlan.mock.calls[0][3]).toContain('64 % porteur / 36 % IGNITUX');
    });

    it('n’ajoute rien quand le projet n’a pas d’accord', async () => {
      prisma.participation_agreements.findFirst.mockResolvedValue(null);
      financingService.createFinancingPlan.mockResolvedValue({
        summary: 'R',
        estimated_budget: 'x',
        funding_sources: [],
        budget_breakdown: [],
      });
      prisma.financing_plans.create.mockResolvedValue({});

      await service.createFinancingPlanForOwner('u1', 'p1');

      expect(financingService.createFinancingPlan.mock.calls[0][3]).toBeUndefined();
    });
  });

  describe('createTransmissionPlanForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.createTransmissionPlanForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(transmissionService.createTransmissionPlan).not.toHaveBeenCalled();
    });

    it('génère le plan de transmission puis persiste le résultat', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      const plan = {
        summary: 'Résumé',
        transfer_options: ['Association avec un repreneur'],
        key_documentation: ['Contrats fournisseurs'],
        readiness_checklist: ['Formaliser les processus clés'],
      };
      prisma.projects.findFirst.mockResolvedValue(project);
      transmissionService.createTransmissionPlan.mockResolvedValue(plan);
      prisma.transmission_plans.create.mockResolvedValue({ id: 'tp1', project_id: 'p1', ...plan });

      const result = await service.createTransmissionPlanForOwner('u1', 'p1');

      expect(transmissionService.createTransmissionPlan).toHaveBeenCalledWith('Idée', 'Desc', ATTRIBUTION, undefined);
      expect(prisma.transmission_plans.create).toHaveBeenCalledWith({
        data: { project_id: 'p1', ...plan, ...GENERATED_PROVENANCE },
      });
      expect(result).toEqual({ id: 'tp1', project_id: 'p1', ...plan });
    });

    it('crée des tâches suivables à partir de la check-list de transmissibilité', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      transmissionService.createTransmissionPlan.mockResolvedValue({
        summary: 'Résumé',
        transfer_options: ['Association avec un repreneur'],
        key_documentation: ['Contrats fournisseurs'],
        readiness_checklist: ['Formaliser les processus clés', 'Documenter les accès'],
      });
      prisma.transmission_plans.create.mockResolvedValue({});

      await service.createTransmissionPlanForOwner('u1', 'p1');

      expect(workflowService.createTasksFromSuggestions).toHaveBeenCalledWith(
        'p1',
        ['Formaliser les processus clés', 'Documenter les accès'],
        'transmission_plan',
      );
    });

    it('compose le contexte à partir des quatre étapes précédentes', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      prisma.analyses.findFirst.mockResolvedValue({ summary: 'Analyse.', feasibility_score: 6 });
      prisma.build_plans.findFirst.mockResolvedValue({ summary: 'Construction.' });
      prisma.financing_plans.findFirst.mockResolvedValue({ summary: 'Financement.' });
      prisma.development_plans.findFirst.mockResolvedValue({ summary: 'Développement.' });
      transmissionService.createTransmissionPlan.mockResolvedValue({
        summary: 'Résumé',
        transfer_options: ['Association avec un repreneur'],
        key_documentation: ['Contrats fournisseurs'],
        readiness_checklist: ['Formaliser les processus clés'],
      });
      prisma.transmission_plans.create.mockResolvedValue({});

      await service.createTransmissionPlanForOwner('u1', 'p1');

      const [, , , context] = transmissionService.createTransmissionPlan.mock.calls[0];
      expect(context).toContain('Analyse.');
      expect(context).toContain('Construction.');
      expect(context).toContain('Financement.');
      expect(context).toContain('Développement.');
    });

    it("déclenche l'automatisation après un plan de transmission réussi", async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      transmissionService.createTransmissionPlan.mockResolvedValue({
        summary: 'Résumé',
        transfer_options: [],
        key_documentation: [],
        readiness_checklist: [],
      });
      prisma.transmission_plans.create.mockResolvedValue({});

      await service.createTransmissionPlanForOwner('u1', 'p1');

      expect(automationService.run).toHaveBeenCalledWith('p1');
    });
  });

  describe('listTransmissionPlansForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.listTransmissionPlansForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('liste les plans du projet, les plus récents en premier', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.transmission_plans.findMany.mockResolvedValue([{ id: 'tp1' }]);

      const result = await service.listTransmissionPlansForOwner('u1', 'p1');

      expect(prisma.transmission_plans.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        orderBy: { created_at: 'desc' },
      });
      expect(result).toEqual([{ id: 'tp1' }]);
    });
  });

  describe('runAutomationForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.runAutomationForOwner('u1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
      expect(automationService.run).not.toHaveBeenCalled();
    });

    it('déclenche manuellement une exécution une fois la propriété vérifiée', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      automationService.run.mockResolvedValue({ run: { id: 'run1' }, tasksCreated: [], tasksClosed: [], conceptLinksCreated: [] });

      const result = await service.runAutomationForOwner('u1', 'p1');

      expect(automationService.run).toHaveBeenCalledWith('p1');
      expect(result).toEqual({ run: { id: 'run1' }, tasksCreated: [], tasksClosed: [], conceptLinksCreated: [] });
    });
  });

  describe('listAutomationRunsForViewer', () => {
    it("lève une NotFoundException si l'utilisateur n'a pas accès au projet", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.listAutomationRunsForViewer('u1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('un collaborateur (pas seulement le propriétaire) peut consulter l\'historique', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      automationService.listRuns.mockResolvedValue([{ id: 'run1' }]);

      const result = await service.listAutomationRunsForViewer('u2-collaborateur', 'p1');

      expect(automationService.listRuns).toHaveBeenCalledWith('p1');
      expect(result).toEqual([{ id: 'run1' }]);
    });
  });
});
