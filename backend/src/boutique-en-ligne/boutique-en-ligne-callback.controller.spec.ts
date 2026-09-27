import { BoutiqueEnLigneCallbackController } from './boutique-en-ligne-callback.controller.js';
import { BoutiqueEnLigneService } from './boutique-en-ligne.service.js';

type Mock = ReturnType<typeof vi.fn>;
type ReponseSimulee = Parameters<BoutiqueEnLigneCallbackController['callback']>[1];

describe('BoutiqueEnLigneCallbackController', () => {
  let controller: BoutiqueEnLigneCallbackController;
  let service: { verifierSignatureCallback: Mock };
  let res: { redirect: Mock };
  const anciennesEnv = { ...process.env };

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://ignitux.fr';
    service = { verifierSignatureCallback: vi.fn() };
    res = { redirect: vi.fn() };
    controller = new BoutiqueEnLigneCallbackController(service as unknown as BoutiqueEnLigneService);
  });

  afterEach(() => {
    process.env = { ...anciennesEnv };
  });

  it('redirige vers le frontend avec les paramètres Shopify quand la signature est valide', () => {
    service.verifierSignatureCallback.mockReturnValue({ ok: true, projectId: 'p1' });

    controller.callback(
      { code: 'c1', shop: 's.myshopify.com', state: 'etat1', hmac: 'x' },
      res as unknown as ReponseSimulee,
    );

    const url = new URL(res.redirect.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://ignitux.fr/boutique-en-ligne');
    expect(url.searchParams.get('projet')).toBe('p1');
    expect(url.searchParams.get('shopify_code')).toBe('c1');
    expect(url.searchParams.get('shopify_shop')).toBe('s.myshopify.com');
    expect(url.searchParams.get('shopify_state')).toBe('etat1');
    expect(url.searchParams.get('shopify_hmac')).toBe('x');
  });

  it('redirige vers une erreur générique quand la signature est invalide, sans révéler pourquoi', () => {
    service.verifierSignatureCallback.mockReturnValue({ ok: false, projectId: null });

    controller.callback({ hmac: 'faux' }, res as unknown as ReponseSimulee);

    expect(res.redirect).toHaveBeenCalledWith('https://ignitux.fr/boutique-en-ligne?erreur=1');
  });

  it('retombe sur localhost:3001 si FRONTEND_URL est absente, plutôt qu’une redirection relative cassée', () => {
    delete process.env.FRONTEND_URL;
    service.verifierSignatureCallback.mockReturnValue({ ok: false, projectId: null });

    controller.callback({}, res as unknown as ReponseSimulee);

    expect(res.redirect).toHaveBeenCalledWith('http://localhost:3001/boutique-en-ligne?erreur=1');
  });
});
