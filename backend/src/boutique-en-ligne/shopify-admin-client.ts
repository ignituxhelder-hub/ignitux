const SHOPIFY_API_VERSION = '2025-01';

export interface ShopifyCredentials {
  shopDomain: string;
  accessToken: string;
}

export interface ShopifyTokenResponse {
  accessToken: string;
  scope: string;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  status: string;
  totalInventory: number;
}

export interface ShopifyOrder {
  id: string;
  name: string;
  displayFinancialStatus: string;
  totalPriceCents: number;
  currency: string;
  createdAt: string;
}

async function requeteGraphQL<T>(
  credentials: ShopifyCredentials,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(
    `https://${credentials.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': credentials.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  if (!res.ok) {
    throw new Error(`Shopify a répondu ${res.status}.`);
  }

  const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (body.errors && body.errors.length > 0) {
    throw new Error(`Shopify : ${body.errors.map((e) => e.message).join(', ')}`);
  }
  if (!body.data) {
    throw new Error('Shopify a répondu sans données.');
  }
  return body.data;
}

export async function echangerCodeContreJeton(
  shopDomain: string,
  apiKey: string,
  apiSecret: string,
  code: string,
): Promise<ShopifyTokenResponse> {
  const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code }),
  });

  if (!res.ok) {
    throw new Error(`Échange du code Shopify refusé (${res.status}).`);
  }

  const body = (await res.json()) as { access_token?: string; scope?: string };
  if (!body.access_token) {
    throw new Error('Shopify n’a renvoyé aucun jeton.');
  }
  return { accessToken: body.access_token, scope: body.scope ?? '' };
}

export async function listerProduits(credentials: ShopifyCredentials): Promise<ShopifyProduct[]> {
  const data = await requeteGraphQL<{
    products: {
      edges: Array<{ node: { id: string; title: string; status: string; totalInventory: number } }>;
    };
  }>(credentials, `query { products(first: 20) { edges { node { id title status totalInventory } } } }`);
  return data.products.edges.map((edge) => edge.node);
}

export async function creerProduit(
  credentials: ShopifyCredentials,
  titre: string,
  description: string | null,
): Promise<ShopifyProduct> {
  const data = await requeteGraphQL<{
    productCreate: {
      product: { id: string; title: string; status: string; totalInventory: number } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(
    credentials,
    `mutation CreerProduit($input: ProductInput!) {
      productCreate(input: $input) {
        product { id title status totalInventory }
        userErrors { field message }
      }
    }`,
    { input: { title: titre, descriptionHtml: description ?? '' } },
  );

  if (data.productCreate.userErrors.length > 0) {
    throw new Error(data.productCreate.userErrors.map((e) => e.message).join(', '));
  }
  if (!data.productCreate.product) {
    throw new Error('Shopify n’a renvoyé aucun produit créé.');
  }
  return data.productCreate.product;
}

export async function listerCommandes(credentials: ShopifyCredentials): Promise<ShopifyOrder[]> {
  const data = await requeteGraphQL<{
    orders: {
      edges: Array<{
        node: {
          id: string;
          name: string;
          displayFinancialStatus: string;
          createdAt: string;
          totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
        };
      }>;
    };
  }>(
    credentials,
    `query { orders(first: 20, sortKey: CREATED_AT, reverse: true) {
      edges { node { id name displayFinancialStatus createdAt totalPriceSet { shopMoney { amount currencyCode } } } }
    } }`,
  );
  return data.orders.edges.map((edge) => ({
    id: edge.node.id,
    name: edge.node.name,
    displayFinancialStatus: edge.node.displayFinancialStatus,
    totalPriceCents: Math.round(parseFloat(edge.node.totalPriceSet.shopMoney.amount) * 100),
    currency: edge.node.totalPriceSet.shopMoney.currencyCode,
    createdAt: edge.node.createdAt,
  }));
}
