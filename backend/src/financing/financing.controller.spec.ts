import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { FinancingController } from './financing.controller.js';
import { FinancingService } from './financing.service.js';

describe('FinancingController', () => {
  let controller: FinancingController;
  let financingService: Record<string, ReturnType<typeof vi.fn>>;
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    financingService = {
      getScopeNotice: vi.fn().mockReturnValue({}),
      recordRound: vi.fn().mockResolvedValue({}),
      listRounds: vi.fn().mockResolvedValue({}),
      deleteRound: vi.fn().mockResolvedValue(undefined),
      addHolder: vi.fn().mockResolvedValue({}),
      removeHolder: vi.fn().mockResolvedValue(undefined),
      recordEquityChange: vi.fn().mockResolvedValue({}),
      getCapTable: vi.fn().mockResolvedValue({}),
      listEquityEvents: vi.fn().mockResolvedValue([]),
      recordDividend: vi.fn().mockResolvedValue({}),
      listDividends: vi.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinancingController],
      providers: [{ provide: FinancingService, useValue: financingService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FinancingController>(FinancingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it("convertit la date d'apport fournie en chaîne", async () => {
    await controller.recordRound(currentUser, 'p1', {
      source: 'ignitux',
      amountCents: 500000,
      occurredAt: '2026-03-01T00:00:00.000Z',
    });

    expect(financingService.recordRound).toHaveBeenCalledWith(
      'u1',
      'p1',
      'ignitux',
      500000,
      new Date('2026-03-01T00:00:00.000Z'),
      undefined,
    );
  });

  it("retombe sur « autre » pour une source inconnue ayant franchi la validation", async () => {
    await controller.recordRound(currentUser, 'p1', {
      source: 'mecene-anonyme',
      amountCents: 1000,
      occurredAt: '2026-03-01T00:00:00.000Z',
    });

    expect(financingService.recordRound.mock.calls[0][2]).toBe('autre');
  });

  it('transmet part, motif et date à un changement de répartition', async () => {
    await controller.recordEquityChange(currentUser, 'h1', {
      shareBasisPoints: 7000,
      reason: 'Rachat par le porteur',
      occurredAt: '2026-05-01T00:00:00.000Z',
    });

    expect(financingService.recordEquityChange).toHaveBeenCalledWith(
      'u1',
      'h1',
      7000,
      'Rachat par le porteur',
      new Date('2026-05-01T00:00:00.000Z'),
    );
  });

  it("crée un détenteur non fondateur par défaut", async () => {
    await controller.addHolder(currentUser, 'p1', { name: 'Ignitux' });

    expect(financingService.addHolder).toHaveBeenCalledWith('u1', 'p1', 'Ignitux', false);
  });

  it('transmet un dividende versé', async () => {
    await controller.recordDividend(currentUser, 'h1', {
      amountCents: 120000,
      occurredAt: '2026-12-01T00:00:00.000Z',
      note: 'Exercice 2026',
    });

    expect(financingService.recordDividend).toHaveBeenCalledWith(
      'u1',
      'h1',
      120000,
      new Date('2026-12-01T00:00:00.000Z'),
      'Exercice 2026',
    );
  });

  it('les lectures et suppressions délèguent au service', async () => {
    controller.getScopeNotice();
    await controller.listRounds(currentUser, 'p1');
    await controller.getCapTable(currentUser, 'p1');
    await controller.listEquityEvents(currentUser, 'p1');
    await controller.listDividends(currentUser, 'p1');
    await controller.deleteRound(currentUser, 'r1');
    await controller.removeHolder(currentUser, 'h1');

    expect(financingService.getScopeNotice).toHaveBeenCalled();
    expect(financingService.listRounds).toHaveBeenCalledWith('u1', 'p1');
    expect(financingService.getCapTable).toHaveBeenCalledWith('u1', 'p1');
    expect(financingService.listEquityEvents).toHaveBeenCalledWith('u1', 'p1');
    expect(financingService.listDividends).toHaveBeenCalledWith('u1', 'p1');
    expect(financingService.deleteRound).toHaveBeenCalledWith('u1', 'r1');
    expect(financingService.removeHolder).toHaveBeenCalledWith('u1', 'h1');
  });
});
