import { isIP } from 'node:net';
import { z } from 'zod';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { chiffrer, dechiffrer } from '../boutique-en-ligne/chiffrement.js';
import { ClaudeService } from '../igini/claude/claude.service.js';
import { buildSystemPrompt } from '../igini/claude/igini-identity.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  echangerCode,
  optionsCreateurTikTok,
  publier,
  urlAutorisation,
  verifierEtatTikTok,
  verifyState,
  type Plateforme,
  type TypeMedia,
} from './reseaux-sociaux.providers.js';

@Injectable()
export class PublicationsSocialesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
  ) {}

  genererSuggestion(ownerId: string, platform: Plateforme, brief: string) {
    const schema = z.object({ caption: z.string().min(1).max(2200) });
    return this.claude.generateStructuredOutput({
      schema,
      system: buildSystemPrompt(
        'Tu aides à préparer une publication organique pour un réseau social. Rédige une seule légende claire, naturelle et prête à relire. ' +
          'N’invente aucun fait, chiffre, prix, résultat, offre ou caractéristique qui ne figure pas dans la demande. ' +
          'Les hashtags restent sobres et pertinents. La personne validera elle-même le texte avant tout envoi.',
      ),
      userContent: `Réseau : ${platform === 'instagram' ? 'Instagram' : 'TikTok'}\nIdée et consignes : ${brief.trim()}`,
      logContext: 'Échec de la préparation d’une publication sociale via IGINI',
      userErrorMessage:
        'IGINI n’a pas pu préparer cette légende. Vous pouvez toujours la rédiger vous-même.',
      usage: { userId: ownerId, projectId: null, generator: 'publier_reseaux' },
    });
  }

  comptes(ownerId: string) {
    return this.prisma.social_accounts.findMany({
      where: { owner_id: ownerId, disconnected_at: null },
      select: {
        id: true,
        platform: true,
        username: true,
        connected_at: true,
        token_expires_at: true,
      },
      orderBy: { platform: 'asc' },
    });
  }

  demarrerConnexion(ownerId: string, platform: Plateforme) {
    if (
      !/^[0-9a-fA-F]{64}$/.test(
        process.env.SECRETS_ENCRYPTION_KEY?.trim() ?? '',
      )
    ) {
      throw new ServiceUnavailableException(
        'La clé de chiffrement des jetons sociaux doit être configurée avant de connecter un compte.',
      );
    }
    return { url: urlAutorisation(platform, ownerId) };
  }

  async finaliserConnexion(platform: Plateforme, code: string, state: string) {
    const ownerId = verifyState(state, platform);
    const token = await echangerCode(platform, code);
    await this.prisma.social_accounts.upsert({
      where: { owner_id_platform: { owner_id: ownerId, platform } },
      create: {
        owner_id: ownerId,
        platform,
        platform_account_id: token.accountId,
        username: token.username || null,
        access_token_chiffre: chiffrer(token.accessToken),
        token_expires_at: new Date(Date.now() + token.expiresIn * 1000),
        disconnected_at: null,
      },
      update: {
        platform_account_id: token.accountId,
        username: token.username || null,
        access_token_chiffre: chiffrer(token.accessToken),
        token_expires_at: new Date(Date.now() + token.expiresIn * 1000),
        connected_at: new Date(),
        disconnected_at: null,
      },
    });
    return ownerId;
  }

  async deconnecter(ownerId: string, platform: Plateforme) {
    const account = await this.prisma.social_accounts.findFirst({
      where: { owner_id: ownerId, platform, disconnected_at: null },
    });
    if (!account)
      throw new NotFoundException(
        'Aucun compte connecté pour cette plateforme.',
      );
    await this.prisma.social_accounts.update({
      where: { id: account.id },
      data: { disconnected_at: new Date() },
    });
  }

  async optionsTikTok(ownerId: string) {
    const account = await this.prisma.social_accounts.findFirst({
      where: { owner_id: ownerId, platform: 'tiktok', disconnected_at: null },
    });
    if (!account)
      throw new ServiceUnavailableException(
        'Connectez d’abord votre compte TikTok à Ignitux.',
      );
    if (
      account.token_expires_at &&
      account.token_expires_at.getTime() < Date.now() + 60_000
    ) {
      throw new ServiceUnavailableException(
        'La connexion TikTok a expiré. Reconnectez le compte.',
      );
    }
    return optionsCreateurTikTok(dechiffrer(account.access_token_chiffre));
  }

  async creer(
    ownerId: string,
    input: {
      platform: Plateforme;
      caption: string;
      mediaUrl: string;
      mediaType: TypeMedia;
      privacyLevel?: string;
      allowComments?: boolean;
      allowDuet?: boolean;
      allowStitch?: boolean;
      brandOrganic?: boolean;
      brandContent?: boolean;
      mediaDurationSeconds?: number;
    },
  ) {
    this.validerMedia(input.platform, input.mediaType, input.mediaUrl);
    if (input.platform === 'tiktok' && !input.privacyLevel)
      throw new BadRequestException(
        'Choisissez la visibilité TikTok de cette publication.',
      );
    if (
      input.platform === 'tiktok' &&
      input.brandContent &&
      input.privacyLevel === 'SELF_ONLY'
    )
      throw new BadRequestException(
        'Un contenu de marque ne peut pas être publié avec la visibilité « Moi uniquement ».',
      );
    if (
      input.platform === 'tiktok' &&
      input.mediaType === 'video' &&
      !input.mediaDurationSeconds
    )
      throw new BadRequestException(
        'La durée de la vidéo est requise pour vérifier les limites TikTok.',
      );
    if (input.platform === 'instagram' && input.privacyLevel)
      throw new BadRequestException(
        'La visibilité TikTok ne s’applique pas à Instagram.',
      );
    return this.prisma.social_posts.create({
      data: {
        owner_id: ownerId,
        platform: input.platform,
        caption: input.caption.trim(),
        media_url: input.mediaUrl,
        media_type: input.mediaType,
        media_duration_seconds: input.mediaDurationSeconds ?? null,
        privacy_level: input.privacyLevel ?? null,
        allow_comments: input.allowComments ?? false,
        allow_duet: input.allowDuet ?? false,
        allow_stitch: input.allowStitch ?? false,
        brand_organic: input.brandOrganic ?? false,
        brand_content: input.brandContent ?? false,
        music_consent_at: null,
        status: 'draft',
      },
    });
  }

  liste(ownerId: string) {
    return this.prisma.social_posts.findMany({
      where: { owner_id: ownerId },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
  }

  async supprimer(ownerId: string, id: string) {
    const post = await this.prisma.social_posts.findFirst({
      where: { id, owner_id: ownerId },
    });
    if (!post) throw new NotFoundException('Publication introuvable.');
    if (post.status === 'publishing' || post.status === 'published')
      throw new ConflictException(
        'Une publication envoyée ou en cours ne peut pas être supprimée.',
      );
    await this.prisma.social_posts.delete({ where: { id } });
  }

  async publier(ownerId: string, id: string, musicConsent = false) {
    const post = await this.prisma.social_posts.findFirst({
      where: { id, owner_id: ownerId },
    });
    if (!post) throw new NotFoundException('Publication introuvable.');
    if (post.status !== 'draft')
      throw new ConflictException(
        'Seul un brouillon peut être publié. Créez un nouveau brouillon après avoir vérifié l’état de la publication.',
      );
    if (post.platform === 'tiktok' && !musicConsent)
      throw new BadRequestException(
        'Confirmez les règles d’utilisation de la musique TikTok avant de publier.',
      );
    if (
      post.platform === 'tiktok' &&
      post.brand_content &&
      post.privacy_level === 'SELF_ONLY'
    )
      throw new BadRequestException(
        'Un contenu de marque ne peut pas être publié avec la visibilité « Moi uniquement ».',
      );
    const account = await this.prisma.social_accounts.findFirst({
      where: {
        owner_id: ownerId,
        platform: post.platform,
        disconnected_at: null,
      },
    });
    if (!account)
      throw new ServiceUnavailableException(
        `Connectez d’abord votre compte ${post.platform} à Ignitux.`,
      );
    if (
      account.token_expires_at &&
      account.token_expires_at.getTime() < Date.now() + 60_000
    ) {
      throw new ServiceUnavailableException(
        `La connexion ${post.platform} a expiré. Reconnectez le compte avant de publier.`,
      );
    }
    const claim = await this.prisma.social_posts.updateMany({
      where: { id, owner_id: ownerId, status: 'draft' },
      data: {
        status: 'publishing',
        error: null,
        ...(post.platform === 'tiktok' ? { music_consent_at: new Date() } : {}),
      },
    });
    if (claim.count !== 1)
      throw new ConflictException(
        'Cette publication a déjà été prise en charge. Actualisez la page avant de continuer.',
      );
    try {
      const result = await publier(
        post.platform as Plateforme,
        account.platform_account_id,
        post.media_type as TypeMedia,
        post.caption,
        post.media_url,
        dechiffrer(account.access_token_chiffre),
        {
          privacyLevel: post.privacy_level ?? undefined,
          allowComments: post.allow_comments,
          allowDuet: post.allow_duet,
          allowStitch: post.allow_stitch,
          brandOrganic: post.brand_organic,
          brandContent: post.brand_content,
          mediaDurationSeconds: post.media_duration_seconds ?? undefined,
        },
      );
      return await this.prisma.social_posts.update({
        where: { id },
        data: {
          status: result.complete ? 'published' : 'publishing',
          platform_post_id: result.id,
          published_at: result.complete ? new Date() : null,
          error: null,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Erreur inconnue du réseau social.';
      await this.prisma.social_posts.update({
        where: { id },
        data: { status: 'failed', error: message.slice(0, 500) },
      });
      throw error;
    }
  }

  async verifierStatut(ownerId: string, id: string) {
    const post = await this.prisma.social_posts.findFirst({
      where: { id, owner_id: ownerId },
    });
    if (!post) throw new NotFoundException('Publication introuvable.');
    if (
      post.status !== 'publishing' ||
      post.platform !== 'tiktok' ||
      !post.platform_post_id
    )
      return post;
    const account = await this.prisma.social_accounts.findFirst({
      where: { owner_id: ownerId, platform: 'tiktok', disconnected_at: null },
    });
    if (!account)
      throw new ServiceUnavailableException(
        'Reconnectez TikTok pour vérifier l’état de cette publication.',
      );
    const result = await verifierEtatTikTok(
      dechiffrer(account.access_token_chiffre),
      post.platform_post_id,
    );
    if (result.status === 'PUBLISH_COMPLETE') {
      return this.prisma.social_posts.update({
        where: { id },
        data: { status: 'published', published_at: new Date(), error: null },
      });
    }
    if (result.status === 'FAILED') {
      return this.prisma.social_posts.update({
        where: { id },
        data: {
          status: 'failed',
          error: (result.error || 'TikTok a signalé un échec.').slice(0, 500),
        },
      });
    }
    return post;
  }

  private validerMedia(
    platform: Plateforme,
    type: TypeMedia,
    mediaUrl: string,
  ) {
    let url: URL;
    try {
      url = new URL(mediaUrl);
    } catch {
      throw new BadRequestException('Adresse du média invalide.');
    }
    const hote = url.hostname.toLowerCase();
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !hote.includes('.') ||
      isIP(hote) !== 0 ||
      /\.(localhost|local|internal|test|example|invalid)$/.test(hote)
    ) {
      throw new BadRequestException(
        'Le média doit utiliser une adresse HTTPS publique, sans identifiants dans l’adresse.',
      );
    }
    if (platform === 'instagram' && type === 'video')
      throw new BadRequestException(
        'La publication vidéo Instagram n’est pas encore disponible. Choisissez Instagram image.',
      );
  }
}
