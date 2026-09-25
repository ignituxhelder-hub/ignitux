# Audit d'ouverture — ce qui manque vraiment pour de vrais utilisateurs

25 septembre 2026. Commandé en cinq étapes, avec une consigne que ce document
prend au sérieux : **ne rien supposer, vérifier le code.**

C'est pourquoi il commence en corrigeant les chiffres de la commande elle-même.

---

## Préambule — les chiffres, mesurés

| | Annoncé | Mesuré aujourd'hui |
|---|---:|---:|
| Modèles Prisma | 47 | **50** |
| Tests backend | 765 | **1 069** unitaires + **264** bout en bout |
| Tests frontend | 272 | **373** |
| Écrans | — | 24 |
| Routes HTTP | — | 165 |

L'écart n'est pas anodin : il dit que le projet est **plus avancé** que la
mémoire qu'on en a. C'est une bonne nouvelle et un piège — on refait parfois ce
qui existe déjà.

Tout ce qui suit a été lu dans le code ou exécuté. Quand je n'ai pas pu
vérifier, je l'écris.

---

## ÉTAPE 1 — Audit des bloquants

### A. Bloquant absolu pour une bêta privée

**A1. Aucun hébergement.**
*Impact* : le produit n'existe pas en dehors de ce portable. C'est le seul
élément de tout ce document qui empêche littéralement quelqu'un d'ouvrir
Ignitux. *Risque* : nul, techniquement — les deux images Docker se construisent
en CI et l'image du serveur démarre pour de vrai (test de fumée). *Effort* : une
demi-journée. *Priorité* : 1.

**A2. `FRONTEND_URL` doit être en `https`.**
*Impact* : le préflight de production **refuse de démarrer** sans. Ce n'est pas
une pédanterie : un jeton de session en clair s'intercepte sur n'importe quel
réseau partagé. *Risque* : aucun, c'est un refus volontaire. *Effort* : inclus
dans A1 (domaine + certificat). *Priorité* : 1.

**Et c'est tout.** L'email n'en fait pas partie, et c'est vérifié : `grep` sur
tout le backend montre que `email_verified_at` n'est **lu par aucune garde**. Un
compte non vérifié a le produit entier. La bêta privée peut donc s'ouvrir avec
`MAIL_TRANSPORT="log"` et `backend/scripts/lien-mot-de-passe.mjs` pour les
oublis de mot de passe.

### B. Important, mais non bloquant

**B1. Collecteur d'erreurs.** Les `Logger.error` existent, écrits avec soin,
avec une référence pour chaque erreur. Personne ne les lit. *Risque* : le
premier bogue en production se découvrira par un message d'un utilisateur, pas
par une alerte. *Effort* : 2 h. *Priorité* : 2 — à poser **le jour** de la mise
en ligne, pas après.

**B2. Fournisseur d'email.** Le chemin SMTP est éprouvé de bout en bout sans
fournisseur (`scripts/courrier-reel.mjs`, 11/11, dans la CI) : il ne reste
qu'un compte et un mot de passe. *Risque* : tenable à 30 personnes avec la
commande de secours ; intenable au-delà. *Effort* : 2 h de branchement, une
demi-journée avec SPF/DKIM/DMARC. *Priorité* : 2.

**B3. Aucune sauvegarde planifiée.** `sauvegarde.mjs` existe et
`verifier-sauvegarde.mjs` prouve qu'une sauvegarde est restaurable (2 206
références suivies, aucune perdue). **Rien ne les lance.** *Risque* : une
sauvegarde qu'on doit penser à faire n'existe pas le jour où on en a besoin.
*Effort* : 1 h une fois l'hébergement en place. *Priorité* : 2.

**B4. La suite de tests n'est pas déterministe.** Une exécution a rendu
« 2 échecs / 1 067 » ; la suivante, sans rien changer, « 1 069 / 1 069 ».
*Impact* : une suite qui ne se reproduit pas cesse d'être une preuve — et on
prend l'habitude de relancer au lieu de regarder. *Risque* : le jour où deux
échecs sont réels, ils passeront pour du bruit. *Effort* : une demi-journée
d'instrumentation. *Priorité* : 2. **C'est le point le plus sous-estimé de
cette liste.**

