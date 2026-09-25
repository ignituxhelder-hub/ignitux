# Audit d'outillage — ce qu'IGNITUX a, ce qui lui manque, ce dont il n'a pas besoin

**Date** : 20/09/2026.
**Méthode** : mesuré sur le dépôt et sur l'instance Supabase réelle, pas déduit de l'habitude.
Ce qui n'a pas pu être vérifié est signalé comme tel.

---

## La trouvaille qui décide de la moitié de cet audit

L'instance PostgreSQL 17.6 déjà en service propose ces extensions, **non activées**, à une
commande SQL près :

| Extension | Version | Ce qu'on croit devoir installer à côté |
|---|---|---|
| `vector` | 0.8.2 | Pinecone, Weaviate, Qdrant |
| `pg_trgm` | 1.6 | Elasticsearch, OpenSearch, Meilisearch |
| `pgmq` | 1.5.1 | Redis, RabbitMQ, SQS |
| `pg_cron` | 1.6.4 | un ordonnanceur séparé |
| `unaccent` | 1.1 | un moteur de recherche « francophone » |
| `pg_net` | 0.20.4 | un worker HTTP |

`pg_stat_statements` et `pgcrypto`, eux, sont **déjà actifs** : l'observabilité des requêtes
lentes est disponible dès maintenant, gratuitement, sans rien installer.

Autrement dit : la plupart des « outils indispensables » d'une liste standard sont déjà payés,
déjà sauvegardés avec la base, déjà dans la même transaction. Les ajouter comme services séparés
coûterait un second magasin de données, une seconde histoire de sauvegarde, une seconde source
d'incohérence — et ne résoudrait rien qu'on ne puisse résoudre ici.

**Ce que Postgres ne fera jamais** : héberger l'application, envoyer un email, encaisser un
paiement, et vous prévenir quand la production tombe. C'est là que sont les vrais manques.

---

## 1. État actuel

### Ce qui tourne

| Couche | Outil | Remarque |
|---|---|---|
| API | NestJS 12 | modulaire, 146 routes |
| Base | PostgreSQL 17.6 (Supabase) | 46 tables, **14 Mo**, plus grosse table : 36 lignes |
| Accès base | Prisma 7 + `@prisma/adapter-pg` | |
| Interface | Next.js 15, React 19 | **aucune autre dépendance** : ni bibliothèque d'UI, ni gestionnaire d'état, ni client HTTP |
| IA | `@anthropic-ai/sdk` 0.126, `claude-opus-5` | éteint (`IGINI_AI_ENABLED=false`) |
| Tests | Vitest — 740 unitaires, 251 bout en bout | contre une vraie base dédiée |
| Qualité | oxlint (type-aware), TypeScript strict, Prettier | |
| CI | GitHub Actions | lint, double type-check, tests, build, des deux côtés |
| Sécurité | helmet, bcrypt, JWT, `@nestjs/throttler`, Zod, class-validator | |

### Ce qui n'existe pas du tout

- **Aucun hébergement.** Le produit tourne sur un portable, servi en réseau local. Pas de
  `Dockerfile`, pas de `vercel.json`, pas de `fly.toml` — rien.
- **Aucun envoi d'email.** `MailService` journalise au lieu d'envoyer. Les flux de
  réinitialisation de mot de passe et de vérification d'adresse existent mais n'aboutissent pas.
- **Aucun encaissement.** Aucun fournisseur de paiement.
- **Aucune surveillance.** Pas de collecte d'erreurs, pas d'alerte. Une panne en production ne
  serait connue que par la personne qui la subit.
- **Aucun stockage de fichiers.** Pas de PDF de facture, pas de pièce jointe.

### Ce que je n'ai pas pu vérifier

**La politique de sauvegarde de l'offre Supabase en cours.** Elle ne se lit pas depuis SQL. Les
offres gratuites de Supabase n'incluent historiquement **pas** de restauration à un instant
donné (PITR), et les sauvegardes quotidiennes y sont limitées. **À vérifier dans la console
avant toute mise en ligne** — c'est le genre de détail qu'on découvre le jour où on en a besoin.

---

## 2. Domaine par domaine

### Infrastructure

**Le seul vrai trou du projet est l'hébergement.** Tout le reste de cet audit est de
l'optimisation ; ça, c'est la condition d'existence. Un produit sur un portable derrière une box
n'a ni disponibilité, ni certificat, ni redémarrage automatique, ni journal consultable.

