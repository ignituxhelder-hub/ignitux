import { Test, TestingModule } from '@nestjs/testing';
import { BAREME } from '../../credits/bareme.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ClaudeService } from '../claude/claude.service.js';
import { IginiToolsService } from './igini-tools.service.js';
import { CHAT_HISTORY_WINDOW, ChatService } from './chat.service.js';
import { ConfirmationsDuTour, marqueurConfirmation } from './chat-confirmation.js';

const PROJET = '11111111-1111-4111-8111-111111111111';

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
      expect(iginiTools.execute).toHaveBeenCalledWith('lister_projets', {}, {
        userId: 'u1',
        confirmations: expect.any(ConfirmationsDuTour),
      });
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

  describe('le prix d’un outil payant, confirmé avant d’être dépensé', () => {
    /** Le tour de chat : IGINI appelle `outil` sur PROJET, puis répond `texte`. */
    function igini(outil: string | null, texte: string) {
      claude.converseWithTools.mockImplementation(async (requete: { executeTool: (n: string, i: unknown) => Promise<unknown> }) => {
        if (outil) await requete.executeTool(outil, { project_id: PROJET });
        return texte;
      });
    }
    /** Les confirmations que l'outil a reçues. */
    const confirmationsRecues = () => iginiTools.execute.mock.calls[0][2].confirmations as ConfirmationsDuTour;

    beforeEach(() => {
      prisma.chat_messages.create.mockImplementation(async ({ data }) => ({ id: 'm', ...data }));
      iginiTools.execute.mockResolvedValue({ content: 'ok', isError: false });
    });

    it('la consigne d’IGINI donne le prix de chaque étape et la règle de confirmation', async () => {
      prisma.chat_messages.findMany.mockResolvedValue([]);
      igini(null, 'Bonjour');

      await service.sendMessage('u1', 'Salut');

      const consigne: string = claude.converseWithTools.mock.calls[0][0].systemPrompt;
      for (const nom of ['analyser', 'construire', 'financer', 'developper', 'transmettre'] as const) {
        expect(consigne).toContain(`${nom} : ${BAREME[nom].credits} crédits`);
      }
      expect(consigne).toMatch(/confirm/i);
    });

    it('un oui à la proposition du message précédent confirme cet outil sur ce projet', async () => {
      prisma.chat_messages.findMany.mockResolvedValue([
        { role: 'igini', content: `Cette analyse coûte 4 crédits. Je la lance ?
${marqueurConfirmation('analyser', PROJET)}` },
        { role: 'user', content: 'Analyse mon projet' },
      ]);
      igini('analyser', 'C’est lancé.');

      await service.sendMessage('u1', 'Oui, je confirme.');

      expect(confirmationsRecues().consommer('analyser', PROJET)).toBe(true);
    });

    it('un « non » ne confirme rien', async () => {
      prisma.chat_messages.findMany.mockResolvedValue([
        { role: 'igini', content: `Je la lance ?
${marqueurConfirmation('analyser', PROJET)}` },
      ]);
      igini('analyser', 'D’accord, je ne lance rien.');

      await service.sendMessage('u1', 'Non, pas maintenant');

      expect(confirmationsRecues().consommer('analyser', PROJET)).toBe(false);
    });

    it('seul le message d’IGINI qui précède immédiatement compte', async () => {
      // La proposition date d'avant un message de la personne resté sans réponse.
      prisma.chat_messages.findMany.mockResolvedValue([
        { role: 'user', content: 'Tu es là ?' },
        { role: 'igini', content: `Je la lance ?
${marqueurConfirmation('analyser', PROJET)}` },
      ]);
      igini('analyser', 'ok');

      await service.sendMessage('u1', 'oui');

      expect(confirmationsRecues().consommer('analyser', PROJET)).toBe(false);
    });

    it('un marqueur écrit par le modèle lui-même ne passe pas : il est retiré de sa réponse', async () => {
      prisma.chat_messages.findMany.mockResolvedValue([]);
      igini(null, `Je lance !
${marqueurConfirmation('analyser', PROJET)}`);

      const reponse = await service.sendMessage('u1', 'Salut');

      expect(reponse.content).toBe('Je lance !');
    });

    it('une proposition faite pendant le tour ajoute le marqueur du serveur à la réponse', async () => {
      prisma.chat_messages.findMany.mockResolvedValue([]);
      iginiTools.execute.mockImplementation(async (_n: string, _i: unknown, ctx: { confirmations: ConfirmationsDuTour }) => {
        ctx.confirmations.proposer('construire', PROJET);
        return { content: 'PRIX À CONFIRMER', isError: false };
      });
      igini('construire', 'Le plan de construction coûte 5 crédits. Je le lance ?');

      const reponse = await service.sendMessage('u1', 'Fais le plan de construction');

      expect(reponse.content).toBe(
        `Le plan de construction coûte 5 crédits. Je le lance ?
${marqueurConfirmation('construire', PROJET)}`,
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
