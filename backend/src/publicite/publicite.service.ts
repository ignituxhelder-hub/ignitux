import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CreateCampaignInput {
  label: string;
  channel?: string;
}

export interface UpdateCampaignInput {
  label?: string;
  channel?: string;
}

export interface RecordEntryInput {
  spentCents: number;
  leads?: number;
  note?: string;
  occurredOn?: Date;
}

export interface CampaignEntries {
  entries: Array<{
    id: string;
    campaign_id: string;
    spent_cents: number;
    leads: number;
    note: string | null;
    occurred_on: Date;
    created_at: Date | null;
  }>;
  totalSpentCents: number;
  totalLeads: number;
  /** Coût moyen par prospect amené. `null` tant qu'aucun prospect n'a été compté. */
  costPerLeadCents: number | null;
}

/**
 * PUBLICITÉ — les campagnes suivies, scopées à leur propriétaire, même
 * patron que VéhiculesService : rien n'est dénormalisé sur la campagne, le
 * coût par prospect se recalcule à la lecture depuis l'historique complet.
 */
@Injectable()
export class PubliciteService {
  constructor(private readonly prisma: PrismaService) {}

  createCampaign(ownerId: string, input: CreateCampaignInput) {
    return this.prisma.ad_campaigns.create({
      data: {
        owner_id: ownerId,
        label: input.label,
        channel: input.channel ?? null,
      },
    });
  }

  listCampaigns(ownerId: string) {
    return this.prisma.ad_campaigns.findMany({
      where: { owner_id: ownerId },
      orderBy: { label: 'asc' },
    });
  }

  async updateCampaign(ownerId: string, id: string, input: UpdateCampaignInput) {
    await this.findCampaignForOwner(ownerId, id);

    return this.prisma.ad_campaigns.update({
      where: { id },
      data: { label: input.label, channel: input.channel },
    });
  }

  async deleteCampaign(ownerId: string, id: string): Promise<void> {
    await this.findCampaignForOwner(ownerId, id);
    await this.prisma.ad_campaigns.delete({ where: { id } });
  }

  async recordEntry(ownerId: string, campaignId: string, input: RecordEntryInput) {
    await this.findCampaignForOwner(ownerId, campaignId);

    return this.prisma.ad_campaign_entries.create({
      data: {
        campaign_id: campaignId,
        spent_cents: input.spentCents,
        leads: input.leads ?? 0,
        note: input.note ?? null,
        occurred_on: input.occurredOn ?? new Date(),
      },
    });
  }

  async listEntries(ownerId: string, campaignId: string): Promise<CampaignEntries> {
    await this.findCampaignForOwner(ownerId, campaignId);

    const entries = await this.prisma.ad_campaign_entries.findMany({
      where: { campaign_id: campaignId },
      orderBy: [{ occurred_on: 'desc' }, { created_at: 'desc' }],
    });

    const totalSpentCents = entries.reduce((total, entry) => total + entry.spent_cents, 0);
    const totalLeads = entries.reduce((total, entry) => total + entry.leads, 0);
    const costPerLeadCents = totalLeads > 0 ? totalSpentCents / totalLeads : null;

    return { entries, totalSpentCents, totalLeads, costPerLeadCents };
  }

  private async findCampaignForOwner(ownerId: string, id: string) {
    const campaign = await this.prisma.ad_campaigns.findFirst({
      where: { id, owner_id: ownerId },
    });
    if (!campaign) {
      throw new NotFoundException('Campagne introuvable.');
    }
    return campaign;
  }
}
