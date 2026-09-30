# Dossier investisseur IGNITUX — index

Ce dossier a été construit le **30/09/2026** à partir d'un audit réel du dépôt (code lu, tests exécutés,
documentation existante croisée) et de la Bible IGNITUX (`docs/IGNITUX-la-bible.pdf`, édition du
27/09/2026). Aucun chiffre de marché, de revenu ou de traction n'y est inventé : tout ce qui n'est pas
vérifiable dans le code ou dans un document existant est marqué **[À DÉFINIR]** ou **[À VÉRIFIER]**.

**Commence ici** : [`00-AUDIT-INVESTOR-READINESS.md`](00-AUDIT-INVESTOR-READINESS.md) — le résumé
exécutif de tout l'audit, avec réponse directe à « peut-on démarcher des investisseurs aujourd'hui ».

## Comment lire ce dossier

| Si tu veux... | Lis |
|---|---|
| Le résumé de l'audit et la décision à prendre | `00-AUDIT-INVESTOR-READINESS.md` |
| Un pitch en 2 minutes | `01-resume-investisseur.md`, `16-pitch-oral.md` |
| Un document à envoyer par email | `02-investor-one-pager.md` |
| Le contenu d'un deck de présentation | `03-pitch-deck.md` |
| Le dossier complet, avec toutes les preuves | `04-dossier-investisseur.md` |
| Le modèle économique et ses incohérences à trancher | `05-modele-economique.md` |
| La feuille de route | `06-roadmap.md` |
| L'architecture technique et sa défendabilité | `07-technologie.md` |
| Ce qui est prouvé vs ce qui ne l'est pas | `08-traction-et-validation.md` |
| La concurrence (largement à compléter par toi) | `09-concurrence.md` |
| Les risques et comment y répondre en entretien | `10-risques-et-reponses.md` |
| Les questions difficiles à anticiper | `11-faq-investisseur.md` |
| Combien lever, et pourquoi | `12-besoin-financement.md` |
| Comment cet argent serait dépensé | `13-utilisation-des-fonds.md` |
| La liste des documents à préparer pour une due diligence | `14-data-room-index.md` |
| Ce que TOI tu dois préparer avant un rendez-vous | `15-checklist-fondateur.md` |
| Un script pour un pitch oral | `16-pitch-oral.md` |
| Qui contacter et comment | `17-strategie-prospection.md` à `21-relance.md` |
| Ce qu'il te manque encore pour être crédible | `22-informations-a-fournir-par-le-fondateur.md` |
| Si tu peux commencer à prospecter maintenant | `23-go-no-go-investisseurs.md` |

## Ce que ce dossier n'est PAS

- Ce n'est pas une valorisation d'entreprise.
- Ce n'est pas un business plan chiffré sur 3 ans (les données pour le construire manquent — voir
  le fichier 22).
- Ce n'est pas une promesse que le produit est fini : la Bible elle-même distingue ce qui est
  démontré de ce qui est partiel, et ce dossier reprend cette distinction sans l'adoucir.
- Ce n'est pas un avis juridique sur le montage 51/49 ni sur le statut réglementaire du module
  Financement & Investisseurs — un point d'attention sérieux, détaillé dans `10-risques-et-reponses.md`.

## Méthode et sources

Chaque affirmation de ce dossier est rattachée à une preuve :

| Étiquette | Signifie |
|---|---|
| **[Code]** | vérifié en lisant le code source le 29-30/09/2026 |
| **[Test]** | vérifié en exécutant réellement une suite de tests le 29-30/09/2026 |
| **[Bible]** | tiré de `docs/IGNITUX-la-bible.pdf`, édition du 27/09/2026 |
| **[Doc]** | tiré d'un document du dépôt (nommé explicitely) |
| **[Git]** | vérifié par l'état réel du dépôt Git (commits, branches, fichiers non commités) |
| **[Fondateur]** | donnée que seul Helder peut fournir — jamais inventée |
| **[Hypothèse]** | déduction raisonnable, explicitement marquée comme telle, jamais présentée comme un fait |

Voir `04-dossier-investisseur.md` pour le détail complet de l'audit, y compris la méthode et les
limites de cet audit (notamment : pas d'exécution des tests de bout en bout, pas de vérification
navigateur par cet audit lui-même).
