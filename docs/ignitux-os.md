# IGNITUX OS — le système d'exploitation d'entreprise piloté par IGINI

26 septembre 2026. Analyse seule, aucune ligne de code modifiée.

Ce document prolonge [`vision-v2-analyse.md`](vision-v2-analyse.md) (audit
de l'existant, comparaison, ce qui se garde). Il ne le répète pas : il le
pousse jusqu'à la nouvelle ambition — non plus *créer* une entreprise, mais
la *créer, la gérer, la développer et la faire évoluer*.

Les affirmations sur le code sont marquées **[lu]** quand elles viennent
d'une lecture directe du dépôt.

---

## 1. Audit de l'existant — lu sous l'angle « système d'exploitation »

Le premier audit comptait les briques : 35 modules serveur, 50 tables,
~25 pages, 24 articles constitutionnels. La question change ici : **un
système d'exploitation a un noyau, des services système et des
applications. Qu'est-ce qu'IGNITUX a déjà de chacun ?**

| Couche d'un OS | Ce qu'IGNITUX a déjà | Ce qui manque |
|---|---|---|
| **Identité et droits** | Comptes, JWT, multi-rôle (`user_roles`), profil | La notion d'**entreprise** et de **membres** |
| **Règles du système** | Moteur constitutionnel, 12 articles vérifiés par le code | Des règles sur *qui peut activer quoi* |
| **Système de fichiers / données** | 50 tables, argent en centimes entiers, caisses séparées | Un propriétaire *entreprise*, pas seulement *personne* |
| **Journal du système** | `automation_runs`, `workflow_events`, `constitution_violations`, `ai_usage_events` | Un **journal d'événements commun** à toutes les applications |
| **Ordonnanceur** | Rien **[lu]** : ni `@nestjs/schedule`, ni tâche planifiée | Tout — sans lui, IGINI ne peut rien faire de lui-même |
| **Assistant** | 5 générateurs IGINI, appelés à la demande | Conversation, contexte, proactivité |
| **Mémoire** | `memories` : 5 catégories, saisies par la personne | `objectif`, portée entreprise, relecture active |
| **Applications** | CRM, facturation, comptabilité, banque, financement, investisseurs, communauté, conformité | Un **catalogue**, une activation, un lanceur |
| **Interfaces** | Web (Next.js), hors ligne fonctionnel | Mobile ; sessions longues |

### Les trois manques structurels

Ce sont eux qui décident de tout le reste. Chacun a été vérifié dans le code.

**1. Il n'y a pas d'entreprise dans IGNITUX. [lu]**
Chaque donnée appartient à une personne : `billing_documents.owner_id`,
`crm_contacts.owner_id`, `crm_companies.owner_id` pointent vers `users`.
Le mot « organisation » n'apparaît nulle part dans le schéma. Pour
accompagner un créateur seul, c'était juste. Pour faire tourner un
restaurant de huit salariés, c'est bloquant : la serveuse ne peut pas
encaisser sur la caisse du patron, le comptable ne peut pas voir les
factures. **C'est le chantier le plus important de toute la vision, et le
plus délicat à migrer.**

**2. Il n'y a pas de journal d'événements ni d'ordonnanceur. [lu]**
Aucune application ne dit aux autres ce qui s'est passé. Une facture
payée ne prévient personne ; IGINI ne peut le découvrir qu'en relisant
toute la base. Et rien ne s'exécute à une date : pas de rappel, pas de
relance, pas de bilan du lundi. Un assistant « proactif » sans ces deux
pièces n'est qu'un assistant qui attend qu'on lui parle.

**3. Les sessions durent un jour, sans renouvellement. [lu]**
`JWT_EXPIRES_IN` signe un seul jeton ; il n'existe aucun jeton de
renouvellement. Sur le web, se reconnecter chaque jour est acceptable.
Dans une application mobile qu'on ouvre dix fois par jour, c'est une
raison de la désinstaller.

### Ce qui est déjà d'un niveau « OS »

À l'inverse, certaines pièces sont plus mûres que ce que la vision exige :

- **La séparation des caisses** (IGNITUX / personne), tenue par le
  schéma lui-même et vérifiée par un audit financier. Le modèle est
  directement transposable à « entreprise A / entreprise B ».
- **Le principe « un rôle est une vue, jamais un conteneur »** : retirer
  un rôle ferme une porte, n'efface rien. C'est exactement la règle qu'il
  faut pour désactiver une application.
- **La traçabilité de ce qu'IGINI produit** (`generated_by`,
  `generated_model`) et de ce qu'il fait seul (`automation_runs`). La
  proactivité future a besoin de ce réflexe partout.
