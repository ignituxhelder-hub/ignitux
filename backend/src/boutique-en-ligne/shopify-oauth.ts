import { createHmac, timingSafeEqual } from 'node:crypto';

export interface EtatConnexion {
  userId: string;
  projectId: string;
  /**
   * Le domaine visé au moment de la demande. Comparé de nouveau à la
   * finalisation : sans lui, rien n'empêcherait de démarrer une connexion
   * pour un domaine et de la finaliser silencieusement pour un autre.
   */
  shopDomain: string;
}

/** Le temps d'un aller-retour OAuth, pas plus : au-delà, on préfère
 * recommencer plutôt que d'accepter un callback resté trop longtemps
 * dans un onglet ouvert. */
const DUREE_VALIDITE_MS = 10 * 60 * 1000;

function cleHmac(secret: string): Buffer {
  return Buffer.from(secret, 'utf8');
}

export function construireUrlAutorisation(params: {
  shopDomain: string;
  apiKey: string;
  scopes: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(`https://${params.shopDomain}/admin/oauth/authorize`);
  url.searchParams.set('client_id', params.apiKey);
  url.searchParams.set('scope', params.scopes);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', params.state);
  return url.toString();
}

export function signerEtat(etat: EtatConnexion, secret: string): string {
  const payload = JSON.stringify({ ...etat, expire: Date.now() + DUREE_VALIDITE_MS });
  const encode = Buffer.from(payload, 'utf8').toString('base64url');
  const signature = createHmac('sha256', cleHmac(secret)).update(encode).digest('base64url');
  return `${encode}.${signature}`;
}

export function verifierEtat(state: string, secret: string): EtatConnexion | null {
  const [encode, signature] = state.split('.');
  if (!encode || !signature) return null;

  const attendue = createHmac('sha256', cleHmac(secret)).update(encode).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(attendue);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encode, 'base64url').toString('utf8')) as EtatConnexion & {
      expire: number;
    };
    if (typeof payload.expire !== 'number' || payload.expire < Date.now()) return null;
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.projectId !== 'string' ||
      typeof payload.shopDomain !== 'string'
    ) {
      return null;
    }
    return { userId: payload.userId, projectId: payload.projectId, shopDomain: payload.shopDomain };
  } catch {
    return null;
  }
}

/**
 * Shopify signe chaque callback OAuth avec le secret de l'application, sur
 * les paramètres de la requête triés par clé, `hmac` exclu. Une signature
 * qui ne correspond pas signifie que la requête ne vient pas de Shopify.
 */
export function verifierHmacCallback(query: Record<string, string>, secret: string): boolean {
  const { hmac, ...reste } = query;
  if (!hmac) return false;

  const message = Object.keys(reste)
    .sort()
    .map((cle) => `${cle}=${reste[cle]}`)
    .join('&');
  const attendu = createHmac('sha256', cleHmac(secret)).update(message).digest('hex');

  const a = Buffer.from(hmac);
  const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
}
