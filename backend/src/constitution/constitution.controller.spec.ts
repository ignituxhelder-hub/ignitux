import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ConstitutionController } from './constitution.controller.js';
import { ConstitutionService } from './constitution.service.js';

describe('ConstitutionController', () => {
  let controller: ConstitutionController;
  let constitutionService: {
    listArticles: ReturnType<typeof vi.fn>;
    listRules: ReturnType<typeof vi.fn>;
    audit: ReturnType<typeof vi.fn>;
    listViolations: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    constitutionService = {
      listArticles: vi.fn(),
      listRules: vi.fn(),
      audit: vi.fn(),
      listViolations: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConstitutionController],
      providers: [{ provide: ConstitutionService, useValue: constitutionService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ConstitutionController>(ConstitutionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('listArticles transmet le filtre de version', () => {
    constitutionService.listArticles.mockReturnValue([]);

    void controller.listArticles('principes-fondateurs');

    expect(constitutionService.listArticles).toHaveBeenCalledWith('principes-fondateurs');
  });

  it('audit délègue au service', () => {
    constitutionService.audit.mockReturnValue([]);

    void controller.audit();

    expect(constitutionService.audit).toHaveBeenCalled();
  });

  it('listViolations ne rend que les refus de la personne connectee', () => {
    // Le filtre etait absent : n importe quel compte lisait le journal
    // entier, avec l identifiant et le projet de tous les autres. Ce test
    // echoue si quelqu un retire l argument en refactorant.
    constitutionService.listViolations.mockReturnValue([]);

    void controller.listViolations({ id: 'u1', email: 'a@b.com' });

    expect(constitutionService.listViolations).toHaveBeenCalledWith('u1');
  });

  it('listRules délègue au service', () => {
    constitutionService.listRules.mockReturnValue([]);

    void controller.listRules();

    expect(constitutionService.listRules).toHaveBeenCalled();
  });
});
