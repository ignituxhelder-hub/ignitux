# Déploiement V1 — test privé

Ce document liste tout ce qu'il faut configurer pour mettre IGNITUX en ligne pour la bêta
privée : backend sur Render ou Railway, frontend sur Vercel. Il ne déclenche aucun
déploiement — c'est la préparation (Tâche 6 du plan). Les comptes à créer et les secrets à
fournir sont demandés séparément (Tâche 7) ; ce document leur sert de référence.

## Pourquoi Render/Railway + Vercel plutôt que tout-Docker

Un document antérieur (`docs/hebergement.md`, 26/09/2026) recommandait de déployer les deux
services comme conteneurs Docker sur Scalingo ou Railway, sans Vercel. Cette V1 suit à la
place la consigne explicite de Helder : backend sur Render ou Railway, frontend sur Vercel.
`backend/Dockerfile` reste utilisable tel quel (Render/Railway démarrent nativement depuis un
Dockerfile). `frontend/Dockerfile` n'est **pas** utilisé pour Vercel — Vercel build Next.js
nativement, sans conteneur.

## Variables d'environnement — backend (Render ou Railway)

| Variable | Valeur pour la bêta | Obligatoire au démarrage ? |
|---|---|---|
| `NODE_ENV` | `production` | oui — déclenche tous les contrôles ci-dessous |
| `DATABASE_URL` | fournie par Helder (Supabase, base `ignitux_prod`, **pas** `postgres`) | oui |
| `JWT_SECRET` | généré (`openssl rand -base64 48`), différent de dev, ≥ 32 caractères | oui |
| `JWT_EXPIRES_IN` | `1d` (déjà la valeur par défaut) | non |
| `FRONTEND_URL` | URL Vercel finale, en `https://` | oui |
| `TRUST_PROXY` | `1` (Render/Railway sont derrière un proxy) | oui |
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
| `IGINI_QUOTA_COST_EUR_PER_MONTH` | `2` (déjà la valeur par défaut — 10 testeurs actifs restent sous 20 €/mois) | non |
| `IGNITUX_BETA_V1` | `true` (déjà la valeur par défaut — sans moyen de paiement, ouvre l'offre Entrepreneur par défaut aux testeurs pour qu'ils puissent essayer les 6 générateurs) | non |
| `PORT` | injecté automatiquement par l'hébergeur | — |

**Note sur `MAIL_TRANSPORT=log`** : si aucun fournisseur SMTP n'est configuré pour ce premier
test, "mot de passe oublié" ne fonctionnera pas (l'email part seulement dans les journaux du
serveur). Pour un tout petit groupe de testeurs de confiance, c'est un risque acceptable pour
un premier tour — à condition de le savoir. Configurer un vrai SMTP reste recommandé (Tâche 7).

## Variable d'environnement — frontend (Vercel)

| Variable | Valeur pour la bêta |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL du backend Render/Railway, en `https://` — **doit être définie avant `next build`**, pas seulement au démarrage (Next.js l'intègre au code au moment de la compilation) |

## Contrôle au démarrage (déjà en place, vérifié)

`backend/src/config/production-preflight.ts` refuse de démarrer en production si l'une des
variables obligatoires ci-dessus manque ou garde une valeur d'exemple du dépôt (`JWT_SECRET`
laissé à `change-me`, `FRONTEND_URL` qui pointe sur `localhost`, `DATABASE_URL` qui pointe sur
la base `postgres` au lieu de `ignitux_prod`, etc.). Le message d'erreur nomme précisément ce
qui manque — rien à ajouter ici, juste à lire les journaux du premier démarrage s'il refuse.

## Procédure (Tâche 8, une fois les comptes et secrets de la Tâche 7 réunis)

1. Configurer les variables ci-dessus sur Render/Railway, déployer le backend.
2. Exécuter la migration de production une seule fois : `npx prisma migrate deploy` (avec
   `DATABASE_URL` pointée sur `ignitux_prod`).
3. Vérifier `GET /ready` sur l'URL backend — doit répondre en bonne santé.
4. Configurer `NEXT_PUBLIC_API_URL` sur Vercel, déployer le frontend.
5. Revenir sur Render/Railway, mettre à jour `FRONTEND_URL` avec l'URL Vercel finale (sinon
   CORS refuse les requêtes du frontend).

## URLs de production

*(à compléter une fois le déploiement réel fait — Tâche 8)*

- Backend : —
- Frontend (lien à envoyer aux testeurs) : —
