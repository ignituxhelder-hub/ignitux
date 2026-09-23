import { Injectable } from '@nestjs/common';
import { ConstitutionService } from '../../constitution/constitution.service.js';
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
   *
   * `null` tant qu'aucune étape n'a démarré. Ce champ valait auparavant 0
   * dans ce cas : un zéro affiché se lit « fiabilité nulle », alors que la
   * réalité est « rien à mesurer encore ». Le moteur constitutionnel refuse
   * désormais cette valeur (article 10, règle score-sans-source).
   */
  confiance: number | null;
}

/** Un relevé passé, tel qu'il a été observé ce jour-là. */
export interface ScoreSnapshot extends ScoreCard {
  /** Le jour du relevé, au format ISO (AAAA-MM-JJ). */
  jour: string;
}

/**
 * SCORING — le quatrième moteur du cerveau IGINI. Chaque score est calculé à
 * partir de données réelles déjà en base (analyses, plans, tâches) — aucun
 * score n'est inventé : quand le signal n'existe pas encore, la valeur est
 * `null` plutôt qu'un chiffre arbitraire.
 */
@Injectable()
export class ScoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly constitutionService: ConstitutionService,
  ) {}

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
    const confiance = stagesStarted > 0 ? Math.round((stagesStarted / 5) * 10) : null;

    const scoreCard: ScoreCard = { etincelle, construction, evolution, transmission, confiance };

    // Le moteur constitutionnel relit chaque chiffre avant qu'il ne sorte
    // d'ici. Ce n'est pas une formalité : c'est ce contrôle qui a révélé que
    // `confiance` valait 0 en l'absence totale de données, et il attrapera
    // la prochaine régression du même genre sans qu'on ait à y penser.
    await this.assertScoresHaveSources(userId, projectId, scoreCard, {
      etincelle: analysis !== null,
      construction: tasks.length > 0,
      evolution: developmentPlan !== null,
      transmission: transmissionPlan !== null,
      confiance: stagesStarted > 0,
    });

    // Relevé du jour, posé après que le moteur constitutionnel a validé
    // les chiffres : enregistrer avant reviendrait à garder une trace de
    // valeurs que le produit aurait refusé de montrer.
    await this.releverAujourdHui(projectId, scoreCard);

    return scoreCard;
  }

  /**
   * Garde une trace de ce que les scores valaient aujourd'hui.
   *
   * Les scores restent calculés à la lecture — cette table ne stocke pas LE
   * score, mais ce qu'il VALAIT un jour donné. Le score du jour se
   * recalcule ; un relevé d'il y a trois semaines, non, parce que les
   * données qui l'ont produit ont changé depuis.
   *
   * Un seul relevé par jour : l'évolution d'un projet se lit en semaines,
   * et garder chaque lecture ferait des milliers de lignes identiques pour
   * une courbe qui ne dirait rien de plus.
   *
   * L'échec est avalé. Consulter ses scores ne doit pas échouer parce qu'un
   * relevé n'a pas pu s'écrire : on perdrait la lecture pour sauver
   * l'historique, ce qui est le mauvais arbitrage.
   */
  private async releverAujourdHui(projectId: string, scores: ScoreCard): Promise<void> {
    // Un relevé entièrement vide ne dit rien et occuperait la courbe d'un
    // point sans information.
    const aQuelqueChose = Object.values(scores).some((valeur) => valeur !== null);
    if (!aQuelqueChose) return;

    const jour = new Date();
    jour.setUTCHours(0, 0, 0, 0);

    try {
      await this.prisma.score_snapshots.upsert({
        where: { project_id_captured_on: { project_id: projectId, captured_on: jour } },
        update: { ...scores },
        create: { project_id: projectId, captured_on: jour, ...scores },
      });
    } catch {
      // Silencieux à dessein : voir le commentaire ci-dessus.
    }
  }

  /**
   * L'évolution des scores, du plus ancien au plus récent.
   *
   * Ne rend que des points observés. Aucune interpolation entre deux
   * relevés : un projet qu'on n'a pas ouvert pendant trois semaines n'a pas
   * « progressé régulièrement », il n'a simplement pas été mesuré. Une
   * courbe lissée raconterait une histoire que personne n'a vécue.
   */
  async historique(userId: string, projectId: string, jours = 90): Promise<ScoreSnapshot[]> {
    await assertHasProjectAccess(this.prisma, userId, projectId);

    const depuis = new Date();
    depuis.setUTCHours(0, 0, 0, 0);
    depuis.setUTCDate(depuis.getUTCDate() - jours);

    const lignes = await this.prisma.score_snapshots.findMany({
      where: { project_id: projectId, captured_on: { gte: depuis } },
      orderBy: { captured_on: 'asc' },
    });

    return lignes.map((ligne) => ({
      jour: ligne.captured_on.toISOString().slice(0, 10),
      etincelle: ligne.etincelle,
      construction: ligne.construction,
      evolution: ligne.evolution,
      transmission: ligne.transmission,
      confiance: ligne.confiance,
    }));
  }

  private async assertScoresHaveSources(
    userId: string,
    projectId: string,
    scoreCard: ScoreCard,
    sources: Record<keyof ScoreCard, boolean>,
  ): Promise<void> {
    for (const field of Object.keys(scoreCard) as Array<keyof ScoreCard>) {
      await this.constitutionService.guard(
        {
          kind: 'publish_score',
          field,
          value: scoreCard[field],
          hasSource: sources[field],
        },
        { userId, projectId },
      );
    }
  }
}
