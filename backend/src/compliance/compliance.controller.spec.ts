import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ComplianceController } from './compliance.controller.js';
import { ComplianceService } from './compliance.service.js';

describe('ComplianceController', () => {
  let controller: ComplianceController;
  let complianceService: {
    listRequirements: ReturnType<typeof vi.fn>;
    listForProject: ReturnType<typeof vi.fn>;
    markChecked: ReturnType<typeof vi.fn>;
    unmarkChecked: ReturnType<typeof vi.fn>;
  };
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    complianceService = {
      listRequirements: vi.fn(),
      listForProject: vi.fn(),
      markChecked: vi.fn(),
      unmarkChecked: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ComplianceController],
      providers: [{ provide: ComplianceService, useValue: complianceService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ComplianceController>(ComplianceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('listRequirements délègue au service avec le pays donné', async () => {
    complianceService.listRequirements.mockResolvedValue({ disclaimer: 'd', requirements: [] });

    await controller.listRequirements('FR');

    expect(complianceService.listRequirements).toHaveBeenCalledWith('FR');
  });

  it('listForProject délègue au service avec l\'utilisateur courant', async () => {
    complianceService.listForProject.mockResolvedValue({ disclaimer: 'd', requirements: [] });

    await controller.listForProject(currentUser, 'p1', 'FR');

    expect(complianceService.listForProject).toHaveBeenCalledWith('u1', 'p1', 'FR');
  });

  it('markChecked délègue au service', async () => {
    complianceService.markChecked.mockResolvedValue({ id: 'c1' });

    await controller.markChecked(currentUser, 'p1', 'r1');

    expect(complianceService.markChecked).toHaveBeenCalledWith('u1', 'p1', 'r1');
  });

  it('unmarkChecked délègue au service', async () => {
    complianceService.unmarkChecked.mockResolvedValue(undefined);

    await controller.unmarkChecked(currentUser, 'p1', 'r1');

    expect(complianceService.unmarkChecked).toHaveBeenCalledWith('u1', 'p1', 'r1');
  });
});
