import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ClaudeService } from '../claude/claude.service.js';
import { IginiToolsService } from './igini-tools.service.js';
import { CHAT_HISTORY_WINDOW, ChatService } from './chat.service.js';

describe('ChatService', () => {
  let service: ChatService;
  let prisma: {
    chat_messages: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let claude: { converseWithTools: ReturnType<typeof vi.fn> };
  let iginiTools: { execute: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = { chat_messages: { create: vi.fn(), findMany: vi.fn() } };
    claude = { converseWithTools: vi.fn() };
    iginiTools = { execute: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: ClaudeService, useValue: claude },
        { provide: IginiToolsService, useValue: iginiTools },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  describe('sendMessage', () => {
    it('persiste le message utilisateur avant d’appeler Claude, puis persiste la réponse finale', async () => {
      prisma.chat_messages.findMany.mockResolvedValue([]);
      prisma.chat_messages.create
        .mockResolvedValueOnce({ id: 'm1', role: 'user', content: 'Salut' })
        .mockResolvedValueOnce({ id: 'm2', role: 'igini', content: 'Bonjour !' });
      claude.converseWithTools.mockResolvedValue('Bonjour !');

      const result = await service.sendMessage('u1', 'Salut');

      expect(prisma.chat_messages.create).toHaveBeenNthCalledWith(1, {
        data: { user_id: 'u1', role: 'user', content: 'Salut' },
      });
      expect(prisma.chat_messages.create).toHaveBeenNthCalledWith(2, {
        data: { user_id: 'u1', role: 'igini', content: 'Bonjour !' },
      });
      expect(result).toEqual({ id: 'm2', role: 'igini', content: 'Bonjour !' });
    });

    it('envoie la fenêtre des messages précédents, du plus ancien au plus récent, plus le nouveau message', async () => {
      prisma.chat_messages.findMany.mockResolvedValue([
        { role: 'igini', content: 'Réponse récente' },
        { role: 'user', content: 'Question récente' },
      ]);
      prisma.chat_messages.create.mockResolvedValue({ id: 'm2', role: 'igini', content: 'Suite' });
      claude.converseWithTools.mockResolvedValue('Suite');

      await service.sendMessage('u1', 'Nouvelle question');

      expect(claude.converseWithTools).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'Question récente' },
            { role: 'assistant', content: 'Réponse récente' },
            { role: 'user', content: 'Nouvelle question' },
          ],
        }),
      );
    });

    it("attribue l'appel au chat, sans projet, avec les 7 outils, et relie l'exécuteur à IginiToolsService", async () => {
      prisma.chat_messages.findMany.mockResolvedValue([]);
      prisma.chat_messages.create.mockResolvedValue({ id: 'm2', role: 'igini', content: 'ok' });
      claude.converseWithTools.mockResolvedValue('ok');

      await service.sendMessage('u1', 'Salut');

      const appel = claude.converseWithTools.mock.calls[0][0];
      expect(appel.usage).toEqual({ userId: 'u1', projectId: null, generator: 'discuter' });
      expect(appel.tools.map((t: { name: string }) => t.name).sort()).toEqual(
        ['analyser', 'construire', 'developper', 'financer', 'lister_projets', 'rappeler_souvenirs', 'transmettre'].sort(),
      );

      iginiTools.execute.mockResolvedValue({ content: '[]', isError: false });
      await appel.executeTool('lister_projets', {});
      expect(iginiTools.execute).toHaveBeenCalledWith('lister_projets', {}, { userId: 'u1' });
    });

    it("limite la fenêtre au nombre de messages configuré", async () => {
      prisma.chat_messages.findMany.mockResolvedValue([]);
      prisma.chat_messages.create.mockResolvedValue({ id: 'm2', role: 'igini', content: 'ok' });
      claude.converseWithTools.mockResolvedValue('ok');

      await service.sendMessage('u1', 'Salut');

      expect(prisma.chat_messages.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { user_id: 'u1' }, take: CHAT_HISTORY_WINDOW }),
      );
    });
  });

  describe('history', () => {
    it('renvoie les messages du plus ancien au plus récent', async () => {
      prisma.chat_messages.findMany.mockResolvedValue([
        { id: 'm2', role: 'igini', content: 'Récent' },
        { id: 'm1', role: 'user', content: 'Ancien' },
      ]);

      const result = await service.history('u1');

      expect(result).toEqual([
        { id: 'm1', role: 'user', content: 'Ancien' },
        { id: 'm2', role: 'igini', content: 'Récent' },
      ]);
    });
  });
});
