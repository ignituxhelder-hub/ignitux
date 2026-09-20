import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { journeyView, type JourneyView, type ProjectFacts } from './journey-model.js';

/**
 * Compte ce qui existe réellement, et laisse le modèle décider.
 *
 * Tout le raisonnement vit dans `journey-model.ts`, qui est pur. Ce service
 * ne fait que mesurer : la séparation permet d'éprouver chaque règle de
 * parcours sans base de données, et de vérifier ici, séparément, qu'on
 * compte bien ce qu'on croit compter.
 */
@Injectable()
export class JourneyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Le parcours de chacun de mes projets, en une seule requête.
   *
   * L'écran d'accueil montre « prochaine étape » sous chaque projet :
   * interroger `/parcours` une fois par projet ferait N requêtes pour une
   * page d'accueil, ce qui se paie en attente dès le troisième projet.
   *
   * Ne rend que l'essentiel — le titre de l'étape et la phase. Le détail
   * appartient à la fiche, pas à la liste : y déverser tout le parcours
   * reconstituerait la surcharge qu'on vient de retirer.
   */
  async forMyProjects(
    userId: string,
  ): Promise<
    Array<{ projectId: string; title: string; phase: string; nextStep: string | null }>
  > {
    const projets = await this.prisma.projects.findMany({
      where: { owner_id: userId },
      select: { id: true, title: true },
      orderBy: { updated_at: 'desc' },
    });

    return Promise.all(
      projets.map(async (projet) => {
        const vue = await this.forProject(userId, projet.id);
        return {
          projectId: projet.id,
          title: projet.title,
          phase: vue.phaseLabel,
          nextStep: vue.nextStep?.titre ?? null,
        };
      }),
    );
  }

  async forProject(userId: string, projectId: string): Promise<JourneyView> {
    // Un projet qu'on ne peut pas voir n'a pas de parcours à montrer. On
    // accepte aussi le collaborateur : il suit le même chemin, en lecture.
    const projet = await this.prisma.projects.findFirst({
      where: {
        id: projectId,
        OR: [{ owner_id: userId }, { collaborators: { some: { user_id: userId } } }],
      },
      select: { description: true },
    });
    if (!projet) throw new NotFoundException('Projet introuvable.');

    const p = { project_id: projectId };

    const [
      analyses,
      derniereAnalyse,
      buildPlans,
      financingPlans,
      developmentPlans,
      transmissionPlans,
      tasks,
      openTasks,
      memories,
      concepts,
      complianceChecks,
      completedComplianceChecks,
      automationRuns,
      workflows,
      financingRounds,
      equityHolders,
      collaborators,
      financed,
    ] = await Promise.all([
      this.prisma.analyses.count({ where: p }),
      // La dernière analyse fait foi : une idée retravaillée doit pouvoir
      // remonter, sinon le premier verdict serait définitif.
      this.prisma.analyses.findFirst({
        where: p,
        orderBy: { created_at: 'desc' },
        select: { feasibility_score: true },
      }),
      this.prisma.build_plans.count({ where: p }),
      this.prisma.financing_plans.count({ where: p }),
      this.prisma.development_plans.count({ where: p }),
      this.prisma.transmission_plans.count({ where: p }),
      this.prisma.tasks.count({ where: p }),
      this.prisma.tasks.count({ where: { ...p, status: { not: 'done' } } }),
      this.prisma.memories.count({ where: p }),
      this.prisma.concepts.count({ where: p }),
      this.prisma.project_compliance_checks.count({ where: p }),
      // La table ne porte pas de statut mais une date : une demarche est
      // faite quand elle a ete datee, et pas avant.
      this.prisma.project_compliance_checks.count({
        where: { ...p, completed_at: { not: null } },
      }),
      this.prisma.automation_runs.count({ where: p }),
      this.prisma.workflow_definitions.count({ where: p }),
      this.prisma.financing_rounds.count({ where: p }),
      this.prisma.equity_holders.count({ where: p }),
      this.prisma.project_collaborators.count({ where: p }),
      this.prisma.financed_projects.findUnique({
        where: { project_id: projectId },
        select: { id: true },
      }),
    ]);

    const faits: ProjectFacts = {
      // Une description vide ou faite de trois mots ne donne rien à
      // analyser : on ne prétend pas le contraire pour faire avancer le
      // parcours d'une case.
      hasDescription: (projet.description ?? '').trim().length >= 20,
      analyses,
      // De 1-10 vers 0-100 : la source ne produit que des entiers, donc la
      // conversion ne donne que des dizaines. L'écran le dit.
      etincelle:
        derniereAnalyse === null ? null : derniereAnalyse.feasibility_score * 10,
      buildPlans,
      financingPlans,
      developmentPlans,
      transmissionPlans,
      tasks,
      openTasks,
      memories,
      concepts,
      complianceChecks,
      completedComplianceChecks,
      automationRuns,
      workflows,
      financingRounds,
      equityHolders,
      collaborators,
      financingOpened: financed !== null,
    };

    return journeyView(faits);
  }
}
