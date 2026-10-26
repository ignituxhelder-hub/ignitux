import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getEnv } from '../config/env.js';

export type Plateforme = 'instagram' | 'tiktok';
export type TypeMedia = 'image' | 'video';
export interface OptionsCreateurTikTok {
  privacyLevels: string[];
  creatorNickname: string;
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number | null;
}

export interface CompteSocial {
  id: string;
  username: string | null;
  platform_account_id: string;
  access_token_chiffre: string;
}

async function appel(url: string | URL, init?: RequestInit) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
}

function config(platform: Plateforme) {
  const vars =
    platform === 'instagram'
      ? {
          id: 'INSTAGRAM_CLIENT_ID',
          secret: 'INSTAGRAM_CLIENT_SECRET',
          redirect: 'INSTAGRAM_REDIRECT_URI',
        }
      : {
          id: 'TIKTOK_CLIENT_KEY',
          secret: 'TIKTOK_CLIENT_SECRET',
          redirect: 'TIKTOK_REDIRECT_URI',
        };
  const clientId = process.env[vars.id]?.trim();
  const clientSecret = process.env[vars.secret]?.trim();
  const redirectUri = process.env[vars.redirect]?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new ServiceUnavailableException(
      `La connexion ${platform} n'est pas configurée dans le serveur Ignitux.`,
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/** La plateforme a-t-elle ses identifiants développeur sur ce serveur ? */
export function estConfiguree(platform: Plateforme): boolean {
  try {
    config(platform);
    return true;
  } catch {
    return false;
  }
}

function createState(userId: string, platform: Plateforme): string {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      platform,
      issuedAt: Date.now(),
      nonce: randomBytes(16).toString('hex'),
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', getEnv().JWT_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyState(state: string, platform: Plateforme): string {
  const [payload, signature] = state.split('.');
  if (!payload || !signature)
    throw new BadGatewayException('État OAuth invalide.');
  const expected = createHmac('sha256', getEnv().JWT_SECRET)
    .update(payload)
    .digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, 'base64url');
  } catch {
    throw new BadGatewayException('État OAuth invalide.');
  }
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  )
    throw new BadGatewayException('État OAuth invalide.');
  let data: { userId?: string; platform?: string; issuedAt?: number };
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new BadGatewayException('État OAuth invalide.');
  }
  if (
    data.platform !== platform ||
    !data.userId ||
    !data.issuedAt ||
    Date.now() - data.issuedAt > 10 * 60_000 ||
    data.issuedAt > Date.now() + 30_000
  ) {
    throw new BadGatewayException(
      'La demande de connexion a expiré. Recommence depuis Ignitux.',
    );
  }
  return data.userId;
}

export function urlAutorisation(platform: Plateforme, userId: string): string {
  const c = config(platform);
  const url =
    platform === 'instagram'
      ? new URL('https://www.instagram.com/oauth/authorize')
      : new URL('https://www.tiktok.com/v2/auth/authorize/');
  url.searchParams.set(
    platform === 'instagram' ? 'client_id' : 'client_key',
    c.clientId,
  );
  url.searchParams.set('redirect_uri', c.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', createState(userId, platform));
  url.searchParams.set(
    'scope',
    platform === 'instagram'
      ? 'instagram_business_basic,instagram_business_content_publish'
      : 'user.info.basic,video.publish',
  );
  return url.toString();
}

async function jsonResponse(res: Response): Promise<Record<string, any>> {
  const data = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok)
    throw new BadGatewayException(
      `Le réseau social a refusé la demande (${res.status}).`,
    );
  return data;
}

/**
 * TikTok répond souvent 200 avec l'erreur dans le corps
 * (`error.code` différent de `ok`) : un statut HTTP réussi ne suffit pas.
 */
async function reponseTikTok(res: Response): Promise<Record<string, any>> {
  const data = await jsonResponse(res);
  const code = data.error?.code;
  if (code && code !== 'ok')
    throw new BadGatewayException(
      `TikTok a refusé la demande (${String(code)}).`,
    );
  return data;
}

