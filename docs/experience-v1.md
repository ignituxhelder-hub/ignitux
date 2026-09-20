# Expérience IGNITUX V1 — les écrans manquants

Construit et mesuré le 20 septembre 2026. Aucun moteur ajouté, aucune table ajoutée.
Deux routes de lecture ajoutées, parce que deux écrans ne pouvaient pas s'ouvrir sans elles.

---

## Le constat qui a déclenché ce chantier

Quatre modules du serveur totalisaient **zéro appel** depuis l'interface. Ils existaient,
étaient testés, appliquaient leurs règles — et n'existaient pas pour qui utilise le produit.

| Module | Avant | Après |
|---|---|---|
| `investors` | 0 route appelée | 8 routes appelées |
| `banking` | 0 | 0 |
| `ledger` | 0 | 0 |
| `finance-audit` | 0 | 0 |
| Coûts IA (`igini/usage`) | 0 route appelée | 2 routes appelées |

Le module investisseurs est branché des **deux côtés** : le porteur peut enregistrer,
l'investisseur peut lire. Comptabilité, banque et audit financier restent sans interface —
voir §7.

---

## 1. Espace Investisseur

`/investisseur` — complété sur les cinq points demandés.

| Demandé | Où |
|---|---|
| Portefeuille | Bandeau global : investi, récupéré, dividendes, projets, solde net |
| Investissements | Une ligne par projet, avec sa part détenue aujourd'hui |
| Dividendes | Par projet dans la ligne, et au détail dans l'historique |
| Participations | Section propre : chaque apport, sa date, la part accordée ce jour-là |
| Historique | Dépliable par projet, chargé à la demande et une seule fois |

**Deux manques comblés qui bloquaient tout le reste.**

*Se déclarer investisseur.* La route existait, aucun écran ne l'appelait : personne ne
pouvait devenir investisseur depuis l'interface. Un espace vide qui ne dit pas comment
cesser de l'être est une impasse. Le formulaire est là, avec ce qu'il fait — et ce qu'il ne
fait pas : « Cela n'engage rien et n'investit rien. »

*L'identifiant à communiquer.* Un porteur qui veut enregistrer un apport a besoin de
l'identifiant de l'investisseur. **Ignitux ne propose aucune recherche par email**, et c'est
délibéré : elle laisserait n'importe qui vérifier si une adresse appartient à un
investisseur. L'identifiant s'affiche dans l'espace de son porteur, avec un bouton pour le
copier — il se transmet parce que son porteur a décidé de le transmettre.

---

## 2. Tableau de bord financier

`/projects/[id]/finances` — accessible depuis la fiche projet.

Il vit **à part de la fiche projet**, qui faisait déjà 7 245 px. L'argent mérite son propre
écran : on n'y vient pas en passant.

