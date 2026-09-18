# Vision, mission et méthode

## Vision, mission, devise

- **Vision** — accompagner une personne de l'idée jusqu'à la transmission de son savoir ou de son
  entreprise.
- **Mission** — « Nous servir »
- **Devise** — « La vérité avant tout »

## Méthode

La méthode a deux niveaux de granularité, qui ne se contredisent pas :

- **3 phases macro** — Découvrir → Construire → Transmettre
- **5 étapes opérationnelles**, telles qu'implémentées dans le produit (routes API, interface,
  base de données) — Analyser → Construire → Financer → Développer → Transmettre

**Hypothèse retenue** (à confirmer si elle est fausse) : Analyser correspond à Découvrir, et
Construire/Financer/Développer sont la décomposition opérationnelle de la phase macro Construire.
Transmettre est la même étape des deux côtés. Le code garde le nom "Analyser" (c'est celui qui
apparaît dans les routes, l'interface et les tests) plutôt que "Découvrir" tant que cette
équivalence n'est pas infirmée — renommer à travers tout le code, l'interface et les tests serait un
chantier à part, pas fait sans confirmation explicite que les deux termes désignent des choses
différentes.

## L'Étincelle

Le potentiel humain de chaque porteur de projet, mesuré à travers 5 scores : Étincelle,
Construction, Évolution, Transmission, Confiance. Implémentés dans
[`ScoringService`](../backend/src/igini/scoring/scoring.service.ts) — voir
[`decisions.md`](decisions.md#pas-de-score-fabriqué) pour la règle qui les rend honnêtes (`null`
plutôt qu'un chiffre inventé).

## IGINI

L'IA centrale d'IGNITUX — guide, assistant, analyste et coordinateur. Principe fondateur :
**l'IA conseille, l'humain décide**. C'est pour ça qu'il n'y a pas de moteur d'automatisation qui
exécute des tâches tout seul (voir [`decisions.md`](decisions.md#pas-de-moteur-dautomatisation)).

## One Brain, Multiple Regulations

Un noyau unique, avec des modules qui adaptent fiscalité/droit/comptabilité selon le pays (France,
Portugal, Suisse, Canada, Kenya…). **Pas commencé** — nécessite un pays cible et une source
réglementaire fiable avant tout code, pour ne pas présenter du contenu légal inventé comme fiable
(voir [`status.md`](status.md)).

## Offline First

Le système doit à terme fonctionner sans connexion, puis se synchroniser au retour de la connexion.
**Vision future, pas une condition du MVP** — explicitement écarté du périmètre actuel (voir
[`status.md`](status.md)) : c'est un chantier d'architecture lourd (stockage local, résolution de
conflits de synchronisation) qui n'a de sens qu'une fois le produit de base validé par de vrais
utilisateurs.