const URL_GRAPH_INSTAGRAM = () =>
  `https://graph.instagram.com/${process.env.INSTAGRAM_GRAPH_VERSION?.trim() || 'v26.0'}`;

export async function echangerCode(platform: Plateforme, code: string) {
  const c = config(platform);
  if (platform === 'instagram') {
    const form = new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: c.redirectUri,
      code,
    });
    const short = await jsonResponse(
      await appel('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        body: form,
      }),
    );
    if (!short.access_token || !short.user_id)
      throw new BadGatewayException(
        'Instagram n’a pas renvoyé de jeton valide.',
      );
    const longUrl = new URL('https://graph.instagram.com/access_token');
    longUrl.searchParams.set('grant_type', 'ig_exchange_token');
    longUrl.searchParams.set('client_secret', c.clientSecret);
    longUrl.searchParams.set('access_token', short.access_token);
    const long = await jsonResponse(await appel(longUrl));
    const profileUrl = new URL('https://graph.instagram.com/me');
    profileUrl.searchParams.set('fields', 'user_id,username');
    profileUrl.searchParams.set(
      'access_token',
      long.access_token ?? short.access_token,
    );
    const profile = await jsonResponse(await appel(profileUrl));
    return {
      accountId: String(profile.user_id ?? short.user_id),
      username: String(profile.username ?? ''),
      accessToken: String(long.access_token ?? short.access_token),
      expiresIn: Number(long.expires_in ?? 3600),
      refreshToken: null,
      refreshExpiresIn: null,
    };
  }
  const form = new URLSearchParams({
    client_key: c.clientId,
    client_secret: c.clientSecret,
    grant_type: 'authorization_code',
    redirect_uri: c.redirectUri,
    code,
  });
  const tokenResult = await reponseTikTok(
    await appel('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    }),
  );
  const token = tokenResult.data ?? tokenResult;
  if (!token.access_token || !token.open_id)
    throw new BadGatewayException('TikTok n’a pas renvoyé de jeton valide.');
  const userResult = await reponseTikTok(
    await appel(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name',
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    ),
  );
  const user = userResult.data?.user ?? {};
  return {
    accountId: String(token.open_id),
    username: String(user.display_name ?? ''),
    accessToken: String(token.access_token),
    expiresIn: Number(token.expires_in ?? 86400),
    // Le jeton d'accès TikTok ne vit que 24 h : sans celui-ci, il faudrait
    // reconnecter le compte chaque jour.
    refreshToken: token.refresh_token ? String(token.refresh_token) : null,
    refreshExpiresIn: token.refresh_expires_in
      ? Number(token.refresh_expires_in)
      : null,
  };
}

/** Un nouveau jeton TikTok (24 h) à partir du jeton de renouvellement. */
export async function renouvelerTikTok(refreshToken: string) {
  const c = config('tiktok');
  const result = await reponseTikTok(
    await appel('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: c.clientId,
        client_secret: c.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    }),
  );
  const token = result.data ?? result;
  if (!token.access_token)
    throw new BadGatewayException('TikTok n’a pas renouvelé la connexion.');
  return {
    accessToken: String(token.access_token),
    expiresIn: Number(token.expires_in ?? 86400),
    // TikTok peut renvoyer un nouveau jeton de renouvellement : on garde le
    // plus récent, l'ancien peut cesser de marcher.
    refreshToken: token.refresh_token ? String(token.refresh_token) : refreshToken,
    refreshExpiresIn: token.refresh_expires_in
      ? Number(token.refresh_expires_in)
      : null,
  };
}

/**
 * Prolonge un jeton Instagram de 60 jours. Instagram n'accepte qu'un jeton
 * encore valide et vieux d'au moins 24 h : passé l'échéance, il faut
 * reconnecter le compte.
 */
export async function renouvelerInstagram(accessToken: string) {
  const url = new URL('https://graph.instagram.com/refresh_access_token');
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', accessToken);
  const result = await jsonResponse(await appel(url));
  if (!result.access_token)
    throw new BadGatewayException('Instagram n’a pas renouvelé la connexion.');
  return {
    accessToken: String(result.access_token),
    expiresIn: Number(result.expires_in ?? 5_184_000),
  };
}

