import {
  creerProduit,
  echangerCodeContreJeton,
  listerCommandes,
  listerProduits,
} from './shopify-admin-client.js';

describe('échange du code contre un jeton', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renvoie le jeton et le scope quand Shopify répond correctement', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'shpat_abc', scope: 'read_products' }),
      }),
    );

    const resultat = await echangerCodeContreJeton(
      'ma-boutique.myshopify.com',
      'cle',
      'secret',
      'code123',
    );

    expect(resultat).toEqual({ accessToken: 'shpat_abc', scope: 'read_products' });
  });

  it('rejette quand Shopify répond en erreur HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    await expect(
      echangerCodeContreJeton('ma-boutique.myshopify.com', 'cle', 'secret', 'code123'),
    ).rejects.toThrow(/400/);
  });

  it('rejette quand la réponse ne porte aucun jeton', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await expect(
      echangerCodeContreJeton('ma-boutique.myshopify.com', 'cle', 'secret', 'code123'),
    ).rejects.toThrow(/jeton/);
  });
});

const CREDENTIALS = { shopDomain: 'ma-boutique.myshopify.com', accessToken: 'shpat_abc' };

describe('lister les produits', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('convertit les arêtes GraphQL en liste plate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            products: {
              edges: [
                { node: { id: 'gid://1', title: 'Bougie', status: 'ACTIVE', totalInventory: 5 } },
              ],
            },
          },
        }),
      }),
    );

    const produits = await listerProduits(CREDENTIALS);
    expect(produits).toEqual([
      { id: 'gid://1', title: 'Bougie', status: 'ACTIVE', totalInventory: 5 },
    ]);
  });

  it('rejette proprement une réponse GraphQL en erreur', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ errors: [{ message: 'Access denied' }] }),
      }),
    );
    await expect(listerProduits(CREDENTIALS)).rejects.toThrow(/Access denied/);
  });
});

describe('créer un produit', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renvoie le produit créé', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            productCreate: {
              product: { id: 'gid://2', title: 'Savon', status: 'DRAFT', totalInventory: 0 },
              userErrors: [],
            },
          },
        }),
      }),
    );

    const produit = await creerProduit(CREDENTIALS, 'Savon', null);
    expect(produit).toEqual({ id: 'gid://2', title: 'Savon', status: 'DRAFT', totalInventory: 0 });
  });

  it('rejette quand Shopify renvoie des erreurs de validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            productCreate: {
              product: null,
              userErrors: [{ field: ['title'], message: 'Titre requis' }],
            },
          },
        }),
      }),
    );
    await expect(creerProduit(CREDENTIALS, '', null)).rejects.toThrow(/Titre requis/);
  });
});

describe('lister les commandes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('convertit le montant Shopify (chaîne décimale) en centimes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            orders: {
              edges: [
                {
                  node: {
                    id: 'gid://o1',
                    name: '#1001',
                    displayFinancialStatus: 'PAID',
                    createdAt: '2026-09-20T10:00:00Z',
                    totalPriceSet: { shopMoney: { amount: '29.90', currencyCode: 'EUR' } },
                  },
                },
              ],
            },
          },
        }),
      }),
    );

    const commandes = await listerCommandes(CREDENTIALS);
    expect(commandes).toEqual([
      {
        id: 'gid://o1',
        name: '#1001',
        displayFinancialStatus: 'PAID',
        totalPriceCents: 2990,
        currency: 'EUR',
        createdAt: '2026-09-20T10:00:00Z',
      },
    ]);
  });
});
