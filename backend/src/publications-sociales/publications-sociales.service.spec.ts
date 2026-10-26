import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { chiffrer, dechiffrer } from '../boutique-en-ligne/chiffrement.js';
import { ClaudeService } from '../igini/claude/claude.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { accesOuvert } from './acces.js';
import { PublicationsSocialesService } from './publications-sociales.service.js';
import * as reseaux from './reseaux-sociaux.providers.js';

// Aucun appel réseau dans ces tests : chaque échange avec Instagram ou
// TikTok est remplacé, et l'on vérifie ce qu'Ignitux en fait.
vi.mock('./reseaux-sociaux.providers.js', () => ({
  echangerCode: vi.fn(),
  estConfiguree: vi.fn().mockReturnValue(true),
  etatConteneurInstagram: vi.fn(),
  optionsCreateurTikTok: vi.fn(),
  publier: vi.fn(),
  publierConteneurInstagram: vi.fn(),
  renouvelerInstagram: vi.fn(),
  renouvelerTikTok: vi.fn(),
  revoquerTikTok: vi.fn(),
  urlAutorisation: vi.fn().mockReturnValue('https://exemple.invalid/autoriser'),
  verifierEtatTikTok: vi.fn(),
  verifyState: vi.fn(),
}));

type Mock = ReturnType<typeof vi.fn>;
const m = <T>(fn: T) => fn as unknown as Mock;

const OPERATEUR = { id: 'u1', email: 'helder@ignitux.com' };
const AUTRE = { id: 'u2', email: 'quelqu.un@exemple.fr' };
const DANS_UNE_HEURE = () => new Date(Date.now() + 3600_000);
const DANS_UN_MOIS = () => new Date(Date.now() + 30 * 24 * 3600_000);

