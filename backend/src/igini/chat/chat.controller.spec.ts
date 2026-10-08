import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: { sendMessage: ReturnType<typeof vi.fn>; history: ReturnType<typeof vi.fn> };
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    chatService = { sendMessage: vi.fn(), history: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: ChatService, useValue: chatService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ChatController>(ChatController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it("send délègue au service avec l'utilisateur courant", async () => {
    chatService.sendMessage.mockResolvedValue({ id: 'm2', role: 'igini', content: 'ok' });

    const result = await controller.send(currentUser, { content: 'Salut' });

    expect(chatService.sendMessage).toHaveBeenCalledWith('u1', 'Salut');
    expect(result).toEqual({ id: 'm2', role: 'igini', content: 'ok' });
  });

  it('history délègue au service avec la limite fournie', async () => {
    chatService.history.mockResolvedValue([{ id: 'm1' }]);

    const result = await controller.history(currentUser, '10');

    expect(chatService.history).toHaveBeenCalledWith('u1', 10);
    expect(result).toEqual([{ id: 'm1' }]);
  });

  it('history retombe sur la limite par défaut si le paramètre est invalide', async () => {
    chatService.history.mockResolvedValue([]);

    await controller.history(currentUser, 'abc');

    expect(chatService.history).toHaveBeenCalledWith('u1', undefined);
  });

  it("history retombe sur la limite par défaut si aucun paramètre n'est fourni", async () => {
    chatService.history.mockResolvedValue([]);

    await controller.history(currentUser, undefined);

    expect(chatService.history).toHaveBeenCalledWith('u1', undefined);
  });
});