/**
 * Retire chez TikTok l'autorisation donnée à Ignitux. Sans effet sur
 * Instagram, qui n'offre pas de révocation par l'API : la personne la retire
 * depuis ses paramètres Instagram (« Applications et sites web »).
 */
export async function revoquerTikTok(accessToken: string) {
  const c = config('tiktok');
  await reponseTikTok(
    await appel('https://open.tiktokapis.com/v2/oauth/revoke/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: c.clientId,
        client_secret: c.clientSecret,
        token: accessToken,
      }),
    }),
  );
}

export async function optionsCreateurTikTok(
  token: string,
): Promise<OptionsCreateurTikTok> {
  const result = await reponseTikTok(
    await appel(
      'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
    ),
  );
  const options = result.data?.privacy_level_options;
  if (!Array.isArray(options) || options.length === 0)
    throw new BadGatewayException(
      'TikTok n’a fourni aucune option de visibilité.',
    );
  return {
    privacyLevels: options as string[],
    creatorNickname: String(
      result.data?.creator_nickname ?? result.data?.creator_username ?? '',
    ),
    commentDisabled: Boolean(result.data?.comment_disabled),
    duetDisabled: Boolean(result.data?.duet_disabled),
    stitchDisabled: Boolean(result.data?.stitch_disabled),
    maxVideoPostDurationSec:
      result.data?.max_video_post_duration_sec !== undefined &&
      result.data?.max_video_post_duration_sec !== null &&
      Number.isFinite(Number(result.data.max_video_post_duration_sec))
        ? Number(result.data.max_video_post_duration_sec)
        : null,
  };
}

