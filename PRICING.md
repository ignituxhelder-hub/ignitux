# Rentabilité d'un forfait à 20 €/mois pour 5 analyses

**Date** : 20/09/2026.
**Question posée** : 20 €/mois pour cinq analyses — une par générateur — est-ce rentable avec
`claude-opus-5` ?

**Réponse courte** : oui, très largement. Le coût IA d'un pipeline complet est de l'ordre de
**0,19 €**, soit **environ 1 % du prix de vente**. Même dans l'hypothèse la plus défavorable
testée plus bas, la marge reste au-dessus de 94 %. Mais ce chiffre repose sur une estimation, pas
sur une facture — et la section suivante explique pourquoi.

---

## 1. Ce que je n'ai pas pu faire, et pourquoi

**Les tokens ne sont journalisés nulle part.** Vérifié dans les trois endroits où ils pourraient
l'être :

- `ClaudeService.generateStructuredOutput` lit `response.parsed_output` et **jette
  `response.usage`**, qui contient pourtant `input_tokens` et `output_tokens` ;
- aucune colonne de token ni de coût dans `prisma/schema.prisma` (36 tables) ;
- le rapport des 12 appels réels (PROGRESS.md, « Budget IA ») note leur nombre, leur nature et
  leur durée — 38 à 46 secondes — mais aucun décompte de tokens.

**Il n'existe donc aucun coût facturé à calculer.** Tout chiffre présenté ici est une estimation.

### Ce que j'ai fait à la place

Plutôt que de deviner, j'ai mesuré des **artefacts réels** :

- **l'entrée** est déterministe et vit dans le code : socle d'identité IGINI (652 caractères),
  consigne propre à chaque générateur, schéma Zod envoyé via `output_config.format` (ses
  `.describe()` sont facturés comme du texte), et le résumé de chaque étape précédente que le
  contexte injecte — mesuré à **734 caractères en moyenne**, et non la sortie entière ;
- **la sortie** vient des **7 générations réellement produites** par les appels du 19/09 et
  encore présentes en base : 2 analyses, 2 plans de construction, 1 plan de financement, 1 de
  développement, 1 de transmission.

### Les trois hypothèses qui restent

1. **Conversion caractères → tokens : 3,5 caractères par token.** Le français tokenise moins bien
   que l'anglais (accents, mots plus longs). L'API expose un endpoint `count_tokens` qui donnerait
   le chiffre exact, mais l'appeler serait un appel à l'API Anthropic, que je n'ai pas fait.
2. **Taux de change : 1 USD = 0,92 EUR.**
3. **La grille tarifaire date du 24/06/2026** (source : référence Anthropic bundlée). Elle a
   presque trois mois — à revérifier avant toute décision engageante.

### Le trou le plus important : les tokens de réflexion

Sur `claude-opus-5`, **la réflexion adaptative est active par défaut** : le code ne passe aucun
paramètre `thinking`, donc elle tourne. Ces tokens sont **facturés au tarif de sortie** (25 $/M)
et **n'apparaissent nulle part** dans le résultat stocké.

Les chiffres du tableau ci-dessous sont donc un **plancher**, pas une estimation centrale. La
section 5 montre ce qui change si la réflexion ajoute 500 à 8 000 tokens par appel.

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

L'entrée grossit d'une étape à l'autre parce que chaque étape reçoit le résumé des précédentes.
Cela reste marginal : l'entrée est cinq fois moins chère que la sortie, et c'est la **sortie qui
porte tout le coût**.

**Sur des échantillons de 1 à 2 générations**, ces moyennes sont fragiles. L'écart observé sur
« Analyser » le montre : 1 814 et 4 387 caractères, soit un facteur 2,4 entre deux appels du même
générateur. Un projet richement décrit coûtera plus qu'un projet en trois lignes.

---

## 3. Pipeline complet et marge sur 20 €

Un utilisateur qui consomme tout son quota mensuel lance les cinq générateurs une fois.

| | Coût du pipeline | Marge sur 20 € | Marge en % | Seuil de rentabilité |
|---|---|---|---|---|
| **`claude-opus-5`** | **0,1938 €** | **19,81 €** | **99,03 %** | 103 pipelines/mois |
| `claude-sonnet-5` | 0,0775 € | 19,92 € | 99,61 % | 258 pipelines/mois |
| `claude-haiku-4-5` | 0,0388 € | 19,96 € | 99,81 % | 516 pipelines/mois |

Le « seuil de rentabilité » répond à une question qui compte davantage que la marge : **combien
de pipelines un seul utilisateur devrait-il lancer pour consommer les 20 € qu'il a payés ?** Avec
`claude-opus-5`, il en faudrait **103** — soit vingt fois le quota annoncé.

---

## 4. Faut-il passer à un modèle moins cher ?

**Non, pas pour des raisons de coût.** Le calcul le dit clairement :