describe('PublicationsSocialesService', () => {
  let service: PublicationsSocialesService;
  let claude: { generateStructuredOutput: Mock };
  let prisma: {
    social_accounts: { findMany: Mock; findFirst: Mock; upsert: Mock; update: Mock };
    social_posts: {
      create: Mock;
      findMany: Mock;
      findFirst: Mock;
      findFirstOrThrow: Mock;
      updateMany: Mock;
      update: Mock;
      delete: Mock;
    };
  };
  const envAvant = { ...process.env };

  beforeEach(async () => {
    vi.clearAllMocks();
    m(reseaux.estConfiguree).mockReturnValue(true);
    process.env.IGNITUX_OPERATEURS = OPERATEUR.email;
    delete process.env.RESEAUX_SOCIAUX_POUR_TOUS;
    process.env.SECRETS_ENCRYPTION_KEY = 'a'.repeat(64);
    claude = {
      generateStructuredOutput: vi.fn().mockResolvedValue({ caption: 'Une proposition.' }),
    };
    prisma = {
      social_accounts: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      social_posts: {
        create: vi.fn().mockResolvedValue({ id: 'p1' }),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        findFirstOrThrow: vi.fn().mockResolvedValue({ id: 'p1', status: 'publishing' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'p1', ...data })),
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

  afterAll(() => {
    process.env = envAvant;
  });

  /** Un compte connecté, jetons chiffrés comme en base. */
  function compte(platform: 'instagram' | 'tiktok', surcharges: Record<string, unknown> = {}) {
    return {
      id: `c-${platform}`,
      owner_id: 'u1',
      platform,
      platform_account_id: '1789',
      access_token_chiffre: chiffrer('jeton-actuel'),
      token_expires_at: DANS_UN_MOIS(),
      refresh_token_chiffre: platform === 'tiktok' ? chiffrer('jeton-renouvellement') : null,
      refresh_expires_at: platform === 'tiktok' ? DANS_UN_MOIS() : null,
      disconnected_at: null,
      ...surcharges,
    };
  }

  describe('qui peut s’en servir', () => {
    it('est réservé aux opérateurs Ignitux, sauf ouverture explicite à tous', () => {
      expect(accesOuvert(OPERATEUR.email)).toBe(true);
      expect(accesOuvert(AUTRE.email)).toBe(false);
      process.env.RESEAUX_SOCIAUX_POUR_TOUS = 'true';
      expect(accesOuvert(AUTRE.email)).toBe(true);
    });

    it('refuse à une personne non autorisée de connecter, préparer, publier ou faire écrire IGINI', async () => {
      expect(() => service.demarrerConnexion(AUTRE, 'instagram')).toThrow(ForbiddenException);
      expect(() => service.genererSuggestion(AUTRE, 'instagram', 'Lancer Ignitux')).toThrow(
        ForbiddenException,
      );
      await expect(
        service.creer(AUTRE, {
          platform: 'instagram',
          caption: 'Texte',
          mediaUrl: 'https://cdn.ignitux.com/photo.jpg',
          mediaType: 'image',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.publier(AUTRE, 'p1')).rejects.toBeInstanceOf(ForbiddenException);
      // IGINI n'a rien coûté, rien n'a été lu ni écrit.
      expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
      expect(prisma.social_posts.create).not.toHaveBeenCalled();
      expect(prisma.social_posts.findFirst).not.toHaveBeenCalled();
    });

    it('dit à l’écran si c’est ouvert et ce qui est configuré', () => {
      m(reseaux.estConfiguree).mockImplementation((p: string) => p === 'instagram');
      expect(service.acces(AUTRE.email)).toEqual({ ouvert: false, instagram: true, tiktok: false });
    });
  });

  it('scoppe la liste des comptes et publications à la personne connectée', async () => {
    await service.comptes('u1');
    await service.liste('u1');
    expect(prisma.social_accounts.findMany.mock.calls[0][0].where).toEqual({
      owner_id: 'u1',
      disconnected_at: null,
    });
    expect(prisma.social_posts.findMany.mock.calls[0][0].where).toEqual({ owner_id: 'u1' });
  });

  it('attribue la suggestion de légende à la personne qui la demande', async () => {
    await expect(service.genererSuggestion(OPERATEUR, 'instagram', 'Lancer Ignitux')).resolves.toEqual({
      caption: 'Une proposition.',
    });
    expect(claude.generateStructuredOutput.mock.calls[0][0].usage).toEqual({
      userId: 'u1',
      projectId: null,
      generator: 'publier_reseaux',
    });
  });

  it('enregistre un brouillon TikTok sans le publier', async () => {
    await service.creer(OPERATEUR, {
      platform: 'tiktok',
      caption: '  Bonjour #Ignitux  ',
      mediaUrl: 'https://cdn.ignitux.com/photo.jpg',
      mediaType: 'image',
      privacyLevel: 'SELF_ONLY',
    });
    expect(prisma.social_posts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ owner_id: 'u1', caption: 'Bonjour #Ignitux', status: 'draft' }),
      }),
    );
  });

  it('accepte une vidéo Instagram (Reel) en brouillon', async () => {
    await service.creer(OPERATEUR, {
      platform: 'instagram',
      caption: 'Texte',
      mediaUrl: 'https://cdn.ignitux.com/video.mp4',
      mediaType: 'video',
    });
    expect(prisma.social_posts.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ media_type: 'video' }) }),
    );
  });

  it('refuse un média qui n’est pas à une adresse HTTPS publique', async () => {
    await expect(
      service.creer(OPERATEUR, {
        platform: 'instagram',
        caption: 'Texte',
        mediaUrl: 'https://media.example/photo.jpg',
        mediaType: 'image',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.social_posts.create).not.toHaveBeenCalled();
  });

  it('refuse le contenu de marque TikTok avec une visibilité privée', async () => {
    await expect(
      service.creer(OPERATEUR, {
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
    await expect(service.publier(OPERATEUR, 'p1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.social_accounts.findFirst).not.toHaveBeenCalled();
  });

  it('ne permet de publier que les brouillons et exige un compte connecté', async () => {
    prisma.social_posts.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1', platform: 'tiktok', status: 'published' });
    await expect(service.publier(OPERATEUR, 'p1', true)).rejects.toBeInstanceOf(ConflictException);

    prisma.social_posts.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1', platform: 'tiktok', status: 'draft' });
    prisma.social_accounts.findFirst.mockResolvedValue(null);
    await expect(service.publier(OPERATEUR, 'p1', true)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.social_posts.updateMany).not.toHaveBeenCalled();
  });

  describe('les connexions durent', () => {
    const brouillonTikTok = {
      id: 'p1',
      owner_id: 'u1',
      platform: 'tiktok',
      status: 'draft',
      media_type: 'video',
      caption: 'Texte',
      media_url: 'https://cdn.ignitux.com/video.mp4',
      privacy_level: 'PUBLIC_TO_EVERYONE',
      media_duration_seconds: 30,
    };

    it('renouvelle le jeton TikTok expiré (24 h) au lieu d’exiger une reconnexion', async () => {
      prisma.social_posts.findFirst.mockResolvedValue(brouillonTikTok);
      prisma.social_accounts.findFirst.mockResolvedValue(compte('tiktok', { token_expires_at: new Date(Date.now() - 1000) }));
      m(reseaux.renouvelerTikTok).mockResolvedValue({
        accessToken: 'jeton-neuf',
        expiresIn: 86400,
        refreshToken: 'renouvellement-neuf',
        refreshExpiresIn: 31_536_000,
      });
      m(reseaux.publier).mockResolvedValue({ id: 'pub-1', complete: false, conteneur: false });

      await service.publier(OPERATEUR, 'p1', true);

      expect(reseaux.renouvelerTikTok).toHaveBeenCalledWith('jeton-renouvellement');
      const enregistre = prisma.social_accounts.update.mock.calls[0][0].data;
      expect(dechiffrer(enregistre.access_token_chiffre)).toBe('jeton-neuf');
      expect(dechiffrer(enregistre.refresh_token_chiffre)).toBe('renouvellement-neuf');
      expect(m(reseaux.publier).mock.calls[0][5]).toBe('jeton-neuf');
    });

    it('demande de reconnecter TikTok quand le jeton de renouvellement a lui aussi expiré', async () => {
      prisma.social_posts.findFirst.mockResolvedValue(brouillonTikTok);
      prisma.social_accounts.findFirst.mockResolvedValue(
        compte('tiktok', { token_expires_at: new Date(Date.now() - 1000), refresh_expires_at: new Date(Date.now() - 1000) }),
      );
      await expect(service.publier(OPERATEUR, 'p1', true)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(reseaux.publier).not.toHaveBeenCalled();
      expect(prisma.social_posts.updateMany).not.toHaveBeenCalled();
    });

    it('prolonge le jeton Instagram quand il lui reste moins d’une semaine', async () => {
      prisma.social_posts.findFirst.mockResolvedValue({ ...brouillonTikTok, platform: 'instagram', media_type: 'image', privacy_level: null });
      prisma.social_accounts.findFirst.mockResolvedValue(compte('instagram', { token_expires_at: new Date(Date.now() + 2 * 24 * 3600_000) }));
      m(reseaux.renouvelerInstagram).mockResolvedValue({ accessToken: 'ig-neuf', expiresIn: 5_184_000 });
      m(reseaux.publier).mockResolvedValue({ id: 'media-1', complete: true, conteneur: false });

      await service.publier(OPERATEUR, 'p1');

      expect(reseaux.renouvelerInstagram).toHaveBeenCalledWith('jeton-actuel');
      expect(m(reseaux.publier).mock.calls[0][5]).toBe('ig-neuf');
    });
  });

  describe('les vidéos Instagram (Reels)', () => {
    const brouillonReel = {
      id: 'p1',
      owner_id: 'u1',
      platform: 'instagram',
      status: 'draft',
      media_type: 'video',
      caption: 'Texte',
      media_url: 'https://cdn.ignitux.com/video.mp4',
      privacy_level: null,
    };

    it('garde le conteneur préparé par Meta et laisse la publication en cours', async () => {
      prisma.social_posts.findFirst.mockResolvedValue(brouillonReel);
      prisma.social_accounts.findFirst.mockResolvedValue(compte('instagram'));
      m(reseaux.publier).mockResolvedValue({ id: 'conteneur-1', complete: false, conteneur: true });

      const post = await service.publier(OPERATEUR, 'p1');

      expect(post).toMatchObject({ status: 'publishing', media_container_id: 'conteneur-1' });
      expect(prisma.social_posts.update.mock.calls.at(-1)![0].data.platform_post_id).toBeUndefined();
    });

    it('publie le Reel quand la vidéo est prête, et une seule fois', async () => {
      prisma.social_posts.findFirst.mockResolvedValue({ ...brouillonReel, status: 'publishing', media_container_id: 'conteneur-1' });
      prisma.social_accounts.findFirst.mockResolvedValue(compte('instagram'));
      m(reseaux.etatConteneurInstagram).mockResolvedValue('FINISHED');
      m(reseaux.publierConteneurInstagram).mockResolvedValue('media-42');

      const post = await service.verifierStatut('u1', 'p1');

      expect(post).toMatchObject({ status: 'published', platform_post_id: 'media-42' });
      expect(prisma.social_posts.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: 'p1', status: 'publishing' },
        data: { status: 'finalizing' },
      });

      // Une seconde vérification arrivée en même temps ne republie pas.
      vi.clearAllMocks();
      prisma.social_posts.updateMany.mockResolvedValue({ count: 0 });
      m(reseaux.etatConteneurInstagram).mockResolvedValue('FINISHED');
      await service.verifierStatut('u1', 'p1');
      expect(reseaux.publierConteneurInstagram).not.toHaveBeenCalled();
    });

    it('attend tant que Meta prépare la vidéo', async () => {
      prisma.social_posts.findFirst.mockResolvedValue({ ...brouillonReel, status: 'publishing', media_container_id: 'conteneur-1' });
      prisma.social_accounts.findFirst.mockResolvedValue(compte('instagram'));
      m(reseaux.etatConteneurInstagram).mockResolvedValue('IN_PROGRESS');

      await service.verifierStatut('u1', 'p1');

      expect(prisma.social_posts.updateMany).not.toHaveBeenCalled();
      expect(reseaux.publierConteneurInstagram).not.toHaveBeenCalled();
    });

    it('signale l’échec quand Meta n’a pas pu traiter la vidéo', async () => {
      prisma.social_posts.findFirst.mockResolvedValue({ ...brouillonReel, status: 'publishing', media_container_id: 'conteneur-1' });
      prisma.social_accounts.findFirst.mockResolvedValue(compte('instagram'));
      m(reseaux.etatConteneurInstagram).mockResolvedValue('ERROR');

      const post = await service.verifierStatut('u1', 'p1');

      expect(post).toMatchObject({ status: 'failed' });
      expect(reseaux.publierConteneurInstagram).not.toHaveBeenCalled();
    });
  });

  describe('déconnecter', () => {
    it('efface les jetons et prévient TikTok, même si TikTok ne répond pas', async () => {
      prisma.social_accounts.findFirst.mockResolvedValue(compte('tiktok'));
      m(reseaux.revoquerTikTok).mockRejectedValue(new Error('TikTok indisponible'));

      await service.deconnecter('u1', 'tiktok');

      expect(reseaux.revoquerTikTok).toHaveBeenCalledWith('jeton-actuel');
      expect(prisma.social_accounts.update.mock.calls[0][0].data).toMatchObject({
        access_token_chiffre: null,
        refresh_token_chiffre: null,
        token_expires_at: null,
        refresh_expires_at: null,
      });
    });

    it('n’appelle aucune révocation pour Instagram, mais efface aussi le jeton', async () => {
      prisma.social_accounts.findFirst.mockResolvedValue(compte('instagram'));
      await service.deconnecter('u1', 'instagram');
      expect(reseaux.revoquerTikTok).not.toHaveBeenCalled();
      expect(prisma.social_accounts.update.mock.calls[0][0].data.access_token_chiffre).toBeNull();
    });
  });
});
