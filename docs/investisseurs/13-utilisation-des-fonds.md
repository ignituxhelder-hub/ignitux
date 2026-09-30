# Utilisation des fonds

Ce document détaille comment un montant levé serait dépensé, poste par poste, en cohérence avec les
trois scénarios de `12-besoin-financement.md`. **Aucun pourcentage ni montant définitif n'est fixé
ici** : la répartition ci-dessous est une structure à remplir, pas une allocation décidée.

## Structure de répartition (à chiffrer avec le fondateur)

| Poste | Description | Part du montant total | Justification |
|---|---|---|---|
| Infrastructure technique | Hébergement, domaine, email, budget IA, paiement, monitoring | **[À DÉFINIR]** | Postes identifiés et chiffrés individuellement dans `docs/en-attente-paiement.md` |
| Juridique et conformité | Statuts, montage 51/49, RGPD formalisé, éventuelle revue réglementaire du module Financement & Investisseurs (voir `10-risques-et-reponses.md`) | **[À DÉFINIR]** | Aucun devis dans le dépôt ; à obtenir |
| Développement (recrutement ou sous-traitance) | Fusion des trois chantiers en worktree, suite de la roadmap Bible ch. 9 | **[À DÉFINIR]** | Dépend du choix : le fondateur seul, ou renfort |
| Rémunération du fondateur | Temps plein sur le projet | **[À DÉFINIR]** | Non présent dans le dépôt — décision personnelle du fondateur |
| Acquisition / marketing | Premiers canaux d'acquisition | **[À DÉFINIR]** | Aucune stratégie testée à ce jour, voir `09-concurrence.md` et le domaine 9 (acquisition clients) dans `04-dossier-investisseur.md` |
| Réserve / imprévu | Marge de sécurité | **[À DÉFINIR]** | Recommandé pour tout scénario, montant usuel à discuter |

## Séquencement recommandé (par étapes, pas par pourcentage figé)

1. **D'abord** : lever les blocages techniques identifiés (§1.13 du dossier principal) — hébergement,
   domaine, email. Coût faible (~30-60 €/mois), impact immédiat : rend la bêta publique possible.
2. **Ensuite** : trancher les décisions produit en attente qui ne coûtent rien en développement mais
   bloquent l'ouverture réelle — vérification d'email obligatoire ou non, budget IA à ouvrir, rôle
   des Gardiens (article 17).
3. **En parallèle** : faire trancher par un professionnel du droit le statut réglementaire du module
   Financement & Investisseurs, **avant** toute ouverture de ce module à de vrais investisseurs
   tiers — c'est un point bloquant identifié par cet audit, pas une option.
4. **Puis** : décider de la fusion des trois chantiers en worktree (chat IGINI, générateur Former,
   boutique en ligne) — ordre de priorité à définir par le fondateur selon la valeur perçue pour les
   premiers utilisateurs.
5. **Enfin, si le scénario le permet** : recrutement et acquisition.

## Ce que ce document ne fait pas

Il ne présente aucun tableau de dépenses en euros sur 12-24 mois : cela suppose un montant total
(scénario A, B ou C — voir `12-besoin-financement.md`) et des devis réels (juridique, recrutement)
qu'aucun document du dépôt ne fournit. Construire ce tableau avec des montants inventés produirait
un modèle financier qui semble précis mais qui ne l'est pas — contraire à la règle « aucun chiffre
non sourcé » de cet audit.
