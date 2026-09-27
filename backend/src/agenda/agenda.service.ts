import { Injectable, NotFoundException } from '@nestjs/common';
import { assertOwnsProject } from '../prisma/assert-owns-project.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CreateAgendaEventInput {
  projectId?: string;
  contactId?: string;
  title: string;
  location?: string;
  note?: string;
  occurredAt: Date;
}

export interface UpdateAgendaEventInput {
  projectId?: string;
  contactId?: string;
  title?: string;
  location?: string;
  note?: string;
  occurredAt?: Date;
}

export interface ListAgendaInput {
  depuis?: Date;
  jusqua?: Date;
}

export type AgendaItem =
  | {
      type: 'evenement';
      id: string;
      title: string;
      date: Date;
      location: string | null;
      note: string | null;
      projectId: string | null;
      contactId: string | null;
    }
  | {
      type: 'echeance';
      id: string;
      title: string;
      date: Date;
      projectId: string;
      status: string;
    };

/**
 * AGENDA — un rendez-vous (`agenda_events`) est un concept différent d'une
 * échéance de tâche (`tasks.due_date`) : l'un se prend, l'autre se rappelle.
 * `list` les fusionne dans une seule liste triée par date, parce que c'est ce
 * que la page affiche, mais le service ne les confond jamais en un seul
 * modèle — chaque item garde son `type` et son id d'origine.
 */
@Injectable()
export class AgendaService {
  constructor(private readonly prisma: PrismaService) {}

  async createEvent(ownerId: string, input: CreateAgendaEventInput) {
    if (input.projectId) {
      await assertOwnsProject(this.prisma, ownerId, input.projectId);
    }
    if (input.contactId) {
      await this.findContactForOwner(ownerId, input.contactId);
    }

    return this.prisma.agenda_events.create({
      data: {
        owner_id: ownerId,
        project_id: input.projectId ?? null,
        contact_id: input.contactId ?? null,
        title: input.title,
        location: input.location ?? null,
        note: input.note ?? null,
        occurred_at: input.occurredAt,
      },
    });
  }

  async updateEvent(ownerId: string, id: string, input: UpdateAgendaEventInput) {
    await this.findEventForOwner(ownerId, id);
    if (input.projectId) {
      await assertOwnsProject(this.prisma, ownerId, input.projectId);
    }
    if (input.contactId) {
      await this.findContactForOwner(ownerId, input.contactId);
    }

    return this.prisma.agenda_events.update({
      where: { id },
      data: {
        project_id: input.projectId,
        contact_id: input.contactId,
        title: input.title,
        location: input.location,
        note: input.note,
        occurred_at: input.occurredAt,
      },
    });
  }

  async deleteEvent(ownerId: string, id: string): Promise<void> {
    await this.findEventForOwner(ownerId, id);
    await this.prisma.agenda_events.delete({ where: { id } });
  }

  async list(ownerId: string, range: ListAgendaInput = {}): Promise<AgendaItem[]> {
    const bornes = {
      ...(range.depuis ? { gte: range.depuis } : {}),
      ...(range.jusqua ? { lte: range.jusqua } : {}),
    };
    const aUneFenetre = Object.keys(bornes).length > 0;

    const [evenements, echeances] = await Promise.all([
      this.prisma.agenda_events.findMany({
        where: { owner_id: ownerId, ...(aUneFenetre ? { occurred_at: bornes } : {}) },
      }),
      this.prisma.tasks.findMany({
        where: {
          due_date: { not: null, ...bornes },
          project: { owner_id: ownerId },
        },
      }),
    ]);

    const items: AgendaItem[] = [
      ...evenements.map((e): AgendaItem => ({
        type: 'evenement',
        id: e.id,
        title: e.title,
        date: e.occurred_at,
        location: e.location,
        note: e.note,
        projectId: e.project_id,
        contactId: e.contact_id,
      })),
      ...echeances.map((t): AgendaItem => ({
        type: 'echeance',
        id: t.id,
        title: t.title,
        // `due_date` est filtré non-null ci-dessus ; le champ reste
        // optionnel dans le type généré par Prisma.
        date: t.due_date as Date,
        projectId: t.project_id,
        status: t.status,
      })),
    ];

    return items.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private async findEventForOwner(ownerId: string, id: string) {
    const event = await this.prisma.agenda_events.findFirst({
      where: { id, owner_id: ownerId },
    });
    if (!event) {
      throw new NotFoundException('Rendez-vous introuvable.');
    }
    return event;
  }

  private async findContactForOwner(ownerId: string, contactId: string) {
    const contact = await this.prisma.crm_contacts.findFirst({
      where: { id: contactId, owner_id: ownerId },
    });
    if (!contact) {
      throw new NotFoundException('Contact introuvable.');
    }
    return contact;
  }
}
