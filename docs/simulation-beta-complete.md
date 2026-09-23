# Simulation bêta — rapport d'audit

23 septembre 2026. Rédigé comme un auditeur externe : sans ménagement, sans protéger le projet.

> **Note de préparation bêta : 52 / 100.**
>
> Le produit est solide. L'exploitation n'existe pas. Ignitux ne peut aujourd'hui être ouvert à
> personne — non pas à cause d'un défaut fonctionnel, mais parce qu'il ne peut ni démarrer en
> production, ni envoyer un email, ni être déployé nulle part, et qu'un tiers de ses
> fonctionnalités n'a jamais touché une base de données.

---

## 0. Ce qui n'a pas pu être fait, et pourquoi

**La mission demandait de partir d'une nouvelle `DATABASE_URL`. Elle n'est pas arrivée sur cette
machine.**

```
backend/.env            -> db.vrgsrisgoocyjqbhefsg.supabase.co  (ENOTFOUND)
backend/.env.test       -> idem
backend/.env.production -> idem
variable d'environnement du shell : absente
dernier fichier .env modifié : par moi, à 08h08
```

Vérifié aussi : aucun fichier du dépôt n'a été touché par quelqu'un d'autre dans les deux
dernières heures. La chaîne existe peut-être dans un tableau de bord Supabase ; elle n'existe pas
ici.

**Conséquence directe : aucune des dix simulations n'a été exécutée.** Ni migration, ni
sauvegarde, ni validation. Le document `docs/validation-finale.md` demandé n'a **pas** été créé —
un document intitulé « validation finale » qui ne rapporterait aucune validation serait un
mensonge par titre.

Ce qui suit est donc de deux natures, et je les sépare : ce qui a été **vérifié** par lecture du
code, et ce qui est **prêt à être exécuté**.

---

## 1. Ce qui a été vérifié — audit statique

### 1.1 Autorisation entre comptes : aucun trou trouvé

58 méthodes de service recevant à la fois un utilisateur et un projet ont été énumérées
automatiquement. 10 ne portaient pas de garde visible ; **les 10 ont été lues une par une**.

| Méthode | Verdict |
|---|---|
| `memory.listTags`, `memory.summarize` | Déléguent à `search()`, qui appelle `assertHasProjectAccess` |
| `knowledge.getGraph`, `knowledge.listCategories` | Déléguent à `listConcepts()`, même garde |
| `crm.getPipeline` | Filtre par `owner_id` dans la clause WHERE |
| `investors.projectRegisterByProject` | `findFirst({ where: { id, owner_id } })` — garde en ligne |
| `journey.forProject` | Garde en ligne (propriétaire OU collaborateur) |
| `scoring.assertScoresHaveSources`, `projects.generatedProvenance` | Auxiliaires privés, appelés après la garde |
| `workflow-engine.advanceActiveRunsForProject` | Aucune route ne l'expose |

**Zéro faille d'autorisation horizontale détectable statiquement.** Ce n'est pas une preuve
d'absence : le profil 8 du harnais attaque réellement ces routes, et lui seul tranchera.

### 1.2 Injection : la surface est structurellement fermée

| Vecteur | État |
|---|---|
| XSS stocké | **Aucun `dangerouslySetInnerHTML` ni `innerHTML` dans tout le frontend.** React échappe par défaut |
| Injection SQL | Prisma, requêtes paramétrées. Les seuls `$queryRaw` sont des littéraux sans interpolation |
| Affectation en masse | `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` — un champ inconnu fait échouer la requête |
| En-têtes | `helmet()` posé |
| Force brute | `@Throttle(5/min)` sur connexion, inscription et mot de passe oublié |

### 1.3 Champs sans borne de longueur

Quatre DTO déclarent une chaîne sans `@MaxLength` :

| Champ | Gravité réelle |
|---|---|
| `reset-password.token`, `verify-email.token` | **MINEUR** — valeurs opaques comparées en base ; la limite de corps d'Express (100 ko par défaut) borne l'abus |
| `update-sector.sector` | **Aucune** — contraint par `@IsIn(SECTEURS)` |
| `change-password.currentPassword` | **Aucune** — bcrypt tronque à 72 octets |

Aucun n'est bloquant. Le vrai test est le profil 8, qui envoie 200 000 caractères dans une
description de projet.

