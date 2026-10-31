import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConstitutionService } from '../constitution/constitution.service.js';
import { AnalysisService } from '../igini/analysis/analysis.service.js';
import { CLAUDE_MODEL } from '../igini/claude/claude.service.js';
import { MemoryService } from '../igini/memory/memory.service.js';
import { AutomationService } from '../igini/automation/automation.service.js';
import { DevelopmentService } from '../igini/development/development.service.js';
import { FinancingService } from '../igini/financing/financing.service.js';
import { PlanningService } from '../igini/planning/planning.service.js';
import { TransmissionService } from '../igini/transmission/transmission.service.js';
import { WorkflowEngineService } from '../igini/workflow/workflow-engine.service.js';
import { WorkflowService } from '../igini/workflow/workflow.service.js';
import { FormerService, type LegalFormRecommendationResult } from '../igini/former/former.service.js';
import { chargerContexteParticipation } from '../participation/participation-context.js';
import { exigerCapacite } from '../equipe/acces-projet.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { chargerContexteDeclare } from './questionnaire/charger-contexte.js';

/**
 * Une facture ou un avoir émis : un document qui se conserve. Un brouillon
 * n'a jamais existé pour le client, et un devis n'est pas une facture.
 */
const DOCUMENT_A_CONSERVER = {
  type: { in: ['facture', 'avoir'] },
  status: { not: 'brouillon' },
};

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analysisService: AnalysisService,
    private readonly formerService: FormerService,
    private readonly planningService: PlanningService,
    private readonly financingService: FinancingService,
    private readonly developmentService: DevelopmentService,
    private readonly transmissionService: TransmissionService,
    private readonly workflowService: WorkflowService,
    private readonly automationService: AutomationService,
    private readonly constitutionService: ConstitutionService,
    private readonly memoryService: MemoryService,
    private readonly workflowEngineService: WorkflowEngineService,
  ) {}

  /**
   * Provenance commune aux six générateurs, soumise au moteur
   * constitutionnel avant l'écriture. Centralisée ici parce qu'une provenance
   * recopiée six fois finit par diverger, et qu'une divergence silencieuse
   * sur ce champ précis est exactement ce que l'article 12 interdit.
   */
  private async generatedProvenance(
    entity: string,
    ownerId: string,
    projectId: string,
  ): Promise<{ generated_by: string; generated_model: string }> {
    await this.constitutionService.guard(
      {
        kind: 'persist_generated',
        entity,
        generatedBy: 'igini',
        generatedModel: CLAUDE_MODEL,
      },
      { userId: ownerId, projectId },
    );

    return { generated_by: 'igini', generated_model: CLAUDE_MODEL };
  }

  async create(ownerId: string, title: string, description?: string) {
    // Aucune limite de nombre de projets : depuis les crédits IGINI
    // (2026-10-25), tous les outils sont gratuits ; seules les actions
    // IGINI se paient, à l'action.

    // Article 13 (Respect de la Vie Privée) : un projet naît privé. La
    // règle attrape une régression où `is_public` prendrait `true` par
    // défaut — un basculement silencieux que personne ne remarquerait.
    await this.constitutionService.guard(
      { kind: 'create_project', isPublic: false },
      { userId: ownerId },
    );

    return this.prisma.projects.create({
      data: { owner_id: ownerId, title, description },
    });
  }

  findAllForOwner(ownerId: string) {
    return this.prisma.projects.findMany({
      where: {
        OR: [{ owner_id: ownerId }, { collaborators: { some: { user_id: ownerId } } }],
        archived_at: null,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /** Les projets archivés, à part : ils ont quitté la liste, pas l'application. */
  findArchivedForOwner(ownerId: string) {
    return this.prisma.projects.findMany({
      where: {
        OR: [{ owner_id: ownerId }, { collaborators: { some: { user_id: ownerId } } }],
        archived_at: { not: null },
      },
      orderBy: { archived_at: 'desc' },
    });
  }

  async findOneForOwner(ownerId: string, id: string) {
    const project = await this.prisma.projects.findFirst({
      where: { id, owner_id: ownerId },
    });

    if (!project) {
      throw new NotFoundException('Projet introuvable.');
    }

    return project;
  }

  // Tout membre de l'équipe lit le titre et la description du projet, quel
  // que soit son rôle. Le reste dépend de ses capacités (voir
  // src/equipe/droits-equipe.ts et exigerCapacite).
  async findOneForViewer(userId: string, id: string) {
    const project = await this.prisma.projects.findFirst({
      where: {
        id,
        OR: [{ owner_id: userId }, { collaborators: { some: { user_id: userId } } }],
      },
    });

    if (!project) {
      throw new NotFoundException('Projet introuvable.');
    }

    return project;
  }

  async updateForOwner(ownerId: string, id: string, title?: string, description?: string) {
    // Vérifie que le projet appartient bien à l'utilisateur avant de le modifier.
    await exigerCapacite(this.prisma, ownerId, id, 'modifier_projet');

    return this.prisma.projects.update({
      where: { id },
      data: { title, description },
    });
  }

  /**
   * Supprime le projet, sauf s'il porte des traces légales de l'entreprise.
   *
   * La fiche d'immatriculation partirait avec lui (cascade) ; les factures
   * émises resteraient, mais détachées de leur projet. Dans ces deux cas on
   * refuse et on propose d'archiver. La suppression revérifie elle-même les
   * deux conditions : une facture émise entre la lecture et la suppression
   * ne passe pas.
   */
  async deleteForOwner(ownerId: string, id: string) {
    await exigerCapacite(this.prisma, ownerId, id, 'supprimer_projet');
    await this.refuserSiTracesLegales(id);

    const supprime = await this.prisma.projects.deleteMany({
      where: {
        id,
        company_registration: { is: null },
        billing_documents: { none: DOCUMENT_A_CONSERVER },
      },
    });
    if (supprime.count === 0) {
      await this.refuserSiTracesLegales(id);
      throw new ConflictException('Ce projet a changé pendant la suppression. Recharge la page et réessaie.');
    }
  }

  private async refuserSiTracesLegales(projectId: string) {
    const [immatriculation, factures] = await Promise.all([
      this.prisma.company_registrations.findUnique({ where: { project_id: projectId }, select: { id: true } }),
      this.prisma.billing_documents.count({ where: { project_id: projectId, ...DOCUMENT_A_CONSERVER } }),
    ]);
    const raisons = [
      ...(immatriculation ? ['sa société est immatriculée'] : []),
      ...(factures > 0 ? ['il a des factures émises'] : []),
    ];
    if (raisons.length > 0) {
      throw new ConflictException(
        `Ce projet ne peut pas être supprimé : ${raisons.join(' et ')}, qu’il faut garder. ` +
          'Archive-le plutôt : il quittera ta liste sans rien perdre.',
      );
    }
  }

  // La même capacité que la suppression : c'est son remplaçant, réservé lui
  // aussi au propriétaire (droits-equipe.ts, validé le 11/10/2026).
  async archiveForOwner(ownerId: string, id: string) {
    await exigerCapacite(this.prisma, ownerId, id, 'supprimer_projet');
    return this.prisma.projects.update({ where: { id }, data: { archived_at: new Date() } });
  }

  async restoreForOwner(ownerId: string, id: string) {
    await exigerCapacite(this.prisma, ownerId, id, 'supprimer_projet');
    return this.prisma.projects.update({ where: { id }, data: { archived_at: null } });
  }

  /**
   * Le secteur d'activité du projet.
   *
   * Sert à trier les démarches de conformité — jamais à en masquer. Un
   * secteur absent n'est pas une lacune à combler : la conformité s'affiche
   * entière sans lui, simplement dans l'ordre par défaut.
   */
  async setSectorForOwner(ownerId: string, id: string, sector: string | null) {
    await exigerCapacite(this.prisma, ownerId, id, 'modifier_projet');
    return this.prisma.projects.update({ where: { id }, data: { sector } });
  }

  /**
   * La forme juridique RETENUE par la personne, distincte de la simple
   * recommandation de Former. Un document aussi engageant que des statuts
   * ne doit jamais se construire sur une suggestion non confirmée.
   */
  async setConfirmedLegalFormForOwner(ownerId: string, id: string, legalForm: string | null) {
    await exigerCapacite(this.prisma, ownerId, id, 'modifier_projet');
    return this.prisma.projects.update({
      where: { id },
      data: { confirmed_legal_form: legalForm },
    });
  }

  async setVisibilityForOwner(ownerId: string, id: string, isPublic: boolean) {
    await exigerCapacite(this.prisma, ownerId, id, 'modifier_projet');
    return this.prisma.projects.update({ where: { id }, data: { is_public: isPublic } });
  }

  // Mémoire commune (voir backend/src/igini/README.md) : chaque génération ne
  // doit voir QUE ce que les étapes qui la précèdent logiquement ont déjà
  // établi — jamais ce qui vient après. Chaque étape a donc sa propre
  // méthode, appelée uniquement par les étapes qui la suivent dans le
  // pipeline (analyse → construction → financement → développement →
  // transmission), plutôt qu'une fonction unique qui remonterait tout sans
  // distinction (ce qui ferait fuir des informations "du futur" en cas de
  // régénération d'une étape après que des étapes suivantes existent déjà).

  private async latestAnalysisContext(projectId: string): Promise<string | undefined> {
    const analysis = await this.prisma.analyses.findFirst({
      where: { project_id: projectId },
      orderBy: { created_at: 'desc' },
    });
    return analysis
      ? `Analyse (score de faisabilité ${analysis.feasibility_score}/10) : ${analysis.summary}`
      : undefined;
  }

  private async latestBuildPlanContext(projectId: string): Promise<string | undefined> {
    const plan = await this.prisma.build_plans.findFirst({
      where: { project_id: projectId },
      orderBy: { created_at: 'desc' },
    });
    return plan ? `Plan de construction : ${plan.summary}` : undefined;
  }

  private async latestFinancingPlanContext(projectId: string): Promise<string | undefined> {
    const plan = await this.prisma.financing_plans.findFirst({
      where: { project_id: projectId },
      orderBy: { created_at: 'desc' },
    });
    return plan ? `Plan de financement : ${plan.summary}` : undefined;
  }

  private async latestDevelopmentPlanContext(projectId: string): Promise<string | undefined> {
    const plan = await this.prisma.development_plans.findFirst({
      where: { project_id: projectId },
      orderBy: { created_at: 'desc' },
    });
    return plan ? `Plan de développement : ${plan.summary}` : undefined;
  }

  /**
   * Rappel de la mémoire IGINI, injecté dans le contexte de CHAQUE
   * génération — y compris la toute première analyse, qui n'a par
   * définition aucune étape précédente mais peut très bien porter sur une
   * personne dont IGINI sait déjà des choses.
   *
   * C'est ce branchement qui donne son sens au moteur Mémoire : jusqu'ici
   * il enregistrait consciencieusement des souvenirs que rien ne relisait
   * jamais.
   */
  private memoryContext(ownerId: string, projectId: string): Promise<string | undefined> {
    return this.memoryService.recallAsContext(ownerId, projectId);
  }

  /**
   * Ce que la personne a déclaré — sur elle (profil, CV) et sur ce projet
   * (questionnaire) — injecté dans CHAQUE génération.
   *
   * Le profil se remplissait consciencieusement sans que rien ne le relise
   * jamais — le même défaut que la mémoire avait avant d'être branchée ici.
   * L'échec est avalé dans le chargeur (voir charger-contexte.ts).
   */
  private personContext(ownerId: string, projectId: string): Promise<string | undefined> {
    return chargerContexteDeclare(this.prisma, ownerId, projectId);
  }

  /**
   * Où en est la participation d'IGNITUX dans ce projet, pour IGINI.
   *
   * Seulement pour les étapes où elle compte (construire, financer,
   * développer, transmettre) : l'analyse et la forme juridique précèdent
   * tout accord. L'échec est avalé dans le chargeur.
   */
  private participationContext(projectId: string): Promise<string | undefined> {
    return chargerContexteParticipation(this.prisma, projectId);
  }

  private joinContext(...parts: Array<string | undefined>): string | undefined {
    const present = parts.filter((part): part is string => Boolean(part));
    return present.length > 0 ? present.join('\n') : undefined;
  }

  async analyzeForOwner(demandeurId: string, id: string) {
    // Un associé peut lancer IGINI : les crédits du propriétaire paient, l'associé reste l'acteur.
    const { ownerId } = await exigerCapacite(this.prisma, demandeurId, id, 'lancer_ia');
    const project = await this.findOneForOwner(ownerId, id);
    const result = await this.analysisService.analyzeProject(
      project.title,
      project.description,
      { userId: ownerId, actorId: demandeurId, projectId: project.id },
      this.joinContext(await this.personContext(ownerId, id), await this.memoryContext(ownerId, id)),
    );

    const analysis = await this.prisma.analyses.create({
      data: {
        project_id: project.id,
        summary: result.summary,
        feasibility_score: result.feasibility_score,
        score_rationale: result.score_rationale,
        strengths: result.strengths,
        risks: result.risks,
        next_steps: result.next_steps,
        ...(await this.generatedProvenance('analyses', ownerId, project.id)),
      },
    });

    // Les sources réellement consultées par la recherche web (voir
    // ClaudeService.WebSearchSource) — une table à part, pas un champ sur
    // `analyses` : chacune est une ligne avec sa propre date, comme un
    // mouvement de stock est une ligne à part de l'article qu'il concerne.
    // `result.sources` défend contre un appelant qui, un jour, ne le
    // fournirait pas : écrire silencieusement rien plutôt que planter sur
    // `undefined.length` est le bon compromis ici, l'analyse elle-même étant
    // déjà persistée.
    const sources = result.sources ?? [];
    if (sources.length > 0) {
      await this.prisma.analysis_sources.createMany({
        data: sources.map((source) => ({
          analysis_id: analysis.id,
          title: source.title,
          url: source.url,
        })),
      });
    }

    // Workflow : les prochaines étapes suggérées par l'analyse deviennent des
    // tâches suivables, pas juste du texte affiché puis oublié.
    await this.workflowService.createTasksFromSuggestions(project.id, result.next_steps, 'analysis');
    // Automation : sans confirmation, IGINI réévalue les tâches d'étape et
    // les liens de concepts du projet à chaud (voir AutomationService).
    await this.automationService.run(project.id);
    await this.workflowEngineService.advanceActiveRunsForProject(ownerId, project.id);

    // Plus de Former déclenché ici au-dessus de 75/100 (retiré le
    // 2026-10-31) : la forme juridique est la deuxième étape de
    // l'enchaînement IGINI, pour tous les projets (voir enchainement-model.ts).

    // Attaché depuis ce qu'on vient d'écrire, pas relu en base : c'est
    // exactement les mêmes sources, et une requête de plus n'apprendrait
    // rien que `sources` ne sache déjà.
    return { ...analysis, sources };
  }

  async listAnalysesForOwner(ownerId: string, id: string) {
    await exigerCapacite(this.prisma, ownerId, id, 'voir_projet');
    return this.prisma.analyses.findMany({
      where: { project_id: id },
      include: { sources: true },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Persiste une recommandation et ses tables filles. Privée et réutilisée
   * par le déclenchement manuel (ci-dessous) et le déclenchement automatique
   * (ProjectsService.analyzeForOwner) : les deux chemins doivent écrire
   * exactement la même chose.
   */
  private async persistFormerRecommendation(
    projectId: string,
    ownerId: string,
    result: LegalFormRecommendationResult,
  ) {
    const recommendation = await this.prisma.legal_form_recommendations.create({
      data: {
        project_id: projectId,
        recommended_form: result.recommended_form,
        rationale: result.rationale,
        points_to_check: result.points_to_check,
        ...(await this.generatedProvenance('legal_form_recommendations', ownerId, projectId)),
      },
    });

    if (result.assumptions.length > 0) {
      await this.prisma.legal_form_assumptions.createMany({
        data: result.assumptions.map((a) => ({ recommendation_id: recommendation.id, ...a })),
      });
    }
    if (result.alternatives.length > 0) {
      await this.prisma.legal_form_alternatives.createMany({
        data: result.alternatives.map((a) => ({ recommendation_id: recommendation.id, ...a })),
      });
    }
    if (result.sources.length > 0) {
      await this.prisma.legal_form_sources.createMany({
        data: result.sources.map((s) => ({ recommendation_id: recommendation.id, ...s })),
      });
    }

    return {
      ...recommendation,
      assumptions: result.assumptions,
      alternatives: result.alternatives,
      sources: result.sources,
    };
  }

  async recommendLegalFormForOwner(demandeurId: string, id: string) {
    // Un associé peut lancer IGINI : les crédits du propriétaire paient, l'associé reste l'acteur.
    const { ownerId } = await exigerCapacite(this.prisma, demandeurId, id, 'lancer_ia');
    const project = await this.findOneForOwner(ownerId, id);
    const result = await this.formerService.recommendLegalForm(
      project.title,
      project.description,
      { userId: ownerId, actorId: demandeurId, projectId: project.id },
      this.joinContext(await this.personContext(ownerId, id), await this.memoryContext(ownerId, id)),
    );
    return this.persistFormerRecommendation(project.id, ownerId, result);
  }

  async listLegalFormRecommendationsForOwner(ownerId: string, id: string) {
    await exigerCapacite(this.prisma, ownerId, id, 'voir_projet');
    return this.prisma.legal_form_recommendations.findMany({
      where: { project_id: id },
      include: { assumptions: true, alternatives: true, sources: true },
      orderBy: { created_at: 'desc' },
    });
  }

  async createBuildPlanForOwner(demandeurId: string, id: string) {
    // Un associé peut lancer IGINI : les crédits du propriétaire paient, l'associé reste l'acteur.
    const { ownerId } = await exigerCapacite(this.prisma, demandeurId, id, 'lancer_ia');
    const project = await this.findOneForOwner(ownerId, id);
    const [personne, memory, analysis, participation] = await Promise.all([
      this.personContext(ownerId, id),
      this.memoryContext(ownerId, id),
      this.latestAnalysisContext(id),
      this.participationContext(id),
    ]);
    const context = this.joinContext(personne, memory, analysis, participation);
    const result = await this.planningService.createBuildPlan(
      project.title,
      project.description,
      { userId: ownerId, actorId: demandeurId, projectId: project.id },
      context,
    );

    const buildPlan = await this.prisma.build_plans.create({
      data: {
        project_id: project.id,
        summary: result.summary,
        estimated_timeline: result.estimated_timeline,
        milestones: result.milestones,
        key_resources: result.key_resources,
        ...(await this.generatedProvenance('build_plans', ownerId, project.id)),
      },
    });

    // Workflow : les jalons du plan de construction deviennent des tâches
    // suivables.
    await this.workflowService.createTasksFromSuggestions(project.id, result.milestones, 'build_plan');
    await this.automationService.run(project.id);
    await this.workflowEngineService.advanceActiveRunsForProject(ownerId, project.id);

    return buildPlan;
  }

  async listBuildPlansForOwner(ownerId: string, id: string) {
    await exigerCapacite(this.prisma, ownerId, id, 'voir_projet');
    return this.prisma.build_plans.findMany({
      where: { project_id: id },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Tout ce qu’IGINI sait du projet, pour l’évaluation de financement : le
   * même contexte que les générateurs, plus les plans des étapes déjà faites.
   * Propriétaire seulement (404 sinon).
   */
  async contexteEvaluation(
    ownerId: string,
    projectId: string,
  ): Promise<{ titre: string; description: string | null; contexte: string | undefined }> {
    const project = await this.findOneForOwner(ownerId, projectId);
    const parts = await Promise.all([
      this.personContext(ownerId, projectId),
      this.memoryContext(ownerId, projectId),
      this.latestAnalysisContext(projectId),
      this.latestBuildPlanContext(projectId),
      this.latestFinancingPlanContext(projectId),
      this.latestDevelopmentPlanContext(projectId),
      this.participationContext(projectId),
    ]);
    return { titre: project.title, description: project.description, contexte: this.joinContext(...parts) };
  }

  async createFinancingPlanForOwner(demandeurId: string, id: string) {
    // Un associé peut lancer IGINI : les crédits du propriétaire paient, l'associé reste l'acteur.
    const { ownerId } = await exigerCapacite(this.prisma, demandeurId, id, 'lancer_ia');
    const project = await this.findOneForOwner(ownerId, id);
    const [personne, memory, analysis, buildPlan, participation] = await Promise.all([
      this.personContext(ownerId, id),
      this.memoryContext(ownerId, id),
      this.latestAnalysisContext(id),
      this.latestBuildPlanContext(id),
      this.participationContext(id),
    ]);
    const context = this.joinContext(personne, memory, analysis, buildPlan, participation);
    const result = await this.financingService.createFinancingPlan(
      project.title,
      project.description,
      { userId: ownerId, actorId: demandeurId, projectId: project.id },
      context,
    );

    const financingPlan = await this.prisma.financing_plans.create({
      data: {
        project_id: project.id,
        summary: result.summary,
        estimated_budget: result.estimated_budget,
        funding_sources: result.funding_sources,
        budget_breakdown: result.budget_breakdown,
        ...(await this.generatedProvenance('financing_plans', ownerId, project.id)),
      },
    });

    // Workflow : les pistes de financement deviennent des tâches suivables.
    await this.workflowService.createTasksFromSuggestions(
      project.id,
      result.funding_sources,
      'financing_plan',
    );
    await this.automationService.run(project.id);
    await this.workflowEngineService.advanceActiveRunsForProject(ownerId, project.id);

    return financingPlan;
  }

  async listFinancingPlansForOwner(ownerId: string, id: string) {
    await exigerCapacite(this.prisma, ownerId, id, 'voir_plan_financement');
    return this.prisma.financing_plans.findMany({
      where: { project_id: id },
      orderBy: { created_at: 'desc' },
    });
  }

  async createDevelopmentPlanForOwner(demandeurId: string, id: string) {
    // Un associé peut lancer IGINI : les crédits du propriétaire paient, l'associé reste l'acteur.
    const { ownerId } = await exigerCapacite(this.prisma, demandeurId, id, 'lancer_ia');
    const project = await this.findOneForOwner(ownerId, id);
    const [personne, memory, analysis, buildPlan, financingPlan, participation] = await Promise.all([
      this.personContext(ownerId, id),
      this.memoryContext(ownerId, id),
      this.latestAnalysisContext(id),
      this.latestBuildPlanContext(id),
      this.latestFinancingPlanContext(id),
      this.participationContext(id),
    ]);
    const context = this.joinContext(personne, memory, analysis, buildPlan, financingPlan, participation);
    const result = await this.developmentService.createDevelopmentPlan(
      project.title,
      project.description,
      { userId: ownerId, actorId: demandeurId, projectId: project.id },
      context,
    );

    const developmentPlan = await this.prisma.development_plans.create({
      data: {
        project_id: project.id,
        summary: result.summary,
        growth_levers: result.growth_levers,
        key_metrics: result.key_metrics,
        scaling_risks: result.scaling_risks,
        ...(await this.generatedProvenance('development_plans', ownerId, project.id)),
      },
    });

    // Workflow : les leviers de croissance deviennent des tâches suivables.
    await this.workflowService.createTasksFromSuggestions(
      project.id,
      result.growth_levers,
      'development_plan',
    );
    await this.automationService.run(project.id);
    await this.workflowEngineService.advanceActiveRunsForProject(ownerId, project.id);

    return developmentPlan;
  }

  async listDevelopmentPlansForOwner(ownerId: string, id: string) {
    await exigerCapacite(this.prisma, ownerId, id, 'voir_projet');
    return this.prisma.development_plans.findMany({
      where: { project_id: id },
      orderBy: { created_at: 'desc' },
    });
  }

  async createTransmissionPlanForOwner(demandeurId: string, id: string) {
    // Un associé peut lancer IGINI : les crédits du propriétaire paient, l'associé reste l'acteur.
    const { ownerId } = await exigerCapacite(this.prisma, demandeurId, id, 'lancer_ia');
    const project = await this.findOneForOwner(ownerId, id);
    const [personne, memory, analysis, buildPlan, financingPlan, developmentPlan, participation] =
      await Promise.all([
      this.personContext(ownerId, id),
      this.memoryContext(ownerId, id),
      this.latestAnalysisContext(id),
      this.latestBuildPlanContext(id),
      this.latestFinancingPlanContext(id),
      this.latestDevelopmentPlanContext(id),
      this.participationContext(id),
    ]);
    const context = this.joinContext(
      personne,
      memory,
      analysis,
      buildPlan,
      financingPlan,
      developmentPlan,
      participation,
    );
    const result = await this.transmissionService.createTransmissionPlan(
      project.title,
      project.description,
      { userId: ownerId, actorId: demandeurId, projectId: project.id },
      context,
    );

    const transmissionPlan = await this.prisma.transmission_plans.create({
      data: {
        project_id: project.id,
        summary: result.summary,
        transfer_options: result.transfer_options,
        key_documentation: result.key_documentation,
        readiness_checklist: result.readiness_checklist,
        ...(await this.generatedProvenance('transmission_plans', ownerId, project.id)),
      },
    });

    // Workflow : la check-list de transmissibilité devient des tâches suivables.
    await this.workflowService.createTasksFromSuggestions(
      project.id,
      result.readiness_checklist,
      'transmission_plan',
    );
    await this.automationService.run(project.id);
    await this.workflowEngineService.advanceActiveRunsForProject(ownerId, project.id);

    return transmissionPlan;
  }

  async listTransmissionPlansForOwner(ownerId: string, id: string) {
    await exigerCapacite(this.prisma, ownerId, id, 'voir_projet');
    return this.prisma.transmission_plans.findMany({
      where: { project_id: id },
      orderBy: { created_at: 'desc' },
    });
  }

  // Déclenchement manuel, pour un projet existant sans nouvelle génération —
  // exécute exactement la même logique que celle appelée automatiquement
  // après chaque génération (voir AutomationService).
  async runAutomationForOwner(ownerId: string, id: string) {
    await exigerCapacite(this.prisma, ownerId, id, 'lancer_ia');
    return this.automationService.run(id);
  }

  // Lecture seule : accessible au propriétaire et aux collaborateurs, comme
  // les autres moteurs transverses.
  async listAutomationRunsForViewer(userId: string, id: string) {
    await exigerCapacite(this.prisma, userId, id, 'voir_projet');
    return this.automationService.listRuns(id);
  }
}