- **Le hors-ligne avec détection des écritures périmées** : la mécanique
  qu'une application mobile doit reproduire existe et est testée.

---

## 2. Compatibilité avec la vision

**Compatible à ~80 % au niveau des données et des règles, à ~20 % au
niveau de l'expérience.** Chaque module existant trouve sa place ; aucun
n'est en contradiction avec la vision.

| Module existant | Devient dans IGNITUX OS | Effort d'adaptation |
|---|---|---|
| `auth`, `users`, `roles`, `profile` | Noyau — identité | Moyen : ajouter entreprise, membres, sessions longues |
| `constitution` | Noyau — règles | Faible : nouvelles règles d'activation |
| `ledger`, `banking` | Noyau — argent | Moyen : propriétaire « entreprise » |
| `igini/*` (12 modules) | Service système — IGINI | Élevé : passage à l'assistant |
| `igini/memory`, `knowledge` | Service système — mémoire | Moyen |
| `igini/automation`, `workflow` | Service système — ordonnanceur | Moyen : branchés sur le futur journal d'événements |
| `crm` | Application **CRM** | Faible (hors propriétaire) |
| `billing` | Application **Facturation** | Faible (hors propriétaire) |
| `ledger` (vue utilisateur) | Application **Comptabilité** | Faible |
| `banking` | Application **Banque** | Faible |
| `financing`, `investors` | Applications **Financement** et **Portefeuille** | Faible — déjà séparées |
| `compliance` | Application **Démarches** | Faible |
| `community`, `marketplace` | Applications **Communauté** et **Réseau** | Faible |
| `projects` + 5 générateurs | Application **Parcours créateur** (Catégorie A) | Moyen : devient une application parmi d'autres |
| `offres` | Service système — abonnements | Moyen : bouquets d'applications |

Le point clé : **le projet cesse d'être le centre.** Aujourd'hui tout
pend à `projects`. Dans IGNITUX OS, le centre est l'**entreprise** (ou la
personne, pour un créateur seul), et le projet devient l'objet d'une
application — le parcours créateur.

---

## 3. Architecture cible IGNITUX OS

```
┌──────────────────────────────────────────────────────────────────┐
│  INTERFACES        Web (Next.js)  ·  Mobile (Flutter)  ·  PWA     │
│                    une seule API, un seul compte, mêmes données   │
├──────────────────────────────────────────────────────────────────┤
│  LANCEUR           IGINI + les applications activées pour moi     │
├──────────────────────────────────────────────────────────────────┤
│  APPLICATIONS      Parcours · CRM · Facturation · Comptabilité ·  │
│                    Banque · Caisse · Stocks · Agenda · Portefeuille│
│                    · Immobilier · Véhicules · Publicité · …       │
│                    chacune : un manifeste, des actions, des       │
│                    événements                                     │
├──────────────────────────────────────────────────────────────────┤
│  SERVICES SYSTÈME  IGINI assistant · Mémoire · Journal            │
│                    d'événements · Ordonnanceur · Notifications ·  │
│                    Documents · Recherche · Abonnements            │
├──────────────────────────────────────────────────────────────────┤
│  NOYAU             Identité · Entreprises & membres · Droits ·    │
│                    Constitution · Grand livre · Télémétrie IA     │
├──────────────────────────────────────────────────────────────────┤
│  DONNÉES           PostgreSQL 17 (Supabase eu-west-1)             │
└──────────────────────────────────────────────────────────────────┘
```

### Les règles qui tiennent l'ensemble

1. **Une application ne lit jamais directement les tables d'une autre.**
   Elle passe par les actions que l'autre expose, ou elle écoute ses
   événements. C'est ce qui permet d'en ajouter vingt sans que tout
   devienne un plat de spaghettis. Aujourd'hui, les modules NestJS se
   lisent encore les uns les autres par Prisma : la règle s'applique aux
   nouvelles applications d'abord, et les anciennes s'y conforment au fil
   des évolutions.
