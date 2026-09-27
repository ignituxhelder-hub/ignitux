import { createHmac } from 'node:crypto';
import {
  construireUrlAutorisation,
  signerEtat,
  verifierEtat,
  verifierHmacCallback,
} from './shopify-oauth.js';

describe('URL d’autorisation Shopify', () => {
  it('porte tous les paramètres attendus', () => {
    const url = new URL(
      construireUrlAutorisation({
        shopDomain: 'ma-boutique.myshopify.com',
        apiKey: 'cle123',
        scopes: 'read_products,write_products',
        redirectUri: 'https://api.ignitux.fr/boutique-en-ligne/callback',
        state: 'etat-signe',
      }),
    );

    expect(url.origin + url.pathname).toBe(
      'https://ma-boutique.myshopify.com/admin/oauth/authorize',
    );
    expect(url.searchParams.get('client_id')).toBe('cle123');
    expect(url.searchParams.get('scope')).toBe('read_products,write_products');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.ignitux.fr/boutique-en-ligne/callback',
    );
    expect(url.searchParams.get('state')).toBe('etat-signe');
  });
});

describe('état signé de la connexion', () => {
  const secret = 'secret-de-test-suffisamment-long';

  it('se relit tel quel juste après signature', () => {
    const etat = signerEtat({ userId: 'u1', projectId: 'p1' }, secret);
    expect(verifierEtat(etat, secret)).toEqual({ userId: 'u1', projectId: 'p1' });
  });

  it('refuse un état signé avec un autre secret', () => {
    const etat = signerEtat({ userId: 'u1', projectId: 'p1' }, secret);
    expect(verifierEtat(etat, 'un-autre-secret')).toBeNull();
  });

  it('refuse un état altéré', () => {
    const etat = signerEtat({ userId: 'u1', projectId: 'p1' }, secret);
    expect(verifierEtat(etat + 'x', secret)).toBeNull();
  });

  it('refuse un état expiré', () => {
    vi.useFakeTimers();
    const etat = signerEtat({ userId: 'u1', projectId: 'p1' }, secret);
    vi.advanceTimersByTime(11 * 60 * 1000); // 11 minutes, au-delà des 10 autorisées
    expect(verifierEtat(etat, secret)).toBeNull();
    vi.useRealTimers();
  });

  it('refuse une chaîne qui ne ressemble pas à un état signé', () => {
    expect(verifierEtat('pas-un-etat', secret)).toBeNull();
    expect(verifierEtat('', secret)).toBeNull();
  });
});

describe('vérification HMAC du callback Shopify', () => {
  const secret = 'secret-de-test-suffisamment-long';

  it('accepte un HMAC calculé sur les mêmes paramètres', () => {
    // HMAC construit ici exactement comme le ferait shopify-oauth.ts, pour
    // vérifier la vérification elle-même plutôt qu'une valeur en dur qui
    // deviendrait fausse au moindre changement d'algorithme.
    const query = { code: 'abc', shop: 'ma-boutique.myshopify.com', timestamp: '123' };
    const message = Object.keys(query)
      .sort()
      .map((cle) => `${cle}=${(query as Record<string, string>)[cle]}`)
      .join('&');
    const hmac = createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest('hex');

    expect(verifierHmacCallback({ ...query, hmac }, secret)).toBe(true);
  });

  it('refuse un HMAC incorrect', () => {
    expect(
      verifierHmacCallback(
        { code: 'abc', shop: 'ma-boutique.myshopify.com', hmac: 'faux' },
        secret,
      ),
    ).toBe(false);
  });

  it('refuse quand le HMAC est absent', () => {
    expect(verifierHmacCallback({ code: 'abc' }, secret)).toBe(false);
  });
});
