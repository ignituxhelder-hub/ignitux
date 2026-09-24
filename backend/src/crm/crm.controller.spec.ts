import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { EcritureDepasseeGuard } from '../hors-ligne/ecriture-depassee.guard.js';
import { CrmController } from './crm.controller.js';
import { CrmService } from './crm.service.js';

describe('CrmController', () => {
  let controller: CrmController;
  let crmService: Record<string, ReturnType<typeof vi.fn>>;
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    crmService = {
      createCompany: vi.fn().mockResolvedValue({}),
      listCompanies: vi.fn().mockResolvedValue([]),
      updateCompany: vi.fn().mockResolvedValue({}),
      deleteCompany: vi.fn().mockResolvedValue(undefined),
      createContact: vi.fn().mockResolvedValue({}),
      listContacts: vi.fn().mockResolvedValue([]),
      getContact: vi.fn().mockResolvedValue({}),
      updateContact: vi.fn().mockResolvedValue({}),
      deleteContact: vi.fn().mockResolvedValue(undefined),
      logInteraction: vi.fn().mockResolvedValue({}),
      listInteractions: vi.fn().mockResolvedValue([]),
      deleteInteraction: vi.fn().mockResolvedValue(undefined),
      getPipeline: vi.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CrmController],
      providers: [{ provide: CrmService, useValue: crmService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      // Ces tests portent sur la délégation au service, pas sur les gardes.
      // Que celui-ci soit bien monté est vérifié là où ça se voit :
      // test/hors-ligne.e2e-spec.ts, qui passe par la vraie pile HTTP.
      .overrideGuard(EcritureDepasseeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CrmController>(CrmController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('ignore un filtre mal orthographié au lieu de renvoyer une erreur', async () => {
    // Une recherche qui échoue parce qu'une étape est mal écrite dans
    // l'URL n'aide personne.
    await controller.listContacts(currentUser, 'ada', 'presque-signe', 'ami');

    expect(crmService.listContacts).toHaveBeenCalledWith('u1', {
      query: 'ada',
      stage: undefined,
      kind: undefined,
      companyId: undefined,
      projectId: undefined,
    });
  });

  it('transmet un filtre valide', async () => {
    await controller.listContacts(currentUser, undefined, 'qualifie', 'client');

    expect(crmService.listContacts).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ stage: 'qualifie', kind: 'client' }),
    );
  });

  it("convertit la date d'échange fournie", async () => {
    await controller.logInteraction(currentUser, 'c1', {
      channel: 'appel',
      summary: 'Premier contact',
      occurredAt: '2026-09-10T14:00:00.000Z',
    });

    expect(crmService.logInteraction).toHaveBeenCalledWith(
      'u1',
      'c1',
      'appel',
      'Premier contact',
      new Date('2026-09-10T14:00:00.000Z'),
    );
  });

  it("retombe sur « note » pour un canal inconnu ayant franchi la validation", async () => {
    await controller.logInteraction(currentUser, 'c1', {
      channel: 'pigeon-voyageur',
      summary: 'Message',
    });

    expect(crmService.logInteraction).toHaveBeenCalledWith(
      'u1',
      'c1',
      'note',
      'Message',
      undefined,
    );
  });

  it('createContact, pipeline et suppressions délèguent au service', async () => {
    await controller.createContact(currentUser, { firstName: 'Ada', lastName: 'Lovelace' });
    await controller.getPipeline(currentUser, 'p1');
    await controller.deleteContact(currentUser, 'c1');
    await controller.deleteCompany(currentUser, 'e1');
    await controller.deleteInteraction(currentUser, 'i1');

    expect(crmService.createContact).toHaveBeenCalled();
    expect(crmService.getPipeline).toHaveBeenCalledWith('u1', 'p1');
    expect(crmService.deleteContact).toHaveBeenCalledWith('u1', 'c1');
    expect(crmService.deleteCompany).toHaveBeenCalledWith('u1', 'e1');
    expect(crmService.deleteInteraction).toHaveBeenCalledWith('u1', 'i1');
  });

  it('companies et interactions se listent par leur route', async () => {
    await controller.listCompanies(currentUser);
    await controller.listInteractions(currentUser, 'c1');
    await controller.getContact(currentUser, 'c1');

    expect(crmService.listCompanies).toHaveBeenCalledWith('u1');
    expect(crmService.listInteractions).toHaveBeenCalledWith('u1', 'c1');
    expect(crmService.getContact).toHaveBeenCalledWith('u1', 'c1');
  });
});
