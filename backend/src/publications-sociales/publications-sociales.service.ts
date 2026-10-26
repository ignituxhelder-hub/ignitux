import { isIP } from 'node:net';
import { z } from 'zod';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { chiffrer, dechiffrer } from '../boutique-en-ligne/chiffrement.js';
import type { social_accounts } from '../generated/prisma/client.js';
import { ClaudeService } from '../igini/claude/claude.service.js';
import { buildSystemPrompt } from '../igini/claude/igini-identity.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { accesOuvert } from './acces.js';
import {
  echangerCode,
  estConfiguree,
  etatConteneurInstagram,
  optionsCreateurTikTok,
  publier,
  publierConteneurInstagram,
  renouvelerInstagram,
  renouvelerTikTok,
  revoquerTikTok,
  urlAutorisation,
  verifierEtatTikTok,
  verifyState,
  type Plateforme,
  type TypeMedia,
} from './reseaux-sociaux.providers.js';

/** Instagram : on prolonge le jeton quand il lui reste moins d'une semaine. */
const MARGE_RENOUVELLEMENT_INSTAGRAM_MS = 7 * 24 * 3600_000;
/** TikTok : le jeton vit 24 h, on le renouvelle dès qu'il lui reste moins de 5 minutes. */
const MARGE_RENOUVELLEMENT_TIKTOK_MS = 5 * 60_000;

@Injectable()
export class PublicationsSocialesService {
  private readonly logger = new Logger(PublicationsSocialesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
  ) {}

  /** Ce que l'écran doit savoir avant d'afficher quoi que ce soit. */
  acces(email: string) {
    return {
      ouvert: accesOuvert(email),
      instagram: estConfiguree('instagram'),
      tiktok: estConfiguree('tiktok'),
    };
  }

  private exigerAcces(email: string) {
    if (!accesOuvert(email))
      throw new ForbiddenException(
        "Les réseaux sociaux ne sont pas encore ouverts à tous : Instagram et TikTok doivent d'abord valider Ignitux.",
      );
  }

