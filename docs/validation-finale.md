# Validation finale sur base réelle

Exécution du 23 septembre 2026, contre la base Supabase reconnectée. Ce
document remplace `beta-ready.md` sur tout ce qui concerne les preuves : là où
ce dernier disait « prêt sous réserve de vérification », celui-ci dit ce qui a
été vérifié, comment, et ce qui ne l'est pas.

> **Verdict : 41 vérifications sur 41 passent sur la base réelle, dont les
> appels IA. La simulation des dix bêta-testeurs ne remonte plus aucun
> constat, à aucun niveau de gravité.**
>
> Les deux actions de base qui restaient — fermer la surface REST et migrer
> `ignitux_prod` — **ont été passées le soir même par le porteur**, et
> revérifiées ici.
>
> Ce n'est pas la même chose que « prêt à ouvrir ». Le produit est éprouvé et
> la base est en ordre ; l'infrastructure qui porterait le tout n'existe pas
> encore.

> ### Reprise du 24 septembre 2026
>
> La commande a grandi depuis : **70 contrôles** au lieu de 41 — facturation,
> Constitution, investisseur, données personnelles, partage, courrier, et les
> écritures revenues du froid. Relancée aujourd'hui contre la même base :
> **69 vérifiés, 0 en échec, 1 non prouvé**.
>
> Le contrôle non prouvé est le même qu'hier et ne dépend pas du code : le
> parcours complet du mot de passe oublié exige qu'un vrai courrier parte, donc
> un fournisseur d'email. Le mécanisme, lui, est éprouvé à la main — jeton
> d'une heure, ancien mot de passe refusé, rejeu refusé.
>
> Les suites ont suivi le même mouvement : **1 055** tests unitaires backend
> (78 fichiers), **258** bout en bout (16 fichiers), **367** frontend
> (39 fichiers) — **1 680** au total, tous verts. S'y ajoute une commande qui
> n'existait pas :
> `scripts/hors-ligne.mjs`, **7 vérifiés, 0 en échec**, qui coupe le réseau
> pour de bon et constate que l'application s'ouvre quand même (article 16).

---

## 1. Résultats détaillés

### 1.1 Les suites automatiques

| Suite | Fichiers | Tests | Résultat |
|---|---:|---:|---|
| Unitaires backend | 76 | 1 028 | tous verts |
| Bout en bout backend (vraie base `ignitux_test`) | 15 | 252 | tous verts |
| Frontend | 39 | 356 | tous verts |
| **Total** | **130** | **1 636** | **tous verts** |

### 1.2 La validation réelle — `node scripts/validation-reelle.mjs --avec-ia`

Contre le serveur réel, la vraie base, un vrai navigateur, et de vrais appels
Claude.

```
41 vérifiés ·  0 en échec ·  0 non prouvés
```

Le détail, par section :

| Section | Ce qui est prouvé |
|---|---|
| Compte | inscription, connexion, jeton, mot de passe oublié |
| Offres et droits | un compte neuf est en Découverte ; le 2ᵉ projet est refusé **en nommant l'offre qui l'ouvre** ; aucune offre payante ne se prend sans encaissement ; l'évaluation de financement porte son avertissement |
| Projet, mémoire, connaissances | modification, souvenir écrit puis relu, catégorie `error` acceptée, deux concepts et un lien |
| Profil | enregistrement et relecture |
| Conformité | le pays déclaré est utilisé ; le secteur **trie sans rien retirer** (12 démarches, groupes `secteur` et `toute-activite`) ; aucune source ne renvoie un 404 |
| Tâches, orchestration, scores | une tâche ajoutée n'en crée qu'une ; les scores restent `null` sans source, **jamais zéro** ; un relevé est enregistré ; le parcours ouvre sur des données ; l'automatisation tourne et se journalise |
| Générateurs | Construire refusé en Découverte ; **IGINI rend une analyse réelle de 4 204 caractères** ; l'appel est journalisé avec ses jetons et son coût ; **Découverte s'arrête à 3 analyses, et le 4ᵉ refus est gratuit** |
| Navigateur | quatre écrans traversés sous Edge : un seul `<h1>`, aucun `undefined`/`NaN`/`[object Object]` visible, aucune erreur JavaScript, aucun 500 |

