import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { EcritureDepasseeGuard } from '../../hors-ligne/ecriture-depassee.guard.js';
import { ExecutionController } from './execution.controller.js';
import { ExecutionService } from './execution.service.js';

describe('ExecutionController', () => {
  let controller: ExecutionController;
  let service: Record<string, ReturnType<typeof vi.fn>>;
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    service = {
      runTask: vi.fn(),
      validateTask: vi.fn(),
      refuseTask: vi.fn(),
      runCompliance: vi.fn(),
      validateCompliance: vi.fn(),
      refuseCompliance: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExecutionController],
      providers: [{ provide: ExecutionService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(EcritureDepasseeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ExecutionController);
  });

  it('runTask délègue au service', async () => {
    service.runTask.mockResolvedValue({ id: 't1' });
    const result = await controller.runTask(currentUser, 'p1', 't1');
    expect(service.runTask).toHaveBeenCalledWith('u1', 'p1', 't1');
    expect(result).toEqual({ id: 't1' });
  });

  it('validateTask délègue au service', async () => {
    await controller.validateTask(currentUser, 'p1', 't1');
    expect(service.validateTask).toHaveBeenCalledWith('u1', 'p1', 't1');
  });

  it('refuseTask transmet le motif', async () => {
    await controller.refuseTask(currentUser, 'p1', 't1', { reason: 'Hors sujet' });
    expect(service.refuseTask).toHaveBeenCalledWith('u1', 'p1', 't1', 'Hors sujet');
  });

  it('refuseTask fonctionne sans corps', async () => {
    await controller.refuseTask(currentUser, 'p1', 't1', undefined as never);
    expect(service.refuseTask).toHaveBeenCalledWith('u1', 'p1', 't1', undefined);
  });

  it('runCompliance délègue au service', async () => {
    await controller.runCompliance(currentUser, 'p1', 'r1');
    expect(service.runCompliance).toHaveBeenCalledWith('u1', 'p1', 'r1');
  });

  it('validateCompliance délègue au service', async () => {
    await controller.validateCompliance(currentUser, 'p1', 'r1');
    expect(service.validateCompliance).toHaveBeenCalledWith('u1', 'p1', 'r1');
  });

  it('refuseCompliance transmet le motif', async () => {
    await controller.refuseCompliance(currentUser, 'p1', 'r1', { reason: 'Non' });
    expect(service.refuseCompliance).toHaveBeenCalledWith('u1', 'p1', 'r1', 'Non');
  });

  it('refuseCompliance fonctionne sans corps', async () => {
    await controller.refuseCompliance(currentUser, 'p1', 'r1', undefined as never);
    expect(service.refuseCompliance).toHaveBeenCalledWith('u1', 'p1', 'r1', undefined);
  });
});
