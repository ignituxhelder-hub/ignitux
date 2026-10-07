import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ParticipationController } from './participation.controller.js';
import { ParticipationService } from './participation.service.js';

describe('ParticipationController', () => {
  let controller: ParticipationController;
  let service: Record<string, ReturnType<typeof vi.fn>>;
  let operateursInitiaux: string | undefined;

  const owner = { id: 'u-owner', email: 'porteur@x.test' };
  const operator = { id: 'u-op', email: 'ops@ignitux.test' };

  beforeEach(async () => {
    operateursInitiaux = process.env.IGNITUX_OPERATEURS;
    process.env.IGNITUX_OPERATEURS = operator.email;

    service = {
      getParticipation: vi.fn().mockResolvedValue({ agreement: null }),
      createAgreement: vi.fn().mockResolvedValue({ id: 'a1' }),
      addMilestone: vi.fn().mockResolvedValue({ id: 'm1' }),
      validateMilestone: vi.fn().mockResolvedValue({ id: 'm1' }),
      executeMilestone: vi.fn().mockResolvedValue({ id: 'm1' }),
      acknowledgeMilestone: vi.fn().mockResolvedValue({ id: 'm1' }),
      recordDistributedDividend: vi.fn().mockResolvedValue({ id: 'd1' }),
      settleDividendRight: vi.fn().mockResolvedValue({ id: 'd1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParticipationController],
      providers: [{ provide: ParticipationService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ParticipationController);
  });

  afterEach(() => {
    if (operateursInitiaux === undefined) delete process.env.IGNITUX_OPERATEURS;
    else process.env.IGNITUX_OPERATEURS = operateursInitiaux;
  });

  it('dit à l’interface si la personne parle pour IGNITUX, sans rien débloquer côté serveur', async () => {
    const pourLePorteur = await controller.get(owner, 'p1');
    const pourIgnitux = await controller.get(operator, 'p1');

    expect(pourLePorteur).toMatchObject({ viewer: { isIgnituxOperator: false } });
    expect(pourIgnitux).toMatchObject({ viewer: { isIgnituxOperator: true } });
    expect(service.getParticipation).toHaveBeenCalledWith('u-owner', 'p1');
  });

  it('crée l’accord avec l’acteur complet et des dates réelles, sans valeur imposée', async () => {
    await controller.createAgreement(operator, 'p1', {
      founderName: 'Camille',
      effectiveOn: '2026-10-01',
      founderBasisPoints: 6000,
      ignituxBasisPoints: 4000,
    });

    expect(service.createAgreement).toHaveBeenCalledWith(operator, 'p1', {
      founderName: 'Camille',
      effectiveOn: new Date('2026-10-01'),
      founderBasisPoints: 6000,
      ignituxBasisPoints: 4000,
      dividendRightBasisPoints: undefined,
      ecosystemOffre: undefined,
      contractReference: undefined,
    });
  });

  it('prévoit un palier sans date d’échéance ni durée', async () => {
    await controller.addMilestone(operator, 'p1', {
      label: 'Premier palier',
      targetIgnituxBasisPoints: 3000,
      conditions: ['Écrite pour ce projet'],
    });

    expect(service.addMilestone).toHaveBeenCalledWith(operator, 'p1', {
      label: 'Premier palier',
      targetIgnituxBasisPoints: 3000,
      conditions: ['Écrite pour ce projet'],
    });
  });

  it('transmet la validation avec l’acteur : l’identité de celui qui valide est conservée', async () => {
    await controller.validateMilestone(operator, 'm1', { note: 'Conditions constatées' });

    expect(service.validateMilestone).toHaveBeenCalledWith(operator, 'm1', 'Conditions constatées');
  });

  it('exécute un palier à la date effective fournie', async () => {
    await controller.executeMilestone(operator, 'm1', { effectiveOn: '2027-03-01' });

    expect(service.executeMilestone).toHaveBeenCalledWith(operator, 'm1', new Date('2027-03-01'));
  });

  it('laisse le porteur prendre connaissance d’un palier avec son seul identifiant', async () => {
    await controller.acknowledgeMilestone(owner, 'm1');

    expect(service.acknowledgeMilestone).toHaveBeenCalledWith('u-owner', 'm1');
  });

  it('constate un dividende distribué pour le porteur', async () => {
    await controller.recordDividend(owner, 'p1', {
      distributedCents: 1_000_000,
      occurredOn: '2031-12-31',
      note: 'Exercice 2031',
    });

    expect(service.recordDistributedDividend).toHaveBeenCalledWith('u-owner', 'p1', {
      distributedCents: 1_000_000,
      occurredOn: new Date('2031-12-31'),
      note: 'Exercice 2031',
    });
  });

  it('règle un droit côté IGNITUX', async () => {
    await controller.settleDividendRight(operator, 'd1', { settledOn: '2032-01-15' });

    expect(service.settleDividendRight).toHaveBeenCalledWith(operator, 'd1', new Date('2032-01-15'));
  });
});
