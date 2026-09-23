# État de préparation à la bêta

Exécution du 23 septembre 2026. Ce document remplace l'analyse
(`deblocage-beta.md`) par un état de fait : ce qui a été construit, ce qui a
été corrigé, ce qui reste — et à qui.

> **Niveau réel de préparation : le produit est prêt, l'infrastructure ne l'est pas.**
>
> Il reste **un seul blocage que je peux lever moi-même** (l'adresse https du
> frontend, qui dépend d'un domaine). Tout le reste attend soit une base de
> données joignable, soit un compte chez un tiers.

---

## 1. Ce qui a été fait dans cette session

### Mission 6 — Déploiement : de rien à reproductible

Il n'existait **aucun** artefact de déploiement. Il en existe maintenant six.

| Fichier | Rôle |
|---|---|
| `backend/Dockerfile` | Trois étages : dépendances, build, exécution. L'image finale ne contient ni sources TypeScript, ni tests, ni dépendances de développement |
| `frontend/Dockerfile` | Idem, avec `NEXT_PUBLIC_API_URL` en **argument de build** |
| `docker-compose.yml` | Base + serveur + interface, avec sondes de santé et ordre de démarrage |
| `backend/.dockerignore`, `frontend/.dockerignore` | Les fichiers d'environnement en tête de liste |
| `.env.docker.example` | Modèle commenté, `.env.docker` ajouté au `.gitignore` |

**La composition embarque sa propre base Postgres.** C'est la décision qui compte : les trois
environnements du projet pointaient sur une seule instance distante, et quand elle s'est arrêtée,
le développement, les tests et la production se sont arrêtés ensemble. `docker compose up` donne
désormais une pile complète sans aucune dépendance à un service tiers.

**Deux pièges sont écrits dans les fichiers plutôt que laissés à découvrir :**

- `NEXT_PUBLIC_API_URL` est lue par du code qui tourne dans le navigateur. Next l'inscrit dans le
  paquet **au build**, pas au démarrage. La poser à l'exécution ne change rien — l'image garde
  l'ancienne valeur et l'interface appelle une API qui n'existe pas, sans message d'erreur.
- **Aucune migration au démarrage.** `prisma db push` dans un point d'entrée semble pratique
  jusqu'au jour où deux conteneurs démarrent ensemble et modifient le schéma simultanément.

### Mission 4 — Production : trois blocages, deux levés

Le serveur refusait de démarrer sur trois réglages. Vérifié en exécutant le préflight contre le
vrai fichier :

```
avant : NON — 3 réglage(s) à corriger
après : 1 réglage restant
```

| Réglage | État | Décision |
|---|---|---|
| `TRUST_PROXY` | **corrigé** → `1` | Un reverse proxy devant le serveur, ce que fait tout hébergeur géré. Les deux erreurs sont silencieuses : ne rien déclarer met tout le monde dans le même seau de limitation, sur-déclarer laisse forger `X-Forwarded-For` |
| `MAIL_TRANSPORT` | **corrigé** → `log` | Décision explicite, et elle veut dire qu'**aucun email ne part** |
| `FRONTEND_URL` | **laissé faux** | Exige le domaine réel |

`NODE_ENV`, `PORT`, `MAIL_FROM`, les quatre `SMTP_*` et `ENABLE_API_DOCS` manquaient aussi : tous
ajoutés et commentés.

**`FRONTEND_URL` a été laissée fausse à dessein.** La remplir d'un `https://` factice rendrait le
préflight vert alors que CORS refuserait tout le monde en silence — et, ce qui est pire, **les
liens de réinitialisation de mot de passe pointeraient vers une adresse qui n'existe pas**, parce
que les deux modèles d'email construisent leur URL à partir de cette variable.

**Aucun garde-fou n'a été contourné** : `/docs` reste éteint, le préflight reste actif,
`NODE_ENV` reste `production`.

### Mission 1 — Un script de vérification avant migration

`backend/scripts/verifier-base.mjs`, en **lecture seule du début à la fin**. Il répond à la seule
question qui compte avant un `prisma db push` : *qu'est-ce qui manque, et est-ce que le combler
peut détruire quelque chose ?*

- Distingue **ADDITIF** (la table est vide, l'ajout est sûr) de **À EXAMINER** (la table contient
  des lignes) en comptant réellement.
- Signale les tables présentes en base mais absentes du schéma — le **seul** cas où
  `prisma db push` proposerait une destruction.
- Dit explicitement de ne pas passer `--accept-data-loss` si le verdict le contredit.
- N'affiche **jamais** la chaîne de connexion, seulement l'hôte et le nom de la base : un rapport
  de vérification finit collé dans une conversation.

Essayé contre l'hôte mort : il diagnostique correctement le `ENOTFOUND` et explique quoi faire.

### Mission 3 — Une checklist exécutable

`scripts/validation-reelle.mjs` : **une commande, une vraie base, un verdict**. 30 vérifications
couvrant inscription, connexion, mot de passe oublié, mentions légales, offres et droits, projet,
mémoire (catégorie `error` comprise), connaissances, profil, conformité par pays et par secteur,
tâches, orchestration, scores, historique, parcours, tableau de bord, générateurs, et une
traversée navigateur.

Trois propriétés qui en font autre chose qu'une liste :

- **Il n'écrit que ses propres données.** Aucune suppression, aucune requête sur d'autres comptes.
  Le lancer sur une base qui porte du travail réel est sans danger.
- **`IGNORÉ` n'est pas un succès.** Une vérification qui n'a pas pu avoir lieu est comptée à part
  et listée à la fin. Un `IGNORÉ` silencieux se lirait comme un vert de plus.
- **Il vérifie les propriétés, pas les apparences.** Le tri par secteur est validé en comparant le
  **nombre total de démarches avant et après** — un tri qui perd une ligne serait un filtre, et un
  filtre sur des obligations légales fabrique des faux négatifs.

Les 28 routes qu'il appelle ont été confrontées aux contrôleurs réels ; une seule était fausse et
a été corrigée.

### Mission 5 — Email : audité, pas éprouvé

| Élément | État |
|---|---|
| Transport SMTP (nodemailer, `secure` déduit du port) | écrit, 11 tests |
| `send()` rend `sent` / `logged` / `failed`, ne lève jamais | vérifié |
| Modèle « Confirme ton email » (jeton 24 h) | écrit |
| Modèle « Réinitialise ton mot de passe » (jeton 1 h) | écrit |
| Jetons à usage unique, silence anti-énumération | vérifié |
| **Envoi et réception réels** | **impossible** — aucun compte SMTP |

Le système est complet. Ce qui manque est un fournisseur, pas du code.

---

## 2. Ce qui reste

### Bloquant

| # | Élément | Qui | Pourquoi c'est bloquant |
|---|---|---|---|
| 1 | **Base de données joignable** | Helder | Rien ne peut être migré ni vérifié. `db.<ref>.supabase.co` ne résout pas ; l'API du projet répond, donc il n'est ni supprimé ni renommé |
| 2 | **Domaine et `FRONTEND_URL` en https** | Helder | Le serveur refuse de démarrer, et les liens de réinitialisation ne mèneraient nulle part |
| 3 | **Compte d'envoi d'email** | Helder | Avec `MAIL_TRANSPORT=log`, quelqu'un qui oublie son mot de passe **reste dehors** |
| 4 | **Hébergeur** | Helder | Les images existent, il n'y a nulle part où les pousser |
| 5 | Migration des trois bases | Claude | Dépend de 1 |
| 6 | Exécution de `validation-reelle.mjs` | Claude | Dépend de 1 |

### Important

| Élément | Qui | Note |
|---|---|---|
| Suite de bout en bout jamais exécutée sur le nouveau code | Claude | 251 tests. Trois échecs dormants avaient déjà été trouvés ainsi |
| `ANTHROPIC_API_KEY` vide en production | Helder | Les générateurs refuseront chaque appel |
| Le job CI de bout en bout n'a jamais tourné | — | Écrit et valide ; pas de Docker sur cette machine |
| Sortir `ignitux_test` de l'instance de production | Claude | La composition Docker le permet déjà |
| Offres, historique des scores, mentions légales jamais vus dans un navigateur | Claude | Dépend de 1 |

### Amélioration

| Élément | Note |
|---|---|
| Paiements | Hors du chemin de la bêta. Aucun fournisseur sans SIRET (15 à 30 j) |
| Écran d'évolution des scores | L'API existe, l'écran non |
| `output: 'standalone'` pour alléger l'image frontend | Gain de taille, aucun gain fonctionnel |
| Référentiel de conformité : 2 démarches sectorielles sur 12 | Le tri marche, il a peu à trier |
| Écho visuel tableau de bord / bande de phases | Cosmétique |

---

## 3. Risques restants

| Risque | Gravité | Ce qui le limite |
|---|---|---|
| Le projet Supabase a été **supprimé**, pas mis en pause | élevée | Sauvegarde et restauration testées : 185 lignes, zéro écart. La composition Docker permet de repartir sur une base neuve |
| `prisma db push` réclame `--accept-data-loss` | moyenne | Ce serait le signe qu'une hypothèse est fausse. `verifier-base.mjs` le dit avant, et la consigne est de **s'arrêter**, pas de passer le drapeau |
| Les liens de réinitialisation pointent vers la mauvaise adresse | **élevée** | Non traité tant que `FRONTEND_URL` est fausse. À vérifier en premier après le déploiement |
| Une image poussée avec un `.env` dedans | faible | `.dockerignore` les exclut, fichiers d'environnement en tête |
| Les images Docker n'ont jamais été construites | moyenne | Ni Docker ni base sur cette machine. Première construction = première preuve |
| Budget IA consommé par accident | faible | `IGINI_AI_ENABLED=false` par défaut dans la composition |

---

## 4. Niveau réel de préparation

**Le produit : prêt.** 1 019 tests serveur, 355 tests interface, lint et typage propres,
18 écrans traversés sans anomalie le 20 septembre, produit utilisable générateurs éteints.

**L'infrastructure : les pièces existent, rien n'a jamais tourné.** Les Dockerfiles ne sont pas
construits, la composition n'est pas démarrée, la CI de bout en bout n'a jamais été exécutée. Ce
sont des fichiers justes, pas des faits vérifiés — et je préfère l'écrire que le laisser supposer.

**La distance restante n'est pas du développement.** Elle tient en quatre comptes à ouvrir et une
base à rallumer.

### Ce qu'il reste, en heures

| | Heures | Dépend de |
|---|---|---|
| Helder : Supabase, domaine, email, hébergeur | **2 h 20** | rien |
| Claude : migration + validation réelle + corrections | 3 à 5 | base joignable |
| Claude : premier déploiement, sondes, SMTP branché | 4 à 6 | domaine, hébergeur, email |
| Claude : traversée complète en ligne | 2 | déploiement |

**Total : 9 à 13 heures côté Claude Code**, contre 14,5 à 20 estimées avant cette session — les
artefacts de déploiement et les deux réglages de production sont faits.

---

## 5. La première commande à taper

Dès que la nouvelle `DATABASE_URL` est en place dans `backend/.env` :

```bash
cd backend
npx prisma generate && npm run build       # le script lit le client compilé
node scripts/verifier-base.mjs .env        # lecture seule : que manque-t-il ?
```

S'il répond **ADDITIF**, la suite est sûre :

```bash
node scripts/sauvegarde.mjs                # d'abord, toujours
npx prisma db push
npm run test:e2e
node ../scripts/validation-reelle.mjs      # 30 vérifications sur la vraie base
```

S'il répond **À EXAMINER**, s'arrêter et lire ce qu'il nomme.
