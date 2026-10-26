import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClaudeService } from '../igini/claude/claude.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PublicationsSocialesService } from './publications-sociales.service.js';

type Mock = ReturnType<typeof vi.fn>;

describe('PublicationsSocialesService', () => {
  let service: PublicationsSocialesService;
  let claude: { generateStructuredOutput: Mock };
  let prisma: {
    social_accounts: {
      findMany: Mock;
      findFirst: Mock;
      upsert: Mock;
      update: Mock;
    };
    social_posts: {
      create: Mock;
      findMany: Mock;
      findFirst: Mock;
      updateMany: Mock;
      update: Mock;
      delete: Mock;
    };
  };

  beforeEach(async () => {
    claude = {
      generateStructuredOutput: vi
        .fn()
        .mockResolvedValue({ caption: 'Une proposition.' }),
    };
    prisma = {
      social_accounts: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      social_posts: {
        create: vi.fn().mockResolvedValue({ id: 'p1' }),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicationsSocialesService,
        { provide: PrismaService, useValue: prisma },
        { provide: ClaudeService, useValue: claude },
      ],
    }).compile();
    service = module.get(PublicationsSocialesService);
  });

  it('scoppe la liste des comptes et publications à la personne connectée', async () => {
    await service.comptes('u1');
    await service.liste('u1');
    expect(prisma.social_accounts.findMany.mock.calls[0][0].where).toEqual({
      owner_id: 'u1',
      disconnected_at: null,
    });
    expect(prisma.social_posts.findMany.mock.calls[0][0].where).toEqual({
      owner_id: 'u1',
    });
  });

  it('attribue la suggestion de légende à la personne qui la demande', async () => {
    await expect(
      service.genererSuggestion('u1', 'instagram', 'Lancer Ignitux'),
    ).resolves.toEqual({ caption: 'Une proposition.' });
    expect(claude.generateStructuredOutput.mock.calls[0][0].usage).toEqual({
      userId: 'u1',
      projectId: null,
      generator: 'publier_reseaux',
    });
  });

  it('enregistre un brouillon TikTok sans le publier', async () => {
    await service.creer('u1', {
      platform: 'tiktok',
      caption: '  Bonjour #Ignitux  ',
      mediaUrl: 'https://cdn.ignitux.com/photo.jpg',
      mediaType: 'image',
      privacyLevel: 'SELF_ONLY',
    });
    expect(prisma.social_posts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          owner_id: 'u1',
          caption: 'Bonjour #Ignitux',
          status: 'draft',
        }),
      }),
    );
  });

  it('refuse la vidéo Instagram avant tout enregistrement', async () => {
    await expect(
      service.creer('u1', {
        platform: 'instagram',
        caption: 'Texte',
        mediaUrl: 'https://media.example/video.mp4',
        mediaType: 'video',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.social_posts.create).not.toHaveBeenCalled();
  });

  it('refuse le contenu de marque TikTok avec une visibilité privée', async () => {
    await expect(
      service.creer('u1', {
        platform: 'tiktok',
        caption: 'Texte',
        mediaUrl: 'https://cdn.ignitux.com/photo.jpg',
        mediaType: 'image',
        privacyLevel: 'SELF_ONLY',
        brandContent: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.social_posts.create).not.toHaveBeenCalled();
  });

  it('ne retrouve jamais une publication appartenant à une autre personne', async () => {
    prisma.social_posts.findFirst.mockResolvedValue(null);
    await expect(service.publier('u2', 'p1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.social_accounts.findFirst).not.toHaveBeenCalled();
  });

  it('ne permet de publier que les brouillons et exige un compte connecté', async () => {
    prisma.social_posts.findFirst.mockResolvedValue({
      id: 'p1',
      owner_id: 'u1',
      platform: 'tiktok',
      status: 'published',
    });
    await expect(service.publier('u1', 'p1', true)).rejects.toBeInstanceOf(
      ConflictException,
    );

    prisma.social_posts.findFirst.mockResolvedValue({
      id: 'p1',
      owner_id: 'u1',
      platform: 'tiktok',
      status: 'draft',
    });
    prisma.social_accounts.findFirst.mockResolvedValue(null);
    await expect(service.publier('u1', 'p1', true)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.social_posts.updateMany).not.toHaveBeenCalled();
  });
});