2. **Toute donnée a un propriétaire : une entreprise ou une personne.**
   Même principe que les caisses séparées actuelles, et même moyen : tenu
   par le schéma (`NOT NULL`), pas seulement par le code.
3. **Désactiver une application ne supprime rien.** Même règle que les
   rôles : on ferme une porte, on n'efface pas une pièce. Réactiver
   retrouve tout.
4. **Tout ce qu'IGINI fait seul est journalisé et réversible**, ou alors
   il demande. Extension directe de l'article constitutionnel sur la
   transparence, déjà appliqué à `automation_runs`.
5. **Le serveur reste un monolithe modulaire.** Pas de microservices :
   pour une équipe d'une personne, ils multiplient les pannes sans
   apporter de gain. Les frontières entre applications sont des
   frontières de modules NestJS, vérifiables à la lecture.

### Le modèle entreprise

```
organizations        l'entreprise (raison sociale, pays, secteur, SIRET)
memberships          qui en fait partie, avec quel rôle interne
                     (dirigeant, associé, salarié, comptable externe…)
organization_apps    quelles applications sont activées, depuis quand
```

Un créateur seul reçoit automatiquement une entreprise personnelle, à son
seul nom. **L'utilisateur ne voit jamais le mot « organisation »** tant
qu'il est seul : la complexité n'apparaît qu'au moment où il invite
quelqu'un.

Un investisseur n'est membre d'aucune entreprise qu'il finance : il voit
ses participations par le Portefeuille, jamais par les applications de
l'entreprise. Le principe `investissements-non-melanges` s'étend
naturellement.

---

## 4. Architecture de l'App Store interne

### Le manifeste d'application

Chaque application se décrit dans un fichier de code, **pas en base** —
même convention que `roles-catalogue.ts` et `offres-catalogue.ts` : une
application est une brique de produit, pas une donnée qu'on saisit.

```
slug              'caisse'
nom, icône        pour le lanceur
catégorie         'vente' | 'gestion' | 'finance' | 'croissance' | …
publics           ['entreprise', 'createur', 'investisseur']
secteurs          [] = tous ; sinon ['restauration', 'commerce', …]
pays              ['FR'] — une caisse française n'est pas une caisse belge
dépend de         ['comptabilite'] — la caisse écrit au grand livre
offres            dans quels abonnements elle est incluse
permissions       ce qu'elle lit et écrit, par portée
actions           ce qu'elle expose à IGINI et aux autres applications
événements        ce qu'elle émet ('caisse.vente_encaissee', …)
cadre légal       'NF525' — voir risques
statut            'disponible' | 'bêta' | 'prévue'
```

### Le moteur d'activation

Une **fonction pure** : elle reçoit le profil, les rôles, l'entreprise,
le secteur, le pays, l'avancement et l'abonnement, et rend trois listes :

- **activées** — visibles dans le lanceur ;
- **suggérées** — IGINI peut les proposer, avec la raison ;
- **invisibles** — tout le reste.

Parce que c'est une fonction pure, elle se teste exhaustivement sans base
de données : le restaurateur obtient Caisse, Stocks, Comptabilité, CRM ;
le consultant, CRM, Facturation, Agenda ; l'investisseur, Portefeuille,
Participations, Dividendes. Chacun de ces exemples de la vision devient
un test.

**IGINI propose, la personne active.** Une application n'apparaît jamais
d'elle-même avec des données dedans : IGINI dit « tu encaisses en
espèces, la Caisse te ferait gagner une heure par jour — je l'ajoute ? ».
L'activation automatique est réservée au premier lancement, à partir de
l'onboarding, et elle est expliquée.

### Les permissions

Chaque action porte une portée : `lecture`, `écriture`, `argent`
(tout ce qui touche un montant), `personnes` (données personnelles de
tiers). Un salarié peut avoir la Caisse en écriture sans voir la
Comptabilité ; un comptable externe peut tout lire sans rien encaisser.
Le contrôle se fait au serveur, dans un garde NestJS unique — même
emplacement que les gardes existants (`JwtAuthGuard`,
`EcritureDepasseeGuard`).

### Le bureau et la barre des tâches (fait, 26/09/2026)