Les six blocs demandés : financements reçus, investisseurs, répartition du capital,
historique, dividendes, rachats (le rachat progressif reste sur la fiche projet, où il
appartient au récit du projet plus qu'à sa comptabilité).

**Ce que le porteur peut enfin faire** : ouvrir son projet au financement, enregistrer un
apport, enregistrer un remboursement de capital, répartir un dividende. C'était tout le
module investisseurs, inaccessible sans écrire des requêtes HTTP à la main.

Quatre honnêtetés tenues à l'écran :

- **Deux notions de part, jamais confondues.** La section « Investisseurs » montre la part
  *accordée au moment de l'apport* ; la section « Répartition du capital » montre celle
  d'*aujourd'hui*. L'écran dit laquelle fait foi. Une dilution ultérieure n'aurait pas
  modifié la première.
- **Aucun avancement inventé.** Sans objectif de levée déclaré, pas de pourcentage : « sans
  cible déclarée, il n'y a pas de pourcentage d'avancement à afficher ».
- **Un écart de répartition est signalé, jamais normalisé.** 90 % au lieu de 100 % s'affiche
  tel quel : redistribuer l'écart reviendrait à décider à la place des personnes qui
  détiennent ces parts.
- **La part perpétuelle de 5 % se coche explicitement.** Pas de valeur par défaut : tous les
  projets ne sont pas entrés au capital selon le modèle 51/49, et prélever par défaut
  reviendrait à décider à la place du porteur.

---

## 3. Consommation IA

`/consommation-ia` — depuis la navigation et depuis Mon compte.

Analyses utilisées, analyses restantes, coût total, budget restant, détail par générateur,
et l'historique appel par appel avec modèle, jetons, durée et coût.

**Un plafond qu'on ne voit pas approcher est un refus qui tombe sans prévenir**, au moment
précis où la personne avait préparé son travail. L'écran avertit avant le mur.

Deux distinctions que cet écran refuse d'aplatir :

- **Le coût est dérivé, pas facturé.** Il est calculé depuis une grille tarifaire dont la
  date est affichée. Un montant sans la date de son tarif est invérifiable.
- **Un modèle hors grille donne « — », jamais 0.** Zéro dirait « gratuit » ; le tiret dit
  « on ignore combien ». Ce n'est pas la même information, et l'écran l'écrit :
  « Ce n'est pas "il reste de la marge", c'est "on ne sait pas". »

---

## 4. Facturation imprimable

`/facturation/[id]` — chaque document s'ouvre tel que le client le recevra.

Une facture qu'on ne peut pas envoyer est incomplète. Le document s'imprime, et
« Enregistrer au format PDF » est dans la boîte d'impression de tous les navigateurs
modernes.

**Pourquoi pas une bibliothèque PDF embarquée.** Elle ajouterait des centaines de
kilo-octets et une *seconde* mise en page à tenir à jour. Le jour où les deux divergeraient,
c'est le document envoyé au client qui serait faux. Une seule mise en page, celle qu'on voit
à l'écran.

Les styles d'impression retirent la navigation et les avertissements destinés au porteur :
ils n'ont rien à faire sur la feuille qui part. Le fond sombre du produit devient blanc —
l'imprimer viderait une cartouche et rendrait le texte illisible. Les marges sont posées par
`@page` : sans elles, la colonne de droite se fait rogner par la zone non imprimable de
l'imprimante, ce que la première capture d'essai a montré.

Un brouillon le dit, et le dit **à l'écran seulement** : « son numéro n'est pas définitif ».

---

## 5. Ce qui a été ajouté côté serveur, et pourquoi

Deux routes de lecture. Pas un moteur, pas une table.

| Route | Sans elle |
|---|---|
| `GET /projects/:id/financement` | L'écran de financement connaît le projet, pas le registre : il ne peut pas s'ouvrir. |
| `GET /igini/usage/historique` | Un total sans le détail n'est pas vérifiable : savoir qu'on a dépensé 3,40 € ne dit pas sur quoi. |

La première rend `financedProject: null` plutôt qu'un 404 quand le projet n'a jamais été
ouvert au financement : c'est l'état normal de la plupart des projets, et un 404 obligerait
l'écran à traiter une absence banale comme une panne.

---

## 6. Vérifié dans un vrai navigateur

Sur un cas réel semé pour l'occasion : 5 000 € placés dans « Ressourcerie du Val », 1 200 €
remboursés, 400 € de dividendes, 12 % du capital.

| Vérification | Résultat |
|---|---|
| Espace investisseur : identifiant, portefeuille, participations | oui |
| Montants justes (5 000 / 1 200 / 400 / 12 %) | oui |
| Historique dépliable, chargé une seule fois | oui |
| Tableau de bord financier : les six blocs | oui |
| Répartition 88 % / 12 % lue dans la table de capitalisation | oui |
| Consommation IA : utilisées, restantes, coût, grille datée | oui |
| Facture : client, désignation, 850 HT → 170 TVA → 1 020 TTC | oui |
| Navigation masquée à l'impression | oui |
| Aucun débordement horizontal à 390 px (3 écrans) | oui |
| Aucune erreur JavaScript, aucune 500 | oui |

Tests : **765 côté serveur**, **272 côté interface**. Tous verts.

Un défaut de lisibilité trouvé et corrigé en cours de route : les deux formulaires de saisie
se suivaient sans séparation et se lisaient comme un seul — on aurait rempli le montant du
haut et cliqué sur le bouton du bas. Chacun porte maintenant son titre.

---

## 7. Ce qui reste sans interface

- **Comptabilité** (`ledger`) — plan de comptes, écritures, balance. Zéro appel.
- **Banque** (`banking`) — comptes, rapprochement. Zéro appel.
- **Audit financier** (`finance-audit`) — les onze contrôles. Zéro appel ; seule la route
  par projet est exposée côté serveur.
- **CRM** — entreprises et échanges, que l'API gère et que l'écran n'offre pas.
- **Devis → facture** — un devis accepté se ressaisit encore à la main.

Et une limite de la facturation qui n'est pas un manque d'écran : Ignitux ne vérifie ni les
mentions obligatoires propres à une activité, ni un régime de TVA, ni les obligations de
facturation électronique. L'écran le dit à chaque document.
