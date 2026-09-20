# Coût IA d'un forfait à 20 €/mois — organisé autour d'un plafond à 10 %

**Date** : 20/09/2026.
**Décision de l'entrepreneur** : le coût IA peut monter jusqu'à **10 % du prix de vente**.
**Traduction** : **2,00 € d'IA par utilisateur payant et par mois**.

> **Mise à jour, même jour.** Le point 1 de la section 7 — enregistrer `response.usage` — a été
> construit. Les prochains appels journaliseront leurs tokens réels, réflexion interne comprise.
> Les chiffres de ce document restent des estimations tant qu'aucun appel n'a tourné avec les
> générateurs rallumés, mais ils cesseront de l'être d'eux-mêmes, sans qu'il faille refaire ce
> travail.

Ce document ne demande plus « est-ce rentable ? » — la question précédente, à laquelle la réponse
était oui à 1 % du prix. Il demande **comment dépenser les 2,00 € désormais autorisés**, et ce que
le passage de 1 % à 10 % rend possible, obligatoire, ou définitivement clos.

**Les trois conclusions, d'abord** :

1. Le pipeline actuel coûte **0,1938 €**, soit **0,97 %** du prix. Il reste **10,3 fois** de marge
   sous le plafond. L'enveloppe n'est pas serrée, elle est largement vide.
2. La question du modèle est **close** : `claude-opus-5` tient dans le plafond avec un facteur 10.
   Descendre en gamme n'a plus aucun argument financier.
3. **Ce qui change de nature : le plafond de 5 analyses devient nécessaire.** À 1 % il était
   cosmétique. À la profondeur que 10 % autorise, **7 appels suffisent à percer l'enveloppe**.
   Le compteur n'est plus un confort d'affichage, c'est le mécanisme qui fait tenir le taux.

---

## 1. Ce que je n'ai pas pu mesurer, et pourquoi

**Au moment où ce calcul a été fait, les tokens n'étaient journalisés nulle part.** Vérifié dans
les trois endroits où ils auraient pu l'être :

- `ClaudeService.generateStructuredOutput` lisait `response.parsed_output` et **jetait
  `response.usage`**, qui contient pourtant `input_tokens` et `output_tokens` ;
- aucune colonne de token ni de coût dans `prisma/schema.prisma` (36 tables) ;
- le rapport des 12 appels réels (PROGRESS.md, « Budget IA ») note leur nombre, leur nature et
  leur durée — 38 à 46 secondes — mais aucun décompte de tokens.

**Il n'existait donc aucun coût facturé à calculer**, et tout chiffre présenté ici reste une
estimation construite sur des artefacts réels, pas une facture.

> **Le premier point est corrigé depuis** (section 12) : le journal existe, la table aussi. Mais
> il est vide, puisque aucun appel n'a eu lieu depuis — les générateurs restent éteints. Cette
> section décrit donc toujours fidèlement la base des chiffres ci-dessous. Elle cessera d'être
> nécessaire au premier appel réel, pas avant.

### Ce que j'ai mesuré à la place

- **l'entrée** est déterministe et vit dans le code : socle d'identité IGINI (652 caractères),
  consigne propre à chaque générateur, schéma Zod envoyé via `output_config.format` (ses
  `.describe()` sont facturés comme du texte), et le résumé de chaque étape précédente que le
  contexte injecte — mesuré à **734 caractères en moyenne**, et non la sortie entière ;
- **la sortie** vient des **7 générations réellement produites** par les appels du 19/09 et
  encore présentes en base : 2 analyses, 2 plans de construction, 1 plan de financement, 1 de
  développement, 1 de transmission.

### Les trois hypothèses qui restent

1. **Conversion caractères → tokens : 3,5 caractères par token.** Le français tokenise moins bien
   que l'anglais. L'API expose `count_tokens`, qui donnerait le chiffre exact — l'appeler serait
   un appel à l'API Anthropic, que je n'ai pas fait.
2. **Taux de change : 1 USD = 0,92 EUR.**
3. **La grille tarifaire date du 24/06/2026** (source : référence Anthropic bundlée). Elle a
   presque trois mois — à revérifier avant toute décision engageante.