**B5. Personne ne prouve son adresse.** Aucune route n'exige la vérification.
En bêta privée entre gens qu'on connaît, c'est le bon réglage. À l'ouverture
publique, c'est une porte : on s'inscrit avec l'adresse de quelqu'un d'autre.
*Effort* : 2 h (la vérification existe, il suffit de l'exiger). *Priorité* : 3,
mais **bloquante pour la phase 3**.

**B6. L'investisseur ne peut rien faire.** Détaillé à l'étape 2. *Priorité* : 2
si la bêta comprend des investisseurs, 4 sinon.

### C. Peut attendre après le lancement

`localStorage` → IndexedDB (plafond de 60 entrées, déclencheur écrit) ·
`pg_trgm`/`unaccent` (au premier ralentissement de recherche) · `pg_cron` ·
`vector` (au-delà de ~100 souvenirs par projet) · stockage objet (première pièce
jointe) · les « Gardiens » de l'article 17 (décision de gouvernance, pas du
code) · pagination du module investisseurs (voir étape 4 : déclenchée par le
succès, pas par le temps).

---

## ÉTAPE 2 — Expérience utilisateur

### Cas 1 — Entrepreneur : **le parcours tient**

Mesuré, pas supposé : `scripts/parcours-premier-utilisateur.mjs` suit douze
étapes en ne cliquant **que ce qui est visible** — aucun appel d'API, aucune
URL tapée. Verdict actuel : **0 critique, 0 majeur, 0 moyen**.

Inscription → rôle → premier projet → ouverture du projet → prochaine étape
nommée → ajout d'une tâche → retour aux projets → offres. Tout passe.

L'analyse IGINI fonctionne avec de vrais appels Claude (0,046 € l'unité), et
dit la vérité quand le projet ne tient pas : le profil de test « entreprise
spatiale avec 500 € et aucune formation » reçoit **2/10 et cinq risques**.

**Ce qui reste confus** : rien que les harnais détectent encore. Les trois
derniers constats sont des liens de navigation dans une phrase, laissés
volontairement.

### Cas 2 — Investisseur : **le parcours n'existe pas**

C'est la trouvaille principale de cet audit, et elle est structurelle.

| Étape demandée | État réel |
|---|---|
| Inscription | ✅ identique à l'entrepreneur |
| Activation du rôle investisseur | ✅ écran `/roles`, puis `/investisseur` |
| **Découverte des projets** | ❌ **aucune route, aucun écran** |
| **Investissement** | ❌ **impossible depuis le produit** |
| Suivi des participations | ✅ `/investisseur` |
| Remboursements | ⚠️ visibles, jamais reçus |
| Dividendes | ⚠️ visibles, jamais reçus |

Le module est un **registre**, pas une place d'investissement. Toutes les
écritures sont réservées au **porteur du projet** :
`POST /projets-finances/:id/participations` s'appuie sur
`requireOwnedFinancedProject(ownerId, …)` — c'est l'entrepreneur qui
*enregistre* qui a investi, après un accord conclu ailleurs. L'investisseur est
un **lecteur de son propre registre**.

**Est-ce un défaut ?** Non, si c'est assumé : proposer d'investir en ligne est
une activité réglementée (statut CIF ou PSFP en France), et `docs/outillage.md`
range Mangopay/Lemonway sous « après la réponse juridique ». Le code est donc
prudent, et il a raison de l'être.

**Mais le produit ne le dit nulle part.** Un investisseur qui arrive sur
`/investisseur`, voit « Mon portefeuille » vide et aucune liste de projets,
conclut que le produit est cassé. **C'est le premier risque d'abandon du
parcours investisseur, et il se règle avec une phrase, pas avec un module.**

**Écrans manquants, par ordre d'utilité :**

1. **Une phrase sur `/investisseur` vide** qui dit comment un investissement
   entre dans le registre (« c'est le porteur du projet qui l'enregistre »).
   *Effort : 1 h.* C'est le meilleur rapport valeur/effort de tout ce document.
2. **`/investisseur/projets/[id]`** — le détail d'un projet financé.
   `GET /investisseurs/moi/projets/:financedProjectId` **existe déjà** et
   n'est servi par aucun écran. *Effort : une demi-journée.*
3. Un accusé lisible quand un remboursement ou un dividende est enregistré.
   *Effort : une demi-journée.*

### Cas 3 — Hybride : **la règle existe, la preuve manque**

