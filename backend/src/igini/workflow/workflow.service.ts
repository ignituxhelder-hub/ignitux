import { exigerCapacite } from '../../equipe/acces-projet.js';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AutomationService } from '../automation/automation.service.js';
import type { TaskAssignee, TaskStatus } from './task-status.js';

/**
 * WORKFLOW — le troisième moteur du cerveau IGINI : transformer les
 * recommandations des générateurs (prochaines étapes, jalons…) en tâches
 * suivables, dans l'esprit de l'autonomie supervisée : IGINI peut proposer
 * des tâches, l'humain reste toujours celui qui valide et fait avancer leur
 * statut. Il n'y a pas ici de moteur d'automatisation qui exécute des tâches
 * tout seul — IGINI n'a aucune action concrète à déclencher pour l'instant,
 * ce serait mentir que de le prétendre.
 */
@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly automation: AutomationService,
  ) {}

  async createTask(
    userId: string,
    projectId: string,
    title: string,
    description?: string,
    assignee: TaskAssignee = 'human',
    source = 'manual',
  ) {
    await exigerCapacite(this.prisma, userId, projectId, 'modifier_taches');

    const tache = await this.prisma.tasks.create({
      data: { project_id: projectId, title, description, assignee, source },
    });

    // Une tâche ajoutée à la main change ce que l'orchestration voit — et
    // donc les tâches d'étape, les liens de concepts et les scores. Sans
    // ce rappel, il fallait cliquer « Actualiser » pour que le produit
    // s'aperçoive de ce qu'on venait de lui dire.
    await this.automation.runAfterChange(projectId);
    return tache;
  }

  // Lecture : tout membre qui a « voir_taches ». Créer une tâche ou changer
  // son statut demande « modifier_taches » (propriétaire, associé, salarié).
  async listTasks(userId: string, projectId: string) {
    await exigerCapacite(this.prisma, userId, projectId, 'voir_taches');

    return this.prisma.tasks.findMany({
      where: { project_id: projectId },
      orderBy: { created_at: 'asc' },
    });
  }

  async updateStatus(userId: string, taskId: string, status: TaskStatus) {
    const task = await this.prisma.tasks.findFirst({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('Tâche introuvable.');
    }
    await exigerCapacite(this.prisma, userId, task.project_id, 'modifier_taches');

    const misAJour = await this.prisma.tasks.update({
      where: { id: taskId },
      data: { status },
    });

    // Cocher une tâche fait bouger le score Construction, qui est le rapport
    // des tâches terminées. Le laisser figé jusqu'au prochain rechargement
    // ferait douter du chiffre plutôt que de la tâche.
    await this.automation.runAfterChange(task.project_id);
    return misAJour;
  }

  /**
   * Convertit une liste de suggestions textuelles (prochaines étapes d'une
   * analyse, jalons d'un plan de construction…) en tâches assignées à
   * l'humain, avec une source pour tracer d'où elles viennent. Utilisé par
   * ProjectsService juste après une génération IA — pas d'appel HTTP direct,
   * l'appelant a déjà vérifié la propriété du projet.
   */
  createTasksFromSuggestions(projectId: string, titles: string[], source: string) {
    if (titles.length === 0) {
      return Promise.resolve([]);
    }

    return this.prisma.tasks.createManyAndReturn({
      data: titles.map((title) => ({
        project_id: projectId,
        title,
        assignee: 'human' as TaskAssignee,
        source,
      })),
    });
  }
}
