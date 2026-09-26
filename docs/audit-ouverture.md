# Audit d'ouverture — ce qui manque vraiment pour de vrais utilisateurs

25 septembre 2026. Commandé en cinq étapes, avec une consigne que ce document
prend au sérieux : **ne rien supposer, vérifier le code.**

C'est pourquoi il commence en corrigeant les chiffres de la commande elle-même,
et pourquoi chaque affirmation porte la marque de ce qui l'établit.

## Comment lire ce document

Chaque fait porte l'une de ces trois marques :

| Marque | Sens |
|---|---|
| **[mesuré]** | exécuté aujourd'hui, 25 septembre 2026 |
| **[lu]** | lu dans le code aujourd'hui, sans l'exécuter |
| **[consigné]** | mesuré lors d'une session antérieure et écrit dans `docs/` |

Ce qui ne porte aucune marque est un **jugement** : une estimation d'effort,
une priorité, une date. Ils sont discutables, et c'est voulu.

### Sommaire

1. [Les chiffres, corrigés](#préambule--les-chiffres-corrigés)
2. [Étape 1 — Audit des bloquants](#étape-1--audit-des-bloquants)
3. [Étape 2 — Expérience utilisateur](#étape-2--expérience-utilisateur)
4. [Étape 3 — Données à l'inscription](#étape-3--données-à-linscription)
5. [Étape 4 — Investisseurs à 10 000](#étape-4--le-module-investisseurs-à-10 000-investisseurs)
6. [Étape 5 — Plan de lancement](#étape-5--plan-de-lancement)
7. [Les réponses demandées](#les-réponses-demandées)
8. [Ce que cet audit n'a pas pu vérifier](#ce-que-cet-audit-na-pas-pu-vérifier)

---

## En une page

**Un seul bloquant absolu** pour une bêta privée : l'hébergement, et le `https`
qui vient avec — comparaison chiffrée dans [`hebergement.md`](hebergement.md). L'email n'en est pas un — **[lu]** aucune garde ne lit
`email_verified_at`, un compte non vérifié a le produit entier.

**Le parcours entrepreneur tient.** **[mesuré]** douze étapes, aucun constat.

**L'investisseur ne peut pas investir**, et c'est structurel : le registre est
tenu par le porteur. Le code a raison d'être prudent — c'est réglementé — et il
l'explique déjà à l'écran. Ce qui manque est **le chemin d'entrée**, pas le
suivi : une fois inscrit au registre, un investisseur voit tout, jusqu'au
dernier mouvement.

> **Deux corrections de cet audit, les 25 et 26 septembre.** J'ai d'abord écrit
> que le produit n'expliquait nulle part comment un investissement entre au
> registre, puis que l'écran par projet manquait. **Les deux étaient faux.**
> Le module investisseur est plus complet qu'il n'en a l'air depuis l'extérieur,
> et c'est précisément le piège que le préambule annonçait : on refait ce qui
> existe déjà.

~~**Une contradiction chiffrée bloque la phase payante.**~~ **Résolue le
26 septembre** : Construction vendait 150 analyses quand le plafond de 2 €/mois
n'en permettait que 39. La promesse est passée à 35, et un test lie désormais
les deux chiffres.

**À 10 000 investisseurs**, la première chose qui casse est l'écran du porteur,
pas celui de l'investisseur.

---

## Préambule — les chiffres, corrigés

**[mesuré]** aujourd'hui, par comptage direct. Les totaux incluent les sept
tests écrits pendant cet audit même — six pour le cas hybride, un pour l'état
vide du portefeuille :

| | Annoncé dans la commande | Réel |
|---|---:|---:|
| Modèles Prisma | 47 | **50** |
| Tests backend | 765 | **1 069** unitaires + **270** bout en bout |
| Tests frontend | 272 | **374** |
| **Total des tests** | — | **1 713** |
| Écrans (`page.tsx`) | — | 24 |
| Routes HTTP | — | 165 |

L'écart n'est pas anodin : il dit que le projet est **plus avancé** que la
mémoire qu'on en a. C'est une bonne nouvelle et un piège — on refait parfois ce
qui existe déjà.

### L'état des harnais, aujourd'hui

**[mesuré]** Six commandes exécutent le produit pour de vrai, dont quatre
pilotent un navigateur :

| Commande | Verdict du jour |
|---|---|
| `validation-reelle.mjs` | **70 vérifiés · 0 échec · 2 non prouvés** (sur 75) |
| `simulation-beta.mjs --sans-ia` | 0 critique · 0 majeur · **1 moyen** |
| `traversee-ecrans.mjs` | 0 constat |
| `traversee-ecrans.mjs --telephone` | 0 moyen · 3 mineurs, laissés exprès |
| `parcours-premier-utilisateur.mjs` | 0 constat |
| `hors-ligne.mjs` | 7/7 |
| `courrier-reel.mjs` | 11/11 |
| `verifier-sauvegarde.mjs` | 4/4 — 2 206 références, aucune perdue |

Les deux « non prouvés » de la validation : l'analyse IA, qu'on ne lance pas à
chaque fois parce qu'elle coûte, et le parcours complet du mot de passe oublié,
qui exige un fournisseur. Le moyen de la simulation est le même sujet : sans
budget IA, le refus d'une hypothèse absurde n'est pas éprouvé.

---

## ÉTAPE 1 — Audit des bloquants

### A. Bloquant absolu pour une bêta privée

| # | Élément | Impact | Risque | Effort | Priorité |
|---|---|---|---|---|---|
| A1 | **Aucun hébergement** | le produit n'existe pas hors de ce portable | nul techniquement : les deux images se construisent en CI et le serveur démarre pour de vrai **[consigné]** | ½ journée | **1** |
| A2 | **`FRONTEND_URL` en `https`** | le préflight **refuse de démarrer** **[mesuré]** | aucun — c'est un refus volontaire | inclus dans A1 | **1** |

**Et c'est tout.** Deux éléments, un seul obstacle réel.

**Pourquoi l'email n'y figure pas** — **[lu]** `email_verified_at` n'est lu par
aucune garde du backend : un compte non vérifié accède au produit entier. La
bêta peut donc s'ouvrir en `MAIL_TRANSPORT="log"`, avec
`backend/scripts/lien-mot-de-passe.mjs` pour les oublis de mot de passe.

### B. Important, mais non bloquant

| # | Élément | Impact | Risque | Effort | Priorité |
|---|---|---|---|---|---|
| B1 | **Collecteur d'erreurs** | les `Logger.error` existent, avec une référence par erreur ; personne ne les lit | le premier bogue se découvre par un message d'utilisateur | 2 h | **2** — le jour de la mise en ligne |
| B2 | **Fournisseur d'email** | deux parcours s'arrêtent net sans lui | tenable à 30 personnes avec la commande de secours, intenable au-delà | 2 h + ½ journée SPF/DKIM/DMARC | **2** |
| B3 | **Sauvegarde planifiée** | les scripts existent, **rien ne les lance** | une sauvegarde qu'on doit penser à faire n'existe pas le jour venu | 1 h après A1 | **2** |
| B4 | **Suite de tests non déterministe** | une exécution a rendu 2 échecs, la suivante 0, sans rien changer **[mesuré]** | le jour où deux échecs sont réels, ils passeront pour du bruit | ½ journée | **2** |
| B5 | **Personne ne prouve son adresse** | on s'inscrit avec l'adresse d'un autre | acceptable entre gens qu'on connaît ; porte ouverte en public | 2 h — la vérification existe, il suffit de l'exiger | **3**, mais bloquant en phase 3 |
| B6 | **L'investisseur ne peut rien faire** | voir étape 2 | abandon au premier écran — atténué le 25 septembre : l'état vide s'explique | ½ journée pour l'écran par projet | **2** si la bêta a des investisseurs, **4** sinon |

**B4 est le plus sous-estimé de cette liste.** Une suite qui ne se reproduit pas
cesse d'être une preuve, et on prend l'habitude de relancer au lieu de regarder.

### C. Peut attendre après le lancement

Chacun a un **déclencheur écrit**, pas une date :

| Élément | Déclencheur |
|---|---|
| `localStorage` → IndexedDB | quand 60 entrées de cache gênent |
| `pg_trgm` / `unaccent` | au premier ralentissement de recherche |
| `pg_cron` | à la première relance automatique |
| `vector` | au-delà de ~100 souvenirs par projet |
| Stockage objet | à la première pièce jointe |
| Pagination du module investisseurs | voir étape 4 — déclenchée par le succès |
| Les « Gardiens » (article 17) | décision de gouvernance, pas du code |

---

## ÉTAPE 2 — Expérience utilisateur

### Cas 1 — Entrepreneur : le parcours tient

**[mesuré]** `parcours-premier-utilisateur.mjs` suit douze étapes en ne cliquant
**que ce qui est visible** — aucun appel d'API, aucune URL tapée. Verdict :
**0 critique, 0 majeur, 0 moyen**.

| Ce qui existe | Ce qui manque | Ce qui est confus | Risque d'abandon |
|---|---|---|---|
| Inscription, rôle, projet, analyse, tâches, offres — bout en bout | rien que les harnais détectent | rien qui subsiste | aucun mesuré |

**[consigné]** L'analyse IGINI fonctionne avec de vrais appels Claude et dit la
vérité quand le projet ne tient pas. **Non remesuré aujourd'hui** : cela coûte
du budget, et c'est précisément le « non prouvé » de la validation.

### Cas 2 — Investisseur : le parcours n'existe pas

C'est la trouvaille principale de cet audit, et elle est structurelle.

| Étape demandée | État | Établi par |
|---|---|---|
| Inscription | ✅ identique à l'entrepreneur | [mesuré] |
| Activation du rôle | ✅ `/roles` puis `/investisseur` | [mesuré] |
| **Découverte des projets** | ❌ **aucune route, aucun écran** | [lu] |
| **Investissement** | ❌ **impossible depuis le produit** | [lu] |
| Suivi des participations | ✅ `/investisseur` | [lu] |
| Détail d'un projet financé | ✅ déplié dans la ligne, historique compris | [lu] |
| Remboursements | ⚠️ visibles, jamais reçus | [lu] |
| Dividendes | ⚠️ visibles, jamais reçus | [lu] |

**[lu]** Le module est un **registre**, pas une place d'investissement. Toutes
les écritures sont réservées au porteur : `POST /projets-finances/:id/participations`
s'appuie sur `requireOwnedFinancedProject(ownerId, …)`. C'est l'entrepreneur qui
*enregistre* qui a investi, après un accord conclu ailleurs.

**[mesuré]** La simulation le confirme sans le vouloir : le profil 10, un
investisseur, obtient « rôle investisseur pris » puis
« **0 projet(s) visibles publiquement** ».

**Est-ce un défaut ?** Non, si c'est assumé : proposer d'investir en ligne est
une activité réglementée (statut CIF ou PSFP en France), et `docs/outillage.md`
range Mangopay/Lemonway sous « après la réponse juridique ». Le code est prudent,
et il a raison.

| Ce qui existe | Ce qui manque | Ce qui est confus | Risque d'abandon |
|---|---|---|---|
| Portefeuille global et par projet, historique complet, corrections tracées, **et une carte « Mon identifiant » qui explique que le porteur enregistre l'apport** | la découverte, l'investissement, l'écran par projet | l'explication se lit **avant** qu'on se pose la question ; l'état vide ne la rappelait pas | **moyen** : un portefeuille vide sans liste de projets peut se lire comme un produit cassé |

> **Correction du 25 septembre, en cours d'audit.** Une première version de ce
> document affirmait que « le produit ne dit nulle part » comment un
> investissement entre au registre. **C'était faux**, et la lecture du code l'a
> montré : la carte « Mon identifiant » l'explique — « Communique cet
> identifiant au porteur d'un projet pour qu'il enregistre ton apport » — et
> elle s'affiche **avant** le portefeuille.
>
> Ce qui restait vrai est plus petit : l'état vide se contentait de constater
> « Aucun investissement enregistré ». C'est corrigé, avec un test.
>
> L'erreur vaut d'être gardée ici : un audit qui ne relit pas ses propres
> conclusions produit exactement le genre de constat qui fait refaire ce qui
> existe déjà.

**Écrans manquants, par rapport valeur/effort :**

1. ~~Une phrase sur `/investisseur` vide~~ — **fait le 25 septembre.** L'état
   vide dit désormais que c'est normal, et pourquoi.
2. ~~`/investisseur/projets/[id]`~~ — **seconde erreur de cet audit, corrigée
   le 26 septembre.** J'avais écrit que l'API n'était servie par aucun écran.
   **Elle l'est** : le composant `LigneProjet` de `/investisseur` déplie, pour
   chaque projet, le titre, le statut, les quatre montants, et un bouton
   « Voir l'historique » qui appelle exactement `getMyProjectHistory` et
   liste chaque mouvement avec sa date, son libellé, sa référence et la
   mention des rectifications.

   Un écran séparé n'ajouterait qu'une URL partageable, au prix d'un
   composant dupliqué. **Ne pas le construire** est la bonne décision, et
   elle est conforme à la consigne : l'objectif n'est plus d'ajouter des
   modules.
3. Un accusé quand un remboursement ou un dividende est enregistré — **[lu]**
   il n'existe aucun mécanisme de notification dans tout le produit. Ce serait
   donc un module neuf, et il n'aurait nulle part où écrire tant que l'email
   n'est pas branché. *À ne pas faire maintenant.*

### Cas 3 — Hybride : la règle existe, la preuve manque

**[lu]** La séparation est tenue par une règle **bloquante**, `roles-separes`
(article 13), appelée depuis `roles.service.ts` : une vue servie sous un rôle ne
peut contenir que les domaines de ce rôle, et le catalogue garantit que deux
rôles n'en partagent aucun.

**[mesuré]** Côté données : « investir n'ouvre pas le projet — ni lecture, ni
description » est un contrôle vert de la validation.

| Ce qui existe | Ce qui manque | Ce qui est confus | Risque d'abandon |
|---|---|---|---|
| La règle, bloquante, son catalogue, **et depuis le 25 septembre six tests de bout en bout** | plus rien sur ce point | rien | faible |

> **Fait le 25 septembre, en cours d'audit.** `test/roles-hybride.e2e-spec.ts`
> **[mesuré, 6/6]** fait tenir les deux casquettes à la même personne : elle
> porte un projet **et** a réellement investi 2 000 € dans celui de quelqu'un
> d'autre.
>
> Les deux sens sont vérifiés, et c'est le point : l'espace investisseur compte
> **un** projet — celui financé, pas celui porté — et l'espace entrepreneur
> compte **un** projet — celui porté, pas celui financé. Aucun des deux ne
> porte les mots de l'autre.
>
> La première version de ce test se contentait d'un portefeuille vide. Elle
> passait, et ne prouvait rien : un zéro reste un zéro même quand la séparation
> est cassée. C'est en la relisant que je l'ai vu.

---

## ÉTAPE 3 — Données à l'inscription

**La stratégie progressive demandée existe déjà**, et elle est mieux faite que ce
que la question suppose.

**[lu]** L'inscription demande **deux choses** : une adresse et un mot de passe.
`POST /users/signup` ne prend rien d'autre.

**[lu]** Le reste vit dans `backend/src/profile/profile-fields.ts`, où **chaque
champ porte son moment** :

| Niveau demandé | Moment déclaré dans le code | Champs |
|---|---|---|
| 1 — Inscription rapide | *(hors profil)* | email, mot de passe |
| 2 — Complément profil | `accueil` | `display_name`, `investor_kind` |
| 3 — Données métier | `premier-projet` | `activity_country`, `sectors`, `experience`, `availability` |
| 4 — Données avancées | `au-besoin` | `has_founded_before`, `motivation`, `skills`, `investment_horizon`, `risk_level`, `preferred_sectors` |

Chaque champ porte aussi une **question rédigée** (« Comment veux-tu qu'on
t'appelle ? ») plutôt qu'une étiquette, et `GET /profil/a-demander/:moment` rend
la liste du moment — un moment inconnu rend une liste vide plutôt qu'une erreur.

Le principe « demander uniquement ce qui est nécessaire au moment où cela devient
utile » est donc **déjà implémenté**, pas à construire.

### Les deux seules choses que je changerais

1. **`display_name` mérite le niveau 1.** Il est au moment `accueil`, donc
   facultatif — et depuis le 25 septembre, un projet rendu public affiche
   « Porteur sans nom affiché » quand il manque. Le demander à l'inscription
   coûte un champ et évite une reconnaissance perdue (article 21).
2. **Rien d'autre.** La tentation est d'ajouter des champs « utiles plus tard ».
   Chacun coûte un abandon et ne sert que si quelqu'un les lit. Aucun champ
   existant n'est inutile ; aucun manquant ne m'a paru nécessaire.

---

## ÉTAPE 4 — Le module investisseurs, à 10 000 investisseurs

### Ce qui tient sans discussion

| Sujet | État | Établi par |
|---|---|---|
| **L'argent** | centimes entiers, aucun flottant ; totaux **dérivés des lignes**, jamais stockés | [lu] |
| **La séparation** | quatre règles bloquantes sur l'article 22 : `caisses-separees`, `rapprochement-dans-la-meme-caisse`, `investissements-non-melanges`, `majorite-du-porteur` | [lu] |
| **Les index** | posés sur tous les chemins réels : `participations(investor_id, financed_project_id)`, `investor_movements(financed_project_id, occurred_on)` et `(investor_id, occurred_on)` | [lu] |
| **L'irréversible** | rien ne s'efface : une correction est un mouvement qui en corrige un autre ; un investisseur qui part est détaché | [lu] |

Le commentaire du code dit pourquoi les totaux ne sont pas stockés : « un total
qui se calcule deux fois finit par donner deux réponses ». C'est le bon choix
comptable, et il tient à n'importe quelle échelle.

### Ce qui casse à 10 000 — et c'est précis

**[lu]** Aucune pagination dans tout le module : `grep` sur `take:`, `skip:`,
`cursor:` dans `investors.service.ts` rend **zéro**. Deux lectures en souffrent,
et pas également.

| Lecture | Ce qu'elle charge | Gravité |
|---|---|---|
| `projectRegister(...)` | **toutes** les participations d'un projet avec `include: { investor: true }`, **plus** tous ses mouvements | **le mur** — et c'est l'écran du **porteur**, celui qu'il ouvre le plus souvent |
| `portfolio(investorId)` | tous les mouvements de l'investisseur, à chaque affichage | **le plafond** — linéaire pour toujours : 6 000 lignes après dix ans pour afficher trois chiffres |

**Le remède n'est pas de stocker les totaux** — ce serait défaire la seule
décision comptable qui compte. C'est :

- **agréger en base** (`groupBy` / `aggregate`) pour les chiffres ;
- **paginer** les lignes, avec un curseur sur `(occurred_on, created_at)`, qui
  est déjà l'ordre de tri **et déjà indexé**.

*Effort : deux jours. Déclenché par le succès, pas par le calendrier* — en
dessous de ~200 investisseurs par projet, il n'y a rien à faire.

### Ce qui manque pour qu'un investisseur suive son argent

| Besoin exprimé | État |
|---|---|
| Comprendre son portefeuille | ✅ global et par projet ; le net passe **négatif** après un investissement, ce qui est juste |
| Comprendre chaque projet | ✅ replié dans la ligne de portefeuille : montants, statut, et l'historique complet à un clic |
| Suivre son argent | ✅ historique complet, corrections tracées |
| Recevoir ses remboursements | ❌ enregistrés, jamais versés |
| Recevoir ses dividendes | ❌ idem — répartition au centime exact (plus fort reste), aucun versement |

Les deux derniers ne sont pas des manques de code : ils demandent un prestataire
de paiement, lui-même suspendu à une réponse juridique.

---

## ÉTAPE 5 — Plan de lancement

### Phase 0 — Préparation · *1 à 2 jours*

| | |
|---|---|
| **Objectif** | qu'Ignitux existe à une adresse |
| **Prérequis** | hébergement, domaine, certificat |
| **Fait dans la foulée** | collecteur d'erreurs, sauvegarde planifiée, fournisseur d'email |
| **Risque** | aucun risque technique. Le seul est de partir sans le collecteur d'erreurs et de déboguer à l'aveugle |
| **Sortie** | `verifier-production.mjs` rend 0 bloquant |

### Phase 1 — Bêta privée · *3 à 6 semaines*

| | |
|---|---|
| **Objectif** | que 10 à 30 personnes utilisent le produit et disent où ça coince — **entrepreneurs uniquement**, voir étape 2 |
| **Prérequis** | phase 0, la phrase sur l'écran investisseur, le test hybride |
| **Risque** | un défaut d'expérience que ni les harnais ni moi n'avons vu, parce qu'ils mesurent ce qu'ils savent mesurer |
| **Sortie** | dix personnes ont créé un projet et lancé une analyse ; aucune n'est restée bloquée sans recours |

### Phase 2 — Premiers clients payants · *4 à 8 semaines après la phase 1*

| | |
|---|---|
| **Objectif** | encaisser |
| **Prérequis** | un SIRET, puis Stripe pour l'abonnement seul. **[lu]** Le code est prêt : les offres payantes sont refusées sans référence d'encaissement, et ce refus est volontaire |
| **Risque** | voir ci-dessous — il est chiffré, et il bloque |
| **Sortie** | un abonnement encaissé, une facture émise conforme |

**Le risque, chiffré — et résolu le 26 septembre.** L'offre Construction vendait
**150 analyses** pour 59 € tandis que le plafond de coût par utilisateur vaut
**2 €/mois**. **[mesuré]** 55 appels réels donnent **0,0511 €** de moyenne : le
garde-fou coupait donc vers la **39ᵉ**, moins du tiers de ce qui était payé.

Ce n'était pas une question de marge : **c'était le produit qui refusait ce
qu'il avait vendu**, et la personne qui l'apprenait était celle qui venait de
payer.

**La promesse a été alignée sur ce que le plafond permet : 35 analyses.** Pas 30,
parce qu'un test du catalogue exige qu'une offre plus chère ne donne jamais moins
que la précédente — et Entrepreneur en promet 30. Un second test attache
désormais le quota au plafond : relever l'un sans l'autre fait échouer la suite,
avec le message qui nomme les deux chiffres.

**Ce que 35 ne garantit pas**, et c'est écrit dans le catalogue : l'appel le plus
cher observé coûte **0,0914 €** (`construire`). Quelqu'un qui n'utiliserait que
celui-là serait coupé vers la 22ᵉ. L'offre Entrepreneur a exactement la même
propriété, depuis plus longtemps : c'est le plafond qui est commun, pas un défaut
de cette offre-ci. Viser le pire cas descendrait les deux offres payantes à 21
analyses, sous ce que la précédente promet déjà.

### Phase 3 — Lancement public · *3 à 6 mois après la phase 2*

| | |
|---|---|
| **Objectif** | ouvrir |
| **Prérequis** | exiger la vérification d'adresse (B5) ; un budget IA qui n'est plus le plafond ; la pagination si des projets dépassent quelques centaines d'investisseurs |
| **Risque** | **[consigné]** le budget IA est la vraie limite : ~360 utilisateurs gratuits par mois à 0,14 €/utilisateur pour 50 €. Base, connexions et débit sont tous un ordre de grandeur au-dessus |
| **Sortie** | la croissance ne dépend plus d'un plafond de dépense |

---

## Les réponses demandées

### 1. Le pourcentage réel de préparation

Trois chiffres, parce qu'un seul serait malhonnête : ils ne se moyennent pas. On
peut ouvrir une bêta d'entrepreneurs avec 95 % de produit et 0 % de parcours
investisseur.

| Axe | Préparation | Sur quoi repose le chiffre |
|---|---:|---|
| **Produit** | **95 %** | 1 713 tests, six harnais d'exécution réelle, 70 contrôles sans échec |
| **Ouverture à de vrais utilisateurs** | **70 %** | les 30 % manquants ne sont presque pas du code : quatre comptes chez des tiers et une adresse en `https` |
| **Parcours investisseur** | **40 %** | le registre est excellent ; le chemin par lequel un investisseur arrive n'existe pas |

Ces trois pourcentages sont des **jugements**, pas des mesures. Ce qui est mesuré
est ce qui les soutient.

### 2. Les dix prochaines actions, par ordre

| # | Action | Effort | Pourquoi maintenant |
|---|---|---|---|
| 1 | Prendre un hébergement et un domaine | ½ j | le seul vrai verrou — comparaison chiffrée dans [`hebergement.md`](hebergement.md) |
| 2 | Brancher un collecteur d'erreurs | 2 h | **avant** le premier utilisateur, pas après |
| 3 | Brancher le fournisseur d'email | 2 h | le chemin est déjà éprouvé, 11/11 |
| 4 | Planifier la sauvegarde, vérifier la rétention chez l'hébergeur | 1 h | une sauvegarde manuelle n'existe pas |
| 5 | ~~Expliquer l'écran investisseur vide~~ | — | **fait le 25 septembre** |
| 6 | ~~Test de bout en bout du cas hybride~~ | — | **fait le 25 septembre**, 6/6 |
| 7 | Rendre la suite de tests déterministe | ½ j | sinon elle cesse d'être une preuve |
| 8 | ~~Construire `/investisseur/projets/[id]`~~ | — | **inutile** : l'écran existe déjà, replié dans la ligne de portefeuille (26/09) |
| 9 | ~~Contradiction Construction~~ | — | **tranchée le 26 septembre** : 150 → 35, et un test attache le quota au plafond |
| 10 | Exiger la vérification d'adresse | 2 h | avant la phase 3, pas avant la bêta |

**Les six premières font moins de deux jours cumulés.**

### 3. Date la plus optimiste

**Bêta privée : 29 septembre 2026.** Suppose un hébergeur pris aujourd'hui, un
domaine qui propage vite, et les actions 1 à 5 enchaînées sans obstacle.

### 4. Date réaliste

**Bêta privée : 13 octobre 2026.** Laisse la place aux frictions d'hébergement,
à un refus de Microsoft sur l'authentification SMTP, et aux deux ou trois défauts
que dix vrais utilisateurs trouveront en une semaine.

**Premiers clients payants : fin novembre 2026**, conditionné au SIRET et à la
décision n° 9.

### 5. Date prudente

**Bêta privée : 3 novembre 2026.** Suppose que le SMTP Outlook soit refusé et
qu'il faille un vrai fournisseur et un domaine propre, que la suite de tests
réserve une surprise, et que les dix premiers utilisateurs trouvent un défaut
structurel plutôt que cosmétique.

**Lancement public : deuxième trimestre 2027**, dominé par le budget IA et par le
statut réglementaire du volet investissement — deux choses qui ne s'accélèrent
pas en écrivant du code.

---

## Ce que cet audit n'a pas pu vérifier

| Ce qui reste inconnu | Pourquoi |
|---|---|
| **Qu'Ignitux démarre chez un hébergeur** | l'image démarre en CI contre une base jetable ; ce n'est pas la même chose |
| **Qu'un courrier arrive dans une vraie boîte** | le chemin SMTP est prouvé contre une boîte locale ; l'arrivée dépend de SPF/DKIM/DMARC sur un domaine réel |
| **Que le compte Outlook accepte le mot de passe** | **[mesuré]** le serveur annonce `AUTH LOGIN XOAUTH2` après STARTTLS ; que Microsoft l'autorise pour *ce* compte ne se saura qu'avec un identifiant |
| **Le comportement à 10 000 investisseurs** | les conclusions de l'étape 4 viennent de la lecture des requêtes, pas d'une mesure sous charge |
| **Le jugement d'IGINI sur un projet absurde** | **[consigné]** éprouvé lors d'une session antérieure ; non remesuré aujourd'hui faute de budget IA — c'est le « moyen » de la simulation |
