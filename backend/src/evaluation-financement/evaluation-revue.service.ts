import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  EvaluationReportSchema,
  SECTIONS_MODIFIABLES,
  type EvaluationReport,
  type SectionModifiable,
} from './evaluation-model.js';
import { EvaluationService } from './evaluation.service.js';

export interface ChangementSection {
  section: SectionModifiable;
  valeur: unknown;
}

const MODIFIEE_ENTRE_TEMPS =
  'Cette évaluation a été modifiée entre-temps (dans un autre onglet ?). Recharge-la avant de corriger.';

const PAS_EN_REVUE =
  'Cette évaluation n’est plus en revue : elle a déjà été traitée, peut-être depuis un autre onglet.';

/** Une valeur pour une colonne JSON : Prisma exige `DbNull`, pas `null`, pour écrire NULL. */
function json(valeur: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return valeur === null || valeur === undefined ? Prisma.DbNull : (valeur as Prisma.InputJsonValue);
}

function texteObligatoire(valeur: string | undefined, message: string): string {
  const propre = (valeur ?? '').trim();
  if (!propre) throw new BadRequestException(message);
  return propre;
}

/**
 * LA REVUE D'UNE ÉVALUATION PAR UN ADMINISTRATEUR.
 *
 * Rien n'atteint l'entrepreneur sans passer ici. Chaque action ne s'applique
 * qu'à une évaluation encore « en revue » — vérifié dans la même écriture
 * (`updateMany` filtré sur le statut), pour qu'une validation faite depuis
 * deux onglets ne passe qu'une fois.
 *
 * Toute correction est tracée (qui, quand, avant, après), et la version
 * d'IGINI (`ai_draft`) n'est jamais réécrite : on sait toujours qui a dit quoi.
 */
@Injectable()
export class EvaluationRevueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluations: EvaluationService,
  ) {}

  async file() {
    const lignes = await this.prisma.financing_evaluations.findMany({
      where: { status: 'en_revue' },
      orderBy: { created_at: 'asc' },
      include: { project: { select: { title: true, owner: { select: { email: true } } } } },
    });
    return lignes.map((l) => ({
      id: l.id,
      projetTitre: l.project.title,
      entrepreneurEmail: l.project.owner.email,
      verdict: l.verdict,
      createdAt: l.created_at,
    }));
  }

  async detail(id: string) {
    const l = await this.prisma.financing_evaluations.findUnique({
      where: { id },
      include: {
        project: { select: { title: true, owner: { select: { email: true } } } },
        edits: { orderBy: { created_at: 'asc' } },
      },
    });
    if (!l) throw new NotFoundException('Évaluation introuvable.');
    return {
      id: l.id,
      status: l.status,
      projetTitre: l.project.title,
      entrepreneurEmail: l.project.owner.email,
      createdAt: l.created_at,
      rapport: l.report as unknown as EvaluationReport | null,
      noteIgnitux: l.admin_note,
      traces: l.edits,
      /** À renvoyer avec une correction : refusée si quelqu'un a modifié l'évaluation entre-temps. */
      version: (l.updated_at ?? l.created_at).toISOString(),
      /** Une nouvelle version demandée qui n'a pas pu être préparée ; le rapport affiché est le précédent. */
      alerte: l.status === 'en_revue' ? l.failure_reason : null,
    };
  }

  async modifier(
    adminId: string,
    id: string,
    changements: ChangementSection[],
    noteIgnitux?: string | null,
    version?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const l = await tx.financing_evaluations.findUnique({ where: { id } });
      if (!l) throw new NotFoundException('Évaluation introuvable.');
      if (l.status !== 'en_revue' || !l.report) throw new ConflictException(PAS_EN_REVUE);
      // Deux onglets : une correction faite sur une version périmée écraserait
      // celle de l'autre onglet. On la refuse plutôt.
      const lue = (l.updated_at ?? l.created_at).toISOString();
      if (version !== undefined && version !== lue) throw new ConflictException(MODIFIEE_ENTRE_TEMPS);

      const avant = l.report as unknown as EvaluationReport;
      const candidat: Record<string, unknown> = { ...avant };
      for (const { section, valeur } of changements) {
        if (!(SECTIONS_MODIFIABLES as readonly string[]).includes(section)) {
          throw new BadRequestException(`Section inconnue : ${section}.`);
        }
        candidat[section] = valeur;
      }
      const verifie = EvaluationReportSchema.safeParse(candidat);
      if (!verifie.success) {
        throw new BadRequestException('La correction ne respecte pas le format du rapport.');
      }

      const data: Prisma.financing_evaluationsUpdateManyMutationInput = {
        report: verifie.data,
        verdict: verifie.data.verdict,
      };
      const traces: Prisma.financing_evaluation_editsCreateManyInput[] = changements.map(({ section }) => ({
        evaluation_id: id,
        editor_id: adminId,
        section,
        before: json(avant[section]),
        after: json(verifie.data[section]),
      }));
      if (noteIgnitux !== undefined) {
        const note = noteIgnitux?.trim() || null;
        data.admin_note = note;
        traces.push({
          evaluation_id: id,
          editor_id: adminId,
          section: 'note',
          before: json(l.admin_note),
          after: json(note),
        });
      }

      const { count } = await tx.financing_evaluations.updateMany({
        where: { id, status: 'en_revue', ...(version !== undefined ? { updated_at: new Date(version) } : {}) },
        data,
      });
      if (count === 0) throw new ConflictException(PAS_EN_REVUE);
      if (traces.length > 0) await tx.financing_evaluation_edits.createMany({ data: traces });
    });
    return this.detail(id);
  }

  async valider(adminId: string, id: string) {
    await this.transition(id, { status: 'validee', reviewed_by: adminId, reviewed_at: new Date() });
  }

  async faireRefaire(adminId: string, id: string, consigne: string) {
    const propre = texteObligatoire(consigne, 'Écris la consigne à donner à IGINI pour la nouvelle version.');
    // Le changement d'état et sa trace ensemble : sans trace, pas de nouvelle version.
    await this.prisma.$transaction(async (tx) => {
      await this.transition(id, { status: 'en_preparation', redo_instruction: propre, failure_reason: null }, tx);
      // Qui a demandé une nouvelle version, et pourquoi : tracé comme une correction.
      await tx.financing_evaluation_edits.createMany({
        data: [{ evaluation_id: id, editor_id: adminId, section: 'consigne', before: Prisma.DbNull, after: propre }],
      });
    });
    // Sans `await` : la nouvelle version se prépare en arrière-plan, comme la première.
    void this.evaluations.generer(id, propre);
  }

  async refuser(adminId: string, id: string, motif: string) {
    const propre = texteObligatoire(motif, 'Le motif du refus est obligatoire : l’entrepreneur le lira.');
    await this.transition(id, {
      status: 'refusee',
      refusal_reason: propre,
      reviewed_by: adminId,
      reviewed_at: new Date(),
    });
  }

  private async transition(
    id: string,
    data: Prisma.financing_evaluationsUncheckedUpdateManyInput,
    client: Pick<PrismaService, 'financing_evaluations'> = this.prisma,
  ) {
    const { count } = await client.financing_evaluations.updateMany({
      where: { id, status: 'en_revue' },
      data,
    });
    if (count === 0) throw new ConflictException(PAS_EN_REVUE);
  }
}
