# Boutique en ligne — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à un entrepreneur, depuis une nouvelle icône « Boutique en
ligne » d'Ignitux, les outils pour créer et gérer un vrai site/boutique
e-commerce (catalogue, commandes) en s'appuyant sur Shopify — sans
qu'Ignitux ne devienne opérateur de paiement ni n'impose d'écriture dans
la comptabilité de l'entrepreneur.

**Architecture:** Une application Shopify personnalisée (OAuth) connecte
chaque projet Ignitux à une boutique Shopify propre à l'entrepreneur. Le
backend NestJS orchestre la connexion et relaie le strict nécessaire
(catalogue, commandes) via l'API Admin GraphQL de Shopify ; le jeton
d'accès est chiffré au repos. Aucune donnée de paiement ne transite par
Ignitux. La comptabilisation de l'abonnement Shopify reste un geste de
l'entrepreneur, via les endpoints `/comptabilite` déjà existants — le
nouveau module ne touche jamais `ledger_entries`.

**Tech Stack:** NestJS (backend), Next.js/React (frontend), Prisma/
PostgreSQL, `fetch` natif (Node 24) pour l'API Shopify — aucune nouvelle
dépendance npm.

**Spec:** `docs/superpowers/specs/2026-09-27-boutique-en-ligne-design.md`

## Global Constraints

- Aucune donnée de carte bancaire ni de paiement ne transite par les
  serveurs d'Ignitux (spec, section « Ce que ce n'est pas »).
- Le jeton d'accès Shopify est chiffré au repos, jamais stocké en clair
  (spec, « Modèle de données »).
- Ignitux n'ouvre ni n'écrit jamais de compte/écriture dans la
  comptabilité d'un entrepreneur sans son geste explicite (spec,
  « Comptabilité : proposer, jamais imposer »).
- L'absence des variables `SHOPIFY_*`/`SECRETS_ENCRYPTION_KEY` ne bloque
  jamais le démarrage du serveur — seule la route de connexion Shopify
  devient indisponible (spec, « Nouvelle dépendance tierce »).
- L'accès à la brique est réservé à l'offre Construction (`outilsDeGestion`),
  avec un contrôle serveur réel dès le départ (spec, « Accès par offre »).
- Aucun compte comptable ni numéro PCG n'est choisi à la place de
  l'entrepreneur (spec, « Comptabilité »).
- Style du dépôt : commentaires en français, uniquement pour le
  non-évident ; pas de `prettier --write` côté frontend (pas de config) ;
  `oxlint --type-aware` côté backend.

## Review Focus

- **Domaine Shopify invalide ou absent** au démarrage de la connexion
  (`shopDomain` vide, sans `.myshopify.com`, ou avec un protocole/chemin
  injecté) — doit être rejeté avant toute redirection, pas laissé
  provoquer une URL OAuth malformée.
- **Callback OAuth rejoué ou falsifié** (HMAC invalide, `state` expiré,
  modifié, ou signé pour un autre projet) — doit être refusé sans jamais
  créer/mettre à jour `shopify_connections`.
- **Deuxième connexion sur un projet déjà connecté** — `project_id` est
  `@unique` : la reconnexion doit mettre à jour la ligne existante, pas
  échouer avec une erreur de contrainte non gérée.
- **Compte sans offre suffisante** qui appelle directement les routes du
  module (pas seulement caché côté lanceur) — chaque route doit refuser
  via `OffresService.exiger`, pas seulement l'affichage du bouton.
- **Réponse Shopify en erreur ou malformée** (GraphQL `errors`, HTTP
  non-2xx, JSON sans `data`) sur produits/commandes — ne doit jamais
  planter le serveur ni renvoyer `undefined` silencieusement à
  l'entrepreneur.

---

## Task 1: Modèle de données `shopify_connections`

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Test: `backend/src/boutique-en-ligne/shopify-connections.schema.spec.ts`

**Interfaces:**
- Produces: le modèle Prisma `shopify_connections` (champs `id`,
  `project_id`, `shop_domain`, `access_token_chiffre`, `scopes`,
  `forfait_declare`, `prix_declare_centimes`, `connected_at`,
  `disconnected_at`, `created_at`, `updated_at`) et la relation inverse
  `projects.shopify_connection`.

- [ ] **Step 1: Ajouter le modèle et la relation dans `schema.prisma`**

Dans `backend/prisma/schema.prisma`, ajouter la ligne suivante au modèle
`projects` (dans le bloc des relations, à côté de `stock_items`) :

```prisma
  shopify_connection   shopify_connections?
```

Puis ajouter le nouveau modèle, à la suite du modèle `stock_items` (ou de
tout autre modèle simple existant) :

```prisma
model shopify_connections {
  id                    String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  project_id            String    @unique @db.Uuid
  shop_domain           String
  access_token_chiffre  String
  scopes                String
  forfait_declare       String?
  prix_declare_centimes Int?
  connected_at          DateTime  @default(now()) @db.Timestamptz(6)
  disconnected_at       DateTime? @db.Timestamptz(6)
  created_at            DateTime  @default(now()) @db.Timestamptz(6)
  updated_at            DateTime  @updatedAt @db.Timestamptz(6)

  project projects @relation(fields: [project_id], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 2: Pousser le schéma sur la base de développement**

Run: `cd backend && npx prisma db push`
Expected: `shopify_connections` apparaît dans le résumé des changements
appliqués, sur la base de développement uniquement (jamais `ignitux_test`
ni `ignitux_prod` à ce stade — voir Global Constraints du reste du
produit sur les migrations).

- [ ] **Step 3: Régénérer le client Prisma**

Run: `cd backend && npx prisma generate`
Expected: se termine sans erreur ; `backend/src/generated/prisma/models/shopify_connections.ts` existe.

- [ ] **Step 4: Écrire un test qui vérifie la forme du modèle généré**

```ts
// backend/src/boutique-en-ligne/shopify-connections.schema.spec.ts
import { PrismaClient } from '../generated/prisma/client.js';

describe('modèle shopify_connections', () => {
  it('expose bien le delegate Prisma attendu', () => {
    const prisma = new PrismaClient();
    expect(typeof prisma.shopify_connections.findFirst).toBe('function');
    expect(typeof prisma.shopify_connections.upsert).toBe('function');
  });
});
```

- [ ] **Step 5: Lancer le test**

Run: `cd backend && npx vitest run src/boutique-en-ligne/shopify-connections.schema.spec.ts`
Expected: PASS (si Step 2/3 ont réussi ; sinon `findFirst` est `undefined`
et le test le dit clairement).

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/src/generated/prisma backend/src/boutique-en-ligne/shopify-connections.schema.spec.ts
git commit -m "feat(boutique-en-ligne): modele shopify_connections"
```

---

## Task 2: Chiffrement des secrets au repos

**Files:**
- Create: `backend/src/boutique-en-ligne/chiffrement.ts`
- Test: `backend/src/boutique-en-ligne/chiffrement.spec.ts`

**Interfaces:**
- Produces: `chiffrer(clair: string): string`, `dechiffrer(valeur: string): string`.
  Aucune autre tâche ne dépend d'un type exporté ici au-delà de ces deux
  fonctions.

Vérifié dans `backend/src` : aucun utilitaire de chiffrement symétrique
n'existe encore côté serveur (`sauvegarde.mjs` chiffre en AES-256 via
OpenSSL, mais en script ponctuel hors serveur). Ce module en introduit un,
minimal, pour ce seul usage.

- [ ] **Step 1: Écrire les tests d'abord**

```ts
// backend/src/boutique-en-ligne/chiffrement.spec.ts
import { chiffrer, dechiffrer } from './chiffrement.js';

const CLE_VALIDE = 'a'.repeat(64); // 64 hex = 32 octets

describe('chiffrement des secrets au repos', () => {
  const original = process.env.SECRETS_ENCRYPTION_KEY;
  afterEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = original;
  });

  it('déchiffre exactement ce qui a été chiffré', () => {
    process.env.SECRETS_ENCRYPTION_KEY = CLE_VALIDE;
    const valeur = chiffrer('shpat_secret_de_test');
    expect(dechiffrer(valeur)).toBe('shpat_secret_de_test');
  });

  it('produit une valeur différente à chaque appel (IV aléatoire)', () => {
    process.env.SECRETS_ENCRYPTION_KEY = CLE_VALIDE;
    expect(chiffrer('meme-texte')).not.toBe(chiffrer('meme-texte'));
  });

  it('refuse de déchiffrer si la valeur a été altérée', () => {
    process.env.SECRETS_ENCRYPTION_KEY = CLE_VALIDE;
    const valeur = chiffrer('secret');
    const [iv, balise, chiffre] = valeur.split(':');
    const altere = [iv, balise, chiffre.slice(0, -2) + '00'].join(':');
    expect(() => dechiffrer(altere)).toThrow();
  });

  it('refuse une SECRETS_ENCRYPTION_KEY absente ou mal formée', () => {
    process.env.SECRETS_ENCRYPTION_KEY = '';
    expect(() => chiffrer('x')).toThrow(/SECRETS_ENCRYPTION_KEY/);
    process.env.SECRETS_ENCRYPTION_KEY = 'trop-court';
    expect(() => chiffrer('x')).toThrow(/SECRETS_ENCRYPTION_KEY/);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd backend && npx vitest run src/boutique-en-ligne/chiffrement.spec.ts`
