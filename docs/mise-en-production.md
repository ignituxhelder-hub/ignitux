# Mise en production — audit et plan

**Date** : 20/09/2026.
**Objectif** : accueillir les premiers utilisateurs réels.
**Méthode** : vérifié sur le code et sur l'instance réelle. Ce qui n'a pas pu l'être est signalé.

---

> ### Mise à jour du 23 septembre 2026 — les trois alertes ci-dessous sont corrigées
>
> Ce document a été écrit le 20 septembre. Ses « trois choses à savoir »
> décrivaient trois défauts réels ; les trois ont été traités depuis, et les
> laisser tels quels ferait perdre du temps à les rechercher.
>
> | Alerte du 20/09 | État au 23/09 |
> |---|---|
> | Le limiteur de débit deviendrait global derrière un proxy | **Corrigé.** `TRUST_PROXY` est désormais obligatoire : la production refuse de démarrer sans, avec l'explication exacte du piège. |
> | `/docs` publie 146 routes sans condition | **Corrigé.** `shouldServeApiDocs` ne les sert en production que si `ENABLE_API_DOCS=true`. |
> | Aucun artefact de déploiement | **Corrigé.** `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml` (avec sa propre base), `.env.docker.example`, et une construction d'images en CI. |
>
> Reste vrai : les trois bases vivent sur la même instance Supabase.
>
> **Pour savoir où en est une configuration, ne pas relire ce document —
> lancer la commande :**
>
> ```
> node backend/scripts/verifier-production.mjs .env.production
> ```
>
> Elle pose les questions du démarrage sans démarrer, et ajoute celles que le
> contrôle de démarrage ne peut pas poser : la base répond-elle, l'adresse du
> frontend existe-t-elle, le serveur SMTP accepte-t-il une connexion.
>
> Au 23 septembre elle répond : **1 bloquant** — `FRONTEND_URL` n'est pas en
> https, parce qu'il n'y a pas encore de domaine — et 2 avertissements.

---

## Les trois choses à savoir avant de lire le reste

1. **Le limiteur de débit cessera de fonctionner correctement dès la mise en ligne.**
   L'application ne déclare aucun proxy de confiance. Derrière un répartiteur de charge — c'est
   le cas de *toutes* les plateformes d'hébergement — `req.ip` vaut l'adresse du répartiteur, la
   même pour tout le monde. La limite de 5 connexions par minute deviendrait **globale** : cinq
   tentatives par minute pour l'ensemble des utilisateurs. Une personne qui se trompe de mot de
   passe bloquerait tous les autres. Correction : une ligne.

2. **La documentation complète de l'API est publiée sans condition** sur `/docs` : 146 routes,
   la forme de chaque corps attendu, tous les codes de réponse. Ce n'est pas une faille, c'est
   une carte offerte. Correction : une condition sur l'environnement.

3. **Les trois bases — développement, test, production — vivent sur la même instance Supabase.**
   Vérifié : même hôte, même serveur. Une panne d'instance les emporte toutes les trois, et la
   suite de bout en bout tape sur le même serveur que la production.

---

## 1. Hébergement

**État au 20 septembre : inexistant.** Aucun `Dockerfile`, aucun `vercel.json`, aucun
`fly.toml`, aucun `Procfile`. Le produit tourne sur un portable, servi en réseau local à deux
testeurs.

> **Plus vrai depuis.** Les deux `Dockerfile` existent, se construisent en CI, et celle du
> serveur démarre pour de vrai contre une base jetable. Voir [`deployer.md`](deployer.md).

Ce que le code fait déjà bien, et qui rend l'hébergement facile :

- `app.enableShutdownHooks()` est appelé — le conteneur se ferme proprement sur `SIGTERM`, et la
  connexion Postgres est libérée. C'est ce qui manque le plus souvent.
- `GET /health` interroge réellement la base (`SELECT 1`), pas seulement le process. Une sonde de
  disponibilité branchée dessus dira la vérité.