  genererSuggestion(
    owner: { id: string; email: string },
    platform: Plateforme,
    brief: string,
  ) {
    this.exigerAcces(owner.email);
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
        'IGINI n’a pas pu préparer cette légende. Tu peux toujours la rédiger toi-même.',
      usage: { userId: owner.id, projectId: null, generator: 'publier_reseaux' },
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

  demarrerConnexion(owner: { id: string; email: string }, platform: Plateforme) {
    this.exigerAcces(owner.email);
    if (!/^[0-9a-fA-F]{64}$/.test(process.env.SECRETS_ENCRYPTION_KEY?.trim() ?? '')) {
      throw new ServiceUnavailableException(
        'La clé de chiffrement des jetons sociaux doit être configurée avant de connecter un compte.',
      );
    }
    return { url: urlAutorisation(platform, owner.id) };
  }

  async finaliserConnexion(platform: Plateforme, code: string, state: string) {
    const ownerId = verifyState(state, platform);
    const token = await echangerCode(platform, code);
    const jetons = {
      platform_account_id: token.accountId,
      username: token.username || null,
      access_token_chiffre: chiffrer(token.accessToken),
      token_expires_at: new Date(Date.now() + token.expiresIn * 1000),
      refresh_token_chiffre: token.refreshToken ? chiffrer(token.refreshToken) : null,
      refresh_expires_at: token.refreshExpiresIn
        ? new Date(Date.now() + token.refreshExpiresIn * 1000)
        : null,
      disconnected_at: null,
    };
    await this.prisma.social_accounts.upsert({
      where: { owner_id_platform: { owner_id: ownerId, platform } },
      create: { owner_id: ownerId, platform, ...jetons },
      update: { ...jetons, connected_at: new Date() },
    });
    return ownerId;
  }

  /**
   * Déconnecter efface les jetons, pas seulement l'affichage : un compte
   * déconnecté ne doit plus rien pouvoir publier, même si la base fuyait.
   * TikTok est aussi prévenu ; Instagram n'offre pas de révocation par l'API.
   */
  async deconnecter(ownerId: string, platform: Plateforme) {
    const account = await this.prisma.social_accounts.findFirst({
      where: { owner_id: ownerId, platform, disconnected_at: null },
    });
    if (!account) throw new NotFoundException('Aucun compte connecté pour cette plateforme.');
    if (platform === 'tiktok' && account.access_token_chiffre) {
      try {
        await revoquerTikTok(dechiffrer(account.access_token_chiffre));
      } catch (erreur) {
        // La déconnexion côté Ignitux ne dépend pas de la réponse de TikTok.
        this.logger.warn(
          `Révocation TikTok refusée pour le compte ${account.id} : ${(erreur as Error).message}`,
        );
      }
    }
    await this.prisma.social_accounts.update({
      where: { id: account.id },
      data: {
        disconnected_at: new Date(),
        access_token_chiffre: null,
        refresh_token_chiffre: null,
        token_expires_at: null,
        refresh_expires_at: null,
      },
    });
  }

  /** Le compte connecté de cette personne sur cette plateforme, ou une erreur claire. */
  private async compteConnecte(ownerId: string, platform: Plateforme) {
    const account = await this.prisma.social_accounts.findFirst({
      where: { owner_id: ownerId, platform, disconnected_at: null },
    });
    if (!account?.access_token_chiffre)
      throw new ServiceUnavailableException(
        `Connecte d’abord ton compte ${platform === 'instagram' ? 'Instagram' : 'TikTok'} à Ignitux.`,
      );
    return account;
  }

  /**
   * Un jeton utilisable maintenant, renouvelé si besoin. TikTok expire au
   * bout de 24 h, Instagram au bout de 60 jours : sans renouvellement, la
   * personne devrait se reconnecter chaque jour sur TikTok.
   */
  private async jetonValide(account: social_accounts): Promise<string> {
    const actuel = dechiffrer(account.access_token_chiffre!);
    const expire = account.token_expires_at?.getTime() ?? Infinity;
    const nomReseau = account.platform === 'instagram' ? 'Instagram' : 'TikTok';
    const reconnecter = new ServiceUnavailableException(
      `La connexion ${nomReseau} a expiré. Reconnecte le compte.`,
    );

    if (account.platform === 'tiktok') {
      if (expire > Date.now() + MARGE_RENOUVELLEMENT_TIKTOK_MS) return actuel;
      const refreshExpire = account.refresh_expires_at?.getTime() ?? 0;
      if (!account.refresh_token_chiffre || refreshExpire < Date.now()) throw reconnecter;
      try {
        const neuf = await renouvelerTikTok(dechiffrer(account.refresh_token_chiffre));
        await this.prisma.social_accounts.update({
          where: { id: account.id },
          data: {
            access_token_chiffre: chiffrer(neuf.accessToken),
            token_expires_at: new Date(Date.now() + neuf.expiresIn * 1000),
            refresh_token_chiffre: chiffrer(neuf.refreshToken),
            ...(neuf.refreshExpiresIn
              ? { refresh_expires_at: new Date(Date.now() + neuf.refreshExpiresIn * 1000) }
              : {}),
          },
        });
        return neuf.accessToken;
      } catch (erreur) {
        this.logger.warn(
          `Renouvellement TikTok refusé pour le compte ${account.id} : ${(erreur as Error).message}`,
        );
        throw reconnecter;
      }
    }

    // Instagram : un jeton expiré ne se renouvelle plus.
    if (expire < Date.now() + 60_000) throw reconnecter;
    if (expire > Date.now() + MARGE_RENOUVELLEMENT_INSTAGRAM_MS) return actuel;
    try {
      const neuf = await renouvelerInstagram(actuel);
      await this.prisma.social_accounts.update({
        where: { id: account.id },
        data: {
          access_token_chiffre: chiffrer(neuf.accessToken),
          token_expires_at: new Date(Date.now() + neuf.expiresIn * 1000),
        },
      });
      return neuf.accessToken;
    } catch (erreur) {
      // Encore valide quelques jours : on publie avec, on réessaiera demain.
      this.logger.warn(
        `Renouvellement Instagram refusé pour le compte ${account.id} : ${(erreur as Error).message}`,
      );
      return actuel;
    }
  }

  async optionsTikTok(ownerId: string) {
    const account = await this.compteConnecte(ownerId, 'tiktok');
    return optionsCreateurTikTok(await this.jetonValide(account));
  }

  async creer(
    owner: { id: string; email: string },
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
    this.exigerAcces(owner.email);
    this.validerMedia(input.mediaUrl);
    if (input.platform === 'tiktok' && !input.privacyLevel)
      throw new BadRequestException('Choisis la visibilité TikTok de cette publication.');
    if (input.platform === 'tiktok' && input.brandContent && input.privacyLevel === 'SELF_ONLY')
      throw new BadRequestException(
        'Un contenu de marque ne peut pas être publié avec la visibilité « Moi uniquement ».',
      );
    if (input.platform === 'tiktok' && input.mediaType === 'video' && !input.mediaDurationSeconds)
      throw new BadRequestException(
        'La durée de la vidéo est requise pour vérifier les limites TikTok.',
      );
    if (input.platform === 'instagram' && input.privacyLevel)
      throw new BadRequestException('La visibilité TikTok ne s’applique pas à Instagram.');
    return this.prisma.social_posts.create({
      data: {
        owner_id: owner.id,
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
    const post = await this.prisma.social_posts.findFirst({ where: { id, owner_id: ownerId } });
    if (!post) throw new NotFoundException('Publication introuvable.');
    if (post.status === 'publishing' || post.status === 'published')
      throw new ConflictException('Une publication envoyée ou en cours ne peut pas être supprimée.');
    await this.prisma.social_posts.delete({ where: { id } });
  }

  async publier(owner: { id: string; email: string }, id: string, musicConsent = false) {
    this.exigerAcces(owner.email);
    const ownerId = owner.id;
    const post = await this.prisma.social_posts.findFirst({ where: { id, owner_id: ownerId } });
    if (!post) throw new NotFoundException('Publication introuvable.');
    if (post.status !== 'draft')
      throw new ConflictException(
        'Seul un brouillon peut être publié. Crée un nouveau brouillon après avoir vérifié l’état de la publication.',
      );
    if (post.platform === 'tiktok' && !musicConsent)
      throw new BadRequestException(
        'Confirme les règles d’utilisation de la musique TikTok avant de publier.',
      );
    if (post.platform === 'tiktok' && post.brand_content && post.privacy_level === 'SELF_ONLY')
      throw new BadRequestException(
        'Un contenu de marque ne peut pas être publié avec la visibilité « Moi uniquement ».',
      );
    const account = await this.compteConnecte(ownerId, post.platform as Plateforme);
    const jeton = await this.jetonValide(account);
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
        'Cette publication a déjà été prise en charge. Actualise la page avant de continuer.',
      );
    try {
      const result = await publier(
        post.platform as Plateforme,
        account.platform_account_id,
        post.media_type as TypeMedia,
        post.caption,
        post.media_url,
        jeton,
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
        data: result.conteneur
          ? // Instagram prépare la vidéo : elle partira à la vérification du statut.
            { status: 'publishing', media_container_id: result.id, error: null }
          : {
              status: result.complete ? 'published' : 'publishing',
              platform_post_id: result.id,
              published_at: result.complete ? new Date() : null,
              error: null,
            },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue du réseau social.';
      await this.prisma.social_posts.update({
        where: { id },
        data: { status: 'failed', error: message.slice(0, 500) },
      });
      throw error;
    }
  }

  async verifierStatut(ownerId: string, id: string) {
    const post = await this.prisma.social_posts.findFirst({ where: { id, owner_id: ownerId } });
    if (!post) throw new NotFoundException('Publication introuvable.');
    if (post.status !== 'publishing') return post;

    if (post.platform === 'instagram' && post.media_container_id) {
      return this.avancerReelInstagram(ownerId, post.id, post.media_container_id);
    }
    if (post.platform !== 'tiktok' || !post.platform_post_id) return post;

    const account = await this.compteConnecte(ownerId, 'tiktok');
    const result = await verifierEtatTikTok(await this.jetonValide(account), post.platform_post_id);
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

  /**
   * Un Reel Instagram : publié quand Meta a fini de préparer la vidéo.
   *
   * Deux vérifications simultanées ne doivent pas publier deux fois : la
   * première passe le post en `finalizing`, la seconde ne trouve plus de
   * post `publishing` et rend l'état tel quel. Si l'envoi échoue, le post
   * repasse en `publishing` : l'état du conteneur (`PUBLISHED` ou non) dira
   * à la vérification suivante si le Reel est malgré tout parti.
   */
  private async avancerReelInstagram(ownerId: string, id: string, containerId: string) {
    const account = await this.compteConnecte(ownerId, 'instagram');
    const jeton = await this.jetonValide(account);
    const etat = await etatConteneurInstagram(containerId, jeton);

    if (etat === 'PUBLISHED') {
      return this.prisma.social_posts.update({
        where: { id },
        data: { status: 'published', published_at: new Date(), error: null },
      });
    }
    if (etat === 'ERROR' || etat === 'EXPIRED') {
      return this.prisma.social_posts.update({
        where: { id },
        data: {
          status: 'failed',
          error:
            etat === 'EXPIRED'
              ? 'Instagram a laissé expirer la vidéo préparée (24 h). Crée un nouveau brouillon.'
              : 'Instagram n’a pas pu traiter la vidéo. Vérifie le fichier (format MP4, 3 s à 15 min) et son adresse publique.',
        },
      });
    }
    if (etat !== 'FINISHED') {
      return this.prisma.social_posts.findFirstOrThrow({ where: { id } });
    }

    const claim = await this.prisma.social_posts.updateMany({
      where: { id, owner_id: ownerId, status: 'publishing' },
      data: { status: 'finalizing' },
    });
    if (claim.count !== 1) return this.prisma.social_posts.findFirstOrThrow({ where: { id } });
    try {
      const postId = await publierConteneurInstagram(account.platform_account_id, containerId, jeton);
      return await this.prisma.social_posts.update({
        where: { id },
        data: {
          status: 'published',
          platform_post_id: postId,
          published_at: new Date(),
          error: null,
        },
      });
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : 'Erreur inconnue d’Instagram.';
      return this.prisma.social_posts.update({
        where: { id },
        data: { status: 'publishing', error: message.slice(0, 500) },
      });
    }
  }

  private validerMedia(mediaUrl: string) {
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
  }
}