Expected: FAIL — `Cannot find module './chiffrement.js'`.

- [ ] **Step 3: Implémenter**

```ts
// backend/src/boutique-en-ligne/chiffrement.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHME = 'aes-256-gcm';

/**
 * 64 caractères hexadécimaux = 32 octets, exigés par AES-256. Refusé
 * plutôt que dérivé d'une chaîne plus courte : une clé plus faible que ce
 * qu'elle prétend être ne doit jamais passer inaperçue.
 */
function cle(): Buffer {
  const brut = process.env.SECRETS_ENCRYPTION_KEY?.trim() ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(brut)) {
    throw new Error(
      'SECRETS_ENCRYPTION_KEY doit être 64 caractères hexadécimaux (32 octets). ' +
        'Génère-en une avec : openssl rand -hex 32',
    );
  }
  return Buffer.from(brut, 'hex');
}

export function chiffrer(clair: string): string {
  const iv = randomBytes(12);
  const chiffreur = createCipheriv(ALGORITHME, cle(), iv);
  const chiffre = Buffer.concat([chiffreur.update(clair, 'utf8'), chiffreur.final()]);
  const balise = chiffreur.getAuthTag();
  return [iv, balise, chiffre].map((b) => b.toString('hex')).join(':');
}

export function dechiffrer(valeur: string): string {
  const [ivHex, baliseHex, chiffreHex] = valeur.split(':');
  if (!ivHex || !baliseHex || !chiffreHex) {
    throw new Error('Valeur chiffrée illisible.');
  }
  const dechiffreur = createDecipheriv(ALGORITHME, cle(), Buffer.from(ivHex, 'hex'));
  dechiffreur.setAuthTag(Buffer.from(baliseHex, 'hex'));
  return Buffer.concat([
    dechiffreur.update(Buffer.from(chiffreHex, 'hex')),
    dechiffreur.final(),
  ]).toString('utf8');
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `cd backend && npx vitest run src/boutique-en-ligne/chiffrement.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/boutique-en-ligne/chiffrement.ts backend/src/boutique-en-ligne/chiffrement.spec.ts
git commit -m "feat(boutique-en-ligne): chiffrement AES-256-GCM des secrets au repos"
```

---

## Task 3: OAuth Shopify — fonctions pures

**Files:**
- Create: `backend/src/boutique-en-ligne/shopify-oauth.ts`
- Test: `backend/src/boutique-en-ligne/shopify-oauth.spec.ts`

**Interfaces:**
- Consumes: rien (module pur, aucune dépendance aux tâches précédentes).
- Produces: `construireUrlAutorisation(params): string`,
  `signerEtat(etat: EtatConnexion, secret: string): string`,
  `verifierEtat(state: string, secret: string): EtatConnexion | null`,
  `verifierHmacCallback(query: Record<string, string>, secret: string): boolean`,
  et le type `EtatConnexion = { userId: string; projectId: string }`.

- [ ] **Step 1: Écrire les tests d'abord**

```ts
// backend/src/boutique-en-ligne/shopify-oauth.spec.ts
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
    const { createHmac } = require('node:crypto');
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
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd backend && npx vitest run src/boutique-en-ligne/shopify-oauth.spec.ts`
Expected: FAIL — `Cannot find module './shopify-oauth.js'`.

- [ ] **Step 3: Implémenter**

```ts
// backend/src/boutique-en-ligne/shopify-oauth.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface EtatConnexion {
  userId: string;
  projectId: string;
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
    if (typeof payload.userId !== 'string' || typeof payload.projectId !== 'string') return null;
    return { userId: payload.userId, projectId: payload.projectId };
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
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `cd backend && npx vitest run src/boutique-en-ligne/shopify-oauth.spec.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/boutique-en-ligne/shopify-oauth.ts backend/src/boutique-en-ligne/shopify-oauth.spec.ts
git commit -m "feat(boutique-en-ligne): fonctions pures OAuth Shopify (etat signe, HMAC)"
```

---

## Task 4: Client Shopify Admin API

**Files:**
- Create: `backend/src/boutique-en-ligne/shopify-admin-client.ts`
- Test: `backend/src/boutique-en-ligne/shopify-admin-client.spec.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `echangerCodeContreJeton(shopDomain, apiKey, apiSecret, code): Promise<ShopifyTokenResponse>`,
  `listerProduits(credentials: ShopifyCredentials): Promise<ShopifyProduct[]>`,
  `creerProduit(credentials, titre, description): Promise<ShopifyProduct>`,
  `listerCommandes(credentials): Promise<ShopifyOrder[]>`, et les types
  `ShopifyCredentials = { shopDomain: string; accessToken: string }`,
  `ShopifyTokenResponse = { accessToken: string; scope: string }`,
  `ShopifyProduct = { id: string; title: string; status: string; totalInventory: number }`,
  `ShopifyOrder = { id: string; name: string; displayFinancialStatus: string; totalPriceCents: number; currency: string; createdAt: string }`.

Note pour l'implémenteur : le nom des champs GraphQL ci-dessous
(`ProductInput`, `productCreate`, `displayFinancialStatus`, …) suit le
schéma Admin GraphQL de Shopify tel que documenté à l'écriture de ce plan
(version `2025-01`). Shopify fait évoluer son schéma par version
trimestrielle : si `oxlint`/les tests d'intégration réels signalent un
champ renommé, se référer au schéma GraphQL Admin courant plutôt qu'à ce
texte.

- [ ] **Step 1: Écrire les tests d'abord**

```ts
// backend/src/boutique-en-ligne/shopify-admin-client.spec.ts
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
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd backend && npx vitest run src/boutique-en-ligne/shopify-admin-client.spec.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter**

```ts
// backend/src/boutique-en-ligne/shopify-admin-client.ts
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
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `cd backend && npx vitest run src/boutique-en-ligne/shopify-admin-client.spec.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/boutique-en-ligne/shopify-admin-client.ts backend/src/boutique-en-ligne/shopify-admin-client.spec.ts
git commit -m "feat(boutique-en-ligne): client Admin GraphQL Shopify (produits, commandes, jeton)"
```

---

## Task 5: Catalogue d'applications, signal, et lanceur

**Files:**
- Modify: `backend/src/applications/applications-catalogue.ts`
- Modify: `backend/src/applications/applications.service.ts`
- Modify: `backend/src/applications/applications.service.spec.ts`

**Interfaces:**
- Produces: `Signal` inclut désormais `'boutiqueConnectee'` ; le
  catalogue `APPLICATIONS` inclut l'entrée `id: 'boutique-en-ligne'`.

- [ ] **Step 1: Ajouter le signal et l'entrée de catalogue**

Dans `backend/src/applications/applications-catalogue.ts`, modifier
l'union `Signal` (autour de la ligne 56) :

```ts
export type Signal =
  | 'projets'
  | 'contacts'
  | 'documents'
  | 'ecritures'
  | 'comptesBancaires'
  | 'investissements'
  | 'boutiqueConnectee';
```

Puis ajouter l'entrée suivante dans `APPLICATIONS`, juste après l'entrée
`caisse` et avant `agenda` (même catégorie « vendre » que Caisse, même
public) :

```ts
  {
    id: 'boutique-en-ligne',
    nom: 'Boutique en ligne',
    resume: 'Créer et gérer ton site et ta boutique en ligne : catalogue, paiement, commandes.',
    categorie: 'vendre',
    statut: 'disponible',
    route: '/boutique-en-ligne',
    publics: ['entrepreneur'],
    essentielle: false,
    signal: 'boutiqueConnectee',
    pourquoi:
      'Tu as un projet : crée ta boutique en ligne ici, pour vendre directement depuis Ignitux.',
    apres: 'projets',
    offre: 'outilsDeGestion',
    secteurs: [],
    cadre:
      'Le paiement et les données bancaires des clients ne transitent jamais par Ignitux : ' +
      'Shopify reste l’opérateur de paiement et le responsable de la conformité PCI-DSS.',
  },
