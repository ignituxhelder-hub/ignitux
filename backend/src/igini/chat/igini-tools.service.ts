import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ProjectsService } from '../../projects/projects.service.js';
import { MemoryService } from '../memory/memory.service.js';
import { ConfirmationsDuTour, estOutilPayant, messagePrixAConfirmer, type OutilPayant } from './chat-confirmation.js';
import { PROJECT_ID_INPUT_SCHEMA, RAPPELER_SOUVENIRS_INPUT_SCHEMA, toToolErrorMessage } from './igini-tools.js';

export interface ToolResult {
  content: string;
  isError: boolean;
}

/**
 * EXÉCUTEUR DES 7 OUTILS DE L'ORCHESTRATEUR.
 *
 * Un outil payant (un générateur) ne s'exécute que si la personne a
 * confirmé son prix au tour précédent (`ctx.confirmations`, voir
 * chat-confirmation.ts). Sinon il ne lance rien, ne débite rien, note la
 * proposition et rend le prix à annoncer. Sans contexte de confirmation,
 * jamais.
 *
 * N'appelle jamais Claude — seulement des services NestJS déjà existants et
 * déjà gardés. `execute()` ne laisse jamais une exception remonter : elle
 * devient toujours un `ToolResult` avec `isError: true`, pour que Claude
 * puisse la reformuler à la personne plutôt que de faire planter le tour.
 */
@Injectable()
export class IginiToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memory: MemoryService,
    private readonly projects: ProjectsService,
  ) {}

  async execute(
    name: string,
    rawInput: unknown,
    ctx: { userId: string; confirmations?: ConfirmationsDuTour },
  ): Promise<ToolResult> {
    try {
      if (estOutilPayant(name)) {
        const prixConfirme = this.prixConfirme(name, rawInput, ctx.confirmations);
        if (prixConfirme !== true) return prixConfirme;
      }
      switch (name) {
        case 'lister_projets':
          return await this.listerProjets(ctx.userId);
        case 'rappeler_souvenirs':
          return await this.rappelerSouvenirs(rawInput, ctx.userId);
        case 'analyser':
          return await this.declencherGenerateur(rawInput, (id) => this.projects.analyzeForOwner(ctx.userId, id));
        case 'construire':
          return await this.declencherGenerateur(rawInput, (id) =>
            this.projects.createBuildPlanForOwner(ctx.userId, id),
          );
        case 'financer':
          return await this.declencherGenerateur(rawInput, (id) =>
            this.projects.createFinancingPlanForOwner(ctx.userId, id),
          );
        case 'developper':
          return await this.declencherGenerateur(rawInput, (id) =>
            this.projects.createDevelopmentPlanForOwner(ctx.userId, id),
          );
        case 'transmettre':
          return await this.declencherGenerateur(rawInput, (id) =>
            this.projects.createTransmissionPlanForOwner(ctx.userId, id),
          );
        default:
          return { content: `Outil inconnu : ${name}.`, isError: true };
      }
    } catch (error) {
      return { content: toToolErrorMessage(error), isError: true };
    }
  }

  /**
   * `true` si la personne a confirmé ce prix pour ce projet (la confirmation
   * est alors consommée) ; sinon le résultat à rendre, sans rien lancer.
   */
  private prixConfirme(
    outil: OutilPayant,
    rawInput: unknown,
    confirmations: ConfirmationsDuTour | undefined,
  ): true | ToolResult {
    const { project_id } = PROJECT_ID_INPUT_SCHEMA.parse(rawInput);
    if (confirmations?.consommer(outil, project_id)) return true;
    confirmations?.proposer(outil, project_id);
    return { content: messagePrixAConfirmer(outil), isError: false };
  }

  private async listerProjets(userId: string): Promise<ToolResult> {
    const projects = await this.prisma.projects.findMany({
      where: { owner_id: userId },
      select: { id: true, title: true, sector: true },
      orderBy: { created_at: 'desc' },
    });
    return { content: JSON.stringify(projects), isError: false };
  }

  private async rappelerSouvenirs(rawInput: unknown, userId: string): Promise<ToolResult> {
    const input = RAPPELER_SOUVENIRS_INPUT_SCHEMA.parse(rawInput);
    const memories = await this.memory.search(userId, {
      projectId: input.project_id,
      category: input.categorie,
    });
    return { content: JSON.stringify(memories), isError: false };
  }

  private async declencherGenerateur(
    rawInput: unknown,
    appeler: (projectId: string) => Promise<unknown>,
  ): Promise<ToolResult> {
    const input = PROJECT_ID_INPUT_SCHEMA.parse(rawInput);
    const result = await appeler(input.project_id);
    return { content: JSON.stringify(result), isError: false };
  }
}