Au-dessus des règles d'activation, le choix de la personne : une
application ajoutée reste sur le bureau même hors de ses rôles, une
application retirée en disparaît même si elle s'en sert, et IGINI cesse
de la proposer. Les réglages ne se rangent pas, les applications prévues
ne s'ajoutent pas. Retirer n'efface aucune donnée.

L'interface est celle d'un poste de travail : une application plein
écran à la fois, une barre des tâches qui garde les applications ouvertes
(au plus six) et l'endroit où chacune a été laissée. La liste des
applications ouvertes est un état de l'appareil (mémoire du navigateur,
effacée à la déconnexion) ; le bureau est un état du compte (base de
données).

Le bureau lui-même reste sobre : seuls Mes projets, Profil et l'icône
« Organiser mon bureau » y restent en direct. Un dossier « Entreprise »,
comme sur un téléphone, regroupe tout le reste (les autres applications,
les réglages secondaires, les applications prévues) derrière une seule
icône à aperçu, qui s'ouvre en plein écran avec sa propre pagination.

### Ce que « App Store » ne veut pas dire (encore)

Pas d'applications de développeurs tiers avant 2029. Ouvrir le magasin à
d'autres, c'est leur donner accès à des données financières de
personnes réelles : c'est un produit de sécurité à part entière, pas une
fonctionnalité. Le manifeste est conçu pour le permettre plus tard, sans
le promettre maintenant.

---

## 5. Architecture d'IGINI Assistant Personnel

### Ce qu'il devient

Aujourd'hui IGINI est **cinq générateurs** qu'on appelle un par un. Demain
il est **un orchestrateur** : il comprend la demande, choisit les
applications concernées, appelle leurs actions, et répond.

```
Personne ──► IGINI
               │
               ├─ 1. Contexte     qui elle est, son entreprise, ses
               │                  applications, ses objectifs, ce qui
               │                  s'est passé depuis la dernière fois
               ├─ 2. Mémoire      ce qu'elle a dit de durable
               ├─ 3. Outils       les actions des applications ACTIVÉES
               │                  (et seulement celles-là)
               ├─ 4. Constitution ce qu'il a le droit de faire seul
               └─ 5. Réponse      texte + actions proposées ou faites
```

Techniquement : l'API de Claude avec **utilisation d'outils** (tool use).
Chaque action d'application exposée à IGINI devient un outil. Les cinq
générateurs actuels deviennent cinq outils de l'application Parcours —
leurs prompts et leurs règles de provenance ne changent pas.

### Les quatre niveaux d'autonomie

C'est la partie qui décide si IGINI reste digne de confiance.

| Niveau | Exemple | Confirmation |
|---|---|---|
| **Lire** | « Combien j'ai facturé ce mois ? » | Aucune |
| **Proposer** | Brouillon de relance, tâche suggérée | Aucune — rien n'est écrit tant que la personne ne valide pas |
| **Agir après accord** | Émettre une facture, envoyer un email | Un clic, à chaque fois |
| **Agir seul** | Créer une tâche de rappel, classer une mémoire | Aucune, **mais journalisé et annulable** |

**Rien de ce qui touche l'argent ou un tiers n'est jamais au niveau
« agir seul ».** Émettre une facture, encaisser, écrire à un client : un
clic humain, toujours. Cette règle mérite d'être un article
constitutionnel `enforced`, vérifié par le moteur, et non une convention.

### La proactivité

Elle repose sur les deux pièces qui manquent aujourd'hui :

- **Le journal d'événements** : chaque application écrit ce qui s'est
  passé (`facture.payee`, `stock.bas`, `objectif.echeance_proche`) dans
  une table commune, append-only — même principe que
  `investor_movements`.
- **L'ordonnanceur** : chaque nuit, et à certains événements, un
  traitement relit ce qui s'est passé et produit des **suggestions** —
  pas des messages. Une suggestion est une ligne en base, avec sa raison
  et sa source, que la personne voit au prochain passage et peut écarter.

La plupart des suggestions **n'appellent pas l'IA** : « facture en
retard de 15 jours » est une règle, pas un raisonnement. L'IA n'intervient
que pour formuler ou prioriser. C'est ce qui garde le coût sous contrôle.

### Le coût — le vrai risque d'IGINI