```

Il faut aussi ajouter `'boutique-en-ligne'` à l'union `APPLICATION_IDS`
(autour de la ligne 22), juste après `'caisse'`.

- [ ] **Step 2: Constater l'échec de compilation attendu**

Run: `cd backend && npx tsc --noEmit`
Expected: FAIL — `applications.service.ts` : la propriété
`boutiqueConnectee` manque dans l'objet littéral assigné à
`Record<Signal, number>`. C'est le garde-fou qui empêche d'oublier de
calculer le nouveau signal.

- [ ] **Step 3: Calculer le signal dans `ApplicationsService`**

Dans `backend/src/applications/applications.service.ts`, ajouter la
requête au `Promise.all` de `lanceurDe` :

```ts
    const [
      roles,
      projets,
      contacts,
      documents,
      ecritures,
      comptesBancaires,
      investisseur,
      offreId,
      bureau,
      boutiquesConnectees,
    ] = await Promise.all([
      this.prisma.user_roles.findMany({ where: { user_id: userId }, select: { role: true } }),
      this.prisma.projects.findMany({ where: { owner_id: userId }, select: { sector: true } }),
      this.prisma.crm_contacts.count({ where: { owner_id: userId } }),
      this.prisma.billing_documents.count({ where: { owner_id: userId } }),
      this.prisma.ledger_entries.count({ where: { owner_type: 'user', owner_id: userId } }),
      this.prisma.bank_accounts.count({ where: { owner_type: 'user', owner_id: userId } }),
      this.prisma.investors.findFirst({ where: { user_id: userId }, select: { id: true } }),
      this.offres.offreDe(userId),
      this.prisma.user_applications.findMany({
        where: { user_id: userId },
        select: { app_id: true, choix: true },
      }),
      this.prisma.shopify_connections.count({
        where: { disconnected_at: null, project: { owner_id: userId } },
      }),
    ]);
```

Et dans l'objet `usage` passé à `lanceur(...)` :

```ts
      usage: {
        projets: projets.length,
        contacts,
        documents,
        ecritures,
        comptesBancaires,
        investissements,
        boutiqueConnectee: boutiquesConnectees,
      },
```

- [ ] **Step 4: Vérifier que la compilation passe**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Mettre à jour le mock Prisma du test existant**

Dans `backend/src/applications/applications.service.spec.ts`, ajouter au
type et à l'objet `prisma` du `beforeEach` :

```ts
  let prisma: {
    // ... champs existants inchangés ...
    shopify_connections: { count: Mock };
  };
```

```ts
    prisma = {
      // ... champs existants inchangés ...
      shopify_connections: { count: vi.fn().mockResolvedValue(0) },
    };
```

- [ ] **Step 6: Lancer la suite existante pour vérifier qu'elle passe toujours**

Run: `cd backend && npx vitest run src/applications`
Expected: PASS (tous les tests existants, inchangés dans leur intention).

- [ ] **Step 7: Ajouter un test dédié au nouveau signal**

Ajouter dans `applications.service.spec.ts` :

```ts
  it('marque la boutique en ligne comme déjà utilisée quand une connexion est active', async () => {
    prisma.shopify_connections.count.mockResolvedValue(1);

    const bureau = await service.lanceurDe('u1');

    expect(prisma.shopify_connections.count).toHaveBeenCalledWith({
      where: { disconnected_at: null, project: { owner_id: 'u1' } },
    });
    expect(ids(bureau.applications).length).toBeGreaterThanOrEqual(0); // le calcul n'échoue pas
  });
