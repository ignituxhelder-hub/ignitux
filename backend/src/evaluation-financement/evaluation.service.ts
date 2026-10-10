import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ComplianceService } from '../compliance/compliance.service.js';
import { FinanceAuditService } from '../finance-audit/finance-audit.service.js';
import type { financing_evaluations } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { ClaudeService } from '../igini/claude/claude.service.js';
import { readGeneratorsAvailability } from '../igini/claude/generators-availability.js';
import { OffresService } from '../offres/offres.service.js';
import { assertOwnsProject } from '../prisma/assert-owns-project.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import {
  EvaluationReportSchema,
  normaliserRapport,
  statutLu,
  STATUTS_ACTIFS,
  type EvaluationReport,
  type StatutEvaluation,
  type Verdict,
} from './evaluation-model.js';
import { genererDossierPdf } from './evaluation-pdf.js';
import { promptEvaluation, SYSTEM_PROMPT_EVALUATION } from './evaluation-prompts.js';

/** Ce que l'entrepreneur voit d'une évaluation. Le contenu reste caché tant qu'elle n'est pas validée. */
export interface EvaluationVue {
  id: string;
  status: StatutEvaluation;
  createdAt: Date;
  reviewedAt: Date | null;
  verdict: Verdict | null;
  rapport: EvaluationReport | null;
  noteIgnitux: string | null;
  motifRefus: string | null;
  motifEchec: string | null;
}

const ECHEC_PAR_DEFAUT = "L'évaluation n'a pas pu être préparée. Tu peux réessayer.";
const PREPARATION_INTERROMPUE = 'La préparation a été interrompue avant la fin.';

function slug(texte: string): string {
  return (
    texte
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'projet'
  );
}

/**
 * L'ÉVALUATION DE FINANCEMENT, côté entrepreneur — la demander, la lire, en
 * télécharger le dossier.
 *
 * La génération tourne en arrière-plan : la demande rend la main tout de
 * suite, et l'interface relit l'état. La revue par l'administrateur vit dans
 * `EvaluationRevueService`.
 */