Ce qu'il faut, et rien de plus : une plateforme qui exécute un conteneur Node, garde des
variables d'environnement secrètes, redémarre toute seule, et donne accès aux journaux. Railway,
Fly.io, Render, Scaleway ou un simple VPS font tous cela. **Le choix importe moins que le fait de
choisir** — et il se change en une journée tant que l'application est un conteneur sans état,
ce qu'elle est.

La **surveillance** vient immédiatement après, et elle est plus urgente qu'elle n'en a l'air : ce
produit journalise déjà beaucoup de choses (violations constitutionnelles, coûts IA, échecs de
journalisation) dans des `Logger.error` que **personne ne lira jamais** sans collecteur. Le code
est déjà écrit pour être surveillé ; il manque juste l'oreille.

### IA — Claude, mémoire, RAG, embeddings, suivi des coûts

**Le suivi des coûts est fait** : journal par appel, réflexion interne comprise, plafonds
mensuels opposables en 402, coût dérivé d'une grille datée. Rien à ajouter.

**La mémoire IGINI** est un stockage de souvenirs catégorisés, rappelés par projet. Aujourd'hui
le rappel prend **tous** les souvenirs du projet. À une trentaine de souvenirs, c'est le bon
comportement — filtrer serait perdre du contexte. Au-delà de quelques centaines, le prompt
deviendrait à la fois cher et moins bon, et il faudra choisir **quels** souvenirs sont pertinents.

C'est là, et seulement là, que les **embeddings** entrent en jeu : `vector` 0.8.2 est disponible.
Le besoin n'est pas « faire du RAG parce que tout le monde en fait », il est précis : *classer
trente souvenirs par pertinence pour un prompt donné*. Un index vectoriel dans la table
`memories`, une colonne, une requête. Pas de base vectorielle séparée : les souvenirs ont des
règles de propriété et d'effacement RGPD déjà tenues par Postgres, et les dupliquer ailleurs
créerait un second endroit d'où les supprimer — exactement le genre d'oubli qui rend un droit à
l'effacement faux.

**Seuil concret** : quand un projet dépasse ~100 souvenirs, ou quand un prompt dépasse
~3 000 tokens de contexte mémoire. Aucun projet n'en est là.

### Knowledge Graph — PostgreSQL suffit-il, ou Neo4j apporte-t-il un avantage réel ?

**Réponse : PostgreSQL suffit, et Neo4j serait une erreur ici.** Pas par principe — par la forme
du graphe.

Trois faits mesurés :

1. **Le graphe est cloisonné par personne et par projet.** Aucune requête ne traverse jamais le
   graphe d'un autre. Même à 10 000 utilisateurs et 200 concepts chacun — deux millions de nœuds
   au total — aucune requête ne touche plus de 200 nœuds.
2. **La profondeur est plafonnée à 3** (`MAX_TRAVERSAL_DEPTH`), avec une justification écrite :
   au-delà, le « voisinage » d'un concept est le graphe entier et personne n'y lit plus rien.
3. L'avantage de Neo4j est l'adjacence sans index sur des parcours **profonds** dans des graphes
   **grands et connexes**. IGNITUX a des graphes petits et disjoints. L'avantage ne s'applique
   pas.

Le coût, lui, s'appliquerait : un second magasin de données, une seconde sauvegarde, une seconde
politique d'accès, et **aucune transaction commune** — un concept créé pourrait exister dans l'un
et pas dans l'autre.

**Il y a bien une chose à améliorer, et ce n'est pas la base.** `getNeighbourhood` appelle
`getGraph`, qui charge **tous** les nœuds et arêtes du projet en mémoire avant de parcourir en
JavaScript. C'est sans conséquence à 200 nœuds ; ce sera du gâchis à 5 000. Le remède est une
requête récursive (`WITH RECURSIVE`) qui garde le parcours dans la base : **un changement de
code, pas un changement d'architecture**.

### Workflow Engine

Le moteur actuel fait : modèles, étapes conditionnelles, exécution, blocage sur confirmation
humaine (article 8), journal d'événements motivés (article 11), une seule exécution active par
processus. L'état vit en base — il est donc **déjà durable** : un redémarrage du serveur ne perd
rien.