| Passage | Économie par utilisateur et par mois |
|---|---|
| opus-5 → sonnet-5 | **0,12 €** |
| opus-5 → haiku-4-5 | **0,16 €** |

En pourcentage du coût IA, l'écart est spectaculaire — 60 % et 80 %. En euros, il est **inférieur
au prix d'un timbre**, et il représente moins de 1 % du prix de vente. À ce niveau de marge,
descendre en gamme échange de la qualité de génération contre une économie invisible.

L'arbitrage redeviendrait réel dans deux cas, et deux seulement :

- **le volume** : à 10 000 utilisateurs consommant leur quota, l'écart opus-5 → sonnet-5
  représente environ 1 200 €/mois. La question se posera alors, pas avant ;
- **la latence** : un appel prend 38 à 46 secondes (mesuré). C'est long pour une interface. Si
  l'attente devient le problème, un modèle plus rapide se justifie — mais c'est une décision
  d'expérience utilisateur, pas de coût.

---

## 5. Et si la réflexion coûte plus que prévu ?

C'est le seul chiffre susceptible de changer la conclusion. Hypothèses de tokens de réflexion
ajoutés **par appel**, avec `claude-opus-5` :

| Réflexion / appel | Pipeline | Marge | Seuil | Le budget de 50 € couvre |
|---|---|---|---|---|
| +0 (plancher mesuré) | 0,1938 € | 99,03 % | 103 pipelines | 258 pipelines |
| +500 | 0,2513 € | 98,74 % | 79 pipelines | 198 pipelines |
| +1 000 | 0,3088 € | 98,46 % | 64 pipelines | 161 pipelines |
| +2 000 | 0,4238 € | 97,88 % | 47 pipelines | 117 pipelines |
| +4 000 | 0,6538 € | 96,73 % | 30 pipelines | 76 pipelines |
| +8 000 | 1,1138 € | 94,43 % | 17 pipelines | 44 pipelines |

**La conclusion tient sur toute la plage.** Même si la réflexion quadruplait la sortie, la marge
resterait au-dessus de 94 %. Le forfait n'est pas menacé par le coût de l'IA.

---

## 6. Ce que ce calcul ne couvre pas

Le coût IA n'est pas le coût du service. Ne sont pas inclus :

- **les frais de paiement** — de l'ordre de 0,55 € sur une transaction de 20 € chez un
  encaisseur classique, soit **trois fois le coût IA** ;
- **l'hébergement** — aujourd'hui inexistant : le déploiement est en réseau local ;
- **la base de données** — Supabase, aujourd'hui sur une offre gratuite ;
- **l'envoi d'email** — aucun fournisseur choisi ;
- **la TVA**, selon le régime retenu ;
- **le temps de support**, qui sur un produit à 20 € est le poste qui décide de tout.

**Le vrai risque n'est pas le modèle : c'est le reste.** Le coût IA est à 1 % ; les frais de
paiement sont à 3 %. Un seul échange de support d'une demi-heure par utilisateur et par mois
coûte davantage que tout le reste réuni.

---

## 7. Le plafond de 5 analyses n'existe pas dans le code

Aucun compteur, aucun blocage : rien n'empêche aujourd'hui un utilisateur de lancer le pipeline
autant de fois qu'il veut. **Ce n'était pas l'objet de cette session et rien n'a été construit.**

Ce que le calcul apporte à cette décision : le plafond n'est pas une urgence financière. Il
faudrait 103 pipelines dans le mois — ou 30 dans l'hypothèse de réflexion la plus lourde — pour
qu'un seul utilisateur dépasse ce qu'il a payé. Le plafond sert surtout à rendre l'offre lisible
et à borner un cas pathologique, pas à sauver la marge.

---

## 8. Ce qu'il faudrait pour remplacer cette estimation par une mesure

Le SDK renvoie déjà les chiffres exacts ; le code les jette. Trois lignes suffiraient, dans
`ClaudeService.generateStructuredOutput`, pour lire `response.usage` et enregistrer
`input_tokens`, `output_tokens` — et, sur les modèles qui l'exposent, la part de réflexion.

Où les mettre, par ordre de coût de mise en œuvre :

1. **Dans le journal**, avec le nom du générateur. Immédiat, aucune migration, suffisant pour
   remplacer cette estimation par une moyenne réelle en quelques jours d'usage.
2. **Dans les tables de contenu généré**, à côté de `generated_by` et `generated_model` qui
   existent déjà. Permet de dire ce qu'a coûté **ce** plan-là.
3. **Dans une table dédiée**, si un jour le quota doit être compté et facturé. C'est le même
   compteur qui servirait au plafond de 5 analyses.

**Je ne l'ai pas construit** : la consigne de cette session était un calcul, pas une
fonctionnalité. Mais tant que ce journal n'existe pas, toute page de ce document restera une
estimation — y compris sa conclusion rassurante.
