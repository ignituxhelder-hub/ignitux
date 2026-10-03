import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConstitutionService } from '../constitution/constitution.service.js';
import { CLAUDE_MODEL, ClaudeService } from '../igini/claude/claude.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BYLAWS_SYSTEM_PROMPT, BylawsResultSchema } from './bylaws-prompt.js';
import type { GenerateBylawsDto } from './dto/statuts.dto.js';

/** Les quatre formes qui créent une personne morale distincte — voir la spec. */
const FORMES_AVEC_PERSONNE_MORALE = ['EURL', 'SASU', 'SARL', 'SAS'] as const;

/**
 * STATUTS — le brouillon du document fondateur de l'entreprise.
 *
 * Attribué au générateur `former` (voir Global Constraints du plan) : ce
 * n'est pas un septième générateur, c'est la suite de la recommandation de
 * forme juridique.
 */
@Injectable()
export class StatutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
    private readonly constitution: ConstitutionService,
  ) {}

  async genererPourProjet(ownerId: string, projectId: string, dto: GenerateBylawsDto) {
    const project = await this.prisma.projects.findFirst({
      where: { id: projectId, owner_id: ownerId },
    });
    if (!project) {
      throw new NotFoundException('Projet introuvable.');
    }

    const forme = project.confirmed_legal_form;
    if (!forme || !FORMES_AVEC_PERSONNE_MORALE.includes(forme as (typeof FORMES_AVEC_PERSONNE_MORALE)[number])) {
      throw new BadRequestException(
        "Les statuts ne s'appliquent qu'aux formes à personne morale (EURL, SASU, SARL, SAS). " +
          'Confirme une de ces formes sur le projet avant de générer des statuts.',
      );
    }

    const totalBasisPoints = dto.associates.reduce((somme, a) => somme + a.shareBasisPoints, 0);
    if (totalBasisPoints !== 10000) {
      throw new BadRequestException(
        `La somme des parts des associés doit faire 100 % (10000 points de base) ; elle fait ${totalBasisPoints}.`,
      );
    }

    const userContent =
      `Projet : ${project.title}\n` +
      `Forme juridique : ${forme}\n` +
      `Capital social : ${(dto.capitalCents / 100).toFixed(2)} €\n` +
      `Siège social : ${dto.headOffice}\n` +
      `Durée de la société : ${dto.durationYears} ans\n` +
      `Associés :\n` +
      dto.associates.map((a) => `- ${a.fullName} : ${(a.shareBasisPoints / 100).toFixed(2)} %`).join('\n');

    const result = await this.claude.generateStructuredOutput({
      schema: BylawsResultSchema,
      system: BYLAWS_SYSTEM_PROMPT,
      userContent,
      logContext: 'Échec de la génération des statuts via Claude',
      userErrorMessage: 'La génération des statuts a échoué, réessaie dans un instant.',
      usage: { userId: ownerId, projectId, generator: 'former' },
    });

    await this.constitution.guard(
      { kind: 'persist_generated', entity: 'company_bylaws', generatedBy: 'igini', generatedModel: CLAUDE_MODEL },
      { userId: ownerId, projectId },
    );

    const champsCommuns = {
      legal_form: forme,
      capital_cents: dto.capitalCents,
      head_office: dto.headOffice,
      duration_years: dto.durationYears,
      content: result.content,
      status: 'brouillon' as const,
      generated_by: 'igini',
      generated_model: CLAUDE_MODEL,
    };

    // upsert, pas create : une régénération (Task 4) rappelle cette même
    // méthode, et `project_id` est @unique sur ce modèle (une ligne par
    // projet, pas un historique — voir la spec). Les associés sont
    // entièrement remplacés plutôt que fusionnés : une régénération peut
    // changer leur nombre, fusionner ligne à ligne n'aurait pas de sens.
    return this.prisma.company_bylaws.upsert({
      where: { project_id: projectId },
      create: {
        owner_id: ownerId,
        project_id: projectId,
        ...champsCommuns,
        associates: {
          create: dto.associates.map((a) => ({
            full_name: a.fullName,
            share_basis_points: a.shareBasisPoints,
          })),
        },
      },
      update: {
        ...champsCommuns,
        associates: {
          deleteMany: {},
          create: dto.associates.map((a) => ({
            full_name: a.fullName,
            share_basis_points: a.shareBasisPoints,
          })),
        },
      },
    });
  }
}
