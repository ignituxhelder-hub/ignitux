# Déploiement V1 — ouverture publique

Ce document liste tout ce qu'il faut configurer pour mettre IGNITUX en ligne : backend sur
Render, frontend sur Vercel. Il ne déclenche aucun déploiement — c'est la préparation
(Tâche 6 du plan). Les comptes à créer et les secrets à fournir sont demandés séparément
(Tâche 7) ; ce document leur sert de référence.

**Render plutôt que Railway (2026-10-01)** : les deux étaient envisagés, Render a été choisi
parce qu'il a un vrai plan gratuit sans carte bancaire (limite : le service s'endort après
15 min d'inactivité et se réveille en ~1 minute), alors que Railway n'offre plus qu'un
crédit d'essai limité et peut demander une carte. Cohérent avec la décision de ne pas
engager de dépense récurrente avant que le produit ait des utilisateurs réels.

Révisé pour l'ouverture publique (au lieu de la bêta privée sur invitation d'origine) :
chaque inscription passe maintenant par une vérification anti-robot (Cloudflare Turnstile,
voir plus bas), et `IGNITUX_BETA_V1` passe à `false` pour que les nouveaux comptes tombent
sur l'offre Découverte gratuite plutôt que sur l'offre payante Entrepreneur offerte
automatiquement.

## Pourquoi Render + Vercel plutôt que tout-Docker

Un document antérieur (`docs/hebergement.md`, 26/09/2026) recommandait de déployer les deux
services comme conteneurs Docker sur Scalingo ou Railway, sans Vercel. Cette V1 suit à la
place la consigne explicite de Helder : backend sur Render, frontend sur Vercel.
`backend/Dockerfile` reste utilisable tel quel (Render démarre nativement depuis un
Dockerfile). `frontend/Dockerfile` n'est **pas** utilisé pour Vercel — Vercel build Next.js
nativement, sans conteneur.

## Variables d'environnement — backend (Render)

| Variable | Valeur | Obligatoire au démarrage ? |
|---|---|---|
| `NODE_ENV` | `production` | oui — déclenche tous les contrôles ci-dessous |
| `DATABASE_URL` | fournie par Helder (Supabase, base `ignitux_prod`, **pas** `postgres`) | oui |
| `JWT_SECRET` | généré (`openssl rand -base64 48`), différent de dev, ≥ 32 caractères | oui |
| `JWT_EXPIRES_IN` | `1d` (déjà la valeur par défaut) | non |
| `FRONTEND_URL` | URL Vercel finale, en `https://` | oui |
| `TRUST_PROXY` | `1` (Render est derrière un proxy) | oui |
| `MAIL_TRANSPORT` | `smtp` si un fournisseur est configuré (Tâche 7), sinon `log` — voir note ci-dessous | oui |
| `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | fournies par Helder si `MAIL_TRANSPORT=smtp` | si smtp |
| `ENABLE_API_DOCS` | `false` | non (défaut déjà `false`) |
| `IGNITUX_RAISON_SOCIALE` | fournie par Helder | oui |
| `IGNITUX_ADRESSE` | fournie par Helder | oui |
| `IGNITUX_EMAIL` | fournie par Helder | oui |
| `IGNITUX_IDENTIFIANT`, `IGNITUX_TVA` | facultatives tant qu'il n'y a pas de facturation réelle | non |
| `IGNITUX_IBAN`, `IGNITUX_BIC` | idem | non |
| `PAIEMENT_FOURNISSEUR` | `aucun` | non (défaut) |
| `ANTHROPIC_API_KEY` | fournie par Helder | non au démarrage, mais requise pour que les générateurs répondent |
| `IGINI_AI_ENABLED` | `true` — **sans ça, aucun générateur ne fonctionne** | non (défaut déjà `true`) |
| `IGINI_QUOTA_COST_EUR_PER_MONTH` | `2` par défaut — plafond par personne. Pas de plafond global : Helder gère le risque de coût agrégé lui-même, probablement via le plafond de dépense de la console Anthropic | non |
| `IGNITUX_BETA_V1` | `false` — **changé pour l'ouverture publique** (l'ancienne valeur `true` ouvrait l'offre payante Entrepreneur gratuitement à tout inscrit ; en public, les nouveaux comptes tombent sur l'offre Découverte gratuite) | oui, à poser explicitement |
| `TURNSTILE_SECRET_KEY` | clé secrète du tableau de bord Cloudflare Turnstile — **nouvelle, obligatoire au démarrage** | oui |
| `PORT` | injecté automatiquement par l'hébergeur | — |

**Note sur `MAIL_TRANSPORT=log`** : si aucun fournisseur SMTP n'est configuré, l'email part
seulement dans les journaux du serveur — voir la limite connue ci-dessous, qui détaille
pourquoi c'est un choix assumé pour ce premier tour plutôt qu'un oubli.

## Variables d'environnement — frontend (Vercel)

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL du backend Render, en `https://` — **doit être définie avant `next build`**, pas seulement au démarrage (Next.js l'intègre au code au moment de la compilation) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | clé SITE (publique) du même site Cloudflare Turnstile que `TURNSTILE_SECRET_KEY` côté backend — doit elle aussi être définie avant `next build` |