@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  /** L'horloge, remplaçable dans les tests. */
  maintenant: () => Date = () => new Date();

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
    private readonly offres: OffresService,
    private readonly projects: ProjectsService,
    private readonly financeAudit: FinanceAuditService,
    private readonly compliance: ComplianceService,
  ) {}

  async demander(userId: string, projectId: string): Promise<EvaluationVue> {
    await assertOwnsProject(this.prisma, userId, projectId);
    await this.offres.exiger(userId, { kind: 'evaluer_financement' });

    const disponibilite = readGeneratorsAvailability(process.env.IGINI_AI_ENABLED);
    if (!disponibilite.enabled) {
      throw new ServiceUnavailableException(disponibilite.reason);
    }

    const creee = await this.creerSiAucuneActive(userId, projectId);
    // Sans `await` : la demande rend la main, la génération continue seule.
    void this.generer(creee.id);
    return this.vue(creee);
  }

  /**
   * Une seule évaluation active par projet, même sous deux clics simultanés :
   * la lecture des actives et la création se font dans une transaction
   * sérialisable, et un conflit de sérialisation devient un 409.
   */
  private async creerSiAucuneActive(userId: string, projectId: string): Promise<financing_evaluations> {
    const maintenant = this.maintenant();
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const actives = await tx.financing_evaluations.findMany({
            where: { project_id: projectId, status: { in: [...STATUTS_ACTIFS] } },
          });
          const vivantes = actives.filter(
            (a) => statutLu(a.status, a.updated_at ?? a.created_at, maintenant) !== 'echec',
          );
          if (vivantes.length > 0) {
            throw new ConflictException(
              'Une évaluation est déjà en cours pour ce projet. Attends sa revue avant d’en demander une autre.',
            );
          }
          if (actives.length > 0) {
            // Des préparations perdues (serveur redémarré pendant l'appel) : on
            // les range en échec pour qu'elles ne bloquent plus rien.
            await tx.financing_evaluations.updateMany({
              where: { id: { in: actives.map((a) => a.id) }, status: 'en_preparation' },
              data: { status: 'echec', failure_reason: PREPARATION_INTERROMPUE },
            });
          }
          return tx.financing_evaluations.create({
            data: { project_id: projectId, requested_by: userId, status: 'en_preparation' },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (erreur) {
      if ((erreur as { code?: unknown }).code === 'P2034') {
        throw new ConflictException('Une évaluation vient d’être demandée pour ce projet.');
      }
      throw erreur;
    }
  }

  /**
   * Fait rédiger le rapport par IGINI et le place en revue. Ne lève jamais :
   * tout échec est écrit sur la ligne, que l'entrepreneur verra.
   *
   * `consigne` : la demande de l'administrateur quand il fait refaire.
   */
  async generer(evaluationId: string, consigne?: string): Promise<void> {
    try {
      const evaluation = await this.prisma.financing_evaluations.findUnique({ where: { id: evaluationId } });
      if (!evaluation) return;
      const userId = evaluation.requested_by;
      const projectId = evaluation.project_id;

      const [projet, audit, conformite] = await Promise.all([
        this.projects.contexteEvaluation(userId, projectId),
        this.resumeAudit(userId, projectId),
        this.resumeConformite(userId, projectId),
      ]);
      const contexte = [projet.contexte, audit, conformite].filter(Boolean).join('\n\n') || undefined;

      const brut = await this.claude.generateStructuredOutput({
        schema: EvaluationReportSchema,
        system: SYSTEM_PROMPT_EVALUATION,
        userContent: promptEvaluation(projet.titre, projet.description, contexte, consigne),
        logContext: "Échec de la génération de l'évaluation de financement via Claude",
        userErrorMessage: ECHEC_PAR_DEFAUT,
        usage: { userId, projectId, generator: 'evaluer' },
      });
      const rapport = normaliserRapport(brut);

      await this.ecrireSiEnPreparation(evaluationId, {
        status: 'en_revue',
        verdict: rapport.verdict,
        report: rapport,
        ai_draft: rapport,
        failure_reason: null,
      });
    } catch (erreur) {
      this.logger.error(`Évaluation ${evaluationId} en échec : ${String(erreur)}`);
      // Seul un refus lisible (quota, offre…) est montré à l'entrepreneur ;
      // une erreur technique brute reste dans les journaux.
      const motif = erreur instanceof HttpException ? erreur.message : null;
      await this.ecrireSiEnPreparation(evaluationId, { status: 'echec', failure_reason: motif }).catch(
        (e: unknown) => this.logger.error(`Impossible d'écrire l'échec de ${evaluationId} : ${String(e)}`),
      );
    }
  }

  /**
   * N'écrit que sur une évaluation encore en préparation. Un appel lent peut
   * survivre à la fenêtre de 10 minutes : entre-temps la ligne a pu être
   * rangée en échec et une nouvelle demandée. Sa réponse tardive ne doit
   * alors rien ressusciter — elle est journalisée et oubliée.
   */
  private async ecrireSiEnPreparation(
    evaluationId: string,
    data: Prisma.financing_evaluationsUpdateManyMutationInput,
  ): Promise<void> {
    const { count } = await this.prisma.financing_evaluations.updateMany({
      where: { id: evaluationId, status: 'en_preparation' },
      data,
    });
    if (count === 0) {
      this.logger.warn(`Évaluation ${evaluationId} : résultat ignoré, elle n'est plus en préparation.`);
    }
  }

  private async resumeAudit(userId: string, projectId: string): Promise<string | undefined> {
    try {
      const audit = await this.financeAudit.projectAudit(userId, projectId);
      const defauts = audit.findings.filter((f) => f.count > 0);
      if (defauts.length === 0) return 'Contrôle de cohérence financière : aucune anomalie relevée.';
      return `Contrôle de cohérence financière :\n${defauts.map((f) => `- ${f.label} (${f.count})`).join('\n')}`;
    } catch {
      return undefined;
    }
  }

  private async resumeConformite(userId: string, projectId: string): Promise<string | undefined> {
    try {
      const { requirements } = await this.compliance.listForProject(userId, projectId);
      const faites = requirements.filter((r) => r.completed).length;
      return `Conformité : ${faites} démarche(s) de conformité sur ${requirements.length} marquée(s) comme faite(s).`;
    } catch {
      return undefined;
    }
  }

  async lister(userId: string, projectId: string): Promise<EvaluationVue[]> {
    await assertOwnsProject(this.prisma, userId, projectId);
    const lignes = await this.prisma.financing_evaluations.findMany({
      where: { project_id: projectId },
      orderBy: { created_at: 'desc' },
    });
    return lignes.map((l) => this.vue(l));
  }

  async pdf(userId: string, projectId: string, evaluationId: string): Promise<{ fichier: Buffer; nom: string }> {
    await assertOwnsProject(this.prisma, userId, projectId);
    const evaluation = await this.prisma.financing_evaluations.findFirst({
      where: { id: evaluationId, project_id: projectId },
    });
    if (!evaluation || evaluation.status !== 'validee' || !evaluation.report) {
      throw new NotFoundException('Aucun dossier validé pour cette évaluation.');
    }
    const projet = await this.prisma.projects.findUnique({ where: { id: projectId } });
    const titre = projet?.title ?? 'Projet';
    const fichier = await genererDossierPdf({
      titreProjet: titre,
      descriptionProjet: projet?.description ?? null,
      rapport: evaluation.report as unknown as EvaluationReport,
      noteIgnitux: evaluation.admin_note,
      valideLe: evaluation.reviewed_at ?? evaluation.updated_at ?? evaluation.created_at,
    });
    return { fichier, nom: `dossier-financement-${slug(titre)}.pdf` };
  }

  /** Ce que l'entrepreneur a le droit de voir de cette ligne, maintenant. */
  private vue(l: financing_evaluations): EvaluationVue {
    let status = statutLu(l.status, l.updated_at ?? l.created_at, this.maintenant());
    // Une nouvelle version demandée par l'administrateur reste « en revue »
    // pour l'entrepreneur : c'est toujours la revue d'Ignitux qui se poursuit.
    if (status === 'en_preparation' && l.redo_instruction) status = 'en_revue';
    const validee = status === 'validee';
    return {
      id: l.id,
      status,
      createdAt: l.created_at,
      reviewedAt: validee ? l.reviewed_at : null,
      verdict: validee ? (l.verdict as Verdict | null) : null,
      rapport: validee ? (l.report as unknown as EvaluationReport | null) : null,
      noteIgnitux: validee ? l.admin_note : null,
      motifRefus: status === 'refusee' ? l.refusal_reason : null,
      motifEchec:
        status === 'echec'
          ? (l.failure_reason ?? (l.status === 'en_preparation' ? PREPARATION_INTERROMPUE : null))
          : null,
    };
  }
}
