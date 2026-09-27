import { Injectable, NotFoundException } from '@nestjs/common';
import { assertOwnsProject } from '../prisma/assert-owns-project.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CreateStockItemInput {
  projectId?: string;
  name: string;
  unit?: string;
  alertBelow?: number;
}

export interface UpdateStockItemInput {
  projectId?: string;
  name?: string;
  unit?: string;
  alertBelow?: number;
}

export interface RecordMovementInput {
  quantity: number;
  reason?: string;
  occurredOn?: Date;
}

/**
 * STOCKS — les articles suivis en réserve, scopés à leur propriétaire, même
 * patron que CrmService.
 *
 * `quantity` sur stock_items est un solde dénormalisé : il n'est jamais
 * incrémenté à la main, toujours recalculé par un `aggregate` sur les
 * mouvements après écriture. Un incrément manuel divergerait silencieusement
 * du jour où un mouvement serait supprimé ou corrigé.
 */
@Injectable()
export class StocksService {
  constructor(private readonly prisma: PrismaService) {}

  async createItem(ownerId: string, input: CreateStockItemInput) {
    if (input.projectId) {
      await assertOwnsProject(this.prisma, ownerId, input.projectId);
    }

    return this.prisma.stock_items.create({
      data: {
        owner_id: ownerId,
        project_id: input.projectId ?? null,
        name: input.name,
        unit: input.unit ?? 'unite',
        alert_below: input.alertBelow ?? null,
      },
    });
  }

  listItems(ownerId: string) {
    return this.prisma.stock_items.findMany({
      where: { owner_id: ownerId },
      orderBy: { name: 'asc' },
    });
  }

  async updateItem(ownerId: string, id: string, input: UpdateStockItemInput) {
    await this.findItemForOwner(ownerId, id);
    if (input.projectId) {
      await assertOwnsProject(this.prisma, ownerId, input.projectId);
    }

    return this.prisma.stock_items.update({
      where: { id },
      data: {
        project_id: input.projectId,
        name: input.name,
        unit: input.unit,
        alert_below: input.alertBelow,
      },
    });
  }

  async deleteItem(ownerId: string, id: string): Promise<void> {
    await this.findItemForOwner(ownerId, id);
    await this.prisma.stock_items.delete({ where: { id } });
  }

  async recordMovement(ownerId: string, itemId: string, input: RecordMovementInput) {
    await this.findItemForOwner(ownerId, itemId);

    await this.prisma.stock_movements.create({
      data: {
        item_id: itemId,
        quantity: input.quantity,
        reason: input.reason ?? null,
        occurred_on: input.occurredOn ?? new Date(),
      },
    });

    const total = await this.prisma.stock_movements.aggregate({
      where: { item_id: itemId },
      _sum: { quantity: true },
    });

    return this.prisma.stock_items.update({
      where: { id: itemId },
      data: { quantity: total._sum.quantity ?? 0 },
    });
  }

  async listMovements(ownerId: string, itemId: string) {
    await this.findItemForOwner(ownerId, itemId);
    return this.prisma.stock_movements.findMany({
      where: { item_id: itemId },
      orderBy: [{ occurred_on: 'desc' }, { created_at: 'desc' }],
    });
  }

  private async findItemForOwner(ownerId: string, id: string) {
    const item = await this.prisma.stock_items.findFirst({
      where: { id, owner_id: ownerId },
    });
    if (!item) {
      throw new NotFoundException('Article introuvable.');
    }
    return item;
  }
}