## Limite connue : « mot de passe oublié »

Tant qu'aucun nom de domaine n'est acheté et vérifié chez un fournisseur d'email (Resend)
ou que l'envoi SMTP (Outlook) n'est pas finalisé, `MAIL_TRANSPORT` reste `log` :
« mot de passe oublié » ne fonctionne pour personne, silencieusement. Décision assumée
pour ce premier tour d'ouverture publique (Helder achètera le domaine plus tard) — à
corriger rapidement une fois le domaine en place.

## Contrôle au démarrage (déjà en place, vérifié)

`backend/src/config/production-preflight.ts` refuse de démarrer en production si l'une des
variables obligatoires ci-dessus manque ou garde une valeur d'exemple du dépôt (`JWT_SECRET`
laissé à `change-me`, `FRONTEND_URL` qui pointe sur `localhost`, `DATABASE_URL` qui pointe sur
la base `postgres` au lieu de `ignitux_prod`, `TURNSTILE_SECRET_KEY` laissée à la clé de test
Cloudflare, etc.). Le message d'erreur nomme précisément ce qui manque — rien à ajouter ici,
juste à lire les journaux du premier démarrage s'il refuse.

## Procédure (Tâche 8, une fois les comptes et secrets de la Tâche 7 réunis)

1. Configurer les variables ci-dessus sur Render, déployer le backend.
2. Exécuter la migration de production une seule fois : `npx prisma migrate deploy` (avec
   `DATABASE_URL` pointée sur `ignitux_prod`).
3. Vérifier `GET /ready` sur l'URL backend — doit répondre en bonne santé.
4. Configurer `NEXT_PUBLIC_API_URL` sur Vercel, déployer le frontend.
5. Revenir sur Render, mettre à jour `FRONTEND_URL` avec l'URL Vercel finale (sinon CORS
   refuse les requêtes du frontend).

## À faire AVANT de déployer « IGINI exécute les tâches et la conformité »

Cette fonctionnalité a besoin d'une migration de la base de production : `20261007100000_taches_ia`.
Elle ajoute seulement : quelques colonnes à la table `tasks` et une nouvelle table
`project_compliance_ai_runs`. Rien n'est supprimé ni modifié dans les données existantes.

Elle doit être appliquée **avant** de déployer le code, sinon l'application cherchera des colonnes
qui n'existent pas encore. C'est vous (le fondateur) qui la lancez, depuis votre propre PowerShell,
dans le dossier `backend`, dans cet ordre :

1. Vérifier (lecture seule, ne change rien) : `node scripts/verifier-base.mjs .env.production`
   — la réponse doit être « ADDITIF ». Sinon, s'arrêter et demander.
2. Sauvegarder : `node scripts/sauvegarde.mjs --env .env.production`
3. Appliquer : `node scripts/migrer-prod.mjs` (montre la cible sans rien faire — vérifier que c'est
   bien `ignitux_prod`), puis `node scripts/migrer-prod.mjs --appliquer`.

## URLs de production

*(à compléter une fois le déploiement réel fait — Tâche 8)*

- Backend : —
- Frontend (lien public) : —