Mesure actuelle **[lu]** (`offres-catalogue.ts`, 55 appels réels) :
0,0511 € par génération en moyenne, budget de 50 €/mois. Un assistant conversationnel peut consommer dix fois
plus par personne. Trois leviers, dans l'ordre :

1. **Des règles avant l'IA**, pour la proactivité (voir ci-dessus).
2. **Deux étages de modèles** : un modèle rapide et peu coûteux pour
   comprendre la demande et choisir les outils ; le modèle le plus
   capable seulement pour rédiger une analyse ou un plan.
3. **Le cache de prompt** sur le contexte, qui change peu d'un message à
   l'autre.

Et un **plafond par personne et par offre**, qui existe déjà pour les
générateurs et s'étend à la conversation. Le budget par offre doit être
recalculé sur des mesures réelles de la bêta, pas estimé.

### Les tables nouvelles

```
igini_conversations   une conversation, rattachée à une personne et
                      éventuellement à une entreprise
igini_messages        les échanges, avec les outils appelés
igini_actions         ce qu'IGINI a fait ou proposé : niveau, statut
                      (proposée, acceptée, refusée, annulée), trace
igini_suggestions     ce que l'ordonnanceur a produit, avec sa raison
events                le journal commun des applications
```

---

## 6. Architecture de la mémoire long terme

### Le principe, déjà posé dans le code

La mémoire actuelle a une règle forte **[lu]** : une erreur n'est jamais
déduite par le produit, les étiquettes ne sont jamais inventées. C'est la
personne qui décide de ce qu'IGINI retient. **Cette règle est gardée.**
Elle devient : *IGINI propose des souvenirs, la personne les confirme.*

### Les six types

| Type | Exemple | État |
|---|---|---|
| `fact` | « Le local fait 80 m², bail jusqu'en 2029 » | existe |
| `preference` | « Pas de rendez-vous le lundi » | existe |
| `learning` | « Valider le prix avant de produire » | existe |
| `decision` | « On ne livre plus hors département » | existe |
| `error` | « 200 pièces produites, invendables » | existe (manque au sélecteur de l'interface) |
| `objectif` | « 10 000 € de chiffre d'affaires en mars » | **à créer** |

### Ce qui s'ajoute à la table `memories`

```
scope          'personne' | 'entreprise' | 'projet'
               — une préférence est à la personne, un fait sur le bail
               est à l'entreprise et survit au départ d'un associé
status         'proposée' | 'confirmée' | 'archivée'
source         'personne' | 'igini' — qui l'a formulée
supersedes_id  le souvenir qu'il remplace ; on ne réécrit pas, on
               remplace, et l'ancien reste lisible
valid_until    pour ce qui expire (un objectif, un bail)
target_value   pour un objectif chiffré, en centimes ou en unités
last_used_at   pour savoir ce qui sert et ce qui dort
```

### Comment IGINI la retrouve

Pas d'embeddings au départ. La recherche en texte intégral de PostgreSQL,
filtrée par portée et par type, pondérée par la récence, suffit pour
quelques centaines de souvenirs par personne. Les embeddings (`pgvector`,
disponible chez Supabase) viendront quand un volume réel le justifiera —
ils demandent un fournisseur d'embeddings de plus, donc un contrat de
plus et un transfert de données de plus.

À chaque conversation, IGINI charge : les objectifs actifs, les
préférences, les décisions récentes, puis les souvenirs pertinents à la
demande. Ce qu'il a utilisé est affiché — « je me base sur ta décision
du 12 mars » — pour que la personne voie ce qu'il sait.

### Le droit à l'oubli

Une page « Ce qu'IGINI sait de moi », qui liste tout, par type, avec la
suppression d'un clic. C'est une obligation RGPD, et c'est surtout ce qui
rend acceptable un assistant qui se souvient.

---

## 7. Architecture Flutter multiplateforme

### D'abord, ma position

Dans [`vision-v2-analyse.md`](vision-v2-analyse.md) j'ai recommandé une
PWA d'abord, et React Native plutôt que Flutter. **Je maintiens la PWA
d'abord** : elle donne l'essentiel en une semaine, parce que le hors-ligne
est fait. Mais la vision OS change un argument : si IGNITUX doit tourner
**aussi sur Windows et sur des terminaux de caisse**, avec une interface
identique partout, Flutter devient défendable — c'est l'outil qui couvre
le mieux Android, iOS, Windows et macOS depuis un seul code. Le prix reste
le même : un second langage (Dart) et des écrans refaits.

Si Flutter est retenu, voici l'architecture.

### Le contrat qui rend tout possible : l'API décrite

Le serveur expose déjà une description OpenAPI (Swagger, derrière
`ENABLE_API_DOCS`). **Le client Dart en est généré automatiquement.** Les
types ne se recopient jamais à la main : une modification côté serveur
casse la compilation du mobile au lieu de casser l'application d'un
utilisateur.

Condition préalable : l'API versionnée (`/v1`). Un téléphone garde une
vieille version de l'application pendant des mois ; le serveur doit
continuer à lui répondre.

### Structure

```
mobile/
  lib/
    noyau/          session, jetons (stockage sécurisé du système),
                    client API généré, file hors ligne
    lanceur/        écran IGINI + applications, piloté par
                    GET /v1/me/applications
    igini/          conversation, suggestions
    applications/
      caisse/       un dossier par application, même découpage que
      crm/          le serveur : ce qui est activé côté serveur
      facturation/  apparaît, le reste n'est pas chargé
      …
    commun/         design, composants
```

- **État** : Riverpod — le plus répandu, testable sans interface.
- **Hors ligne** : une base SQLite locale (Drift) et une file d'écritures
  qui reproduit **exactement** le mécanisme web actuel, en-tête
  `X-Ignitux-Capture-Age` compris. Le serveur n'a pas à savoir quel
  client lui parle.
- **Session** : jeton d'accès court + **jeton de renouvellement** stocké
  dans le trousseau sécurisé du système (Keychain, Keystore). À créer
  côté serveur — c'est le manque n° 3.
- **Notifications** : les suggestions d'IGINI arrivent en notification
  push. Demande un service d'envoi (Firebase Cloud Messaging pour
  Android, APNs pour iOS).