### 1.3 La simulation des dix bêta-testeurs — `node scripts/simulation-beta.mjs --avec-ia`

```
0 critique · 0 majeur · 0 moyen · 0 mineur
```

Les deux profils qui restaient « non prouvés » faute d'appel IA le sont
désormais :

- **Antoine Leroy** (15 ans de logistique) — l'analyse tient compte du parcours
  déclaré dans le profil. Le profil n'est pas seulement stocké, il est lu.
- **Kevin** (entreprise spatiale, budget 500 €, aucune formation) — IGINI
  répond **faisabilité 2/10, 5 risques identifiés**. C'est la vérification qui
  compte le plus du lot : le produit dit la vérité à quelqu'un dont le projet
  ne tient pas, au lieu de l'encourager.

Le profil malveillant reste sans prise : aucune lecture ni écriture croisée
entre comptes, charges hostiles stockées telles quelles sans erreur serveur,
champ démesuré refusé en 413, référence de paiement inventée rejetée, aucun
accès sans jeton.

---

## 2. Erreurs corrigées

Dix défauts, tous trouvés en exécutant pour de vrai — aucun n'était visible
en lecture de code. Les deux derniers l'ont été en lançant l'outil de
sécurité lui-même, ce qui est la meilleure illustration du principe : un
script qu'on n'a pas exécuté n'est pas un script qui marche.

### 2.1 L'application entière refusait de démarrer — *bloquant absolu*

`OffresController` pose `@UseGuards(JwtAuthGuard)`, mais `OffresModule`
n'importait ni `AuthModule` ni `PassportModule`. Nest ne résolvait pas la garde
et refusait de construire le graphe : **aucune route ne répondait**, pas
seulement celles des offres.

Les 1 028 tests unitaires ne pouvaient pas l'attraper — ils instancient les
services un par un, sans jamais assembler le graphe. C'est la première
exécution de bout en bout contre une vraie base qui l'a vu. Les 15 fichiers e2e
échouaient tous, sur la même ligne.

### 2.2 Un corps trop volumineux rendait 500 — *défaut produit réel*

Trouvé en envoyant 200 000 caractères dans une description. 5 000 passaient,
50 000 rendaient un 400 clair, 200 000 un 500 anonyme : le parseur JSON refuse
avant toute validation et lève une erreur qui n'est pas une `HttpException`,
donc elle ressortait en « erreur de notre côté ».

C'est faux, et faux dans le sens le plus coûteux : la personne croit le produit
cassé et attend une réparation, alors qu'elle n'a qu'à raccourcir. Rendu 413,
avec un message qui dit que ce n'est pas une panne et que rien n'a été
enregistré. Le filtre n'avait **aucun test** ; il en a 26.

### 2.3 Le plafond d'analyses mentait — *et coupait les offres payantes*

Deux endroits comptaient la même chose et s'étaient contredits.
`DEFAULT_CALLS_PER_MONTH` valait 5, écrit du temps d'une offre unique à
20 €/mois pour 5 analyses. Cette offre n'existe plus ; le catalogue annonce 3,
30 et 150. Le chiffre lui a survécu.

Deux conséquences, toutes deux visibles par une personne réelle :

- l'écran « Consommation IA » annonçait **« 5 analyses restantes »** à un
  compte Découverte que le produit arrête à la troisième ;
- surtout, ce plafond serait tombé **avant** l'offre pour tout abonné payant :
  **cinq analyses livrées à quelqu'un qui en a acheté trente.**

Le nombre d'analyses incluses est une promesse commerciale : il vit désormais
uniquement dans le catalogue. L'axe « appels » du garde-fou technique passe à
`null` ; l'axe « coût » reste, parce que lui ne double aucune promesse et voit
ce que compter les appels ne voit pas — un appel dix fois plus gros qu'un
autre. L'écran nomme maintenant le plafond qui arrêtera vraiment : « Sur les 3
incluses ce mois-ci par ton offre decouverte ».

