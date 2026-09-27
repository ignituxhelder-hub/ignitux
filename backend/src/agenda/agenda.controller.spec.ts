import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AgendaController } from './agenda.controller.js';
import { AgendaService } from './agenda.service.js';

describe('AgendaController', () => {
  let controller: AgendaController;
  let agendaService: Record<string, ReturnType<typeof vi.fn>>;
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    agendaService = {
      createEvent: vi.fn().mockResolvedValue({}),
      list: vi.fn().mockResolvedValue([]),
      updateEvent: vi.fn().mockResolvedValue({}),
      deleteEvent: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgendaController],
      providers: [{ provide: AgendaService, useValue: agendaService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AgendaController>(AgendaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('createEvent convertit la date fournie', async () => {
    await controller.createEvent(currentUser, {
      title: 'Réunion',
      occurredAt: '2026-10-05T09:00:00.000Z',
    });

    expect(agendaService.createEvent).toHaveBeenCalledWith('u1', {
      projectId: undefined,
      contactId: undefined,
      title: 'Réunion',
      location: undefined,
      note: undefined,
      occurredAt: new Date('2026-10-05T09:00:00.000Z'),
    });
  });

  it('list transmet la fenêtre de dates fournie', async () => {
    await controller.list(currentUser, '2026-10-01', '2026-10-31');

    expect(agendaService.list).toHaveBeenCalledWith('u1', {
      depuis: new Date('2026-10-01'),
      jusqua: new Date('2026-10-31'),
    });
  });

  it('list fonctionne sans fenêtre de dates', async () => {
    await controller.list(currentUser);

    expect(agendaService.list).toHaveBeenCalledWith('u1', { depuis: undefined, jusqua: undefined });
  });

  it('les autres routes délèguent directement au service', async () => {
    await controller.updateEvent(currentUser, 'e1', { title: 'Nouveau titre' });
    await controller.deleteEvent(currentUser, 'e1');

    expect(agendaService.updateEvent).toHaveBeenCalledWith('u1', 'e1', {
      projectId: undefined,
      contactId: undefined,
      title: 'Nouveau titre',
      location: undefined,
      note: undefined,
      occurredAt: undefined,
    });
    expect(agendaService.deleteEvent).toHaveBeenCalledWith('u1', 'e1');
  });
});