### Le trou le plus important : les tokens de réflexion

Sur `claude-opus-5`, **la réflexion adaptative est active par défaut** : le code ne passe aucun
paramètre `thinking`, donc elle tourne. Ces tokens sont **facturés au tarif de sortie** (25 $/M)
et **n'apparaissent nulle part** dans le résultat stocké.

Les chiffres de la section 2 sont donc un **plancher**, pas une estimation centrale. C'est
précisément ce que le passage à 10 % permet d'absorber : **la première chose qu'achète le
plafond, c'est de la sécurité sur un nombre qu'on ne mesure pas.** À 1 %, une réflexion quatre
fois plus lourde que prévu aurait fait mentir le document ; à 10 %, elle rentre.

**Ce trou est désormais bouché pour les appels à venir.** Le SDK expose cette valeur dans
`output_tokens_details.thinking_tokens` ; le code ne la lisait pas, il la lit maintenant et
l'enregistre. Le tableau de sensibilité de la section 5 deviendra une observation au lieu d'une
hypothèse dès les premiers appels réels — mais il reste une hypothèse aujourd'hui, puisque
aucun appel n'a encore eu lieu depuis.

---

## 2. Coût mesuré par générateur — `claude-opus-5`

Tarif : 5 $/M en entrée, 25 $/M en sortie.

| Générateur | Générations mesurées | Entrée (tokens) | Sortie (tokens) | Coût / appel |
|---|---|---|---|---|
| Analyser | 2 | 484 | 886 | 0,0226 € |
| Construire | 2 | 758 | 1 336 | 0,0342 € |
| Financer | 1 | 1 024 | 1 501 | 0,0392 € |
| Développer | 1 | 1 236 | 1 913 | 0,0497 € |
| Transmettre | 1 | 1 505 | 1 788 | 0,0480 € |
| **Pipeline complet** | | | | **0,1938 €** |

L'entrée grossit d'une étape à l'autre parce que chaque étape reçoit le résumé des précédentes.
Cela reste marginal : l'entrée est cinq fois moins chère que la sortie, et c'est la **sortie qui
porte tout le coût**. Toute décision de dépense ci-dessous est donc une décision sur la sortie.

**Sur des échantillons de 1 à 2 générations**, ces moyennes sont fragiles. L'écart observé sur
« Analyser » le montre : 1 814 et 4 387 caractères, soit un facteur 2,4 entre deux appels du même
générateur. Un projet richement décrit coûtera plus qu'un projet en trois lignes.

---

## 3. Où l'on se situe par rapport au plafond

| | Valeur |
|---|---|
| Prix de vente | 20,00 € |
| Taux décidé | 10 % |
| **Enveloppe IA** | **2,00 € / utilisateur / mois** |
| Dépense actuelle | 0,1938 € |
| Part du prix consommée | **0,97 %** |
| Marge de manœuvre | **× 10,3** |

L'enveloppe est remplie à un dixième. Les sections 4 à 6 disent ce qu'on peut faire des neuf
dixièmes restants : elles **chiffrent des options, elles n'en engagent aucune**. Rien de ce qui y
est décrit — réflexion déclarée, passe de révision, sorties plus longues — n'a été mis en œuvre.
La seule chose construite est l'instrument qui permettra de vérifier ces chiffres : la télémétrie
de la section 12.

---

## 4. Les trois axes sur lesquels l'enveloppe se dépense

Il n'y a que trois façons de dépenser plus d'IA : **réfléchir plus**, **repasser sur son propre
travail**, ou **produire plus**. Chacune est chiffrée séparément, puis combinée en section 5.

### 4.1 Réfléchir plus — la réflexion explicite

Aujourd'hui le code ne passe aucun paramètre `thinking` ; la réflexion adaptative tourne sans
budget déclaré. Lui en donner un rend la dépense prévisible.

| Réflexion / appel | Pipeline | % du prix | Tient dans 10 % ? |
|---|---|---|---|
| +0 (plancher mesuré) | 0,1938 € | 0,97 % | oui |
| +1 000 | 0,3088 € | 1,54 % | oui |
| +2 000 | 0,4238 € | 2,12 % | oui |
| +4 000 | 0,6538 € | 3,27 % | oui |
| +8 000 | 1,1138 € | 5,57 % | oui |
| +16 000 | 2,0338 € | 10,17 % | **non** |