### Ce que Flutter ne remplace pas

**Le web reste en Next.js.** Flutter sait produire du web, mais les pages
publiques (accueil, communauté, mentions légales) doivent être lisibles
par les moteurs de recherche et s'ouvrir instantanément — ce que Flutter
web fait mal. Deux interfaces, donc : c'est le coût assumé.

### Les boutiques

Compte développeur Apple (99 $/an), Google Play (25 $ une fois), et une
revue par Apple à chaque version. Une application qui manipule de
l'argent et des données personnelles doit fournir une politique de
confidentialité et une fiche de collecte de données détaillées.

---

## 8. Plan de migration sans casser l'existant

### Les principes

1. **Uniquement des migrations additives.** Nouvelles tables, nouvelles
   colonnes nullables. Jamais `--accept-data-loss`, conformément aux
   consignes du dépôt. Une colonne ne devient `NOT NULL` qu'après avoir
   été remplie et vérifiée.
2. **L'ancien chemin continue de marcher** pendant que le nouveau se
   construit à côté. On ne bascule qu'une application à la fois.
3. **Chaque étape est réversible** jusqu'à ce qu'elle ait tourné en
   production sans incident.
4. **Les testeurs réels gardent leurs données.** testeur1 et testeur2
   servent de témoins : après chaque étape, leurs projets, factures et
   investissements doivent être identiques au centime près.

### La migration délicate : de « personne » à « entreprise »

| Étape | Ce qui se passe | Risque |
|---|---|---|
| 1 | Créer `organizations` et `memberships`. Rien ne les lit. | Nul |
| 2 | Créer une entreprise personnelle pour chaque compte existant, dont la personne est dirigeante | Faible — script idempotent, vérifié par comptage |
| 3 | Ajouter `organization_id` **nullable** à côté de `owner_id` sur CRM, facturation, banque, comptabilité ; le remplir | Faible |
| 4 | Le serveur **écrit les deux**, lit encore `owner_id` | Faible |
| 5 | Contrôle : pour chaque ligne, les deux colonnes désignent la même personne. Zéro écart exigé | — c'est le verrou |
| 6 | Le serveur lit `organization_id` | Moyen — c'est la bascule |
| 7 | `organization_id` passe `NOT NULL` | Faible si 5 est à zéro |
| 8 | `owner_id` devient « créé par », plus « appartient à » | Nul |

