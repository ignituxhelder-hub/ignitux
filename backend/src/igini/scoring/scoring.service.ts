import { Injectable } from '@nestjs/common';
import { assertHasProjectAccess } from '../../prisma/assert-has-project-access.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface ScoreCard {
  /** Qualité de l'idée (1-10) : le feasibility_score de la dernière analyse. null si aucune analyse. */
  etincelle: number | null;
  /** Capacité à réaliser (0-10) : proportion des tâches du projet marquées "done". null si aucune tâche. */
  construction: number | null;
  /** Potentiel de croissance (0-10) : nombre de leviers du dernier plan de développement. null si aucun plan. */
  evolution: number | null;
  /** Capacité à transmettre (0-10) : richesse du dernier plan de transmission. null si aucun plan. */
  transmission: number | null;
  /**
   * Fiabilité du porteur (0-10) — heuristique honnête, pas une vraie mesure
   * de confiance (pas de données de réputation/avis) : proportion des 5
   * étapes de la méthode déjà entamées pour ce projet.
   */
  confiance: number;
}

/**
 * SCORING — le quatrième moteur du cerveau IGINI. Chaque score est calculé à
 * partir de données réelles déjà en base (analyses, plans, tâches) — aucun
 * score n'est inventé : quand le signal n'existe pas encore, la valeur est
 * `null` plutôt qu'un chiffre arbitraire.
 */
@Injectable()
export class ScoringService {
  constructor(private readonly prisma: PrismaService) {}

  // Lecture seule par nature : un collaborateur peut consulter le score.
  async getScoreCard(userId: string, projectId: string): Promise<ScoreCard> {
    await assertHasProjectAccess(this.prisma, userId, projectId);

    const [analysis, buildPlan, financingPlan, developmentPlan, transmissionPlan, tasks] =
      await Promise.all([
        this.prisma.analyses.findFirst({
          where: { project_id: projectId },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.build_plans.findFirst({
          where: { project_id: projectId },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.financing_plans.findFirst({
          where: { project_id: projectId },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.development_plans.findFirst({
          where: { project_id: projectId },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.transmission_plans.findFirst({
          where: { project_id: projectId },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.tasks.findMany({ where: { project_id: projectId } }),
      ]);

    const etincelle = analysis ? analysis.feasibility_score : null;

    const construction =
      tasks.length > 0
        ? Math.round((tasks.filter((task) => task.status === 'done').length / tasks.length) * 10)
        : null;

    const evolution = developmentPlan ? Math.min(10, developmentPlan.growth_levers.length * 2) : null;

    const transmission = transmissionPlan
      ? Math.min(
          10,
          transmissionPlan.transfer_options.length +
            transmissionPlan.key_documentation.length +
            transmissionPlan.readiness_checklist.length,
        )
      : null;

    const stagesStarted = [analysis, buildPlan, financingPlan, developmentPlan, transmissionPlan].filter(
      Boolean,
    ).length;
    const confiance = Math.round((stagesStarted / 5) * 10);

    return { etincelle, construction, evolution, transmission, confiance };
  }
}