- Le port vient de l'environnement (`PORT`), ce que toutes les plateformes exigent.
- Aucun état en mémoire : JWT sans session serveur, aucun fichier écrit sur disque. L'application
  est réplicable telle quelle.

Ce qui manque, par ordre :

| Manque | Conséquence |
|---|---|
| `Dockerfile` (ou détection de buildpack) | rien à déployer |
| `trust proxy` | le limiteur de débit devient global (voir ci-dessus) |
| Swagger conditionnel | la carte de l'API est publique |
| Filtre d'exception global | une erreur non prévue renvoie un 500 nu et disparaît |

**Le choix de plateforme importe moins que le fait de choisir.** L'application étant un conteneur
sans état, en changer prend une journée. Railway, Fly.io, Render, Scaleway ou un VPS conviennent
tous.

## 2. Sauvegardes

**État : non vérifiable depuis le code, et c'est déjà un problème.**

Ce que j'ai pu établir : les trois bases partagent une instance. Ce que je n'ai pas pu établir :
la politique de sauvegarde de l'offre Supabase en cours — elle ne se lit pas en SQL. Les offres
gratuites de Supabase n'incluent historiquement **pas** de restauration à un instant donné.

Ce qui est certain, en revanche : **aucune restauration n'a jamais été tentée.** Il n'existe
aucun script, aucune procédure écrite, aucune trace d'un essai. Une sauvegarde qu'on n'a jamais
restaurée n'est pas une sauvegarde — c'est une intention, et elle se révèle fausse au pire
moment.

**Trois questions à trancher dans la console avant la première donnée réelle** : l'offre
inclut-elle le PITR ? quelle est la fenêtre de rétention ? et combien de temps prend une
restauration ?

## 3. Emails

**État : rien ne part.** `MailService` journalise au lieu d'envoyer, et son commentaire l'assume :
« aucun fournisseur réel n'est configuré ».

Conséquence concrète : **deux parcours du produit sont des impasses.** La réinitialisation de mot
de passe génère un jeton que personne ne reçoit ; la vérification d'adresse aussi. Une personne
qui perd son mot de passe perd son compte.

Le code est prêt : `MailService` a été écrit pour que seule cette classe change. Ce qui manque
n'est pas du code, c'est **le choix d'un fournisseur** — décision en attente depuis §15.6.

Et un détail qui se paie cher quand on l'oublie : **SPF, DKIM et DMARC**. Sans les trois, les
courriels de réinitialisation partent en indésirables, ce qui est fonctionnellement identique à
ne rien envoyer du tout.

## 4. Monitoring

**État : rien.** Aucune collecte d'erreurs, aucune alerte, aucun tableau de bord.

Ce qui rend ce manque plus grave qu'il n'en a l'air : **le code écrit déjà ce qu'il faudrait
surveiller.** Il journalise l'échec de journalisation d'un coût IA (« la dépense a eu lieu mais
manquera aux totaux »), les refus constitutionnels, les erreurs de génération. Tout cela part
dans un terminal que personne ne regarde. Le produit a été instrumenté ; il lui manque une
oreille.

Ce qu'il faut, minimalement :

- **un collecteur d'erreurs** avec alerte (Sentry, GlitchTip, ou les journaux de la plateforme
  avec une règle d'alerte) ;
- **une sonde externe** sur `/health` — parce qu'une application morte ne signale pas sa propre
  mort ;
- `pg_stat_statements` **est déjà actif** sur l'instance : l'observabilité des requêtes lentes
  est disponible gratuitement, il suffit de la lire.

**Un avertissement sur le filtrage.** Les messages d'erreur de ce produit contiennent des
identifiants de personnes et de projets, et parfois le détail d'une action refusée. Les envoyer
bruts à un service tiers déplacerait des données personnelles hors de la base **sans que les CGU
l'annoncent**. Le filtre s'écrit avant le premier envoi, pas après.

## 5. Sécurité

**État : solide sur les fondamentaux, trois trous à combler avant l'ouverture.**

Ce qui est en place et vérifié :

