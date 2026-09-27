import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { PubliciteService } from './publicite.service.js';

type Mock = ReturnType<typeof vi.fn>;

describe('PubliciteService', () => {
  let service: PubliciteService;
  let prisma: {
    ad_campaigns: { create: Mock; findMany: Mock; findFirst: Mock; update: Mock; delete: Mock };
    ad_campaign_entries: { create: Mock; findMany: Mock };
  };

  beforeEach(async () => {
    prisma = {
      ad_campaigns: {
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
      ad_campaign_entries: { create: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PubliciteService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<PubliciteService>(PubliciteService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cloisonnement', () => {
    it("ne liste que les campagnes de l'appelant", async () => {
      await service.listCampaigns('u1');

      expect(prisma.ad_campaigns.findMany.mock.calls[0][0].where.owner_id).toBe('u1');
    });

    it("refuse de modifier la campagne d'un autre utilisateur", async () => {
      prisma.ad_campaigns.findFirst.mockResolvedValue(null);

      await expect(service.updateCampaign('u2', 'c1', { label: 'Soldes' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuse une entrée sur une campagne introuvable', async () => {
      prisma.ad_campaigns.findFirst.mockResolvedValue(null);

      await expect(
        service.recordEntry('u1', 'introuvable', { spentCents: 5000 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('le coût par prospect', () => {
    beforeEach(() => {
      prisma.ad_campaigns.findFirst.mockResolvedValue({ id: 'c1', owner_id: 'u1' });
    });

    it('reste null tant qu’aucun prospect n’a été compté', async () => {
      prisma.ad_campaign_entries.findMany.mockResolvedValue([
        { id: 'e1', campaign_id: 'c1', spent_cents: 5000, leads: 0, note: null, occurred_on: new Date(), created_at: new Date() },
      ]);

      const { costPerLeadCents } = await service.listEntries('u1', 'c1');

      expect(costPerLeadCents).toBeNull();
    });

    it('se calcule sur la dépense totale divisée par les prospects amenés', async () => {
      prisma.ad_campaign_entries.findMany.mockResolvedValue([
        { id: 'e1', campaign_id: 'c1', spent_cents: 6000, leads: 2, note: null, occurred_on: new Date(), created_at: new Date() },
        { id: 'e2', campaign_id: 'c1', spent_cents: 4000, leads: 3, note: null, occurred_on: new Date(), created_at: new Date() },
      ]);

      const { costPerLeadCents, totalSpentCents, totalLeads } = await service.listEntries('u1', 'c1');

      expect(totalSpentCents).toBe(10000);
      expect(totalLeads).toBe(5);
      expect(costPerLeadCents).toBe(2000);
    });
  });
});