La séparation est tenue par une règle **bloquante** du moteur
constitutionnel, `roles-separes` (article 13), appelée depuis
`roles.service.ts` : une vue servie sous un rôle ne peut contenir que les
domaines de ce rôle, et le catalogue garantit que deux rôles n'en partagent
aucun.

Vérifié aussi côté données : « investir n'ouvre pas le projet — ni lecture, ni
description » est un contrôle de `validation-reelle.mjs`, vert.

**Ce qui manque est la preuve du cas hybride lui-même** : aucun test de bout en
bout ne fait tenir les deux rôles à **la même personne** en même temps pour
vérifier que son portefeuille n'additionne pas ses propres projets. La règle
dit que ça ne peut pas arriver ; rien ne le constate. *Effort : 2 h.*
*Priorité : 2* — c'est bon marché, et c'est exactement le genre de chose dont
on veut la preuve avant d'ouvrir.

---

## ÉTAPE 3 — Données à l'inscription

**La stratégie progressive demandée existe déjà**, et elle est mieux faite que
ce que la question suppose.

L'inscription demande **deux choses** : une adresse et un mot de passe.
`POST /users/signup` ne prend rien d'autre — vérifié.

Le reste vit dans `backend/src/profile/profile-fields.ts`, où **chaque champ
porte son moment** :

| Niveau | Moment déclaré | Champs |
|---|---|---|
| 1 — Inscription | *(rien)* | email, mot de passe |
| 2 — Complément profil | `accueil` | `display_name`, `investor_kind` |
| 3 — Données métier | `premier-projet` | `activity_country`, `sectors`, `experience`, `availability` |
| 4 — Données avancées | `au-besoin` | `has_founded_before`, `motivation`, `skills`, `investment_horizon`, `risk_level`, `preferred_sectors` |

