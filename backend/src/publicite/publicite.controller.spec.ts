import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PubliciteController } from './publicite.controller.js';
import { PubliciteService } from './publicite.service.js';

describe('PubliciteController', () => {
  let controller: PubliciteController;
  let publiciteService: Record<string, ReturnType<typeof vi.fn>>;
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    publiciteService = {
      createCampaign: vi.fn().mockResolvedValue({}),
      listCampaigns: vi.fn().mockResolvedValue([]),
      updateCampaign: vi.fn().mockResolvedValue({}),
      deleteCampaign: vi.fn().mockResolvedValue(undefined),
      recordEntry: vi.fn().mockResolvedValue({}),
      listEntries: vi.fn().mockResolvedValue({ entries: [], totalSpentCents: 0, totalLeads: 0, costPerLeadCents: null }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PubliciteController],
      providers: [{ provide: PubliciteService, useValue: publiciteService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PubliciteController>(PubliciteController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('createCampaign transmet les champs à plat', async () => {
    await controller.createCampaign(currentUser, { label: 'Soldes', channel: 'Instagram' });

    expect(publiciteService.createCampaign).toHaveBeenCalledWith('u1', {
      label: 'Soldes',
      channel: 'Instagram',
    });
  });

  it('recordEntry convertit la date fournie', async () => {
    await controller.recordEntry(currentUser, 'c1', {
      spentCents: 8000,
      leads: 4,
      note: 'Campagne week-end',
      occurredOn: '2026-09-10',
    });

    expect(publiciteService.recordEntry).toHaveBeenCalledWith('u1', 'c1', {
      spentCents: 8000,
      leads: 4,
      note: 'Campagne week-end',
      occurredOn: new Date('2026-09-10'),
    });
  });

  it('les autres routes délèguent directement au service', async () => {
    await controller.listCampaigns(currentUser);
    await controller.updateCampaign(currentUser, 'c1', { label: 'Soldes 2' });
    await controller.deleteCampaign(currentUser, 'c1');
    await controller.listEntries(currentUser, 'c1');

    expect(publiciteService.listCampaigns).toHaveBeenCalledWith('u1');
    expect(publiciteService.updateCampaign).toHaveBeenCalledWith('u1', 'c1', {
      label: 'Soldes 2',
      channel: undefined,
    });
    expect(publiciteService.deleteCampaign).toHaveBeenCalledWith('u1', 'c1');
    expect(publiciteService.listEntries).toHaveBeenCalledWith('u1', 'c1');
  });
});