### 2.4 La sauvegarde visait la mauvaise base — *sans rien signaler*

`verifier-base.mjs` prend son fichier d'environnement en argument nu,
`sauvegarde.mjs` l'exigeait derrière `--env`. Deux conventions sur deux scripts
qu'on enchaîne toujours dans le même souffle. La commande
`node scripts/sauvegarde.mjs .env.production` sauvegardait donc la base de
**développement**, et la sortie ressemblait à une réussite.

Une sauvegarde qui vise la mauvaise base est pire que pas de sauvegarde : on
migre ensuite en croyant être couvert.

### 2.5 La sauvegarde sautait des lignes réelles — *avec un message rassurant*

La détection de « table absente » se faisait sur la prose du message Prisma,
avec un `/does not exist/` qui attrape aussi `column ... does not exist`. Une
table bien présente, en retard d'une seule colonne, était classée absente et
ses lignes sautées — sous le message « normal si la migration n'a pas encore
été passée ».

Sur `ignitux_prod`, cela a silencieusement laissé de côté les **12 lignes de
`compliance_requirements`**, exactement les seules données réelles de cette
base. La détection lit maintenant les codes que Prisma garantit (`P2021` table,
`P2022` colonne), et le second cas ne fait plus abandonner la table : un
`SELECT *` prend les colonnes qui existent vraiment.

### 2.6 La vérification annonçait « rien à migrer » avec deux tables manquantes

`verifier-base.mjs` calculait son verdict sans regarder les tables absentes.
Un verdict faux, et faux dans le sens rassurant — celui qu'on ne recontrôle
pas.

### 2.7 Deux défauts de mon propre harnais

- Le chemin d'import de Playwright n'était pas décodé : le dossier du projet
  contient un espace, `%20` ne se résolvait pas, et **la traversée navigateur
  était silencieusement ignorée** — comptée comme « non prouvée », mais jamais
  regardée de près.
- L'historique de consommation était lu comme un tableau alors que la route
  rend `{ appels: [...] }`, ce qui a produit un faux échec.

### 2.8 L'outil de sécurité, deux fois pris en défaut par son propre usage

**Sa transaction empêchait sa propre correction.** Les neuf ordres SQL étaient
dans un seul bloc. Les six qui comptent passaient ; le septième — `ALTER
DEFAULT PRIVILEGES FOR ROLE supabase_admin` — échouait sur « permission denied
to change default privileges », parce que `postgres` n'est pas membre de ce
rôle sur une instance hébergée. Tout était alors annulé, **et la surface
restait grande ouverte** — pour trois ordres sans effet ici. Un garde-fou placé
là protégeait le mauvais bout. Les six obligatoires gardent leur transaction ;
les trois autres sont tentés après le `COMMIT`, un par un, et un refus est
signalé au lieu d'être fatal.

**Son raccourci « rien à faire » laissait le piège armé.** Le script s'arrêtait
dès qu'aucun droit n'était accordé sur les tables — sans jamais regarder les
privilèges *par défaut*, qui ne se voient pas dans `role_table_grants` et
n'agissent que sur les tables à venir. Une base fraîche est exactement ce cas :
le script aurait annoncé que tout allait bien en laissant le trou se rouvrir au
prochain `db push`. Il regarde maintenant les deux avant de conclure.

---

## 3. Preuves disponibles

Tout est reproductible en une commande, sans préparation.