**La facturation mérite une attention particulière** : la numérotation
sans trou est aujourd'hui par `owner_id`, type et année. Elle doit
devenir par entreprise **sans rompre la séquence en cours** : la
première facture émise après la bascule suit la dernière émise avant.
C'est une obligation légale, et elle se teste avant la bascule, pas
après.

### Le reste, dans l'ordre

1. **API `/v1`** : alias des routes actuelles. Le web continue d'appeler
   les anciennes.
2. **Catalogue d'applications et moteur d'activation**, sans interface :
   ils répondent, personne ne les consulte encore.
3. **Lanceur** derrière un réglage : les testeurs le voient, les autres
   gardent le menu. Le menu disparaît quand le lanceur a fait ses
   preuves.
4. **Journal d'événements** : chaque application existante commence à
   écrire ses événements. Rien ne les lit encore.
5. **IGINI conversationnel**, à côté des générateurs, qui restent
   accessibles.

---

## 9. Roadmap IGNITUX 2026 → 2030

| Période | Jalon | Contenu |
|---|---|---|
| **T4 2026** | Bêta ouverte, fondations | Hébergement, domaine, email ; les petites finitions de [`reste-a-faire.md`](reste-a-faire.md) ; `/v1` ; sessions longues ; entreprises et membres (étapes 1 à 5) |
| **T1 2027** | Le lanceur | Catalogue, moteur d'activation, lanceur, nouvel onboarding en 5 étapes, PWA installable ; bascule entreprise (étapes 6 à 8) |
| **T2 2027** | IGINI parle | Conversation avec outils, mémoire étendue (6 types, portée, oubli), niveaux d'autonomie en article constitutionnel |
| **T3 2027** | IGINI veille | Journal d'événements, ordonnanceur, suggestions, notifications |
| **T4 2027** | Catégorie B | Offre entreprise existante ; invitations de salariés ; permissions par membre ; Agenda |
| **2028** | Le commerce et le mobile | Caisse (via une solution certifiée NF525), Stocks ; application Flutter sur les boutiques ; architecture Immobilier, Véhicules, Publicité passée à l'intégration |
| **2029** | L'entreprise complète | Ressources humaines (via un fournisseur de paie), Production, Formation ; banque synchronisée via un agrégateur agréé ; ouverture à d'autres pays |
| **2030** | La plateforme | Applications de partenaires dans l'App Store, API ouverte ; IGINI capable d'orchestrer plusieurs applications dans une même demande de bout en bout |

Chaque jalon est livrable seul : si la route s'arrête en 2027, ce qui
est fait tient debout.

---

## 10. Estimation du travail

Un développeur à temps plein, avec l'exigence de test déjà tenue sur le
projet. Ordres de grandeur, pas engagements.

| Bloc | Semaines |
|---|---:|
| Sessions longues (jeton de renouvellement) | 1 |
| API `/v1` | 1 |
| Entreprises et membres, migration comprise | 5-7 |
| Permissions par membre | 3 |
| Catalogue, manifeste, moteur d'activation | 3 |
| Lanceur + onboarding | 4-5 |
| PWA installable | 1 |
| Journal d'événements + ordonnanceur | 3 |
| IGINI conversationnel avec outils | 5-6 |
| Mémoire long terme | 2-3 |
| Suggestions + notifications | 3 |
| Offre Catégorie B | 2 |
| **Socle IGNITUX OS (2026-2027)** | **≈ 33-40** |
| Application Flutter (lanceur, IGINI, 4 applications, hors ligne, boutiques) | 16-24 |
| Chaque nouvelle application métier simple (Agenda, Stocks) | 3-5 chacune |
| Chaque application à intégration tierce (Caisse, Banque, Paie, Immobilier) | 4-8 chacune, **hors délais du partenaire** |

Le socle représente **huit à dix mois** pour une personne seule. C'est
le chiffre qui compte pour décider : la vision complète 2030 ne tient pas
à une personne. Le premier recrutement — ou le premier prestataire —
devrait porter sur le mobile, parce que c'est le bloc le plus
indépendant du reste.

---

## 11. Risques techniques