| Point | État |
|---|---|
| `helmet()` | actif |
| CORS | restreint à `FRONTEND_URL`, pas de joker |
| Mots de passe | bcrypt, coût 10 |
| Jetons | JWT signé, secret ≥ 32 caractères imposé par Zod |
| Validation | `whitelist` + `forbidNonWhitelisted` + `transform` |
| Limitation de débit | 20/min global, 5/min sur connexion et inscription |
| Secrets | **aucun n'a jamais été commité** (historique vérifié), tous les `.env` effectivement ignorés |
| Dépendances backend | **0 vulnérabilité** en production |
| Jeton d'un compte supprimé | refusé immédiatement (corrigé en §19) |

Les trois trous :

1. **`trust proxy` absent** — détaillé en tête. C'est le plus urgent parce qu'il transforme une
   protection en nuisance sans rien casser visiblement.
2. **Swagger public** — la carte complète de l'API.
3. **Deux vulnérabilités dans les dépendances de production du frontend**, dont une **haute** :
   `postcss` porte quatre avis (XSS via `</style>` non échappé, lecture de fichiers arbitraires
   via `sourceMappingURL`). Il arrive transitivement par `next ^15.5.4`, et **le correctif
   n'existe qu'en Next 16.3.5** — une montée de version majeure.

   *Exposition réelle* : faible. Ces avis concernent le traitement CSS à la compilation, avec du
   CSS contrôlé par un attaquant. Le CSS d'IGNITUX est écrit par le projet, pas fourni par les
   utilisateurs. Mais laisser un avis « haute » dans l'arbre de production avant une ouverture
   est évitable, et 216 tests frontend existent pour sécuriser la montée.

Deux points à connaître sans qu'ils soient des défauts :

- **Le JWT dure 24 h et ne se révoque pas.** Un jeton volé reste valide jusqu'à expiration. Pour
  les premiers utilisateurs c'est un risque acceptable, à condition de le savoir. Le remède
  classique — jetons courts plus rafraîchissement — vaut la peine quand la base d'utilisateurs
  le justifie, pas avant.
- **Aucune limite de taille de corps de requête** n'est posée explicitement (Express plafonne à
  100 ko par défaut, ce qui convient ici).

## 6. Variables d'environnement

**État : bien tenu, et une seule chose manque.**

`config/env.ts` valide avec Zod **avant** que Nest démarre, et sort avec un message lisible si la
configuration est incomplète. C'est exactement le bon endroit : un `.env` invalide échoue en une
seconde au lieu de se manifester plus tard par un crash Prisma obscur.

| Variable | Obligatoire | Défaut |
|---|---|---|
| `DATABASE_URL` | oui | — |
| `JWT_SECRET` | oui, ≥ 32 caractères | — |
| `JWT_EXPIRES_IN` | non | `1d` |
| `FRONTEND_URL` | non | `http://localhost:3001` |
| `PORT` | non | `3000` |
| `ANTHROPIC_API_KEY` | non | absente |
| `IGINI_AI_ENABLED` | non | générateurs actifs |
| `IGINI_QUOTA_CALLS_PER_MONTH` | non | 5 |
| `IGINI_QUOTA_COST_EUR_PER_MONTH` | non | 2,00 € |

Deux défauts méritent attention en production :

- **`FRONTEND_URL` retombe sur `localhost:3001`.** Oublier de la poser en production donne un
  CORS qui bloque tout le monde — bruyant, donc sans danger.
- **`IGINI_AI_ENABLED` absent laisse les générateurs ACTIFS.** C'est un choix documenté et
  défendable : une valeur inattendue laisse le produit complet plutôt que mutilé. Mais en
  production, cela signifie qu'un déploiement qui oublie cette variable **dépense**. Avec
  `ANTHROPIC_API_KEY` absente l'appel échoue avant de coûter quoi que ce soit, donc le risque
  réel n'existe que si la clé est posée et l'interrupteur oublié. **À poser explicitement dans la
  configuration de production**, dans un sens comme dans l'autre, plutôt que de s'en remettre au
  défaut.