**Le point de rupture est à 15 706 tokens de réflexion par appel** — pour un seul pipeline par
mois, sans aucune reprise. C'est très au-delà de ce qu'une réflexion adaptative consomme en
pratique. **Cet axe seul ne peut pas épuiser l'enveloppe.**

### 4.2 Repasser — la passe de révision

Un second appel par générateur, qui relit sa propre sortie et la réécrit. Son entrée est
l'entrée d'origine **plus** la première sortie ; sa sortie est de taille comparable.

| | Pipeline | % du prix | Surcoût |
|---|---|---|---|
| Une passe (aujourd'hui) | 0,1938 € | 0,97 % | — |
| Deux passes (révision) | **0,4217 €** | 2,11 % | +0,2279 € |

C'est **l'axe au meilleur rapport qualité/prix** : il double le coût mais reste à 2 % du prix, et
c'est le seul des trois qui agit sur la *justesse* du résultat plutôt que sur sa longueur ou son
temps de calcul. Pour un produit dont la devise est « la vérité avant tout », c'est l'axe qui
correspond le mieux à la promesse.

### 4.3 Produire plus — des sorties plus longues

| Facteur sur la sortie | Pipeline | % du prix |
|---|---|---|
| × 1 (aujourd'hui) | 0,1938 € | 0,97 % |
| × 2 | 0,3645 € | 1,82 % |
| × 3 | 0,5353 € | 2,68 % |
| × 5 | 0,8768 € | 4,38 % |
| × 8 | 1,3890 € | 6,95 % |

**C'est l'axe que je recommande le moins.** Un plan de financement huit fois plus long n'est pas
huit fois plus utile — il est surtout huit fois moins lu. Les schémas Zod actuels bornent déjà la
structure ; les allonger produirait du remplissage, pas de la valeur. À garder en réserve pour un
générateur précis dont la sortie serait mesurée comme trop courte, pas comme politique générale.

---

## 5. Répartition proposée de l'enveloppe

L'usage réel n'est pas « un pipeline et on s'arrête ». Un utilisateur **relance** un générateur
dont la sortie ne lui convient pas. Toute répartition honnête doit provisionner ces reprises.

Hypothèse : **1 pipeline complet** (le quota de 5 analyses) **+ des reprises isolées**.

| Profondeur | Pipeline | Appel isolé | Reprises payables | Total si 5 reprises | % du prix |
|---|---|---|---|---|---|
| Aujourd'hui | 0,1938 € | 0,0388 € | 46 | 0,3876 € | 1,94 % |
| Réflexion +2 000 | 0,4238 € | 0,0848 € | 18 | 0,8476 € | 4,24 % |
| Révision | 0,4217 € | 0,0843 € | 18 | 0,8434 € | 4,22 % |
| **Révision + réflexion +2 000** | **0,8817 €** | **0,1763 €** | **6** | **1,7634 €** | **8,82 %** |
| Révision + réflexion +4 000 | 1,3417 € | 0,2683 € | 2 | 2,6834 € | **13,42 %** |

### Ce que je retiens

**La ligne « révision + réflexion +2 000 » est la profondeur maximale compatible avec le taux
décidé.** Elle coûte 1,76 € pour un pipeline complet et cinq reprises — **8,82 %**, sous le
plafond, avec 0,24 € de marge pour la variance entre projets riches et projets maigres.

La ligne du dessous, à +4 000 tokens de réflexion, **sort du cadre à 13,42 %**. Elle est là pour
montrer où est le mur : il n'est pas loin.

**Ordre d'engagement recommandé**, du plus rentable au moins :

1. **La révision** (+0,23 €/pipeline) — agit sur la justesse, c'est-à-dire sur la promesse ;
2. **Un budget de réflexion déclaré** à +2 000 (+0,46 €/pipeline) — rend prévisible une dépense
   aujourd'hui invisible, ce qui vaut plus que le gain de qualité lui-même ;
3. **Les sorties plus longues** — seulement là où une sortie est mesurée trop courte.

Les trois ensemble n'épuisent pas l'enveloppe. **C'est le signe que le taux de 10 % est généreux
pour ce produit**, pas que les 2,00 € doivent être dépensés.

---

## 6. La question du modèle est close

| Modèle | Pipeline | % du prix | Pipelines dans l'enveloppe |
|---|---|---|---|
| **`claude-opus-5`** | **0,1938 €** | **0,97 %** | **10** |
| `claude-sonnet-5` | 0,0775 € | 0,39 % | 25 |
| `claude-haiku-4-5` | 0,0388 € | 0,19 % | 51 |

À 1 % du prix, l'argument contre le passage à un modèle moins cher était que l'économie — 0,12 €
par utilisateur et par mois — était **inférieure au prix d'un timbre**. À 10 %, l'argument devient
plus fort encore : **opus-5 tient dix fois dans l'enveloppe autorisée.** Il n'y a plus de raison
financière d'en discuter.

Deux raisons non financières subsistent, inchangées :

- **le volume** : à 10 000 utilisateurs consommant leur quota, l'écart opus-5 → sonnet-5
  représente environ 1 200 €/mois. La question se reposera alors — mais en valeur absolue, pas en
  pourcentage, et le pourcentage restera sous le plafond ;
- **la latence** : un appel prend 38 à 46 secondes (mesuré). C'est long pour une interface, et la
  révision de la section 4.2 **doublerait cette attente**. C'est le vrai coût de la révision, et
  il ne se paie pas en euros. Si la révision est retenue, elle doit être asynchrone — l'utilisateur
  reçoit une première version, puis une version révisée — et non une attente de 90 secondes devant
  un écran vide.

---

## 7. Ce que le taux de 10 % rend obligatoire

**C'est le point où la conclusion de l'analyse précédente s'inverse, et il faut le dire
clairement.**

Tant que le coût IA était à 1 %, le plafond de 5 analyses n'avait aucune urgence financière : il
aurait fallu 103 pipelines dans le mois pour qu'un utilisateur dépasse ce qu'il a payé. Le
compteur servait à rendre l'offre lisible, rien de plus.

**Décider d'un taux de 10 % change cela**, pour une raison simple : un taux n'existe que s'il est
opposable. À la profondeur recommandée en section 5 :

| | Valeur |
|---|---|
| Appel le plus profond envisagé | 0,2683 € |
| Appels avant de percer l'enveloppe de 2,00 € | **7** |
| Appels avant de percer les 20,00 € du forfait | **74** |

**Sept appels.** Un utilisateur qui relance ses générateurs une après-midi y arrive sans mauvaise
intention. Le plafond cesse d'être un confort d'affichage pour devenir **le seul mécanisme qui
fait tenir le taux décidé**.

### Ce qu'il faut construire pour que 10 % soit une règle et non un vœu

Dans cet ordre :

1. ~~**Enregistrer `response.usage`.**~~ **Fait.** Chaque appel écrit désormais une ligne dans
   `ai_usage_events` : modèle, tokens d'entrée, tokens de sortie, **part de réflexion interne**,
   tokens de cache, durée, personne, projet, générateur. Le journal se pose au même endroit que
   l'interrupteur des générateurs — le point de passage unique — et l'attribution est un champ
   **obligatoire** du contrat : un sixième générateur ne compilera pas tant qu'il n'aura pas dit à
   qui attribuer sa dépense. La consommation se lit sur `GET /igini/usage/mois-en-cours`, pour la
   personne connectée uniquement. Détails et arbitrages en section 12.
2. **Un compteur par utilisateur et par mois.** Compte des appels, ou mieux, des tokens — si l'on
   compte des tokens, le plafond devient « 2,00 € », littéralement la décision prise, plutôt qu'un
   nombre d'analyses qui n'en est qu'une approximation.
3. **Un refus lisible au dépassement.** Le produit refuse déjà proprement en 422 (refus
   constitutionnel) et en 503 (fonctionnalité éteinte) ; un dépassement de quota est un troisième
   cas, avec son propre message et sa propre trace.
4. **Une alerte avant le plafond**, pour l'exploitant : le taux réel constaté, par utilisateur et
   global, comparé aux 10 %.

Les points 1 et 2 sont le même compteur, et la moitié en est écrite : la table et son service
existent, il manque la lecture qui décide et le refus qui s'ensuit. C'est aussi ce compteur qui
permettrait de facturer un dépassement (section 9).

---

## 8. Où le plafond absolu de 50 €/mois mord

Le taux de 10 % est **relatif** ; le budget d'expérimentation de 50 €/mois est **absolu**. Les
deux coexistent, et ils se croisent à un endroit précis.

| Utilisateurs payants | Dépense à la profondeur actuelle | Dépense si l'enveloppe est pleine |
|---|---|---|
| 2 (le test en cours) | 0,39 € | 4,00 € |
| 10 | 1,94 € | 20,00 € |
| **25** | 4,84 € | **50,00 €** |
| 100 | 19,38 € | 200,00 € |
| 1 000 | 193,78 € | 2 000,00 € |

**À 25 utilisateurs payants — soit 500 € de chiffre d'affaires — les 10 % valent exactement
50 €.** Les deux contraintes coïncident à ce point et pas ailleurs.

Ce que cela veut dire concrètement :

- **en dessous de 25 utilisateurs**, c'est le plafond absolu de 50 € qui protège, et il est
  confortable : à la profondeur actuelle, 25 utilisateurs ne coûtent que 4,84 € ;
- **au-dessus de 25 utilisateurs**, le plafond de 50 € cesse d'être un garde-fou et devient un
  frein arbitraire — il faut alors le remplacer par le taux, qui grandit avec le chiffre
  d'affaires, ou le relever consciemment.

**C'est un seuil à noter maintenant**, parce qu'il arrivera sans prévenir : le jour où le 26ᵉ
client paie, une règle écrite pour une phase d'expérimentation commencera à contredire une règle
écrite pour le produit.

---

## 9. Prix plancher d'une analyse supplémentaire

Si un dépassement devait un jour se facturer à l'unité, le taux de 10 % donne directement le prix
plancher : le coût, divisé par 0,10.

| Générateur | Coût réel | Prix à 10 % de coût IA |
|---|---|---|
| Analyser | 0,0226 € | 0,23 € |
| Construire | 0,0342 € | 0,34 € |
| Financer | 0,0392 € | 0,39 € |
| Développer | 0,0497 € | 0,50 € |
| Transmettre | 0,0480 € | 0,48 € |
| **Pipeline complet** | **0,1938 €** | **1,94 €** |

Ces prix sont des **planchers de coût IA seul**, pas des prix de vente : ils n'incluent ni les
frais de paiement — qui sur une transaction de 0,50 € sont proportionnellement énormes — ni quoi
que ce soit de la section 10. Un dépassement facturé à l'unité en dessous de 2 € perdrait de
l'argent sur les seuls frais d'encaissement. **Un dépassement se vend par lot, ou pas du tout.**

---

## 10. Ce que ce calcul ne couvre toujours pas

Le taux de 10 % s'applique au coût IA. Il ne dit rien du reste, et le reste est plus gros :

- **les frais de paiement** — de l'ordre de 0,55 € sur une transaction de 20 €, soit **2,75 % du
  prix**. À la profondeur actuelle, ils coûtent **trois fois plus que l'IA** ; même à la
  profondeur recommandée de 8,82 %, ils restent du même ordre de grandeur ;
- **l'hébergement** — aujourd'hui inexistant : le déploiement est en réseau local ;
- **la base de données** — Supabase, aujourd'hui sur une offre gratuite ;
- **l'envoi d'email** — aucun fournisseur choisi, et c'est l'une des décisions en attente ;
- **la TVA**, selon le régime retenu ;
- **le temps de support**, qui sur un produit à 20 € reste le poste qui décide de tout.

**Décider que l'IA peut coûter 10 % ne rend pas le produit dix fois plus risqué.** Le risque
n'était pas là et n'y est toujours pas : un seul échange de support d'une demi-heure par
utilisateur et par mois coûte davantage que l'enveloppe IA entière.

---

## 11. Ce qui a changé par rapport à la version précédente de ce document

| | Avant (constat à 1 %) | Maintenant (plafond décidé à 10 %) |
|---|---|---|
| Nature du chiffre | une observation | **une décision opposable** |
| Modèle | question ouverte, économie négligeable | **close : opus-5 confirmé** |
| Profondeur de génération | une seule passe, par défaut | **révision + réflexion déclarée, chiffrées** |
| Plafond de 5 analyses | « pas une urgence financière » | **nécessaire : 7 appels percent l'enveloppe** |
| Journal des tokens | souhaitable | **prérequis, et construit le jour même** (section 12) |

**La ligne qui compte est l'avant-dernière.** Elle inverse la conclusion de l'analyse précédente,
et ce n'est pas une correction : c'est la conséquence directe d'avoir transformé un constat en
engagement. Un taux qu'on ne peut pas faire respecter n'est pas un taux.

Et tant que `response.usage` n'est pas enregistré, **ce document reste une estimation** — y
compris sa conclusion rassurante selon laquelle l'enveloppe est large.

---

## 12. La télémétrie, telle qu'elle a été construite

`ClaudeService` lisait `response.parsed_output` et jetait `response.usage`. Cette seule omission
est ce qui a obligé tout ce document à compter des caractères. Elle est corrigée.

### Ce qui est enregistré

Une ligne par appel facturé, dans `ai_usage_events` : `model`, `input_tokens`, `output_tokens`,
`thinking_tokens`, les deux colonnes de cache, `duration_ms`, `user_id`, `project_id`,
`generator`, `created_at`.

### Quatre arbitrages, à connaître avant de lire les chiffres

1. **Aucun montant en euros n'est stocké.** Les tokens sont des faits mesurés et définitifs ; un
   prix est un calcul dont la grille change — celle de ce document avait déjà trois mois. Figer
   l'euro en base scellerait une grille périmée dans l'historique pour toujours. Le coût se dérive
   à la lecture, dans `ai-pricing.ts`. La contrepartie est assumée : le jour où un prix bougera,
   ce module devra porter une grille **datée** plutôt qu'une seule.
2. **Un modèle absent de la grille vaut `null`, jamais zéro.** Zéro se confondrait avec
   « gratuit » et disparaîtrait d'un total sans que rien ne le signale. Un total qui contient un
   modèle non tarifé est rendu `null` en entier plutôt que partiel : un total partiel présenté
   comme complet est faux, et faux dans le sens rassurant.
3. **L'écriture précède la vérification du contenu.** Dès qu'une réponse existe, les tokens sont
   facturés. Enregistrer après le contrôle ferait disparaître des totaux exactement les appels qui
   ont mal tourné — les plus coûteux à ignorer, puisqu'ils sont payés sans rien rendre.
4. **Le journal ne fait jamais échouer une génération.** Entre perdre une ligne de comptabilité et
   perdre quarante secondes de travail déjà payées, c'est la ligne qui saute. **Conséquence à
   retenir pour le plafond** : ce journal est fiable mais **pas transactionnel**. Une écriture
   perdue sera un appel non décompté. Le jour où le plafond s'appuiera dessus, il faudra soit
   rendre l'écriture bloquante, soit assumer qu'il s'agit d'un plafond haut et non d'un compteur
   comptable.

### Ce qui n'est pas encore éprouvé

Le trajet depuis un **vrai appel** à l'API Anthropic. `IGINI_AI_ENABLED` reste à `false` et rien
n'a été rallumé. L'extraction des champs depuis la réponse du SDK est couverte par des tests
unitaires ; l'écriture en base et la lecture par l'API le sont de bout en bout sur la vraie base
Postgres. Le seul maillon non éprouvé en conditions réelles est celui qui exige de rallumer les
générateurs — et il le restera tant qu'ils seront éteints.

### Une étape d'exploitation qui reste à faire

Le schéma a été poussé sur la base de développement et sur la base de test. **Il ne l'a pas été
sur `ignitux_prod`** : l'opération a été refusée comme touchant la production, et c'est le bon
comportement. Tant qu'elle n'est pas faite, une bascule du déploiement vers la base de production
échouerait sur une table manquante. C'est une commande à lancer sciemment, pas un effet de bord à
subir.