export async function publier(
  platform: Plateforme,
  accountId: string,
  type: TypeMedia,
  caption: string,
  mediaUrl: string,
  token: string,
  settings?: {
    privacyLevel?: string;
    allowComments?: boolean;
    allowDuet?: boolean;
    allowStitch?: boolean;
    brandOrganic?: boolean;
    brandContent?: boolean;
    mediaDurationSeconds?: number;
  },
) {
  if (platform === 'instagram') {
    const base = URL_GRAPH_INSTAGRAM();
    if (type === 'video') {
      // Une vidéo devient un Reel. Meta met d'une à quelques minutes à la
      // préparer : on ne tient pas la requête ouverte pendant ce temps. Le
      // conteneur est rendu tout de suite, « Vérifier le statut » publie
      // quand il est prêt (voir publierConteneurInstagram).
      const reel = await jsonResponse(
        await appel(`${base}/${accountId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            media_type: 'REELS',
            video_url: mediaUrl,
            caption,
            share_to_feed: 'true',
            access_token: token,
          }),
        }),
      );
      if (!reel.id)
        throw new BadGatewayException(
          'Instagram n’a pas accepté la vidéo. Vérifie le fichier et son adresse publique.',
        );
      return { id: String(reel.id), complete: false, conteneur: true };
    }
    const container = await jsonResponse(
      await appel(`${base}/${accountId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          image_url: mediaUrl,
          caption,
          access_token: token,
        }),
      }),
    );
    if (!container.id)
      throw new BadGatewayException(
        'Instagram n’a pas créé le brouillon média.',
      );
    let mediaStatus = '';
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const statusUrl = new URL(`${base}/${container.id}`);
      statusUrl.searchParams.set('fields', 'status_code');
      statusUrl.searchParams.set('access_token', token);
      const status = await jsonResponse(await appel(statusUrl));
      mediaStatus = String(status.status_code ?? '');
      if (mediaStatus === 'FINISHED') break;
      if (mediaStatus === 'ERROR' || mediaStatus === 'EXPIRED')
        throw new BadGatewayException(
          'Instagram n’a pas pu traiter le média. Vérifie le fichier et son adresse publique.',
        );
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    if (mediaStatus !== 'FINISHED')
      throw new ServiceUnavailableException(
        'Instagram traite encore le média. Vérifie son état avant de créer une autre publication.',
      );
    const result = await jsonResponse(
      await appel(`${base}/${accountId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          creation_id: String(container.id),
          access_token: token,
        }),
      }),
    );
    return { id: String(result.id ?? container.id), complete: true, conteneur: false };
  }
  const creator = await optionsCreateurTikTok(token);
  if (
    !settings?.privacyLevel ||
    !creator.privacyLevels.includes(settings.privacyLevel)
  )
    throw new BadRequestException(
      'Choisis une option de visibilité TikTok proposée par ton compte.',
    );
  if (
    type === 'video' &&
    creator.maxVideoPostDurationSec &&
    (!settings.mediaDurationSeconds ||
      settings.mediaDurationSeconds > creator.maxVideoPostDurationSec)
  ) {
    throw new BadRequestException(
      `La vidéo doit durer au maximum ${creator.maxVideoPostDurationSec} secondes selon les limites de ton compte TikTok.`,
    );
  }
  if (settings.allowComments && creator.commentDisabled)
    throw new BadRequestException(
      'TikTok a désactivé les commentaires sur ce compte.',
    );
  if (type === 'video' && settings.allowDuet && creator.duetDisabled)
    throw new BadRequestException('TikTok a désactivé les Duos sur ce compte.');
  if (type === 'video' && settings.allowStitch && creator.stitchDisabled)
    throw new BadRequestException(
      'TikTok a désactivé les Collages sur ce compte.',
    );
  const endpoint = type === 'video' ? 'video/init/' : 'content/init/';
  const body =
    type === 'video'
      ? {
          post_info: {
            title: caption,
            privacy_level: settings.privacyLevel,
            disable_comment: !settings.allowComments,
            disable_duet: !settings.allowDuet,
            disable_stitch: !settings.allowStitch,
            brand_organic_toggle: Boolean(settings.brandOrganic),
            brand_content_toggle: Boolean(settings.brandContent),
          },
          source_info: { source: 'PULL_FROM_URL', video_url: mediaUrl },
        }
      : {
          post_info: {
            title: caption.slice(0, 90),
            description: caption,
            privacy_level: settings.privacyLevel,
            disable_comment: !settings.allowComments,
            brand_organic_toggle: Boolean(settings.brandOrganic),
            brand_content_toggle: Boolean(settings.brandContent),
          },
          source_info: {
            source: 'PULL_FROM_URL',
            photo_images: [mediaUrl],
            photo_cover_index: 0,
          },
          post_mode: 'DIRECT_POST',
          media_type: 'PHOTO',
        };
  const response = await reponseTikTok(
    await appel(`https://open.tiktokapis.com/v2/post/publish/${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
  );
  const id = response.data?.publish_id;
  if (!id)
    throw new BadGatewayException(
      'TikTok n’a pas confirmé la création de la publication.',
    );
  return { id: String(id), complete: false, conteneur: false };
}

/**
 * Où en est un conteneur Instagram : `IN_PROGRESS` tant que Meta prépare la
 * vidéo, `FINISHED` quand elle peut partir, `PUBLISHED` une fois publiée,
 * `ERROR` ou `EXPIRED` (24 h sans publication) sinon.
 */
export async function etatConteneurInstagram(containerId: string, token: string) {
  const url = new URL(`${URL_GRAPH_INSTAGRAM()}/${containerId}`);
  url.searchParams.set('fields', 'status_code');
  url.searchParams.set('access_token', token);
  const result = await jsonResponse(await appel(url));
  return String(result.status_code ?? '');
}

/** Publie un conteneur Instagram prêt (`FINISHED`). Rend l'identifiant du post. */
export async function publierConteneurInstagram(
  accountId: string,
  containerId: string,
  token: string,
) {
  const result = await jsonResponse(
    await appel(`${URL_GRAPH_INSTAGRAM()}/${accountId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ creation_id: containerId, access_token: token }),
    }),
  );
  return String(result.id ?? containerId);
}

export async function verifierEtatTikTok(token: string, publishId: string) {
  const response = await reponseTikTok(
    await appel('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ publish_id: publishId }),
    }),
  );
  return {
    status: String(response.data?.status ?? ''),
    error: String(response.data?.fail_reason ?? ''),
  };
}