### 1.4 Une régression prédite, puis écartée

J'ai prédit que le modèle d'offres casserait la suite de bout en bout : le gratuit est limité à
un projet, et le contrôle est branché dans `create()`. Vérification faite, **les onze fichiers e2e
créent au plus un projet par compte** — `couts-ia` en crée deux, mais pour deux comptes
différents.

**Prédiction fausse.** Je la laisse écrite : un audit qui ne montre que ses trouvailles justes
donne une fausse impression d'infaillibilité.

---

## 2. Ce qui est prêt à être exécuté

`scripts/simulation-beta.mjs` — dix profils, une commande.

| Profil | Ce qu'il éprouve |
|---|---|
| 1 · Marc Dubois, ouvrier BTP | Sait-il quoi faire ? L'étape dit-elle *pourquoi* ? Un score vaut-il 0 sans donnée ? Les sections fermées annoncent-elles leur condition ? Une tâche en crée-t-elle une ou six ? |
| 2 · Julie Martin, e-commerce | Deux lectures le même jour font-elles deux points d'historique ? Le tableau de bord se répète-t-il ? |
| 3 · Antoine Leroy, logistique | Le profil se relit-il ? L'analyse mentionne-t-elle le métier déclaré ? |
| 4 · Kevin, spatial à 500 € | Un score sort-il de nulle part ? L'analyse refuse-t-elle l'hypothèse absurde ? |
| 5 · Sophie Bernard, 25 000 € | Le refus du financement nomme-t-il l'offre ? Le prix de l'évaluation porte-t-il son avertissement ? |
| 6 · Gratuit | Le deuxième projet est-il refusé ? Peut-on s'offrir Construction ? Ce qui ne coûte rien reste-t-il ouvert ? |
| 7 · Payant | Une montée d'offre retire-t-elle jamais quelque chose ? Un bouton promet-il sans encaissement ? |
| 8 · Malveillant | Six familles d'attaque : lecture croisée sur six routes, écriture croisée, quatre charges hostiles, champ de 200 000 caractères, élévation par référence de paiement inventée, accès sans jeton |
| 9 · Abandon | Après reconnexion : souvenirs, tâches et prochaine étape survivent-ils ? |
| 10 · Investisseur | La vitrine publique laisse-t-elle fuir `password_hash`, `iban`, `token_hash` ? |

Trois propriétés :

- **Aucune donnée réelle touchée.** Comptes `sim.<profil>.<horodatage>@ignitux.test`, jamais
  supprimés — effacer en masse est la commande qui part une fois de trop.
- **Les générateurs ne sont pas appelés par défaut.** Une simulation complète consommerait du
  budget IA à chaque exécution. `--avec-ia` les active en connaissance de cause.
- **Les 23 routes appelées ont été confrontées aux contrôleurs réels.** Une était fausse —
  l'ouverture du financement est `POST /projets-finances` avec le projet dans le corps, pas
  `POST /projects/:id/financing/open` — et elle est corrigée. Sans cette vérification, le profil 5
  aurait rapporté un faux défaut.

---

## 3. Défauts constatés — classés

### CRITIQUE

| # | Défaut | Reproduction | Impact | Correction |
|---|---|---|---|---|
| C1 | **Aucun email ne peut partir** (`MAIL_TRANSPORT=log`) | Demander une réinitialisation : le message va au journal du serveur | Le premier bêta-testeur qui oublie son mot de passe est **définitivement dehors**. Il n'existe aucun autre chemin de récupération | Ouvrir un compte chez un expéditeur (Brevo, Resend, Postmark — gratuit à ce volume), poser les quatre `SMTP_*`, passer à `smtp` |
| C2 | **Le serveur refuse de démarrer en production** | Lancer le préflight sur `.env.production` | Aucun déploiement possible | `FRONTEND_URL` doit devenir l'adresse https réelle. Exige un domaine |
| C3 | **Un tiers du produit n'a jamais touché une base** | Offres, droits, historique des scores, mentions légales, lecture du profil par IGINI | Ces fonctionnalités sont des hypothèses. Les tests unitaires simulent la base | Rallumer la base, puis `validation-reelle.mjs` et `simulation-beta.mjs` |

### MAJEUR

