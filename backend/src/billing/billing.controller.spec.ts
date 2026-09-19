import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';

describe('BillingController', () => {
  let controller: BillingController;
  let billingService: Record<string, ReturnType<typeof vi.fn>>;
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    billingService = {
      getLegalNotice: vi.fn().mockReturnValue({}),
      listDocuments: vi.fn().mockResolvedValue({}),
      createDocument: vi.fn().mockResolvedValue({}),
      getDocument: vi.fn().mockResolvedValue({}),
      updateDraft: vi.fn().mockResolvedValue({}),
      deleteDraft: vi.fn().mockResolvedValue(undefined),
      changeStatus: vi.fn().mockResolvedValue({}),
      addPayment: vi.fn().mockResolvedValue({}),
      exportCsv: vi.fn().mockResolvedValue(''),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [{ provide: BillingService, useValue: billingService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BillingController>(BillingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('ignore un filtre de type ou de statut inconnu', async () => {
    await controller.listDocuments(currentUser, 'bon-de-commande', 'presque-paye');

    expect(billingService.listDocuments).toHaveBeenCalledWith('u1', {
      type: undefined,
      status: undefined,
    });
  });

  it('transmet un filtre valide', async () => {
    await controller.listDocuments(currentUser, 'facture', 'emis');

    expect(billingService.listDocuments).toHaveBeenCalledWith('u1', {
      type: 'facture',
      status: 'emis',
    });
  });

  it("convertit les dates fournies en chaîne", async () => {
    await controller.createDocument(currentUser, {
      type: 'facture',
      clientName: 'Dupont',
      dueAt: '2026-10-01T00:00:00.000Z',
      lines: [{ label: 'Prestation', quantityMilli: 1000, unitPriceCents: 10000 }],
    });

    expect(billingService.createDocument.mock.calls[0][1].dueAt).toEqual(
      new Date('2026-10-01T00:00:00.000Z'),
    );
  });

  it("retombe sur « autre » pour un moyen de paiement inconnu", async () => {
    await controller.addPayment(currentUser, 'd1', {
      amountCents: 1000,
      method: 'troc',
    });

    expect(billingService.addPayment).toHaveBeenCalledWith(
      'u1',
      'd1',
      1000,
      'autre',
      undefined,
      undefined,
    );
  });

  it('expose la notice légale et l\'export', async () => {
    await controller.getLegalNotice();
    await controller.exportCsv(currentUser);

    expect(billingService.getLegalNotice).toHaveBeenCalled();
    expect(billingService.exportCsv).toHaveBeenCalledWith('u1');
  });

  it('changeStatus, updateDraft et deleteDraft délèguent au service', async () => {
    await controller.changeStatus(currentUser, 'd1', { status: 'emis' });
    await controller.updateDraft(currentUser, 'd1', { clientName: 'X' });
    await controller.deleteDraft(currentUser, 'd1');
    await controller.getDocument(currentUser, 'd1');

    expect(billingService.changeStatus).toHaveBeenCalledWith('u1', 'd1', 'emis');
    expect(billingService.updateDraft).toHaveBeenCalled();
    expect(billingService.deleteDraft).toHaveBeenCalledWith('u1', 'd1');
    expect(billingService.getDocument).toHaveBeenCalledWith('u1', 'd1');
  });
});