| # | Risque | Gravité | Parade |
|---|---|---|---|
| 1 | **La migration personne → entreprise** corrompt une donnée d'argent ou casse la numérotation des factures | Élevée | Étapes additives, double écriture, contrôle à zéro écart avant bascule, testeurs réels comme témoins |
| 2 | **Une application voit ce qu'elle ne devrait pas** (permissions, membres, activation) | Élevée | Un seul garde serveur ; tests d'isolement symétriques à ceux d'`investissements-non-melanges` |
| 3 | **Le coût d'IGINI explose** avec la conversation | Élevée | Règles avant l'IA, deux étages de modèles, cache, plafond par personne ; budget recalculé sur mesures |
| 4 | **IGINI agit à tort** sur de l'argent ou auprès d'un tiers | Élevée | Jamais « agir seul » sur ces domaines, en article constitutionnel `enforced` |
| 5 | **La Caisse** : en France, un logiciel de caisse doit être certifié (loi anti-fraude à la TVA, art. 286 I 3° bis du CGI — le même article que cite déjà `billing-legal.ts`). Amende de 7 500 € par logiciel non conforme | Élevée | Ne pas développer une caisse certifiée soi-même : s'appuyer sur une solution certifiée et l'intégrer |
| 6 | **La paie et la banque synchronisée** sont réglementées (déclarations sociales, agrément pour l'accès aux comptes) | Élevée | Passer par des fournisseurs agréés ; IGNITUX orchestre, il ne remplace pas |
| 7 | **Deux interfaces** (web + Flutter) qui divergent | Moyenne | Client généré depuis l'API ; la logique métier reste au serveur, jamais dans l'interface |
| 8 | **Le monolithe grossit** jusqu'à devenir illisible | Moyenne | Frontières d'applications strictes (règle 1 de la section 3), vérifiées par un test d'architecture |
| 9 | **La mémoire retient ce qu'elle ne devrait pas** (données de tiers, santé) | Moyenne | IGINI propose, la personne confirme ; page d'oubli ; aucune catégorie sensible |
| 10 | **Une seule personne** porte tout le code | Élevée | Documenter les décisions (déjà fait dans `decisions.md`), recruter sur un bloc indépendant |

---

## 12. Priorités de développement

Classées par ce qu'elles débloquent, pas par envie.

**P0 — avant toute chose, parce que rien ne sert sans utilisateurs**
1. Ouvrir la bêta actuelle : hébergement, domaine, email.
2. Les finitions de [`reste-a-faire.md`](reste-a-faire.md), rapporteur
   d'erreurs en tête.

**P1 — les fondations, invisibles mais sans lesquelles rien ne tient**
3. Sessions longues.
4. API `/v1`.
5. Entreprises et membres, jusqu'à l'étape 5 (double écriture vérifiée).

**P2 — la simplicité promise**
6. Catalogue et moteur d'activation.
7. Lanceur et nouvel onboarding.
8. PWA installable.

**P3 — la puissance promise**
9. Journal d'événements et ordonnanceur.
10. IGINI conversationnel, niveaux d'autonomie constitutionnels.
11. Mémoire long terme.

**P4 — le second marché**
12. Offre Catégorie B, permissions par membre.

**P5 — l'extension**
13. Flutter.
14. Nouvelles applications, dans l'ordre de ce que les utilisateurs de la
    bêta auront réellement demandé.

**Ce qui n'est pas prioritaire**, alors que la vision le cite : les
modules Immobilier, Véhicules et Publicité. Ils sont faciles à esquisser
et coûteux à rendre utiles, parce que leur valeur dépend d'intégrations
avec des tiers. Leur architecture tient en un manifeste chacun ; leur
développement attendra que le socle existe.

---

## Ce que je retiens

La nouvelle vision est plus ambitieuse que la précédente, et **elle est
atteignable sans rien jeter** : les règles, l'argent, la constitution et
les modules métier sont déjà au niveau d'un système d'exploitation.

Ce qui manque tient en trois pièces — **l'entreprise, le journal
d'événements, la session longue** — et une couche : **IGINI comme
orchestrateur**. C'est là que se joue la promesse « plus simple et plus
puissant » : la simplicité vient du lanceur et de l'activation, la
puissance vient du journal et de l'assistant. Sans les trois pièces, ni
l'une ni l'autre ne tient.
