import { Injectable, NotFoundException } from '@nestjs/common';
import { assertOwnsProject } from '../prisma/assert-owns-project.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CreatePropertyInput {
  projectId?: string;
  label: string;
  address?: string;
}

export interface UpdatePropertyInput {
  projectId?: string;
  label?: string;
  address?: string;
}

export interface RecordMovementInput {
  amountCents: number;
  reason?: string;
  occurredOn?: Date;
}

/**
 * IMMOBILIER — les biens suivis, scopés à leur propriétaire, même patron que
 * StocksService : un bien porte un solde net (loyers perçus moins charges
 * payées) qui n'est jamais incrémenté à la main, toujours recalculé par un
 * `aggregate` sur les mouvements après écriture.
 */
@Injectable()
export class ImmobilierService {
  constructor(private readonly prisma: PrismaService) {}

  async createProperty(ownerId: string, input: CreatePropertyInput) {
    if (input.projectId) {
      await assertOwnsProject(this.prisma, ownerId, input.projectId);
    }

    return this.prisma.real_estate_properties.create({
      data: {
        owner_id: ownerId,
        project_id: input.projectId ?? null,
        label: input.label,
        address: input.address ?? null,
      },
    });
  }

  listProperties(ownerId: string) {
    return this.prisma.real_estate_properties.findMany({
      where: { owner_id: ownerId },
      orderBy: { label: 'asc' },
    });
  }

  async updateProperty(ownerId: string, id: string, input: UpdatePropertyInput) {
    await this.findPropertyForOwner(ownerId, id);
    if (input.projectId) {
      await assertOwnsProject(this.prisma, ownerId, input.projectId);
    }

    return this.prisma.real_estate_properties.update({
      where: { id },
      data: {
        project_id: input.projectId,
        label: input.label,
        address: input.address,
      },
    });
  }

  async deleteProperty(ownerId: string, id: string): Promise<void> {
    await this.findPropertyForOwner(ownerId, id);
    await this.prisma.real_estate_properties.delete({ where: { id } });
  }

  async recordMovement(ownerId: string, propertyId: string, input: RecordMovementInput) {
    await this.findPropertyForOwner(ownerId, propertyId);

    await this.prisma.real_estate_movements.create({
      data: {
        property_id: propertyId,
        amount_cents: input.amountCents,
        reason: input.reason ?? null,
        occurred_on: input.occurredOn ?? new Date(),
      },
    });

    const total = await this.prisma.real_estate_movements.aggregate({
      where: { property_id: propertyId },
      _sum: { amount_cents: true },
    });

    return this.prisma.real_estate_properties.update({
      where: { id: propertyId },
      data: { balance_cents: total._sum.amount_cents ?? 0 },
    });
  }

  async listMovements(ownerId: string, propertyId: string) {
    await this.findPropertyForOwner(ownerId, propertyId);
    return this.prisma.real_estate_movements.findMany({
      where: { property_id: propertyId },
      orderBy: [{ occurred_on: 'desc' }, { created_at: 'desc' }],
    });
  }

  private async findPropertyForOwner(ownerId: string, id: string) {
    const property = await this.prisma.real_estate_properties.findFirst({
      where: { id, owner_id: ownerId },
    });
    if (!property) {
      throw new NotFoundException('Bien introuvable.');
    }
    return property;
  }
}
