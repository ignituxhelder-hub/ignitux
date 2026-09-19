import { Injectable, NotFoundException } from '@nestjs/common';
import { assertOwnsProject } from '../prisma/assert-owns-project.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  summarizePipeline,
  type CrmChannel,
  type CrmKind,
  type CrmStage,
} from './crm-pipeline.js';

export interface ContactInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  role?: string;
  kind?: CrmKind;
  stage?: CrmStage;
  notes?: string;
  companyId?: string;
  projectId?: string;
}

export interface ContactFilters {
  query?: string;
  stage?: CrmStage;
  kind?: CrmKind;
  companyId?: string;
  projectId?: string;
}

/**
 * CRM — les relations commerciales du porteur de projet.
 *
 * Contrairement aux moteurs IGINI, ce module est strictement personnel :
 * tout est porté par `owner_id` et rien n'est partagé avec les
 * collaborateurs d'un projet. Un carnet d'adresses commercial n'est pas du
 * même ordre qu'une analyse de projet — y donner accès à un collaborateur
 * parce qu'il partage un projet serait une fuite, pas une fonctionnalité.
 *
 * Il n'appelle jamais l'IA : rien ici ne gagnerait à être deviné.
 */
@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- entreprises

  createCompany(
    ownerId: string,
    name: string,
    sector?: string,
    website?: string,
    notes?: string,
  ) {
    return this.prisma.crm_companies.create({
      data: { owner_id: ownerId, name, sector, website, notes },
    });
  }

  listCompanies(ownerId: string) {
    return this.prisma.crm_companies.findMany({
      where: { owner_id: ownerId },
      orderBy: { name: 'asc' },
      include: { contacts: { orderBy: { last_name: 'asc' } } },
    });
  }

  async updateCompany(
    ownerId: string,
    companyId: string,
    data: { name?: string; sector?: string; website?: string; notes?: string },
  ) {
    await this.findCompanyForOwner(ownerId, companyId);
    return this.prisma.crm_companies.update({ where: { id: companyId }, data });
  }

  async deleteCompany(ownerId: string, companyId: string) {
    await this.findCompanyForOwner(ownerId, companyId);
    // Les contacts survivent (company_id passe à null, voir SetNull dans le
    // schéma) : supprimer une fiche entreprise ne doit pas effacer les
    // personnes qu'on y avait rattachées.
    await this.prisma.crm_companies.delete({ where: { id: companyId } });
  }

  // ------------------------------------------------------------------- contacts

  async createContact(ownerId: string, input: ContactInput) {
    if (input.companyId) {
      await this.findCompanyForOwner(ownerId, input.companyId);
    }
    if (input.projectId) {
      await assertOwnsProject(this.prisma, ownerId, input.projectId);
    }

    return this.prisma.crm_contacts.create({
      data: {
        owner_id: ownerId,
        company_id: input.companyId ?? null,
        project_id: input.projectId ?? null,
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        phone: input.phone,
        role: input.role,
        kind: input.kind ?? 'prospect',
        stage: input.stage ?? 'nouveau',
        notes: input.notes,
      },
    });
  }

  /**
   * Recherche : même convention que les autres moteurs — tous les mots
   * doivent être présents, chacun pouvant se trouver dans le prénom, le
   * nom ou l'adresse e-mail.
   */
  listContacts(ownerId: string, filters: ContactFilters = {}) {
    const terms = (filters.query ?? '')
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);

    return this.prisma.crm_contacts.findMany({
      where: {
        owner_id: ownerId,
        ...(filters.stage ? { stage: filters.stage } : {}),
        ...(filters.kind ? { kind: filters.kind } : {}),
        ...(filters.companyId ? { company_id: filters.companyId } : {}),
        ...(filters.projectId ? { project_id: filters.projectId } : {}),
        ...(terms.length > 0
          ? {
              AND: terms.map((term) => ({
                OR: [
                  { first_name: { contains: term, mode: 'insensitive' as const } },
                  { last_name: { contains: term, mode: 'insensitive' as const } },
                  { email: { contains: term, mode: 'insensitive' as const } },
                ],
              })),
            }
          : {}),
      },
      orderBy: [{ last_name: 'asc' }, { first_name: 'asc' }],
      include: { company: true },
    });
  }

  async getContact(ownerId: string, contactId: string) {
    const contact = await this.prisma.crm_contacts.findFirst({
      where: { id: contactId, owner_id: ownerId },
      include: {
        company: true,
        interactions: { orderBy: { occurred_at: 'desc' } },
      },
    });
    if (!contact) {
      throw new NotFoundException('Contact introuvable.');
    }
    return contact;
  }

  async updateContact(ownerId: string, contactId: string, input: Partial<ContactInput>) {
    await this.findContactForOwner(ownerId, contactId);
    if (input.companyId) {
      await this.findCompanyForOwner(ownerId, input.companyId);
    }
    if (input.projectId) {
      await assertOwnsProject(this.prisma, ownerId, input.projectId);
    }

    return this.prisma.crm_contacts.update({
      where: { id: contactId },
      data: {
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        phone: input.phone,
        role: input.role,
        kind: input.kind,
        stage: input.stage,
        notes: input.notes,
        ...(input.companyId !== undefined ? { company_id: input.companyId } : {}),
        ...(input.projectId !== undefined ? { project_id: input.projectId } : {}),
      },
    });
  }

  async deleteContact(ownerId: string, contactId: string) {
    await this.findContactForOwner(ownerId, contactId);
    await this.prisma.crm_contacts.delete({ where: { id: contactId } });
  }

  // --------------------------------------------------------------- interactions

  async logInteraction(
    ownerId: string,
    contactId: string,
    channel: CrmChannel,
    summary: string,
    occurredAt?: Date,
  ) {
    await this.findContactForOwner(ownerId, contactId);

    return this.prisma.crm_interactions.create({
      data: {
        contact_id: contactId,
        channel,
        summary,
        // Par défaut maintenant, mais l'appelant peut dater l'échange du
        // jour où il a réellement eu lieu : un appel saisi le lendemain
        // n'est pas un appel du lendemain.
        occurred_at: occurredAt ?? new Date(),
      },
    });
  }

  async listInteractions(ownerId: string, contactId: string) {
    await this.findContactForOwner(ownerId, contactId);

    return this.prisma.crm_interactions.findMany({
      where: { contact_id: contactId },
      orderBy: { occurred_at: 'desc' },
    });
  }

  async deleteInteraction(ownerId: string, interactionId: string) {
    const interaction = await this.prisma.crm_interactions.findFirst({
      where: { id: interactionId },
    });
    if (!interaction) {
      throw new NotFoundException('Interaction introuvable.');
    }
    await this.findContactForOwner(ownerId, interaction.contact_id);

    await this.prisma.crm_interactions.delete({ where: { id: interactionId } });
  }

  // -------------------------------------------------------------------- pipeline

  /**
   * Répartition des contacts par étape. Un comptage, pas une prévision :
   * voir l'avertissement en tête de crm-pipeline.ts sur l'absence
   * volontaire de chiffre d'affaires prévisionnel.
   */
  async getPipeline(ownerId: string, projectId?: string) {
    const contacts = await this.prisma.crm_contacts.findMany({
      where: { owner_id: ownerId, ...(projectId ? { project_id: projectId } : {}) },
      select: { stage: true },
    });

    return { total: contacts.length, stages: summarizePipeline(contacts) };
  }

  private async findCompanyForOwner(ownerId: string, companyId: string) {
    const company = await this.prisma.crm_companies.findFirst({
      where: { id: companyId, owner_id: ownerId },
    });
    if (!company) {
      throw new NotFoundException('Entreprise introuvable.');
    }
    return company;
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