Chaque champ porte aussi une **question rédigée** (« Comment veux-tu qu'on
t'appelle ? ») plutôt qu'une étiquette, et `GET /profil/a-demander/:moment`
rend la liste du moment — un moment inconnu rend une liste vide plutôt qu'une
erreur.

Le principe « demander uniquement ce qui est nécessaire au moment où cela
devient utile » est donc **déjà implémenté**, pas à construire.

**Les deux seules choses que je changerais :**

1. **`display_name` mérite de monter au niveau 1.** Il est au moment `accueil`,
   donc facultatif — et depuis hier, un projet rendu public affiche « Porteur
   sans nom affiché » quand il manque. Le demander à l'inscription coûte un
   champ et évite une reconnaissance perdue (article 21).
2. **Rien d'autre.** La tentation à ce stade est d'ajouter des champs « utiles
   plus tard ». Chacun coûte un abandon à l'inscription et ne sert que si
   quelqu'un les lit. Aucun des champs existants n'est inutile ; aucun
   manquant ne m'a paru nécessaire.

---

## ÉTAPE 4 — Le module investisseurs, à 10 000 investisseurs

### Ce qui tient sans discussion

**L'argent.** Tout en centimes entiers, aucun flottant nulle part. Les totaux
sont **dérivés des lignes**, jamais stockés — le commentaire du code le dit :
« un total qui se calcule deux fois finit par donner deux réponses ». C'est le
bon choix comptable, et il tient à n'importe quelle échelle.

**La séparation.** Quatre règles bloquantes sur l'article 22 :
`caisses-separees`, `rapprochement-dans-la-meme-caisse`,
`investissements-non-melanges`, `majorite-du-porteur`. Un investisseur traverse
les projets ; son argent, jamais.

**Les index.** Correctement posés sur tous les chemins d'accès réels :
`participations(investor_id, financed_project_id)`,
`investor_movements(financed_project_id, occurred_on)` et
`(investor_id, occurred_on)`. Rien à ajouter.

**L'irréversible.** Rien ne s'efface : une correction est un mouvement qui en
corrige un autre (`corrects_movement_id`). Un investisseur qui part est
détaché, pas supprimé. Le registre d'un projet survit au projet.

### Ce qui casse à 10 000 — et c'est précis

**Aucune pagination dans tout le module.** `grep` sur `take:`, `skip:`,
`cursor:` dans `investors.service.ts` : **zéro**. Deux lectures en souffrent,
et pas également :

**`projectRegister(...)` est le mur.** Elle charge *toutes* les participations
d'un projet avec `include: { investor: true }`, *plus* tous ses mouvements. Un
projet à 10 000 investisseurs, c'est 10 000 participations + 10 000 lignes
d'investisseur + l'historique complet, dans une seule réponse. C'est l'écran du
**porteur**, celui qu'il ouvrira le plus souvent.

**`portfolio(investorId)` est le plafond.** Elle charge tous les mouvements de
l'investisseur pour en dériver les totaux, à chaque affichage. Correct, et
linéaire pour toujours : à 600 mouvements par an, un investisseur de dix ans
recharge 6 000 lignes pour voir trois chiffres.

**Le remède n'est pas de stocker les totaux** — ce serait défaire la seule
décision comptable qui compte. C'est :
- agréger **en base** (`groupBy`/`aggregate`) pour les chiffres ;
- **paginer** les lignes, avec un curseur sur `(occurred_on, created_at)`, qui
  est déjà l'ordre de tri et déjà indexé.

*Effort : deux jours. Priorité : déclenchée par le succès, pas par le
calendrier.* En dessous de ~200 investisseurs par projet, il n'y a rien à
faire.

### Ce qui manque pour qu'un investisseur suive son argent

| Besoin | État |
|---|---|
| Comprendre son portefeuille | ✅ `/investisseur` : global + par projet, net négatif après investissement |
| Comprendre chaque projet | ⚠️ **API oui, écran non** |
| Suivre son argent | ✅ historique complet, corrections tracées |
| Recevoir ses remboursements | ❌ enregistrés, jamais versés |
| Recevoir ses dividendes | ❌ idem — répartition au centime exact (méthode du plus fort reste), mais aucun versement |

Les deux derniers ne sont pas des manques de code : ils demandent un
prestataire de paiement, lui-même suspendu à une réponse juridique.

---

## ÉTAPE 5 — Plan de lancement

### Phase 0 — Préparation *(1 à 2 jours)*

**Objectif** : qu'Ignitux existe à une adresse.
**Prérequis** : hébergement, domaine, certificat.
**Fait dans la foulée** : collecteur d'erreurs, sauvegarde planifiée,
fournisseur d'email.
**Risque** : aucun risque technique. Le seul risque est de partir sans le
collecteur d'erreurs et de déboguer à l'aveugle.
**Sortie** : `verifier-production.mjs` rend 0 bloquant.

### Phase 1 — Bêta privée *(3 à 6 semaines)*

**Objectif** : que 10 à 30 personnes utilisent le produit et disent où ça
coince. **Entrepreneurs uniquement** — voir étape 2.
**Prérequis** : phase 0, plus la phrase d'explication sur l'écran investisseur
(pour ceux qui y passeront quand même) et le test hybride.
**Risque principal** : un défaut d'expérience que ni les harnais ni moi n'avons
vu, parce qu'ils mesurent ce qu'ils savent mesurer.
**Sortie** : dix personnes ont créé un projet et lancé une analyse ; aucune
n'est restée bloquée sans recours.

### Phase 2 — Premiers clients payants *(4 à 8 semaines après la phase 1)*

**Objectif** : encaisser.
**Prérequis** : un SIRET, puis Stripe pour l'abonnement seul. Le code est
prêt : les offres payantes sont **refusées sans référence d'encaissement**, et
ce refus est volontaire — il ne reste qu'à brancher qui confirme le paiement.
**Risque — et c'est un bloquant de phase, pas un arbitrage** : l'offre
Construction vend **150 analyses** pour 59 € (`offres-catalogue.ts`,
`appelsIaParMois: 150`), tandis que le plafond de coût par utilisateur vaut
**2 €/mois** (`DEFAULT_COST_MICRO_EUR_PER_MONTH`). À 0,059 € l'appel en
moyenne, le garde-fou coupe vers la **34ᵉ analyse** — soit moins du quart de ce
qui a été payé.

Ce n'est pas une question de marge : c'est le produit qui refuse ce qu'il a
vendu, et la personne qui l'apprend est celle qui vient de payer. Il faut
choisir avant le premier abonnement : relever le plafond pour les offres
payantes, baisser le nombre d'analyses promises, ou monter le prix. Aujourd'hui
les deux chiffres se contredisent, et rien dans le code ne les rapproche.
**Sortie** : un abonnement encaissé, une facture émise conforme.

### Phase 3 — Lancement public *(3 à 6 mois après la phase 2)*

**Objectif** : ouvrir.
**Prérequis** : exiger la vérification d'adresse (B5) ; un budget IA qui n'est
plus le plafond (aujourd'hui **~360 utilisateurs gratuits par mois** à
0,14 €/utilisateur pour 50 €) ; la pagination du module investisseurs si des
projets dépassent quelques centaines d'investisseurs.
**Risque** : le budget IA est la vraie limite de capacité — ni la base, ni les
connexions, ni le débit, tous un ordre de grandeur au-dessus.
**Sortie** : la croissance ne dépend plus d'un plafond de dépense.

---

## Les réponses demandées

### 1. Le pourcentage réel de préparation

**Produit : 95 %.** Éprouvé par 1 706 tests, sept harnais qui manipulent un
vrai navigateur et une vraie base, et 70 contrôles réels sans échec.

**Ouverture à de vrais utilisateurs : 70 %.** Les 30 % manquants ne sont
presque pas du code — ce sont quatre comptes chez des tiers et une adresse en
`https`.

**Parcours investisseur : 40 %.** Le registre est excellent ; le chemin par
lequel un investisseur arrive n'existe pas.

Un chiffre unique serait malhonnête, parce que ces trois-là ne se moyennent
pas : on peut ouvrir une bêta d'entrepreneurs à 95 % de produit et 0 % de
parcours investisseur.

### 2. Les dix prochaines actions, par ordre

1. Prendre un hébergement et un domaine *(A1, A2 — c'est le seul vrai verrou)*
2. Brancher un collecteur d'erreurs **avant** le premier utilisateur
3. Brancher le fournisseur d'email *(2 h : le chemin est déjà éprouvé)*
4. Planifier la sauvegarde, et vérifier la rétention chez l'hébergeur
5. Écrire la phrase qui explique l'écran investisseur vide *(1 h)*
6. Écrire le test de bout en bout du cas hybride *(2 h)*
7. Rendre la suite de tests déterministe *(B4)*
8. Construire `/investisseur/projets/[id]` *(l'API existe déjà)*
9. **Résoudre la contradiction Construction** : 150 analyses vendues, ~34
   permises par le plafond de coût. Bloquant pour la phase 2.
10. Exiger la vérification d'adresse — **avant** la phase 3, pas avant la bêta

Les six premières font **moins de deux jours** cumulés.

### 3. Date la plus optimiste

**Bêta privée : 29 septembre 2026.** Suppose un hébergeur pris aujourd'hui, un
domaine qui propage vite, et les actions 1 à 5 enchaînées sans obstacle.

### 4. Date réaliste

**Bêta privée : 13 octobre 2026.** Laisse la place aux frictions
d'hébergement, à un refus de Microsoft sur l'authentification SMTP, et aux
deux ou trois défauts que dix vrais utilisateurs trouveront en une semaine.

**Premiers clients payants : fin novembre 2026**, conditionné au SIRET.

### 5. Date prudente

**Bêta privée : 3 novembre 2026.** Suppose que le SMTP Outlook soit refusé et
qu'il faille un vrai fournisseur et un domaine propre (SPF, DKIM, DMARC), que
la suite de tests réserve une surprise, et que les dix premiers utilisateurs
trouvent un défaut structurel plutôt que cosmétique.

**Lancement public : deuxième trimestre 2027**, dominé par le budget IA et par
le statut réglementaire du volet investissement — deux choses qui ne
s'accélèrent pas en écrivant du code.

---

## Ce que cet audit n'a pas pu vérifier

- **Qu'Ignitux démarre chez un hébergeur.** L'image démarre en CI contre une
  base jetable ; ce n'est pas la même chose qu'un vrai hébergeur.
- **Qu'un courrier arrive.** Le chemin SMTP est prouvé contre une boîte aux
  lettres locale. Qu'un message atteigne une vraie boîte sans finir en
  indésirable dépend de SPF/DKIM/DMARC sur un domaine réel.
- **Que le compte Outlook accepte l'authentification par mot de passe.** Le
  serveur l'annonce (`AUTH LOGIN XOAUTH2` après STARTTLS, vérifié) ; que
  Microsoft l'autorise pour *ce* compte ne se saura qu'avec un identifiant.
- **Le comportement à 10 000 investisseurs.** Les conclusions de l'étape 4
  viennent de la lecture des requêtes, pas d'une mesure sous charge.