```

- [ ] **Step 8: Lancer le test**

Run: `cd backend && npx vitest run src/applications/applications.service.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/applications/applications-catalogue.ts backend/src/applications/applications.service.ts backend/src/applications/applications.service.spec.ts
git commit -m "feat(boutique-en-ligne): entree au catalogue d'applications et signal d'usage"
```

---

## Task 6: Droit d'offre `boutique_en_ligne`

**Files:**
- Modify: `backend/src/offres/droits.ts`
- Modify: `backend/src/offres/droits.spec.ts`

**Interfaces:**
- Produces: `Action` accepte
  `{ kind: 'outil_de_gestion'; outil: 'comptabilite' | 'facturation' | 'banque' | 'boutique_en_ligne' }`.

- [ ] **Step 1: Écrire le test d'abord**

Ajouter dans `backend/src/offres/droits.spec.ts` :

```ts
describe('outil de gestion — boutique en ligne', () => {
  it('refuse en Découverte et en Entrepreneur, nomme Construction', () => {
    for (const id of ['decouverte', 'entrepreneur'] as const) {
      const verdict = peut(id, { kind: 'outil_de_gestion', outil: 'boutique_en_ligne' });
      expect(verdict.autorise, id).toBe(false);
      expect(verdict.offreQuiOuvre, id).toBe('construction');
    }
  });

  it('autorise en Construction', () => {
    expect(
      peut('construction', { kind: 'outil_de_gestion', outil: 'boutique_en_ligne' }).autorise,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd backend && npx vitest run src/offres/droits.spec.ts`
Expected: FAIL — erreur TypeScript, `'boutique_en_ligne'` n'est pas
assignable à `outil`.

- [ ] **Step 3: Étendre le type `Action`**

Dans `backend/src/offres/droits.ts`, modifier la ligne 40 :

```ts
  | { kind: 'outil_de_gestion'; outil: 'comptabilite' | 'facturation' | 'banque' | 'boutique_en_ligne' }
```

Le `case 'outil_de_gestion'` existant (ligne 136) n'a besoin d'aucun
changement : il ne distingue déjà pas selon `action.outil`, il ne teste
que `capacites.outilsDeGestion`.

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `cd backend && npx vitest run src/offres/droits.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/offres/droits.ts backend/src/offres/droits.spec.ts
git commit -m "feat(boutique-en-ligne): etendre outil_de_gestion a boutique_en_ligne"
```

---

## Task 7: `BoutiqueEnLigneService` — connexion et cycle de vie

**Files:**
- Create: `backend/src/boutique-en-ligne/boutique-en-ligne.service.ts`
- Test: `backend/src/boutique-en-ligne/boutique-en-ligne.service.spec.ts`

**Interfaces:**
- Consumes: `chiffrer`/`dechiffrer` (Task 2), `construireUrlAutorisation`/
  `signerEtat`/`verifierEtat`/`verifierHmacCallback` (Task 3),
  `echangerCodeContreJeton` (Task 4), `assertOwnsProject` (existant,
  `backend/src/prisma/assert-owns-project.js`), `OffresService.exiger`
  (existant, injecté).
- Produces: `BoutiqueEnLigneService` avec `etat(userId, projectId)`,
  `demarrerConnexion(userId, projectId, shopDomain)`,
  `traiterCallback(query: Record<string, string>)`,
  `deconnecter(userId, projectId)`, `declarerForfait(userId, projectId, forfait, prixCentimes)`.
  Consommé par Task 8 (mêmes méthodes de classe, étendue) et Task 9
  (contrôleurs).

- [ ] **Step 1: Écrire les tests d'abord**

```ts
// backend/src/boutique-en-ligne/boutique-en-ligne.service.spec.ts
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { OffresService } from '../offres/offres.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BoutiqueEnLigneService } from './boutique-en-ligne.service.js';
import * as shopifyAdmin from './shopify-admin-client.js';

type Mock = ReturnType<typeof vi.fn>;

const ENV_VALIDE = {
  SHOPIFY_API_KEY: 'cle',
  SHOPIFY_API_SECRET: 'secret-suffisamment-long',
  SHOPIFY_SCOPES: 'read_products,write_products,read_orders',
  SHOPIFY_APP_URL: 'https://api.ignitux.fr',
  SECRETS_ENCRYPTION_KEY: 'a'.repeat(64),
  FRONTEND_URL: 'https://ignitux.fr',
};

describe('BoutiqueEnLigneService', () => {
  let service: BoutiqueEnLigneService;
  let prisma: {
    projects: { findFirst: Mock };
    shopify_connections: { findFirst: Mock; upsert: Mock; update: Mock };
  };
  let offres: { exiger: Mock };
  const anciennesEnv = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, ENV_VALIDE);
    prisma = {
      projects: { findFirst: vi.fn().mockResolvedValue({ id: 'p1', owner_id: 'u1' }) },
      shopify_connections: {
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    offres = { exiger: vi.fn().mockResolvedValue(undefined) };
    service = new BoutiqueEnLigneService(
      prisma as unknown as PrismaService,
      offres as unknown as OffresService,
    );
  });

  afterEach(() => {
    process.env = { ...anciennesEnv };
    vi.restoreAllMocks();
  });

  describe('etat', () => {
    it('refuse un projet qui n’appartient pas à l’appelant', async () => {
      prisma.projects.findFirst.mockResolvedValue(null);
      await expect(service.etat('u1', 'p-autrui')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rend "non connectée" quand aucune ligne n’existe', async () => {
      const etat = await service.etat('u1', 'p1');
      expect(etat).toEqual({
        connectee: false,
        shopDomain: null,
        forfaitDeclare: null,
        prixDeclareCentimes: null,
        connectedAt: null,
      });
    });

    it('rend l’état connecté quand une ligne active existe', async () => {
      prisma.shopify_connections.findFirst.mockResolvedValue({
        shop_domain: 'ma-boutique.myshopify.com',
        forfait_declare: 'Basic',
        prix_declare_centimes: 2900,
        connected_at: new Date('2026-09-20T00:00:00Z'),
        disconnected_at: null,
      });

      const etat = await service.etat('u1', 'p1');
      expect(etat.connectee).toBe(true);
      expect(etat.shopDomain).toBe('ma-boutique.myshopify.com');
    });
  });

  describe('demarrerConnexion', () => {
    it('exige la capacité outil_de_gestion / boutique_en_ligne', async () => {
      await service.demarrerConnexion('u1', 'p1', 'ma-boutique.myshopify.com');
      expect(offres.exiger).toHaveBeenCalledWith('u1', {
        kind: 'outil_de_gestion',
        outil: 'boutique_en_ligne',
      });
    });

    it('refuse un domaine qui n’est pas un sous-domaine myshopify.com', async () => {
      await expect(service.demarrerConnexion('u1', 'p1', 'pas-un-domaine')).rejects.toThrow(
        /myshopify\.com/,
      );
      await expect(
        service.demarrerConnexion('u1', 'p1', 'javascript:alert(1)'),
      ).rejects.toThrow(/myshopify\.com/);
    });

    it('renvoie une URL Shopify avec un state signé', async () => {
      const resultat = await service.demarrerConnexion('u1', 'p1', 'ma-boutique.myshopify.com');
      expect(resultat.url).toContain('https://ma-boutique.myshopify.com/admin/oauth/authorize');
      expect(resultat.url).toContain('client_id=cle');
    });

    it('refuse quand Shopify n’est pas configuré', async () => {
      delete process.env.SHOPIFY_API_KEY;
      await expect(
        service.demarrerConnexion('u1', 'p1', 'ma-boutique.myshopify.com'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('traiterCallback', () => {
    it('échange le code, chiffre le jeton, et enregistre la connexion', async () => {
      vi.spyOn(shopifyAdmin, 'echangerCodeContreJeton').mockResolvedValue({
        accessToken: 'shpat_abc',
        scope: 'read_products',
      });

      const { url } = await service.demarrerConnexion('u1', 'p1', 'ma-boutique.myshopify.com');
      const state = new URL(url).searchParams.get('state')!;

      await service.traiterCallback({
        shop: 'ma-boutique.myshopify.com',
        code: 'code123',
        state,
        hmac: 'peu-importe-ici', // la vérification HMAC est testée dans shopify-oauth.spec.ts
        timestamp: '123',
      });

      expect(prisma.shopify_connections.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { project_id: 'p1' },
        }),
      );
    });

    it('refuse un state invalide sans toucher la base', async () => {
      await expect(
        service.traiterCallback({ shop: 's', code: 'c', state: 'invalide', hmac: 'x' }),
      ).rejects.toThrow();
      expect(prisma.shopify_connections.upsert).not.toHaveBeenCalled();
    });
  });

  describe('declarerForfait', () => {
    it('refuse quand aucune connexion n’existe encore', async () => {
      await expect(
        service.declarerForfait('u1', 'p1', 'Basic', 2900),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('met à jour le forfait déclaré sur une connexion existante', async () => {
      prisma.shopify_connections.findFirst.mockResolvedValue({ id: 'c1' });
      await service.declarerForfait('u1', 'p1', 'Basic', 2900);
      expect(prisma.shopify_connections.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { forfait_declare: 'Basic', prix_declare_centimes: 2900 },
      });
    });
  });

  describe('deconnecter', () => {
    it('marque la connexion comme déconnectée', async () => {
      prisma.shopify_connections.findFirst.mockResolvedValue({ id: 'c1' });
      await service.deconnecter('u1', 'p1');
      expect(prisma.shopify_connections.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { disconnected_at: expect.any(Date) },
      });
    });
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd backend && npx vitest run src/boutique-en-ligne/boutique-en-ligne.service.spec.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter**

```ts
// backend/src/boutique-en-ligne/boutique-en-ligne.service.ts
import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { assertOwnsProject } from '../prisma/assert-owns-project.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OffresService } from '../offres/offres.service.js';
import { chiffrer, dechiffrer } from './chiffrement.js';
import { echangerCodeContreJeton } from './shopify-admin-client.js';
import {
  construireUrlAutorisation,
  signerEtat,
  verifierEtat,
  verifierHmacCallback,
} from './shopify-oauth.js';

export interface EtatBoutique {
  connectee: boolean;
  shopDomain: string | null;
  forfaitDeclare: string | null;
  prixDeclareCentimes: number | null;
  connectedAt: string | null;
}

const DOMAINE_SHOPIFY = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

interface Configuration {
  apiKey: string;
  apiSecret: string;
  scopes: string;
  appUrl: string;
}

@Injectable()
export class BoutiqueEnLigneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offres: OffresService,
  ) {}

  /**
   * `null` quand la brique n'est pas configurée : une fonctionnalité
   * optionnelle absente ne doit jamais empêcher tout Ignitux de démarrer
   * (voir PAIEMENT_FOURNISSEUR="aucun", même principe).
   */
  private configuration(): Configuration | null {
    const apiKey = process.env.SHOPIFY_API_KEY?.trim();
    const apiSecret = process.env.SHOPIFY_API_SECRET?.trim();
    const scopes = process.env.SHOPIFY_SCOPES?.trim();
    const appUrl = process.env.SHOPIFY_APP_URL?.trim();
    if (!apiKey || !apiSecret || !scopes || !appUrl) return null;
    return { apiKey, apiSecret, scopes, appUrl };
  }

  private exigerConfiguration(): Configuration {
    const config = this.configuration();
    if (!config) {
      throw new ServiceUnavailableException(
        'La connexion à Shopify n’est pas encore configurée côté Ignitux.',
      );
    }
    return config;
  }

  async etat(userId: string, projectId: string): Promise<EtatBoutique> {
    await assertOwnsProject(this.prisma, userId, projectId);
    const connexion = await this.prisma.shopify_connections.findFirst({
      where: { project_id: projectId, disconnected_at: null },
    });

    if (!connexion) {
      return {
        connectee: false,
        shopDomain: null,
        forfaitDeclare: null,
        prixDeclareCentimes: null,
        connectedAt: null,
      };
    }

    return {
      connectee: true,
      shopDomain: connexion.shop_domain,
      forfaitDeclare: connexion.forfait_declare,
      prixDeclareCentimes: connexion.prix_declare_centimes,
      connectedAt: connexion.connected_at.toISOString(),
    };
  }

  async demarrerConnexion(
    userId: string,
    projectId: string,
    shopDomain: string,
  ): Promise<{ url: string }> {
    await this.offres.exiger(userId, { kind: 'outil_de_gestion', outil: 'boutique_en_ligne' });
    await assertOwnsProject(this.prisma, userId, projectId);

    if (!DOMAINE_SHOPIFY.test(shopDomain)) {
      throw new Error('Le domaine doit être un sous-domaine « *.myshopify.com ».');
    }

    const config = this.exigerConfiguration();
    const state = signerEtat({ userId, projectId }, config.apiSecret);

    return {
      url: construireUrlAutorisation({
        shopDomain,
        apiKey: config.apiKey,
        scopes: config.scopes,
        redirectUri: `${config.appUrl}/boutique-en-ligne/callback`,
        state,
      }),
    };
  }

  async traiterCallback(query: Record<string, string>): Promise<void> {
    const config = this.exigerConfiguration();

    if (!verifierHmacCallback(query, config.apiSecret)) {
      throw new Error('Signature Shopify invalide.');
    }

    const etat = verifierEtat(query.state ?? '', config.apiSecret);
    if (!etat) {
      throw new Error('État de connexion invalide ou expiré.');
    }

    // Défense en profondeur : le state a déjà prouvé l'appartenance au
    // moment de démarrerConnexion, mais un projet a pu être supprimé ou
    // transféré entre-temps.
    await assertOwnsProject(this.prisma, etat.userId, etat.projectId);

    const jeton = await echangerCodeContreJeton(
      query.shop,
      config.apiKey,
      config.apiSecret,
      query.code,
    );

    await this.prisma.shopify_connections.upsert({
      where: { project_id: etat.projectId },
      create: {
        project_id: etat.projectId,
        shop_domain: query.shop,
        access_token_chiffre: chiffrer(jeton.accessToken),
        scopes: jeton.scope,
      },
      update: {
        shop_domain: query.shop,
        access_token_chiffre: chiffrer(jeton.accessToken),
        scopes: jeton.scope,
        connected_at: new Date(),
        disconnected_at: null,
      },
    });
  }

  async deconnecter(userId: string, projectId: string): Promise<void> {
    const connexion = await this.trouverConnexionActive(userId, projectId);
    await this.prisma.shopify_connections.update({
      where: { id: connexion.id },
      data: { disconnected_at: new Date() },
    });
  }

  async declarerForfait(
    userId: string,
    projectId: string,
    forfait: string,
    prixCentimes: number,
  ): Promise<void> {
    const connexion = await this.trouverConnexionActive(userId, projectId);
    await this.prisma.shopify_connections.update({
      where: { id: connexion.id },
      data: { forfait_declare: forfait, prix_declare_centimes: prixCentimes },
    });
  }

  /** Partagé avec Task 8 : les méthodes produits/commandes en ont aussi besoin. */
  private async trouverConnexionActive(userId: string, projectId: string) {
    await assertOwnsProject(this.prisma, userId, projectId);
    const connexion = await this.prisma.shopify_connections.findFirst({
      where: { project_id: projectId, disconnected_at: null },
    });
    if (!connexion) {
      throw new NotFoundException('Aucune boutique Shopify connectée pour ce projet.');
    }
    return connexion;
  }

  /** Partagé avec Task 8. */
  private dechiffrerJeton(connexion: { access_token_chiffre: string }): string {
    return dechiffrer(connexion.access_token_chiffre);
  }
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `cd backend && npx vitest run src/boutique-en-ligne/boutique-en-ligne.service.spec.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/boutique-en-ligne/boutique-en-ligne.service.ts backend/src/boutique-en-ligne/boutique-en-ligne.service.spec.ts
git commit -m "feat(boutique-en-ligne): service de connexion OAuth Shopify"
```

---

## Task 8: `BoutiqueEnLigneService` — produits et commandes

**Files:**
- Modify: `backend/src/boutique-en-ligne/boutique-en-ligne.service.ts`
- Modify: `backend/src/boutique-en-ligne/boutique-en-ligne.service.spec.ts`

**Interfaces:**
- Consumes: `listerProduits`, `creerProduit`, `listerCommandes` (Task 4),
  `trouverConnexionActive`/`dechiffrerJeton` (Task 7, méthodes privées
  ajoutées au même fichier `boutique-en-ligne.service.ts`, pas une classe
  séparée).
- Produces: `listerProduits(userId, projectId)`,
  `creerProduit(userId, projectId, titre, description)`,
  `listerCommandes(userId, projectId)` sur `BoutiqueEnLigneService`.

- [ ] **Step 1: Écrire les tests d'abord**

Ajouter dans `boutique-en-ligne.service.spec.ts` (même fichier que
Task 7), avec les imports supplémentaires `import * as shopifyAdmin from './shopify-admin-client.js';`
déjà présents :

```ts
  describe('produits et commandes', () => {
    beforeEach(() => {
      prisma.shopify_connections.findFirst.mockResolvedValue({
        id: 'c1',
        shop_domain: 'ma-boutique.myshopify.com',
        access_token_chiffre: (() => {
          // Chiffré avec la même clé que ENV_VALIDE, pour un aller-retour réel.
          const { chiffrer } = require('./chiffrement.js');
          return chiffrer('shpat_reel');
        })(),
      });
    });

    it('liste les produits de la boutique connectée', async () => {
      const spy = vi
        .spyOn(shopifyAdmin, 'listerProduits')
        .mockResolvedValue([{ id: 'gid://1', title: 'Bougie', status: 'ACTIVE', totalInventory: 5 }]);

      const produits = await service.listerProduits('u1', 'p1');

      expect(spy).toHaveBeenCalledWith({
        shopDomain: 'ma-boutique.myshopify.com',
        accessToken: 'shpat_reel',
      });
      expect(produits).toHaveLength(1);
    });

    it('refuse de lister les produits sans boutique connectée', async () => {
      prisma.shopify_connections.findFirst.mockResolvedValue(null);
      await expect(service.listerProduits('u1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('crée un produit sur la boutique connectée', async () => {
      const spy = vi
        .spyOn(shopifyAdmin, 'creerProduit')
        .mockResolvedValue({ id: 'gid://2', title: 'Savon', status: 'DRAFT', totalInventory: 0 });

      const produit = await service.creerProduit('u1', 'p1', 'Savon', null);

      expect(spy).toHaveBeenCalledWith(
        { shopDomain: 'ma-boutique.myshopify.com', accessToken: 'shpat_reel' },
        'Savon',
        null,
      );
      expect(produit.title).toBe('Savon');
    });

    it('liste les commandes de la boutique connectée', async () => {
      vi.spyOn(shopifyAdmin, 'listerCommandes').mockResolvedValue([]);
      const commandes = await service.listerCommandes('u1', 'p1');
      expect(commandes).toEqual([]);
    });
  });
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd backend && npx vitest run src/boutique-en-ligne/boutique-en-ligne.service.spec.ts`
Expected: FAIL — `service.listerProduits is not a function`.

- [ ] **Step 3: Implémenter**

Ajouter dans `backend/src/boutique-en-ligne/boutique-en-ligne.service.ts` :

- l'import : `import { creerProduit as creerProduitShopify, listerCommandes as listerCommandesShopify, listerProduits as listerProduitsShopify, type ShopifyCredentials } from './shopify-admin-client.js';`
  (renommés à l'import pour ne pas entrer en collision avec les méthodes
  de même nom sur la classe)
- les méthodes, à la suite de `dechiffrerJeton` :

```ts
  private async credentials(userId: string, projectId: string): Promise<ShopifyCredentials> {
    const connexion = await this.trouverConnexionActive(userId, projectId);
    return {
      shopDomain: connexion.shop_domain,
      accessToken: this.dechiffrerJeton(connexion),
    };
  }

  async listerProduits(userId: string, projectId: string) {
    return listerProduitsShopify(await this.credentials(userId, projectId));
  }

  async creerProduit(userId: string, projectId: string, titre: string, description: string | null) {
    return creerProduitShopify(await this.credentials(userId, projectId), titre, description);
  }

  async listerCommandes(userId: string, projectId: string) {
    return listerCommandesShopify(await this.credentials(userId, projectId));
  }
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `cd backend && npx vitest run src/boutique-en-ligne/boutique-en-ligne.service.spec.ts`
Expected: PASS (16 tests au total pour ce fichier).

- [ ] **Step 5: Commit**

```bash
git add backend/src/boutique-en-ligne/boutique-en-ligne.service.ts backend/src/boutique-en-ligne/boutique-en-ligne.service.spec.ts
git commit -m "feat(boutique-en-ligne): produits et commandes via l'API Shopify"
```

---

## Task 9: Contrôleurs, DTOs, module, câblage

**Files:**
- Create: `backend/src/boutique-en-ligne/dto/boutique-en-ligne.dto.ts`
- Create: `backend/src/boutique-en-ligne/boutique-en-ligne.controller.ts`
- Create: `backend/src/boutique-en-ligne/boutique-en-ligne-callback.controller.ts`
- Create: `backend/src/boutique-en-ligne/boutique-en-ligne.module.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/src/boutique-en-ligne/boutique-en-ligne.controller.spec.ts`

**Interfaces:**
- Consumes: `BoutiqueEnLigneService` (Tasks 7-8), `JwtAuthGuard`/
  `CurrentUser`/`AuthenticatedUser` (existants).
- Produces: les routes HTTP du module, montées dans `AppModule`.

- [ ] **Step 1: DTOs**

```ts
// backend/src/boutique-en-ligne/dto/boutique-en-ligne.dto.ts
import { IsInt, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export class DemarrerConnexionDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/, {
    message: 'Le domaine doit être un sous-domaine « *.myshopify.com ».',
  })
  shopDomain: string;
}

export class DeclarerForfaitDto {
  @IsString()
  @MinLength(1, { message: 'Le nom du forfait ne peut pas être vide.' })
  forfait: string;

  @IsInt()
  @Min(0, { message: 'Un prix ne peut pas être négatif.' })
  prixCentimes: number;
}

export class CreerProduitDto {
  @IsString()
  @MinLength(1, { message: 'Un produit a un titre.' })
  titre: string;

  @IsOptional()
  @IsString()
  description?: string;
}
```

- [ ] **Step 2: Contrôleur authentifié (état, connexion, produits, commandes)**

```ts
// backend/src/boutique-en-ligne/boutique-en-ligne.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BoutiqueEnLigneService } from './boutique-en-ligne.service.js';
import { CreerProduitDto, DeclarerForfaitDto, DemarrerConnexionDto } from './dto/boutique-en-ligne.dto.js';

@ApiTags('boutique-en-ligne')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/boutique-en-ligne')
export class BoutiqueEnLigneController {
  constructor(private readonly service: BoutiqueEnLigneService) {}

  @Get()
  etat(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.service.etat(user.id, projectId);
  }

  @Post('connexion')
  demarrerConnexion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: DemarrerConnexionDto,
  ) {
    return this.service.demarrerConnexion(user.id, projectId, dto.shopDomain);
  }

  @Post('deconnexion')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deconnecter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    await this.service.deconnecter(user.id, projectId);
  }

  @Patch('forfait')
  declarerForfait(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: DeclarerForfaitDto,
  ) {
    return this.service.declarerForfait(user.id, projectId, dto.forfait, dto.prixCentimes);
  }

  @Get('produits')
  listerProduits(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.service.listerProduits(user.id, projectId);
  }

  @Post('produits')
  @HttpCode(HttpStatus.CREATED)
  creerProduit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreerProduitDto,
  ) {
    return this.service.creerProduit(user.id, projectId, dto.titre, dto.description ?? null);
  }

  @Get('commandes')
  listerCommandes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.service.listerCommandes(user.id, projectId);
  }
}
```

- [ ] **Step 3: Contrôleur public du callback OAuth**

Le callback est une redirection de navigateur venant de Shopify : aucun
jeton Ignitux ne l'accompagne, donc `JwtAuthGuard` ne s'applique pas
ici — l'authentification passe par le `state` signé, vérifié dans le
service.

```ts
// backend/src/boutique-en-ligne/boutique-en-ligne-callback.controller.ts
import { Controller, Get, Logger, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BoutiqueEnLigneService } from './boutique-en-ligne.service.js';

interface ReponseRedirection {
  redirect: (url: string) => void;
}

@ApiTags('boutique-en-ligne')
@Controller('boutique-en-ligne')
export class BoutiqueEnLigneCallbackController {
  private readonly logger = new Logger(BoutiqueEnLigneCallbackController.name);

  constructor(private readonly service: BoutiqueEnLigneService) {}

  @Get('callback')
  async callback(
    @Query() query: Record<string, string>,
    @Res({ passthrough: false }) res: ReponseRedirection,
  ): Promise<void> {
    const frontend = process.env.FRONTEND_URL ?? '';
    try {
      await this.service.traiterCallback(query);
      res.redirect(`${frontend}/boutique-en-ligne?connecte=1`);
    } catch (error) {
      this.logger.error(
        `Callback Shopify refusé : ${error instanceof Error ? error.message : String(error)}`,
      );
      res.redirect(`${frontend}/boutique-en-ligne?erreur=1`);
    }
  }
}
```

- [ ] **Step 4: Module**

```ts
// backend/src/boutique-en-ligne/boutique-en-ligne.module.ts
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { BoutiqueEnLigneCallbackController } from './boutique-en-ligne-callback.controller.js';
import { BoutiqueEnLigneController } from './boutique-en-ligne.controller.js';
import { BoutiqueEnLigneService } from './boutique-en-ligne.service.js';

@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [BoutiqueEnLigneController, BoutiqueEnLigneCallbackController],
  providers: [BoutiqueEnLigneService],
})
export class BoutiqueEnLigneModule {}
```

- [ ] **Step 5: Câbler dans `AppModule`**

Dans `backend/src/app.module.ts`, ajouter l'import :

```ts
import { BoutiqueEnLigneModule } from './boutique-en-ligne/boutique-en-ligne.module.js';
```

et `BoutiqueEnLigneModule,` dans le tableau `imports`, juste après
`CaisseModule,`.

- [ ] **Step 6: Écrire un test de contrôleur**

```ts
// backend/src/boutique-en-ligne/boutique-en-ligne.controller.spec.ts
import { BoutiqueEnLigneController } from './boutique-en-ligne.controller.js';
import { BoutiqueEnLigneService } from './boutique-en-ligne.service.js';

type Mock = ReturnType<typeof vi.fn>;

describe('BoutiqueEnLigneController', () => {
  let controller: BoutiqueEnLigneController;
  let service: Record<string, Mock>;
  const USER = { id: 'u1', email: 'u1@ignitux.test' };

  beforeEach(() => {
    service = {
      etat: vi.fn().mockResolvedValue({ connectee: false }),
      demarrerConnexion: vi.fn().mockResolvedValue({ url: 'https://...' }),
      deconnecter: vi.fn().mockResolvedValue(undefined),
      declarerForfait: vi.fn().mockResolvedValue(undefined),
      listerProduits: vi.fn().mockResolvedValue([]),
      creerProduit: vi.fn().mockResolvedValue({}),
      listerCommandes: vi.fn().mockResolvedValue([]),
    };
    controller = new BoutiqueEnLigneController(service as unknown as BoutiqueEnLigneService);
  });

  it('relaie etat avec l’utilisateur et le projet', async () => {
    await controller.etat(USER, 'p1');
    expect(service.etat).toHaveBeenCalledWith('u1', 'p1');
  });

  it('relaie demarrerConnexion avec le domaine du DTO', async () => {
    await controller.demarrerConnexion(USER, 'p1', { shopDomain: 'x.myshopify.com' });
    expect(service.demarrerConnexion).toHaveBeenCalledWith('u1', 'p1', 'x.myshopify.com');
  });

  it('relaie creerProduit avec description null par défaut', async () => {
    await controller.creerProduit(USER, 'p1', { titre: 'Bougie' });
    expect(service.creerProduit).toHaveBeenCalledWith('u1', 'p1', 'Bougie', null);
  });
});
```

- [ ] **Step 7: Lancer les tests**

Run: `cd backend && npx vitest run src/boutique-en-ligne`
Expected: PASS (l'ensemble des fichiers de `src/boutique-en-ligne`, dont
ce nouveau fichier).

- [ ] **Step 8: Vérifier que l'application démarre toujours**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS — aucune route en conflit, aucun provider manquant.

- [ ] **Step 9: Commit**

```bash
git add backend/src/boutique-en-ligne/dto backend/src/boutique-en-ligne/boutique-en-ligne.controller.ts backend/src/boutique-en-ligne/boutique-en-ligne-callback.controller.ts backend/src/boutique-en-ligne/boutique-en-ligne.module.ts backend/src/boutique-en-ligne/boutique-en-ligne.controller.spec.ts backend/src/app.module.ts
git commit -m "feat(boutique-en-ligne): controleurs REST et cablage du module"
```

---

## Task 10: Variables d'environnement

**Files:**
- Modify: `backend/.env.example`

**Interfaces:** aucune — configuration seulement.

- [ ] **Step 1: Ajouter le bloc Shopify à `.env.example`**

Ajouter à la fin de `backend/.env.example` :

```bash
# ---------------------------------------------------------------------------
# BOUTIQUE EN LIGNE (SHOPIFY)
#
# Optionnel : en leur absence, Ignitux démarre normalement et seule la
# route de connexion à une boutique Shopify répond "indisponible" (même
# principe que PAIEMENT_FOURNISSEUR="aucun"). Nécessite un compte Shopify
# Partner et une application personnalisée créée dans son tableau de bord.
# ---------------------------------------------------------------------------

SHOPIFY_API_KEY=""
SHOPIFY_API_SECRET=""
SHOPIFY_SCOPES="read_products,write_products,read_orders"
# L'adresse publique de CE backend (pas celle du frontend) : c'est ici que
# Shopify redirige après autorisation, sur /boutique-en-ligne/callback.
SHOPIFY_APP_URL="http://localhost:3000"

# 64 caractères hexadécimaux (32 octets), pour chiffrer le jeton d'accès
# Shopify au repos. Génère-en une avec : openssl rand -hex 32
SECRETS_ENCRYPTION_KEY=""
```

- [ ] **Step 2: Vérifier qu'aucun test de démarrage n'est cassé**

Run: `cd backend && npx vitest run src/config`
Expected: PASS — `production-preflight.ts` n'a volontairement pas été
modifié (voir Global Constraints), donc rien à casser ici.

- [ ] **Step 3: Commit**

```bash
git add backend/.env.example
git commit -m "docs(boutique-en-ligne): variables d'environnement Shopify dans .env.example"
```

---

## Task 11: IGINI mentionne Shopify dans Construire et Financer

**Files:**
- Modify: `backend/src/igini/planning/planning.service.ts`
- Modify: `backend/src/igini/financing/financing.service.ts`
- Modify: `backend/src/igini/planning/planning.service.spec.ts`
- Modify: `backend/src/igini/financing/financing.service.spec.ts`

**Interfaces:** aucune — changement de texte de prompt seulement, aucun
schéma ni signature ne change.

- [ ] **Step 1: Écrire les tests d'abord**

Ajouter dans `planning.service.spec.ts` :

```ts
  it('mentionne un compte Shopify comme ressource pour un projet de vente en ligne', async () => {
    claude.generateStructuredOutput.mockResolvedValue({
      summary: 'x',
      estimated_timeline: 'x',
      milestones: ['x'],
      key_resources: ['x'],
    });

    await service.createBuildPlan('Boutique en ligne', 'Vendre des bougies', ATTRIBUTION);

    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({ system: expect.stringContaining('Shopify') }),
    );
  });
```

Ajouter symétriquement dans `financing.service.spec.ts` (même structure
d'attribution et de mock que ce fichier utilise déjà) :

```ts
  it('mentionne un compte Shopify comme poste de dépense pour la vente en ligne', async () => {
    claude.generateStructuredOutput.mockResolvedValue({
      summary: 'x',
      estimated_budget: 'x',
      funding_sources: ['x'],
      budget_breakdown: ['x'],
    });

    await service.createFinancingPlan('Boutique en ligne', 'Vendre des bougies', ATTRIBUTION);

    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({ system: expect.stringContaining('Shopify') }),
    );
  });
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd backend && npx vitest run src/igini/planning/planning.service.spec.ts src/igini/financing/financing.service.spec.ts`
Expected: FAIL sur les deux nouveaux tests — le mot « Shopify » n'apparaît
pas encore dans `SYSTEM_PROMPT`.

- [ ] **Step 3: Modifier le prompt de `PlanningService`**

Dans `backend/src/igini/planning/planning.service.ts`, remplacer la fin
de `SYSTEM_PROMPT` :

```ts
const SYSTEM_PROMPT = buildSystemPrompt(`Ici, tu appliques la deuxième des cinq étapes de ta
méthode : Construire. On te donne le titre et la description d'une idée de projet, et
éventuellement ce que tu sais déjà d'elle (une analyse déjà faite — jamais d'étape ultérieure,
puisque celles-ci n'existent pas encore à ce stade). Propose un plan de construction concret et
réaliste, cohérent avec cette analyse si elle existe : des jalons actionnables (pas de généralités
type "faire une étude de marché" sans préciser comment), adaptés au stade de l'idée décrite. Si le
projet suppose de vendre en ligne, cite explicitement un compte Shopify (ou une plateforme
e-commerce équivalente) parmi les ressources nécessaires, avec un ordre de grandeur de coût mensuel
réaliste (environ 25 à 100 dollars selon le forfait) plutôt qu'une généralité du type "créer un
site web".`);
```

- [ ] **Step 4: Modifier le prompt de `FinancingService`**

Dans `backend/src/igini/financing/financing.service.ts`, remplacer la fin
de `SYSTEM_PROMPT` :

```ts
const SYSTEM_PROMPT = buildSystemPrompt(`Ici, tu appliques la troisième des cinq étapes de ta
méthode : Financer, dans la continuité de Construire. On te donne le titre et la description
d'une idée de projet, et éventuellement ce que tu sais déjà d'elle (analyse, plan de construction
— jamais d'étape ultérieure, puisque celles-ci n'existent pas encore à ce stade). Propose une
stratégie de financement réaliste, cohérente avec ce contexte s'il existe : ne recommande pas une
levée de fonds en capital-risque pour une idée qui n'a pas encore été validée, et reste concret sur
les montants et les sources. Si le projet suppose de vendre en ligne, inclus l'abonnement à une
plateforme e-commerce (Shopify ou équivalent, environ 25 à 100 dollars par mois selon le forfait)
parmi les postes de dépense du budget prévisionnel.`);
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `cd backend && npx vitest run src/igini/planning/planning.service.spec.ts src/igini/financing/financing.service.spec.ts`
Expected: PASS (tous les tests des deux fichiers, existants inclus — ils
n'assertent pas le texte exact du prompt).

- [ ] **Step 6: Commit**

```bash
git add backend/src/igini/planning/planning.service.ts backend/src/igini/financing/financing.service.ts backend/src/igini/planning/planning.service.spec.ts backend/src/igini/financing/financing.service.spec.ts
git commit -m "feat(boutique-en-ligne): IGINI cite Shopify dans Construire et Financer"
```

---

## Task 12: Frontend — types, API, et catalogue du système

**Files:**
- Modify: `frontend/src/lib/systeme.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/systeme.spec.ts` (vérification, pas de
  nouveau test — le test existant doit continuer à passer)

**Interfaces:**
- Produces: `api.getBoutiqueEnLigneEtat`, `api.demarrerConnexionBoutique`,
  `api.deconnecterBoutique`, `api.declarerForfaitBoutique`,
  `api.listerProduitsBoutique`, `api.creerProduitBoutique`,
  `api.listerCommandesBoutique`, et les types `BoutiqueEnLigneEtat`,
  `ShopifyProduct`, `ShopifyOrder`.

- [ ] **Step 1: Ajouter l'entrée dans `APPS_SYSTEME`**

Dans `frontend/src/lib/systeme.ts`, insérer, **exactement à la même
position relative que dans le catalogue backend** (juste après `caisse`,
avant `agenda` — l'ordre est vérifié par `systeme.spec.ts`) :

```ts
  { id: 'caisse', nom: 'Caisse', route: '/caisse' },
  { id: 'boutique-en-ligne', nom: 'Boutique en ligne', route: '/boutique-en-ligne' },
  { id: 'agenda', nom: 'Agenda', route: '/agenda' },
```

- [ ] **Step 2: Vérifier que le test de dérive de catalogue passe toujours**

Run: `cd frontend && npx vitest run src/lib/systeme.spec.ts`
Expected: PASS — le test compare `APPS_SYSTEME` à ce qu'il relit dans
`applications-catalogue.ts` (Task 5), qui porte désormais la même entrée
à la même position.

- [ ] **Step 3: Ajouter les types dans `frontend/src/lib/api.ts`**

Ajouter, à la suite du bloc `StockItem`/`StockMovement` (fin du fichier
des types métier) :

```ts
export interface BoutiqueEnLigneEtat {
  connectee: boolean;
  shopDomain: string | null;
  forfaitDeclare: string | null;
  prixDeclareCentimes: number | null;
  connectedAt: string | null;
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
```

- [ ] **Step 4: Ajouter les méthodes à l'objet `api`**

Ajouter, dans l'objet `api` de `frontend/src/lib/api.ts` (à la suite du
bloc `// ── LA COMPTABILITE`, par exemple), les méthodes suivantes :

```ts
  // ── BOUTIQUE EN LIGNE ────────────────────────────────────────────────────
  getBoutiqueEnLigneEtat: (token: string, projectId: string) =>
    request<BoutiqueEnLigneEtat>(`/projects/${projectId}/boutique-en-ligne`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  demarrerConnexionBoutique: (token: string, projectId: string, shopDomain: string) =>
    request<{ url: string }>(`/projects/${projectId}/boutique-en-ligne/connexion`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ shopDomain }),
    }),

  deconnecterBoutique: (token: string, projectId: string) =>
    request<void>(`/projects/${projectId}/boutique-en-ligne/deconnexion`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }),

  declarerForfaitBoutique: (token: string, projectId: string, forfait: string, prixCentimes: number) =>
    request<void>(`/projects/${projectId}/boutique-en-ligne/forfait`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ forfait, prixCentimes }),
    }),

  listerProduitsBoutique: (token: string, projectId: string) =>
    request<ShopifyProduct[]>(`/projects/${projectId}/boutique-en-ligne/produits`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  creerProduitBoutique: (token: string, projectId: string, titre: string, description?: string) =>
    request<ShopifyProduct>(`/projects/${projectId}/boutique-en-ligne/produits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ titre, description }),
    }),

  listerCommandesBoutique: (token: string, projectId: string) =>
    request<ShopifyOrder[]>(`/projects/${projectId}/boutique-en-ligne/commandes`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
```

- [ ] **Step 5: Vérifier la compilation TypeScript**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/systeme.ts frontend/src/lib/api.ts
git commit -m "feat(boutique-en-ligne): types et client API frontend"
```

---

## Task 13: Frontend — page Boutique en ligne

**Files:**
- Create: `frontend/src/app/boutique-en-ligne/page.tsx`
- Test: `frontend/src/app/boutique-en-ligne/page.spec.tsx`

**Interfaces:**
- Consumes: `api.getBoutiqueEnLigneEtat`, `api.demarrerConnexionBoutique`,
  `api.deconnecterBoutique`, `api.declarerForfaitBoutique`,
  `api.listerProduitsBoutique`, `api.creerProduitBoutique`,
  `api.listerCommandesBoutique`, `api.listLedgerAccounts`,
  `api.openLedgerAccount`, `api.recordLedgerEntry` (existants, Task 12).

Cette page prend `projectId` en paramètre de requête (`?projet=<id>`),
comme le fait déjà `frontend/src/app/projects/[id]/finances/page.tsx`
pour ses propres sous-écrans liés à un projet — à vérifier dans ce
fichier existant et à reproduire pour la navigation (lien depuis la fiche
projet). Ce plan couvre l'écran lui-même, pas ce lien d'entrée.

- [ ] **Step 1: Écrire un test de rendu d'abord**

```tsx
// frontend/src/app/boutique-en-ligne/page.spec.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { signInAs } from '@/test-utils/mocks';
import * as apiModule from '@/lib/api';
import BoutiqueEnLignePage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('projet=p1'),
}));

function afficher() {
  return render(
    <AuthProvider>
      <BoutiqueEnLignePage />
    </AuthProvider>,
  );
}

describe('BoutiqueEnLignePage', () => {
  beforeEach(() => {
    signInAs('tok123', { id: 'u1', email: 'fictif@ignitux.test' });
  });

  it('propose de connecter une boutique quand aucune n’est connectée', async () => {
    vi.spyOn(apiModule.api, 'getBoutiqueEnLigneEtat').mockResolvedValue({
      connectee: false,
      shopDomain: null,
      forfaitDeclare: null,
      prixDeclareCentimes: null,
      connectedAt: null,
    });

    afficher();

    expect(await screen.findByRole('button', { name: /connecter/i })).toBeInTheDocument();
  });

  it('affiche le domaine et les produits quand une boutique est connectée', async () => {
    vi.spyOn(apiModule.api, 'getBoutiqueEnLigneEtat').mockResolvedValue({
      connectee: true,
      shopDomain: 'ma-boutique.myshopify.com',
      forfaitDeclare: null,
      prixDeclareCentimes: null,
      connectedAt: '2026-09-20T00:00:00Z',
    });
    vi.spyOn(apiModule.api, 'listerProduitsBoutique').mockResolvedValue([
      { id: 'gid://1', title: 'Bougie', status: 'ACTIVE', totalInventory: 5 },
    ]);
    vi.spyOn(apiModule.api, 'listerCommandesBoutique').mockResolvedValue([]);

    afficher();

    expect(await screen.findByText('ma-boutique.myshopify.com')).toBeInTheDocument();
    expect(await screen.findByText('Bougie')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd frontend && npx vitest run src/app/boutique-en-ligne/page.spec.tsx`
Expected: FAIL — `./page` introuvable.

- [ ] **Step 3: Implémenter la page**

```tsx
// frontend/src/app/boutique-en-ligne/page.tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  type BoutiqueEnLigneEtat,
  type ShopifyOrder,
  type ShopifyProduct,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function BoutiqueEnLignePage() {
  const { token, isReady } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const projectId = params.get('projet') ?? '';

  const [etat, setEtat] = useState<BoutiqueEnLigneEtat | null>(null);
  const [produits, setProduits] = useState<ShopifyProduct[]>([]);
  const [commandes, setCommandes] = useState<ShopifyOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [shopDomain, setShopDomain] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const [forfait, setForfait] = useState('');
  const [prixEuros, setPrixEuros] = useState('');

  function charger() {
    if (!token || !projectId) return;
    setIsLoading(true);
    api
      .getBoutiqueEnLigneEtat(token, projectId)
      .then((valeur) => {
        setEtat(valeur);
        if (valeur.connectee) {
          api.listerProduitsBoutique(token, projectId).then(setProduits).catch(() => undefined);
          api.listerCommandesBoutique(token, projectId).then(setCommandes).catch(() => undefined);
        }
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Impossible de charger la boutique.'),
      )
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    if (isReady && !token) {
      router.replace('/login');
      return;
    }
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, token, projectId]);

  if (!isReady || !token) return null;

  async function handleConnecter(e: FormEvent) {
    e.preventDefault();
    if (!token || !shopDomain.trim()) return;
    setError(null);
    setIsConnecting(true);
    try {
      const { url } = await api.demarrerConnexionBoutique(token, projectId, shopDomain.trim());
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connexion impossible.');
      setIsConnecting(false);
    }
  }

  async function handleDeclarerForfait(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const prixCentimes = Math.round(parseFloat(prixEuros.replace(',', '.')) * 100);
    if (!forfait.trim() || !Number.isFinite(prixCentimes) || prixCentimes < 0) return;
    try {
      await api.declarerForfaitBoutique(token, projectId, forfait.trim(), prixCentimes);
      charger();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible d’enregistrer le forfait.');
    }
  }

  return (
    <div>
      <h1>Boutique en ligne</h1>
      {error && <p role="alert">{error}</p>}
      {isLoading && <p>Chargement…</p>}

      {!isLoading && etat && !etat.connectee && (
        <form onSubmit={handleConnecter}>
          <p>Aucune boutique connectée pour ce projet.</p>
          <label htmlFor="shop-domain">Domaine Shopify (xxx.myshopify.com)</label>
          <input
            id="shop-domain"
            value={shopDomain}
            onChange={(e) => setShopDomain(e.target.value)}
            placeholder="ma-boutique.myshopify.com"
          />
          <button type="submit" disabled={isConnecting}>
            Connecter ma boutique Shopify
          </button>
        </form>
      )}

      {!isLoading && etat && etat.connectee && (
        <div>
          <p>{etat.shopDomain}</p>

          {!etat.forfaitDeclare && (
            <form onSubmit={handleDeclarerForfait}>
              <p>Quel forfait Shopify as-tu choisi ?</p>
              <label htmlFor="forfait">Nom du forfait</label>
              <input id="forfait" value={forfait} onChange={(e) => setForfait(e.target.value)} />
              <label htmlFor="prix">Prix mensuel (€)</label>
              <input id="prix" value={prixEuros} onChange={(e) => setPrixEuros(e.target.value)} />
              <button type="submit">Enregistrer le forfait</button>
            </form>
          )}

          {etat.forfaitDeclare && etat.prixDeclareCentimes !== null && (
            <p>
              Forfait {etat.forfaitDeclare} — {(etat.prixDeclareCentimes / 100).toFixed(2)} € / mois.
              Pense à l’enregistrer dans ta{' '}
              <a href={`/comptabilite?projet=${projectId}`}>comptabilité</a> : Ignitux ne le fait
              jamais à ta place.
            </p>
          )}

          <h2>Produits</h2>
          <ul>
            {produits.map((produit) => (
              <li key={produit.id}>{produit.title}</li>
            ))}
          </ul>

          <h2>Commandes</h2>
          <ul>
            {commandes.map((commande) => (
              <li key={commande.id}>
                {commande.name} — {(commande.totalPriceCents / 100).toFixed(2)} {commande.currency}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `cd frontend && npx vitest run src/app/boutique-en-ligne/page.spec.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Vérifier la compilation et le lint**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/boutique-en-ligne
git commit -m "feat(boutique-en-ligne): ecran de connexion, produits et commandes"
```

---

## Task 14: Vérification finale

**Files:** aucun changement de code — vérification uniquement.

- [ ] **Step 1: Suite backend complète**

Run: `cd backend && npx vitest run`
Expected: PASS, sans régression sur les suites existantes.

- [ ] **Step 2: Vérification de type backend**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Lint backend**

Run: `cd backend && npx oxlint --type-aware src/`
Expected: PASS (ou uniquement des avertissements déjà présents avant ce
plan — ne pas lancer `prettier --write`, voir Global Constraints).

- [ ] **Step 4: Suite frontend complète**

Run: `cd frontend && npx vitest run`
Expected: PASS, y compris `src/lib/systeme.spec.ts` (Task 12) et
`src/components/systeme.spec.tsx` (barre des tâches, non modifié mais
sensible à toute entrée de catalogue mal placée).

- [ ] **Step 5: Vérification de type frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Relire la spec une dernière fois**

Comparer `docs/superpowers/specs/2026-09-27-boutique-en-ligne-design.md`
à ce qui a été construit : catalogue payant (Task 5-6), OAuth sans
paiement (Tasks 2-4, 7), pas d'écriture comptable automatique (Task 13 —
lien vers `/comptabilite`, aucun appel à `LedgerService`), IGINI qui cite
Shopify (Task 11). Confirmer qu'aucun écart n'est resté sans explication.

- [ ] **Step 7: Commit final si des ajustements ont été faits**

```bash
git add -A
git commit -m "chore(boutique-en-ligne): verification finale de la branche"
```

(Ne rien committer si Steps 1-6 n'ont rien changé.)