Ce que Temporal, Camunda ou BullMQ apporteraient — exécution durable, reprise après panne,
politiques de nouvelle tentative — est soit déjà tenu par Postgres, soit sans objet pour un
moteur dont chaque pas est déclenché par un appel HTTP.

**Le vrai manque est ailleurs, et il est réel : rien ne se déclenche dans le temps.** Aucune
relance à sept jours, aucun rappel d'échéance de facture, aucun récapitulatif mensuel. Le moteur
ne sait avancer que si quelqu'un appelle. `pg_cron` comble exactement ce trou, sans nouveau
service.

### Offline First

> **Note du 24 septembre 2026.** Cette section a été écrite quand le service
> worker était hors périmètre. Il existe depuis : `frontend/public/sw.js` fait
> démarrer l'application sans réseau, et `scripts/hors-ligne.mjs` le vérifie en
> coupant le réseau pour de bon.
>
> Les conflits, décrits plus bas comme « le vrai trou non résolu », sont
> désormais **détectés** — voir la mise à jour à la fin de la section. Ce qui
> reste entier est le **stockage** : `localStorage` et ses trois limites.

Aujourd'hui : file d'écriture et cache de lecture daté, tous deux dans **`localStorage`**, avec
un plafond de 60 entrées — plafond posé explicitement dans le code pour que le cache n'étouffe
pas la file d'attente, « bien plus précieuse ».

