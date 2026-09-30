# Boutique en ligne — une nouvelle application Ignitux

27 septembre 2026. Design validé avec Helder en session de brainstorming.
Prochaine étape : plan d'implémentation (writing-plans).

## Pourquoi

Un entrepreneur qui vient chez Ignitux pour développer un business en ligne
doit pouvoir, sans quitter Ignitux, se doter d'un vrai site et d'une vraie
boutique e-commerce (catalogue, paiement, commandes) — pas seulement d'un
plan pour en construire un un jour. Aujourd'hui, l'étape « Construire »
d'IGINI ne produit qu'un plan texte (jalons, ressources) ; rien dans le
produit ne construit techniquement quoi que ce soit.

## Ce que ce n'est pas

Ignitux ne réinvente pas un moteur e-commerce ni un opérateur de paiement.
Construire son propre système de paiement pour le compte de chaque
entrepreneur ferait d'Ignitux un établissement de paiement de fait
(encaissement, conformité PCI-DSS, litiges, fiscalité) — un métier à part
entière, sans rapport avec la charge réglementaire qu'Ignitux porte déjà
pour son propre moyen de paiement (bloqué faute de SIRET, voir
`reste-a-faire.md`). La brique s'appuie donc sur une plateforme e-commerce
déjà conforme : **Shopify**.

## Portée

Une seule application, complète dès la version 1 — pas de phase « vitrine
puis boutique » : catalogue produits, paiement, commandes, tout ce dont un
e-commerce a besoin, disponible en un seul endroit.

## Intégration au catalogue d'applications

