# Documentation Ignitux

Ce dossier centralise la documentation qui ne vit pas déjà à côté du code qu'elle décrit.

- [`vision.md`](vision.md) — vision, mission, devise, méthode, l'Étincelle, IGINI, One Brain
  Multiple Regulations, Offline First : les fondations, et ce qui en découle concrètement dans le
  code aujourd'hui.
- [`architecture.md`](architecture.md) — comment le projet est construit : stack, découpage en
  modules, modèle d'accès (propriétaire / collaborateur / communauté), mémoire commune entre les
  étapes IGINI.
- [`status.md`](status.md) — état réel du projet : ce qui est complet, partiel, ou totalement absent,
  et pourquoi. Mis à jour à chaque changement notable plutôt que reconstruit de mémoire.
- [`decisions.md`](decisions.md) — les choix volontaires qui limitent le périmètre actuel (pas
- [outillage.md](outillage.md) — audit des outils : ce qui existe, ce qui manque, ce dont le projet n'a pas besoin
  d'automatisation, pas de scores fabriqués, pas d'offline-first…) et la raison de chacun.

La documentation propre à un module reste à côté de son code :
[`backend/src/igini/README.md`](../backend/src/igini/README.md) documente IGINI (les 5 générateurs
et les 4 moteurs transverses) en détail.

Le [`README.md`](../README.md) à la racine du dépôt reste le point d'entrée : installation,
fonctionnalités, lancement en local.