Il manque enfin un `.env.production.example` : les deux modèles versionnés
(`backend/.env.example`, `frontend/.env.local.example`) décrivent le développement.

## 7. CI/CD

**État : intégration solide, livraison inexistante.**

La chaîne actuelle, sur `push` et `pull_request` vers `main`, des deux côtés : lint, **double**
vérification de types (code livré, puis tests inclus — cette duplication a été ajoutée après
qu'une erreur de type dans un mock soit passée inaperçue), tests unitaires, build.

Ce qui manque :

| Manque | Pourquoi ça compte |
|---|---|
| Aucune étape de déploiement | chaque mise en ligne serait manuelle, donc oubliée ou ratée un jour |
| Les tests de bout en bout n'y tournent pas | décision documentée : ils exigent une vraie base. **251 tests** ne protègent donc que la machine du développeur |
| Aucun `npm audit` | les deux vulnérabilités du frontend ne seront signalées par personne |
| Aucune étape de migration | `prisma db push` reste manuel, et un déploiement peut partir sans son schéma |

Le troisième est le moins cher à combler et le plus rentable : une étape `npm audit --omit=dev`
transforme une découverte manuelle en alerte automatique.

Pour les tests de bout en bout, la solution propre existe : un service Postgres dans le workflow
GitHub Actions, avec `DATABASE_URL` pointant dessus. Le garde-fou de `setup-e2e.ts` exige une
base nommée `ignitux_test` — il suffit de la nommer ainsi.

## 8. Restauration après incident

**État : rien n'existe.** Ni procédure, ni essai, ni délai cible.

Les trois questions auxquelles personne ne peut répondre aujourd'hui :

1. **Combien de temps pour remettre le service debout** après une perte de l'instance ?
2. **Combien de données perdrait-on** au pire ? (c'est la fenêtre de sauvegarde, inconnue)
3. **Qui fait quoi**, et avec quels accès ?

Pour deux premiers utilisateurs, une réponse honnête suffit : « quelques heures, au plus une
journée de données, et c'est moi qui le fais ». Ce qui ne suffit pas, c'est de ne pas savoir.

---

# Architecture cible

L'architecture visée n'ajoute **aucun composant** à ce qui existe. Elle branche ce qui manque.

```
                      ┌──────────────────────┐
   navigateur ───────▶│  Frontend (Next.js)  │
                      │  hébergé, HTTPS      │
                      └──────────┬───────────┘
                                 │  NEXT_PUBLIC_API_URL
                                 ▼
                      ┌──────────────────────┐        ┌──────────────────┐
                      │  API (NestJS)        │───────▶│  Collecteur      │
                      │  conteneur sans état │ erreurs│  d'erreurs       │
                      │  trust proxy activé  │        └──────────────────┘
                      │  Swagger désactivé   │
                      └─────┬──────────┬─────┘
                            │          │
              DATABASE_URL  │          │  API email
                            ▼          ▼
              ┌──────────────────┐  ┌──────────────────┐
              │  PostgreSQL      │  │  Fournisseur     │
              │  ignitux_prod    │  │  d'email         │
              │  + sauvegardes   │  └──────────────────┘
              │    vérifiées     │
              └──────────────────┘
                       ▲
                       │  sonde /health toutes les minutes
              ┌────────┴─────────┐
              │  Surveillance    │
              │  externe         │
              └──────────────────┘
```

Deux décisions structurantes dans ce schéma :

- **Une instance de base distincte pour la production.** Aujourd'hui les trois bases partagent un
  serveur. Les séparer coûte le prix d'une seconde instance et supprime le scénario où un test
  ou une manipulation de développement atteint les données réelles.
- **Aucun composant nouveau.** Pas de cache, pas de file, pas de moteur de recherche — l'audit
  d'outillage ([`outillage.md`](outillage.md)) explique pourquoi Postgres les contient déjà, non
  activés.

---

# Coût mensuel estimé

Ordres de grandeur pour les premiers utilisateurs, à vérifier auprès de chaque fournisseur : les
tarifs changent et ceux-ci datent de la rédaction.

| Poste | Fourchette | Note |
|---|---|---|
| Hébergement API | 5 – 20 € | un petit conteneur suffit ; l'application est sans état |
| Hébergement frontend | 0 – 20 € | gratuit sur les offres d'entrée de Next.js |
| PostgreSQL production **avec sauvegardes** | 25 – 30 € | c'est le poste qui fait passer de « gratuit » à « sérieux » |
| Collecteur d'erreurs | 0 – 30 € | les offres gratuites suffisent largement à ce volume |
| Surveillance externe | 0 – 10 € | gratuit chez la plupart |
| Email transactionnel | 0 – 20 € | quelques centaines d'envois par mois restent gratuits |
| **Infrastructure** | **30 – 130 €/mois** | |
| Encaissement (Stripe) | ~2,75 % du chiffre | ~0,55 € par abonnement à 20 € |
| IA | ~0,19 €/utilisateur | mesuré, voir `PRICING.md` |

**Le seuil de rentabilité de l'infrastructure se situe autour de 3 à 7 abonnés** selon les
options retenues. Ce n'est pas l'IA qui coûte — elle est à 1 % du prix — c'est le socle.

Une économie tentante et à écarter : rester sur une offre de base sans sauvegarde. Elle fait
gagner ~25 €/mois et transforme le premier incident en perte définitive des données de vraies
personnes.

---

# Étapes de déploiement

> **Périmé depuis le 26 septembre 2026 — voir [`deployer.md`](deployer.md).**
>
> Les trois premières étapes ci-dessous sont faites : `trust proxy` se lit
> dans l'environnement, Swagger ne se monte que sur `ENABLE_API_DOCS=true`, le
> filtre d'exception global existe. L'étape 2 aussi : `ignitux_prod` est
> migrée, 50/50 tables. Et l'étape 4 a cessé d'être un chantier : les deux
> `Dockerfile` existent et se construisent en CI, celle du serveur démarrant
> pour de vrai contre une base jetable.
>
> Ce qui suit est conservé comme trace de l'audit du 20 septembre. La
> procédure à suivre est l'autre document.

Dans cet ordre. Chaque étape est vérifiable avant de passer à la suivante.

### Étape 1 — Corriger les trois trous de configuration *(1 heure)*

1. `app.set('trust proxy', 1)` — sinon le limiteur de débit devient global.
2. Monter Swagger **seulement hors production**.
3. Ajouter un filtre d'exception global qui journalise avant de répondre.

Vérifiable : un test de bout en bout qui confirme que `/docs` répond 404 quand
`NODE_ENV=production`.

### Étape 2 — Séparer la base de production *(1 heure)*

Une instance Supabase distincte pour `ignitux_prod`, avec sauvegardes. Puis `prisma db push`
sur elle.

**Mesuré le 20/09/2026 : `ignitux_prod` contient 36 tables sur les 46 du schéma, et AUCUNE des
quatre tables des trois derniers modules** — télémétrie IA, comptabilité, investisseurs. Elle a
dix tables de retard. Le schéma n'y a pas été poussé parce que l'opération a été refusée comme
touchant la production, ce qui est le bon comportement : c'est une commande à lancer sciemment.

Sans cette étape, l'application **démarre normalement** et échoue à la première écriture dans un
module récent — le pire moment pour le découvrir, précisément parce que le démarrage aura réussi.

Vérifiable : `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'` doit
rendre 46.

### Étape 3 — Éprouver une restauration *(une demi-journée)*

Restaurer une sauvegarde dans une base jetable, lancer la suite de bout en bout dessus, noter le
temps réel. Écrire la procédure obtenue. **Cette étape n'est pas facultative** : c'est la seule
qui transforme une intention en garantie.

### Étape 4 — Conteneuriser et déployer *(une demi-journée)*

`Dockerfile` multi-étapes, variables d'environnement côté plateforme, sonde de disponibilité sur
`/health`. Déployer l'API, puis le frontend avec `NEXT_PUBLIC_API_URL`.

Vérifiable : `/health` répond 200 depuis l'extérieur, `/docs` répond 404, et
`/igini/status` dit ce qu'on attend de l'interrupteur IA.

### Étape 5 — Brancher la surveillance *(une demi-journée)*

Collecteur d'erreurs **avec son filtre écrit d'abord**, sonde externe sur `/health`, une alerte
qui arrive quelque part où elle sera lue.

Vérifiable : provoquer une erreur volontaire et constater qu'elle arrive, sans identifiant
personnel dedans.

### Étape 6 — Email *(une demi-journée)*

Fournisseur choisi, `MailService` branché, SPF/DKIM/DMARC posés. Vérifiable : une
réinitialisation de mot de passe de bout en bout, reçue en boîte de réception et non en
indésirables.

### Étape 7 — Compléter la chaîne d'intégration *(une demi-journée)*

`npm audit --omit=dev`, les tests de bout en bout contre un service Postgres du workflow, et le
déploiement automatique depuis `main`.

### Étape 8 — Monter Next et refermer les deux avis *(une demi-journée à un jour)*

Montée majeure de 15 à 16.3.5, couverte par les 216 tests frontend. À faire **avant** l'ouverture
si possible, juste après sinon — l'exposition réelle est faible.

**Total : deux à trois jours de travail effectif.**

---

# Risques restants

Ce qui restera vrai même une fois les huit étapes faites.

| Risque | Gravité | Ce qui l'atténue |
|---|---|---|
| **Un jeton volé reste valide 24 h** | moyenne | pas de révocation. Acceptable à faible effectif ; à revoir avec des jetons courts et un rafraîchissement |
| **Le journal des coûts IA n'est pas transactionnel** | moyenne | une écriture perdue est un appel non décompté. Le plafond est un plafond haut, pas une caisse enregistreuse — c'est écrit dans le code |
| **Aucune génération IA n'a tourné depuis le 19/09** | **élevée** | le seul pan du produit jamais éprouvé en conditions réelles. À rallumer une fois, sur un compte de test, avant d'ouvrir |
| **Aucun écran n'a jamais été ouvert** | **élevée** | contraste et balisage sont testés, mais personne n'a cliqué. 991 tests ne remplacent pas un navigateur |
| **Une seule personne connaît le système** | élevée | la procédure de restauration écrite (étape 3) est le premier remède |
| **Les flux d'investissement ne sont pas encaissables** | bloquante pour cette fonctionnalité | activité réglementée, statut à trancher avec un juriste (voir `outillage.md`) |
| **Supabase est un point unique** | moyenne | base, authentification des données et sauvegardes chez un seul fournisseur. Une exportation périodique hors fournisseur y répond |
| **Les modules pays se limitent à la France** | faible | bloqué sur le choix des sources officielles |

## Ce qui n'est pas un risque, et qu'on pourrait croire tel

- **La montée en charge.** La base fait 14 Mo, la plus grosse table 36 lignes. Rien dans
  l'architecture ne plafonne avant plusieurs milliers d'utilisateurs.
- **Le coût de l'IA.** Mesuré à ~1 % du prix de vente, plafonné et opposable depuis §22.
- **La qualité du code livré.** 740 tests unitaires, 251 de bout en bout contre une vraie base,
  zéro erreur de type, lint à zéro.

---

## Verdict

**Le produit est prêt techniquement ; il n'est pas prêt opérationnellement.** L'écart n'est pas
du code à écrire — c'est de la plomberie à brancher, et elle se compte en jours, pas en semaines.

Deux choses seraient déraisonnables : ouvrir sans avoir **restauré une sauvegarde au moins une
fois**, et ouvrir sans avoir **rallumé l'IA une seule fois** pour voir ce que les générateurs
produisent réellement. La première protège les données des gens ; la seconde protège la promesse
qu'on leur fait.