| # | Défaut | Impact | Correction |
|---|---|---|---|
| M1 | Aucun hébergement | Les images existent, il n'y a nulle part où les pousser | Ouvrir un compte (Railway, Render, Fly.io, VPS) |
| M2 | Les images Docker n'ont jamais été construites | Ce sont des fichiers justes, pas des faits | Le job CI « Images Docker » les construit à la prochaine poussée |
| M3 | La suite de bout en bout n'a pas tourné depuis le 20 septembre | 251 tests muets. Trois échecs dormants avaient déjà été trouvés ainsi | Dépend de la base |
| M4 | `ANTHROPIC_API_KEY` vide en production | Les cinq générateurs refuseront chaque appel — le cœur du produit payant | La poser |
| M5 | Les trois environnements sur une seule instance | Une panne les emporte ensemble. C'est arrivé le 20 septembre | `docker-compose.yml` donne une base locale indépendante |

### MOYEN

| # | Défaut | Impact |
|---|---|---|
| Y1 | Le référentiel de conformité ne contient que 2 démarches sectorielles sur 12 | Le tri par secteur fonctionne mais n'a presque rien à trier |
| Y2 | Aucun écran pour l'évolution des scores | L'API existe depuis aujourd'hui, l'interface non |
| Y3 | Aucun écran pour l'espace investisseur côté recherche de projets | Le profil 10 ne peut parcourir qu'une vitrine communautaire |
| Y4 | Le refus du financement en offre gratuite n'a jamais été vu | Le profil 5 le vérifie, il n'a pas tourné |

### MINEUR

| # | Défaut |
|---|---|
| N1 | Écho visuel entre le tableau de bord et la bande de phases : trois boîtes bordées suivies de trois autres |
| N2 | `reset-password.token` et `verify-email.token` sans `@MaxLength` |
| N3 | L'image frontend n'utilise pas `output: 'standalone'` — plus lourde que nécessaire |

---

## 4. La note, et comment elle se décompose

| Axe | Note | Pourquoi |
|---|---|---|
| **Fonctionnel** | 17 / 20 | 1 019 tests serveur, 355 interface, 18 écrans traversés sans anomalie le 20 septembre. Le produit fonctionne générateurs éteints |
| **Sécurité** | 16 / 20 | Aucune faille d'autorisation ni surface XSS trouvée. Helmet, whitelist, limiteur. Moins 4 : jamais attaqué pour de vrai |
| **Données et migrations** | 12 / 20 | Écart strictement additif, script de vérification en lecture seule, sauvegarde et restauration testées. Moins 8 : deux tables et six colonnes non migrées, sur trois bases injoignables |
| **Exploitation** | 4 / 20 | Les artefacts existent depuis aujourd'hui. Rien n'a jamais été construit, démarré ni déployé |
| **Prêt pour de vraies personnes** | 3 / 20 | Pas d'email, pas de domaine, pas d'hébergement. Un utilisateur qui oublie son mot de passe est perdu |
| **Total** | **52 / 100** | |

### Ce qui est prêt

Le produit lui-même, et il l'est sérieusement. L'architecture tient, les garde-fous sont réels et
refusent vraiment, les refus expliquent et proposent une suite, rien n'est inventé quand la donnée
manque. C'est un travail au-dessus de la moyenne des produits à ce stade.

### Ce qui bloque

Rien de ce qui bloque n'est du développement. **Quatre comptes à ouvrir et une base à rallumer.**
C'est toute la distance.

### La malhonnêteté qu'il faut éviter

Ouvrir la bêta sans email fonctionnel serait le plus sûr moyen de perdre les premiers testeurs :
non pas à cause d'un bug, mais parce que le premier oubli de mot de passe est définitif. **C1 est
non négociable avant le premier utilisateur.**

---

## 5. La commande à taper, dans l'ordre

```bash
# 1. Coller la nouvelle chaîne dans backend/.env, puis :
cd backend
npx prisma generate && npm run build
node scripts/verifier-base.mjs .env          # lecture seule

# 2. Si le verdict est ADDITIF :
node scripts/sauvegarde.mjs
npx prisma db push
npm run test:e2e

# 3. Les deux harnais :
node ../scripts/validation-reelle.mjs        # 30 vérifications
node ../scripts/simulation-beta.mjs          # 10 profils
```

Si `verifier-base.mjs` répond **À EXAMINER**, s'arrêter et lire ce qu'il nomme. Ne pas passer
`--accept-data-loss`.
