import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ProjectsService } from '../../projects/projects.service.js';
import { MemoryService } from '../memory/memory.service.js';
import { PROJECT_ID_INPUT_SCHEMA, RAPPELER_SOUVENIRS_INPUT_SCHEMA, toToolErrorMessage } from './igini-tools.js';

export interface ToolResult {
  content: string;
  isError: boolean;
}

/**
 * EXÉCUTEUR DES 7 OUTILS DE L'ORCHESTRATEUR.
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

  async execute(name: string, rawInput: unknown, ctx: { userId: string }): Promise<ToolResult> {
    try {
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