Ce plafond est le symptôme. `localStorage` a trois limites dures : **environ 5 Mo**, **synchrone**
(chaque lecture bloque le fil d'affichage), et **chaînes de caractères uniquement**.

**IndexedDB** lève les trois : asynchrone, plusieurs centaines de Mo, objets structurés. C'est un
changement de **stockage**, pas un service worker — le périmètre que tu avais fixé reste tenu.
L'abstraction `KeyValueStorage` existe déjà dans `offline-queue.ts` : le remplacement est local.

**La gestion des conflits est le vrai trou non résolu.** La file rejoue les écritures dans
l'ordre, mais rien ne détecte qu'une donnée a changé côté serveur entre la capture et le rejeu.
Deux réponses possibles, et il faut en choisir une explicitement : soit une version par ressource
(`If-Match`, rejet en 409 et l'interface demande à la personne), soit « la dernière écriture
gagne » — **assumé et affiché**, pas subi en silence.

> ### Mise à jour du 24 septembre 2026 — la première réponse a été retenue
>
> Le paragraphe ci-dessus demandait un choix explicite. Il est fait, et c'est le
> premier : **détecter et le dire**. « La dernière écriture gagne » aurait
> consisté à effacer le travail de quelqu'un en affichant un avertissement
> général, ce qu'une devise « la vérité avant tout » supporte mal, et que
> l'article 13 supporterait encore moins le jour où le conflit porte sur la
> visibilité d'un projet.
>
> Le dispositif tient en deux pièces, dans `backend/src/hors-ligne/` et dans
> `replayOfflineQueue` :
>
> - chaque écriture rejouée part avec **son âge**, en millisecondes — pas avec
>   une date. Une date viendrait de l'horloge de l'appareil ; une montre en
>   retard de dix minutes ferait refuser tout ce que la personne a fait hors
>   ligne, c'est-à-dire exactement la panne qu'on veut éviter. Un âge est une
>   soustraction entre deux lectures de la même horloge : son décalage s'annule ;
> - le serveur reconstitue l'instant de capture sur **sa** propre horloge et
>   refuse en 409 si la ligne a bougé depuis. L'écriture n'est ni appliquée ni
>   jetée : elle rejoint les « refusées » du bandeau, avec la raison.
>
> **Ce que ça ne fait pas**, et il vaut mieux l'écrire : cela ne fusionne rien.
> Fusionner deux versions supposerait savoir laquelle a raison, ce que personne
> ici ne sait. La personne décide.
>
> **Ce qui est couvert** : `projects`, `tasks`, `billing_documents`,
> `crm_contacts`, `crm_companies` — les modèles qui portent `updated_at`, soit
> 11 des 50. Les 39 autres ne peuvent pas entrer sans migration, et il vaut
> mieux qu'ils restent dehors que d'y entrer avec une date approchée. Restent
> aussi dehors les routes dont l'URL ne porte pas l'identifiant de la ligne —
> l'objectif de rachat, par exemple, qui se désigne par projet et par type.
>
> **Ce qui reste entier** : le stockage. `localStorage` a toujours ses 5 Mo,
> son plafond de 60 entrées et ses lectures synchrones.

### CRM

Les quatre briques demandées existent : contacts, prospects (`kind`), entreprises, pipeline à six
étapes. Trois besoins futurs, par ordre de proximité :

1. **La recherche.** Elle est aujourd'hui un `ILIKE '%terme%'`. Aucun index ne peut servir un
   joker en tête : c'est un balayage séquentiel. Invisible à 36 lignes, perceptible vers
   10 000 contacts, pénible au-delà. `pg_trgm` + un index GIN résout exactement ce cas, et
   `unaccent` le rend utilisable en français (« Benali » trouvé en tapant « benali »).
2. **La segmentation.** Rien aujourd'hui. Une table de filtres enregistrés suffit ; pas d'outil.
3. **Les automatisations.** Le moteur de processus existe déjà — il lui manque le déclencheur
   temporel du point précédent.

### Facturation et encaissement

Trois flux bien distincts, et c'est leur distinction qui commande le choix :

| Flux | Nature | Argent de qui |
|---|---|---|
| Abonnement 20 €/mois | vente de service | **IGNITUX** |
| Facturation de l'entrepreneur à ses clients | documents seuls, aucun encaissement | **l'entrepreneur** |
| Investissement, remboursement, dividende | fonds de tiers en transit | **ni l'un ni l'autre** |

**Pour l'abonnement : Stripe, sans hésiter.** C'est exactement son cas d'usage, la conformité SCA
est gérée, l'intégration est d'une journée. Frais de l'ordre de 1,5 % + 0,25 € en Europe — soit
environ 0,55 € sur 20 €, ce que `PRICING.md` chiffrait déjà comme **trois fois le coût IA**.

**Pour le troisième flux, la question n'est pas technique.** Faire transiter l'argent
d'investisseurs vers des porteurs de projet est une activité **réglementée** en Europe
(règlement 2020/1503, statut PSFP), et les conditions générales de Stripe écartent en général les
plateformes d'investissement. Ce n'est pas un détail d'intégration : c'est un préalable juridique.

| Fournisseur | Pour | Contre |
|---|---|---|
| **Stripe** | le plus simple, excellente documentation, parfait pour l'abonnement | ne détient pas de fonds de tiers ; plateformes d'investissement généralement exclues |
| **Stripe Connect** | conçu pour les places de marché, KYC intégré, reversements | pensé pour vendeur/acheteur, pas pour l'investissement ; mêmes restrictions de fond |
| **Mangopay** | établissement de monnaie électronique, porte-monnaie et cantonnement des fonds, **conçu pour le financement participatif** | intégration plus lourde, KYC exigeant, moins de documentation publique |
| **Lemonway** | même catégorie, français, connaît bien le cadre réglementaire local | même lourdeur ; équipe plus petite |

**Recommandation** : Stripe pour l'abonnement **maintenant**, et ne rien choisir pour les flux
d'investissement **avant d'avoir la réponse juridique**. Choisir l'outil avant de connaître le
statut, c'est construire sur une hypothèse qu'un juriste peut démolir en une phrase.

### Financement IGNITUX — investissements, remboursements, dividendes, portefeuille

Le moteur est là : participations, répartition au centime exact, deux vues du dividende
consolidées, journal immuable, audit de séparation. **Rien ne manque côté logiciel.**

Ce qui manquera au moment de verser pour de vrai :

1. **Le statut réglementaire** (voir ci-dessus). Préalable à tout.
2. **Le fournisseur de porte-monnaie**, une fois le statut connu.
3. **Une file d'ordres de versement** — à verser / en cours / versé / échoué. Une table, et elle
   n'a de sens qu'une fois (2) tranché : c'est le fournisseur qui dicte les états.
4. **Le rapprochement** entre ce qui est ordonné et ce que la banque confirme. La cellule
   bancaire sait déjà rapprocher un mouvement d'une écriture ; il lui manque la source.

---

## 3. Outils manquants — ce qui manque réellement

| Outil | Problème résolu | Postgres suffit-il ? |
|---|---|---|
| **Hébergement** | le produit n'existe pas en dehors d'un portable | non, hors sujet |
| **Collecteur d'erreurs** | les `Logger.error` déjà écrits ne sont lus par personne | non |
| **Fournisseur d'email** | réinitialisation de mot de passe et vérification d'adresse n'aboutissent pas | non |
| **Stripe** | encaisser les 20 €/mois | non |
| **Sauvegardes vérifiées** | une restauration jamais testée n'est pas une sauvegarde | à confirmer dans la console |

## 4. Outils facultatifs — plus tard, et pour une raison précise

| Outil | Déclencheur concret |
|---|---|
| `pg_trgm` + `unaccent` | au-delà de ~10 000 contacts, ou dès la première plainte sur la recherche |
| `vector` (pgvector) | au-delà de ~100 souvenirs par projet |
| `pg_cron` | à la première fonctionnalité déclenchée par le temps |
| IndexedDB | quand le cache de 60 entrées devient une gêne réelle |
| Stockage objet | à la première facture en PDF |
| `pgmq` | si une génération IA devient asynchrone |
| Mangopay / Lemonway | après la réponse juridique, pas avant |

## 5. Ce que je n'installerais à aucun moment prévisible

| Outil | Pourquoi non |
|---|---|
| **Neo4j** | graphes cloisonnés, petits, profondeur plafonnée à 3. Zéro bénéfice, second magasin à sauvegarder et à garder cohérent |
| **Elasticsearch / OpenSearch** | `pg_trgm` couvre le besoin de plusieurs ordres de grandeur. Un cluster de recherche pour 46 tables est une charge d'exploitation sans contrepartie |
| **Redis** | ni session à partager (JWT sans état), ni cache chaud à tenir. `pgmq` couvre la file le jour venu |
| **Temporal / Camunda** | l'état des processus est déjà durable en base, et chaque pas est déclenché par un appel HTTP |
| **Kafka** | il n'y a pas de flux d'événements à distribuer |
| **Kubernetes** | un conteneur sans état et une base gérée |

---

## 6. Priorités

| Priorité | Outil | Quand |
|---|---|---|
| **Critique** | Hébergement | avant le premier utilisateur hors réseau local |
| **Critique** | Vérifier et **tester** les sauvegardes | avant la première donnée réelle |
| **Importante** | Collecteur d'erreurs | le jour de la mise en ligne |
| **Importante** | Fournisseur d'email | avant d'exiger la vérification d'adresse |
| **Importante** | Stripe (abonnement seul) | avant le premier euro encaissé |
| **Utile** | `pg_trgm` + `unaccent` | au premier ralentissement de recherche |
| **Utile** | `pg_cron` | à la première relance automatique |
| **Utile** | IndexedDB | quand 60 entrées de cache gênent |
| **Plus tard** | `vector` | au-delà de ~100 souvenirs par projet |
| **Plus tard** | Stockage objet | à la première pièce jointe |
| **Plus tard** | Mangopay / Lemonway | après la réponse juridique |

## 7. Plan d'installation

### Hébergement — **critique**

- **Quand** : maintenant. C'est le seul élément qui bloque tout le reste.
- **Pourquoi** : sans lui, il n'y a pas de produit, seulement un dépôt.
- **Impact** : faible. L'application est un conteneur sans état ; il manque un `Dockerfile` et
  les variables d'environnement côté plateforme. Rien à changer dans le code.
- **Effort** : une demi-journée pour le premier déploiement, une journée avec le domaine, le
  certificat et le redéploiement automatique depuis GitHub Actions.

### Sauvegardes — **critique**

- **Quand** : avant la première donnée réelle.
- **Pourquoi** : trois bases coexistent sur la même instance. Une sauvegarde jamais restaurée
  n'est pas une sauvegarde — c'est une intention.
- **Impact** : nul sur le code.
- **Effort** : une heure pour vérifier l'offre ; une demi-journée pour écrire et **exécuter
  réellement** une restauration de bout en bout dans une base jetable.

### Collecteur d'erreurs — **importante**

- **Quand** : le jour de la mise en ligne.
- **Pourquoi** : le code écrit déjà ce qu'il faut surveiller — échec de journalisation d'un coût
  IA, violation constitutionnelle, génération perdue. Sans collecteur, tout cela tombe dans un
  terminal que personne ne regarde.
- **Impact** : un module Nest, un intercepteur d'exceptions. **Attention** : filtrer ce qui part.
  Les messages d'erreur de ce produit contiennent des identifiants de personnes et de projets ;
  les envoyer bruts à un service tiers déplacerait des données personnelles hors de la base sans
  que les CGU l'annoncent.
- **Effort** : une demi-journée, dont la moitié pour le filtrage.

### Email — **importante**

- **Quand** : avant de rendre la vérification d'adresse obligatoire.
- **Pourquoi** : deux parcours existent et n'aboutissent pas.
- **Impact** : **une seule classe change** — `MailService` a été écrit pour ça, et son
  commentaire le dit.
- **Effort** : deux heures pour le branchement, une demi-journée avec SPF, DKIM et DMARC. Ces
  trois-là ne sont pas optionnels : sans eux, les courriels partent en indésirables.

> **Mise à jour du 25 septembre 2026.** Le branchement ne se fait plus à
> l'aveugle. `node scripts/courrier-reel.mjs` ouvre une boîte aux lettres SMTP
> locale, démarre le serveur en transport « smtp » contre elle, et suit les
> **deux** parcours jusqu'au bout — confirmation d'adresse et mot de passe
> oublié : **11 vérifiés, 0 en échec**, et le pas est dans la CI.
>
> Ce que ça change pour l'estimation : les deux heures de branchement ne sont
> plus deux heures de découverte. Le chemin SMTP est éprouvé ; il ne reste que
> l'hôte, le port et les identifiants à écrire. La demi-journée SPF/DKIM/DMARC,
> elle, reste entière — c'est de la réputation d'expéditeur, et aucune commande
> lancée d'ici ne peut y répondre.

### Stripe, abonnement seul — **importante**

- **Quand** : avant le premier euro.
- **Pourquoi** : encaisser. Et le webhook alimentera le compte `706 — Abonnements Ignitux` du
  plan comptable, qui existe déjà et attend.
- **Impact** : un module, un webhook signé, et une écriture comptable par encaissement. Le
  plafond mensuel existe déjà ; il lui manque juste de savoir **qui a payé**.
- **Effort** : un à deux jours, webhook et idempotence compris. L'idempotence est le point
  délicat : Stripe rejoue ses webhooks, et un encaissement compté deux fois fausse la
  comptabilité.

### Extensions Postgres — **utile**

- **Quand** : au déclencheur indiqué dans le tableau, pas avant.
- **Pourquoi** : elles suppriment le besoin d'un service séparé.
- **Impact** : `CREATE EXTENSION`, un index, une requête. Aucune architecture ne change.
- **Effort** : une à deux heures chacune. **Vérifier d'abord** qu'elles sont autorisées sur
  l'offre Supabase en cours.

---

## 8. Verdict

### Si j'étais CTO d'IGNITUX aujourd'hui, j'installerais immédiatement

1. **Un hébergement** — c'est la seule chose qui manque vraiment. Tout le reste est un produit
   qui existe ; celui-ci est un produit qui n'est pas joignable.
2. **Une restauration de sauvegarde réellement testée** — pas vérifiée dans une interface :
   exécutée.
3. **Un collecteur d'erreurs**, avec un filtre écrit avant le premier envoi.
4. **Un fournisseur d'email**, parce que deux parcours du produit sont aujourd'hui des impasses.
5. **Stripe pour l'abonnement seul**, et rien d'autre côté paiement.

Cinq éléments, environ **trois à quatre jours** de travail cumulé. Aucun ne change
l'architecture : ce sont des branchements aux endroits que le code a déjà prévus.

### Je n'installerais pas encore

- **Neo4j** — jamais, sauf si la forme du graphe change du tout au tout.
- **Elasticsearch, Redis, Kafka, Temporal, Kubernetes** — aucun ne résout un problème que ce
  produit ait aujourd'hui, et chacun ajoute une pièce à surveiller, sauvegarder et maintenir
  cohérente.
- **pgvector, pg_trgm, pg_cron** — pas maintenant, mais ils ne demanderont qu'une heure le jour
  où leur déclencheur se produira. Rien à préparer d'ici là.
- **Mangopay ou Lemonway** — pas avant la réponse juridique. Choisir l'outil avant de connaître
  le statut, c'est bâtir sur une hypothèse qu'un juriste peut démolir en une phrase.

### La phrase qui résume

Ce projet n'a pas un problème d'outils : il a **un problème d'hébergement et quatre branchements
à faire**. Le réflexe serait d'ajouter des moteurs ; la mesure dit que la base en contient déjà
la plupart, non activés, et que le vrai manque est beaucoup plus prosaïque — **personne ne peut
s'y connecter, et personne ne serait prévenu si ça tombait**.