| Preuve | Commande |
|---|---|
| L'état du schéma face à la base | `node backend/scripts/verifier-base.mjs [.env\|.env.test\|.env.production]` |
| Sauvegarde logique horodatée | `node backend/scripts/sauvegarde.mjs [fichier]` → `backend/sauvegardes/<base>-<date>/` avec `_manifeste.json` |
| Les 1 636 tests | `npm test` (backend, frontend), `npm run test:e2e` (backend) |
| Les 41 vérifications réelles | `node scripts/validation-reelle.mjs --avec-ia` |
| Les dix bêta-testeurs | `node scripts/simulation-beta.mjs --avec-ia` |
| L'état de la surface REST | `node backend/scripts/fermer-surface-rest.mjs [fichier]` (aperçu, n'écrit rien) |
| Migrer la production sans pouvoir viser la mauvaise base | `node backend/scripts/migrer-prod.mjs` (aperçu, n'écrit rien) |
| Le déploiement à blanc | `node backend/scripts/verifier-production.mjs .env.production` |
| Un lien de mot de passe oublié, sans email | `node backend/scripts/lien-mot-de-passe.mjs <email>` |
| L'audit financier de toute la base | `node backend/scripts/audit-financier.mjs [fichier]` |
| Ce que `dist/` importe est-il installé en production | `node backend/scripts/verifier-dependances.mjs` |
| Les 21 écrans, vus comme un premier utilisateur | `node scripts/traversee-ecrans.mjs [--telephone]` |
| Le parcours complet, sans jamais taper une adresse | `node scripts/parcours-premier-utilisateur.mjs [--telephone]` |

**Sauvegardes prises pendant cette session** — `backend/sauvegardes/` :

- `postgres-2026-09-23T20-26-13` — 50 tables, **802 lignes** (développement)
- `ignitux_prod-2026-09-23T20-25-54` — 47 tables, **36 lignes**, 3 tables
  réellement absentes

Le drapeau `--avec-ia` reste **éteint par défaut**, et sans lui les lignes
concernées comptent comme *non prouvées*, jamais comme des succès. Ne pas
dépenser est un choix défendable ; se dire vérifié sans avoir vérifié ne l'est
pas.

---

## 4. État réel du projet

### 4.1 Ce qui existe

| | |
|---|---:|
| Modules backend | 26 |
| Contrôleurs HTTP | 20 |
| Routes HTTP | 165 |
| Tables en base | 50 |
| Index | 144 |
| Pages frontend | 24 |
| Tests | 1 636 |

### 4.2 Les trois bases

| Base | État | Données |
|---|---|---|
| `postgres` (développement) | **à jour** | 82 comptes, 63 projets, 802 lignes |
| `ignitux_test` (bout en bout) | **à jour** | recréée à chaque exécution |
| `ignitux_prod` | **à jour** | 50/50 tables, aucune colonne manquante ; 12 lignes de conformité, 24 articles de Constitution, 0 compte, 0 projet |

`ignitux_prod` a été migrée. Le verdict préalable était **ADDITIF** — aucune
destruction en jeu — et la vérification d'après le confirme : « la base est à
jour, rien à migrer », avec les 12 lignes de conformité intactes.

Deux colonnes étaient signalées **À EXAMINER** avant la migration
(`compliance_requirements.sectors` et `.verified_on`, sur une table portant 12
lignes). C'était un signalement, pas un danger : ajouter une colonne à une
table peuplée donne `NULL` aux lignes existantes, sans rien perdre. Reste une
conséquence de contenu, mineure et à rattraper le jour où prod sera peuplée :
ces 12 démarches y ont `sectors` vide, donc toutes traitées comme « toute
activité », là où 2 sur 12 portent un secteur précis en développement.

### 4.3 Ce qui coûte

Mesuré sur les appels réels de cette session, pas estimé :

| | |
|---|---:|
| Appels IA ce mois-ci | 21 |
| Coût total | **1,24 €** |
| Coût moyen par appel | **0,059 €** |
| Coût d'une analyse (`analyser`) | **0,046 €** |
| Plafond mensuel fixé | 50 € |

### 4.4 Ce qui répond, et en combien de temps

Serveur local, base Supabase à Dublin, connexion domestique. La latence est
dominée par l'aller-retour vers la base, pas par le calcul.

| Route | Médiane | Max |
|---|---:|---:|
| `GET /health` | 206 ms | 368 ms |
| `GET /projects` | 298 ms | 380 ms |
| `GET /projects/:id/parcours` | 290 ms | 1 421 ms |
| `GET /projects/:id/scores` | 212 ms | 228 ms |
| `GET /login` (page web) | 5 ms | 11 ms |

Héberger le serveur dans la même région que la base ferait tomber l'essentiel
de ces chiffres. C'est un choix d'hébergement, pas un travail de code.

---

## 5. Niveau de préparation à la bêta

> **Le produit est prêt. L'infrastructure n'existe pas.**

### Ce qui est prêt

- Les 165 routes répondent, éprouvées contre une vraie base.
- Le modèle économique tient : Découverte s'arrête à 3 analyses, nomme l'offre
  qui rouvre, et dit que le compteur repart le mois prochain. Aucune offre
  payante ne peut être prise tant que rien n'encaisse.
- IGINI dit la vérité, y compris quand elle déplaît (Kevin : 2/10).
- Aucune donnée ne fuit entre comptes — vérifié sur 58 méthodes portant un
  couple (utilisateur, projet), et par le profil malveillant de la simulation.
- La production refuse de démarrer si `DATABASE_URL`, `FRONTEND_URL`,
  `JWT_SECRET`, `MAIL_TRANSPORT`, `SMTP_PORT` ou `TRUST_PROXY` sont mal posées.
  Ce contrôle couvre notamment le piège du limiteur de débit derrière un
  reverse proxy, qui mettrait tous les comptes dans le même seau.
- Aucun secret n'est dans le code source : tout passe par l'environnement, et
  les fichiers `.env*` sont hors dépôt.
- **La base n'est plus exposée** : les rôles `anon` et `authenticated` n'ont
  plus aucun droit, sur aucune des trois bases, et les privilèges par défaut
  ne leur en rouvriront pas (§ 6.1).
- **`ignitux_prod` est à jour** : 50 tables sur 50, aucune colonne manquante
  (§ 6.2).

### Ce qui manque, et qui ne dépend pas de moi

| Manque | Conséquence |
|---|---|
| **Un hébergeur** | le produit tourne sur un ordinateur portable ; il s'arrête quand il se ferme |
| **Un domaine** | pas d'adresse https, donc pas de lien à envoyer |
| **Un fournisseur d'email** | `MAIL_TRANSPORT=log` : les mots de passe oubliés s'écrivent dans un journal au lieu de partir — **contournable à la main**, voir ci-dessous |
| **Un fournisseur de paiement** | aucune offre payante ne peut être encaissée — sans SIRET, aucun fournisseur n'ouvre de compte |

L'absence de paiement **n'est pas un blocage pour une bêta privée** : une bêta
privée n'a rien à vendre. C'est un blocage pour ouvrir les offres.

### L'email non plus, pour trente personnes

Le mécanisme de réinitialisation est intact — jeton de 64 caractères, valable
une heure, à usage unique, refusé s'il est rejoué. **Seul le facteur manque.**

Une commande le remplace :

```
node backend/scripts/lien-mot-de-passe.mjs quelquun@exemple.fr
```

Elle appelle le code que l'API emploie elle-même — même durée, même forme
d'adresse, même usage unique — et affiche le lien au lieu de l'envoyer. On le
transmet par le moyen dont on dispose.

Ce n'est pas une solution à l'échelle : à mille personnes, c'est intenable. À
trente, c'est ce qui évite qu'un bêta-testeur reste enfermé dehors en attendant
qu'un fournisseur d'email soit branché. **L'email cesse donc de bloquer la bêta
privée ; il reste bloquant pour une ouverture publique.**

### La réserve technique qui reste

La surface REST de Supabase **a été fermée** (§ 6). Il reste un seul point, et
ce n'est pas un défaut de code :

- **Le plafond de coût par personne est à 2 €/mois**, ce qui suffit à
   Découverte (0,14 €) et à Entrepreneur (≈ 1,77 € pour 30 appels), mais
   **pas à Construction** : 150 appels à 0,059 € font 8,85 €, donc un abonné
  à 59 € serait coupé vers la 34ᵉ analyse sur 150 promises. C'est un
  arbitrage de marge qui t'appartient, et il n'a aucun effet tant qu'aucune
  offre payante n'est vendable.

---

## 6. Les deux actions de base, passées et vérifiées

Toutes deux avaient été refusées à l'exécution par la garde qui protège les
bases partagées et la production. Le porteur les a passées lui-même, à la main,
le soir du 23 septembre. Ce qui suit est l'état constaté après.

### 6.1 La surface REST est fermée

Ce qui était constaté avant :

- les rôles `anon` et `authenticated` avaient **SELECT, INSERT, UPDATE, DELETE
  et TRUNCATE sur les 50 tables** du schéma public de la base `postgres` ;
- la sécurité par ligne n'était active que sur `users`, donc **49 tables
  lisibles telles quelles** ;
- l'API REST de l'hébergeur répondait sur `/rest/v1/users` : elle réclamait une
  clé `apikey`, et rien d'autre.

Or cette clé est, dans le modèle Supabase, une clé **publique** : elle est
faite pour être posée dans du code de navigateur, et c'est la RLS qui protège
les données derrière. Ignitux n'utilise ni l'une ni l'autre — aucun paquet
`@supabase`, aucune clé dans le dépôt, tout passe par Prisma. C'était une
porte, sans serrure, devant une pièce où personne n'a affaire.

**Après `fermer-surface-rest.mjs --appliquer` :**

| Base | Droits `anon`/`authenticated` | Privilèges par défaut ouverts |
|---|---|---|
| `postgres` (dev) | **aucun** | `supabase_admin` seulement — voir ci-dessous |
| `ignitux_test` | **aucun** | aucun |
| `ignitux_prod` | **aucun** | aucun |

Deux enseignements que seule l'exécution a donnés :

1. **L'exposition ne concernait que la base `postgres`.** `ignitux_test` et
   `ignitux_prod` ont répondu « rien à faire » : Supabase ne pose ses droits
   `anon` que sur la base qu'il provisionne lui-même, et les bases créées
   ensuite n'en héritent pas. La faille portait donc exactement sur celle qui
   contenait les 85 comptes — et elle est fermée.
2. **Les trois `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` sont
   refusés** par l'hébergeur (`permission denied to change default
   privileges`), parce que `postgres` n'est pas membre de ce rôle. Sans effet
   ici : ils ne gouvernent que les tables créées *par* `supabase_admin` dans
   le schéma public, et Prisma crée sous `postgres`, dont les privilèges par
   défaut ont bien été vidés.

Le second point a été **prouvé** juste après : la migration d'`ignitux_prod` a
créé trois tables neuves, et aucune n'a reçu de droit `anon`. Le piège qui
aurait rouvert le trou au prochain `db push` est bien désamorcé.

**Et le produit n'a rien perdu** : les 41 vérifications réelles ont été
relancées après la fermeture — 41 sur 41, dont l'analyse IGINI et les quatre
écrans du navigateur.

### 6.2 `ignitux_prod` est migrée

Sauvegarde prise avant (`ignitux_prod-2026-09-23T20-25-54`, 36 lignes).
Verdict préalable de `verifier-base.mjs` : **ADDITIF**.

```
node scripts/migrer-prod.mjs --appliquer
→ Your database is now in sync with your Prisma schema. Done in 5.01s

node scripts/verifier-base.mjs .env.production
→ Tables : 50 présentes / 50 attendues · Colonnes : aucune manquante
→ VERDICT : la base est à jour. Rien à migrer.
```

Les 12 lignes de `compliance_requirements` sont intactes. Les deux colonnes
signalées **À EXAMINER** avant la migration étaient un avertissement, pas un
danger : ajouter une colonne à une table peuplée donne `NULL` aux lignes
existantes, sans rien perdre.

---

## 7. Combien de personnes la plateforme peut-elle accueillir aujourd'hui

Deux réponses, parce que la question a deux sens.

### 7.1 Aujourd'hui, réellement : **zéro en public, dix en local**

Il n'y a ni hébergeur, ni domaine. Le produit tourne sur un ordinateur
portable, joignable sur le réseau local. Les dix profils de la simulation y
passent sans un seul constat. Ce n'est pas une limite technique : c'est
l'absence d'une machine qui reste allumée.

### 7.2 Une fois hébergé : **la contrainte qui mord en premier est le budget IA**

Chaque contrainte, chiffrée depuis des mesures réelles :

| Contrainte | Plafond | Combien de personnes |
|---|---|---:|
| **Budget IA — 50 €/mois** | 0,046 € par analyse, 3 analyses incluses en Découverte, soit 0,14 €/personne/mois à consommation pleine | **≈ 360** |
| Connexions Postgres | 60 au total, 14 déjà prises par l'hébergeur ; un serveur Node n'en ouvre qu'une poignée | plusieurs milliers |
| Taille de la base | 15 Mo pour 82 comptes et 63 projets, soit ≈ 180 ko par personne ; 500 Mo au palier gratuit | ≈ 2 700 |
| Débit du serveur | ≈ 300 ms par lecture, presque entièrement en attente réseau ; Node traite ces attentes en parallèle | plusieurs centaines en simultané |
| Limiteur de débit | 20 requêtes / 60 s **par adresse IP** | ne plafonne pas le nombre de personnes, mais le rythme de chacune |

**Le chiffre à retenir : environ 360 personnes en offre gratuite**, et c'est le
budget IA qui l'impose — pas le code, pas la base, pas le serveur. En pratique
toutes ne consommeront pas leurs trois analyses, donc le nombre réel serait
plus élevé ; mais c'est le plafond qu'il faut prévoir, parce que c'est celui
qui se paie.

Trois remarques qui comptent autant que le chiffre :

- **Le limiteur de débit ne plafonne pas le nombre d'utilisateurs**, à une
  condition : que `TRUST_PROXY` soit posée correctement derrière le reverse
  proxy de l'hébergeur. Sinon le serveur voit l'adresse du proxy pour tout le
  monde et les 20 requêtes/minute deviennent un plafond **global**. Le contrôle
  au démarrage refuse déjà de lancer la production sans cette variable.
- **Pour une bêta privée, viser dix à trente personnes** est le bon ordre de
  grandeur : très en dessous de toutes les limites, assez pour que les retours
  soient variés, et assez peu pour répondre à chacun.
- **Ces chiffres valent pour l'offre gratuite.** Un abonné Entrepreneur coûte
  ≈ 1,77 €/mois en IA pour 9,90 € encaissés ; le plafond de 50 € serait alors
  une décision à revoir, pas une limite subie.

---

## 8. Ce qui reste ouvert, honnêtement

**Fermé depuis la rédaction :** `ignitux_prod` est migrée et la surface REST
est close (§ 6). Les deux seules lignes techniques de cette liste ont disparu.

Ce qui reste :

- **Le plafond de coût par personne (2 €/mois) ne couvre pas l'offre
  Construction** : 150 appels à 0,059 € font 8,85 €. Arbitrage de marge, pas
  défaut de code, et sans effet tant qu'aucune offre payante n'est vendable.
- **Sur la base `postgres`, trois privilèges par défaut restent posés par
  `supabase_admin`** et l'hébergeur refuse qu'on les retire. Ils ne
  gouvernent que les tables créées par ce rôle ; Prisma crée sous `postgres`,
  et la migration de prod l'a vérifié en pratique — trois tables neuves, zéro
  droit `anon`. À reregarder si Supabase change ce fonctionnement.
- **Il n'y a ni hébergeur, ni domaine, ni fournisseur d'email, ni fournisseur
  de paiement.** C'est désormais le seul obstacle entre Ignitux et une bêta
  privée.
- Le trajet depuis un vrai appel Anthropic **est** éprouvé (§ 1.2, § 1.3) ;
  c'était le dernier maillon non couvert du parcours. La remarque qui le
  signalait en tête de `test/couts-ia.e2e-spec.ts` reste exacte pour la suite
  e2e elle-même, qui garde les générateurs éteints.
- Rien n'a été déployé. Rien ne sera déployé sans que tu le demandes.

---

**Suite :** la session du 24 septembre a repris le produit par l'expérience
plutôt que par les routes, et y a trouvé quatre défauts qu'aucune de ces
vérifications ne pouvait voir — dont un mot de passe en clair dans le
navigateur. Voir [`session-autonome-2026-09-24.md`](session-autonome-2026-09-24.md).