Nouvelle entrée dans `backend/src/applications/applications-catalogue.ts` :

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
  signal: 'boutiqueConnectee', // nouveau signal, voir plus bas
  pourquoi: 'Tu as un projet : crée ta boutique en ligne ici, pour vendre directement depuis Ignitux.',
  apres: 'projets',
  offre: 'outilsDeGestion',
  secteurs: [],
  cadre: 'Le paiement et les données bancaires des clients ne transitent jamais par Ignitux : Shopify reste l’opérateur de paiement et le responsable de la conformité PCI-DSS.',
}
```

**Nom distinct du concept existant.** L'accueil (`frontend/src/app/accueil/page.tsx`)
a déjà une section « boutique » qui sert à *ajouter des applications
Ignitux* au bureau (mémoire du 26/09). Le nouvel id `boutique-en-ligne` et
le nom affiché « Boutique en ligne » évitent la confusion : l'une ajoute
des outils, l'autre est un outil.

**Nouveau signal.** `Signal` (même fichier) gagne `'boutiqueConnectee'` —
posé quand `shopify_connections` a une ligne active pour le projet, sur le
même principe que `comptesBancaires` ou `ecritures` : une application déjà
utilisée n'est plus « suggérée ».

**Accès par offre : payant (Construction, `outilsDeGestion`).** Décision de
Helder — cohérent avec Facturation/Comptabilité/Banque/Stocks/Caisse,
qui suivent déjà la même règle pour « gérer une activité réelle ».

## Modèle de données

Nouvelle table Prisma, poussée d'abord sur la base de dev uniquement (même
prudence que `user_applications`) :

```prisma
model shopify_connections {
  id                    String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  project_id            String    @unique @db.Uuid
  shop_domain           String
  access_token_chiffre  String
  scopes                String
  forfait_declare       String?
  prix_declare_centimes Int?
  connected_at          DateTime  @default(now())
  disconnected_at       DateTime?
  created_at            DateTime  @default(now())
  updated_at            DateTime  @updatedAt

  project projects @relation(fields: [project_id], references: [id])
}
```

Une boutique par projet (`project_id` unique) — un projet est une
entreprise, une entreprise a une boutique. `access_token_chiffre` : jamais
en clair. **Vérifié : aucun utilitaire de chiffrement symétrique n'existe
encore côté serveur** (recherché dans `backend/src` — rien en
`crypto`/`createCipheriv`, seul `sauvegarde.mjs` chiffre, mais en AES-256
via OpenSSL, en script ponctuel, pas dans le serveur qui tourne). Ce
module introduit donc un petit utilitaire `chiffrement.ts` (AES-256-GCM,
clé lue depuis une nouvelle variable `SECRETS_ENCRYPTION_KEY`, jamais en
base) — même algorithme que `sauvegarde.mjs` pour rester cohérent, mais
appelable en continu par le serveur plutôt qu'en ligne de commande.
`forfait_declare`/`prix_declare_centimes` : Shopify n'expose pas à une
application tierce le montant que paie le marchand ; l'entrepreneur le
déclare lui-même, une fois, à la connexion.

## Flux de connexion (OAuth Shopify)

1. L'entrepreneur ouvre `/boutique-en-ligne`. Si son offre ne couvre pas
   `outilsDeGestion`, refus standard via `droits.ts` (voir plus bas).
2. S'il n'a pas encore de compte Shopify : lien externe vers la création
   d'un compte Shopify (Ignitux ne crée pas de compte à sa place — c'est
   l'entrepreneur qui reste titulaire et payeur de son abonnement Shopify,
   décision actée en session).
3. S'il a déjà un domaine `*.myshopify.com` : redirection OAuth vers
   Shopify (`/admin/oauth/authorize`), via l'application Shopify
   personnalisée d'Ignitux (compte Shopify Partner requis — nouvelle
   dépendance tierce, voir plus bas).
4. Callback signé (vérification HMAC + `state`), échange du code contre un
   jeton d'accès, jeton chiffré et stocké dans `shopify_connections`.
5. Écran de confirmation : « Quel forfait as-tu choisi ? » (liste des
   forfaits Shopify connus avec leur prix indicatif). Cette réponse
   alimente `forfait_declare`/`prix_declare_centimes` et prépare le
   brouillon comptable (section suivante) — elle ne le poste pas.

## Comptabilité : proposer, jamais imposer

Point vérifié dans `backend/src/ledger/chart-of-accounts.ts` : Ignitux
**n'ouvre et n'écrit jamais d'office dans les livres d'un entrepreneur** —
« leur comptabilité est la leur », et le faire serait la donnée inventée
que l'article 9 interdit. Le plan `IGNITUX_CHART` ne sert qu'aux propres
comptes d'Ignitux.

En conséquence, l'abonnement Shopify déclaré ne s'écrit pas seul, et
**aucun nouvel endpoint de comptabilisation n'est nécessaire** : les
endpoints existants suffisent (`GET/POST /comptabilite/comptes`,
`POST /comptabilite/ecritures`, déjà exposés côté frontend par
`api.listLedgerAccounts`/`api.openLedgerAccount`/`api.recordLedgerEntry`).
Le module Boutique en ligne se contente de **suggérer**, jamais de
choisir à la place de l'entrepreneur :

- À la validation du forfait (étape 5 ci-dessus), l'écran affiche le
  montant déclaré et un libellé suggéré (« Abonnement Shopify — <forfait>
  »), avec un bouton « Enregistrer dans ma comptabilité ».
- Ce bouton ouvre un petit formulaire qui laisse l'entrepreneur choisir
  lui-même le compte à débiter (ses comptes de charge existants, via
  `listLedgerAccounts` — ou le créer sur place, comme il le ferait déjà
  depuis `/comptabilite`, sans qu'Ignitux lui impose un numéro de compte)
  et le compte à créditer (banque ou fournisseurs). Aucun numéro de compte
  n'est pré-choisi par Ignitux : seule la comptabilité française suit une
  numérotation PCG, et rien ne dit que celle de l'entrepreneur la suit.
- Le clic final appelle l'endpoint `POST /comptabilite/ecritures`
  existant — le module Boutique en ligne ne touche donc jamais
  `ledger_entries` directement, il ne fait que pré-remplir un formulaire
  qui utilise le circuit déjà en place.
- Le renouvellement mensuel automatique de cette écriture est hors
  périmètre v1 (voir plus bas) : on ne construit pas un système de
  dépenses récurrentes pour une seule brique.

## Planification IA (Construire / Financer)

Changement de prompt, pas de schéma. `PlanningService.createBuildPlan`
(`backend/src/igini/planning/planning.service.ts`) et
`FinancingService.createFinancingPlan`
(`backend/src/igini/financing/financing.service.ts`) gagnent une
instruction dans leur `SYSTEM_PROMPT` : quand le projet décrit une
activité de vente en ligne, citer explicitement un compte Shopify (ou
équivalent) comme ressource/poste de dépense, avec un ordre de grandeur
réaliste (~25-100 $/mois selon le forfait) — cohérent avec l'exigence déjà
posée de rester concret plutôt que générique. `BuildPlanSchema` et
`FinancingPlanSchema` ne changent pas : `key_resources`,
`funding_sources` et `budget_breakdown` restent des tableaux de texte
libre, la mention y trouve sa place naturellement.

## Backend : module `boutique-en-ligne`

`backend/src/boutique-en-ligne/` :

- `boutique-en-ligne.controller.ts`
  - `GET /projects/:projectId/boutique-en-ligne` — état de connexion
  - `GET /projects/:projectId/boutique-en-ligne/connexion` — URL
    d'autorisation OAuth
  - `GET /boutique-en-ligne/callback` — callback OAuth Shopify
  - `POST /projects/:projectId/boutique-en-ligne/deconnexion`
  - `GET /projects/:projectId/boutique-en-ligne/produits` /
    `POST .../produits` — catalogue, via l'API Admin Shopify (GraphQL)
  - `GET /projects/:projectId/boutique-en-ligne/commandes` — lecture seule
- `boutique-en-ligne.service.ts` — appels à l'API Admin Shopify,
  chiffrement/déchiffrement du jeton
- Garde d'offre : extension de `Action` dans `backend/src/offres/droits.ts`
  — `{ kind: 'outil_de_gestion'; outil: 'comptabilite' | 'facturation' |
  'banque' | 'boutique_en_ligne' }`. **Choix assumé** : ce nouveau module
  applique un vrai contrôle serveur dès le départ (pas seulement un
  drapeau côté lanceur, comme c'est le cas aujourd'hui pour Stocks/Caisse
  — un trou déjà documenté comme décision ouverte pour Helder ailleurs).
  On ne corrige pas Stocks/Caisse ici : hors périmètre de ce chantier.

## Frontend

- `frontend/src/app/boutique-en-ligne/page.tsx` — état non connecté (bouton
  connecter/créer), état connecté (domaine, forfait déclaré, dernières
  commandes, catalogue), écran de confirmation du forfait.
- `frontend/src/lib/systeme.ts` — entrée `boutique-en-ligne` dans la carte
  route→application, avec le même id que le backend (`systeme.spec.ts`
  échoue déjà sur toute dérive entre les deux catalogues).

## Sécurité

- Jeton d'accès Shopify chiffré au repos, jamais en clair en base.
- Callback OAuth vérifié par HMAC et `state` signé (anti-CSRF).
- Aucune donnée de carte bancaire ne transite par les serveurs d'Ignitux —
  le paiement reste entièrement chez Shopify.
- Le guard `outil_de_gestion` protège toutes les routes du module.

## Nouvelle dépendance tierce

S'ajoute à la liste déjà connue (hébergement, domaine, SMTP, moyen de
paiement, dans `docs/reste-a-faire.md`) : **un compte Shopify Partner**,
avec `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_SCOPES`,
`SHOPIFY_APP_URL`. Même discipline que `PAIEMENT_FOURNISSEUR="aucun"` :
leur absence ne bloque pas le démarrage du serveur (une brique optionnelle
ne doit pas empêcher tout Ignitux de tourner) — elle rend seulement la
route de connexion Shopify indisponible, avec un message clair plutôt
qu'un plantage, jusqu'à ce que Helder les pose.

## Hors périmètre (explicitement exclu de cette v1)

- **Ignitux revendeur/Partner qui provisionne et facture Shopify** pour le
  compte de l'entrepreneur — écarté en session : l'entrepreneur reste
  titulaire de son propre abonnement Shopify.
- **Synchronisation bidirectionnelle avec le module Stocks d'Ignitux** —
  la boutique lit/écrit son propre catalogue Shopify ; relier ça à
  l'inventaire interne d'Ignitux est un chantier séparable.
- **Correction du trou d'enforcement `outil_de_gestion` pour Stocks/Caisse**
  — décision ouverte préexistante, pas celle de ce chantier.
- **Écritures comptables récurrentes automatiques** — v1 propose une
  écriture à la connexion ; le renouvellement mensuel reste manuel (ou
  sujet d'un futur système de rappels).
- **Domaine personnalisé, thèmes avancés, marketing** — gérés directement
  dans l'admin Shopify, pas dupliqués dans l'interface Ignitux.

## Tests à prévoir

- `applications-catalogue` / `systeme.spec.ts` — cohérence des deux
  catalogues, comme pour toute nouvelle application.
- `droits.spec.ts` — nouveau cas `outil_de_gestion` /
  `boutique_en_ligne`, autorisé/refusé selon l'offre.
- e2e OAuth avec un Shopify mocké (succès, HMAC invalide, state invalide).
- Le module Boutique en ligne ne contient aucun appel à
  `LedgerService`/`ledger_entries` — seule la suggestion d'affichage
  (montant, libellé) est testée ; l'écriture elle-même passe par le
  formulaire existant de `/comptabilite`.
