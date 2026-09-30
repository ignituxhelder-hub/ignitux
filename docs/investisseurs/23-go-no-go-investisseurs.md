# Go/No-Go investisseurs — checklist objective

Pas un verdict global arbitraire : une liste vérifiable, séparée en deux usages différents.

## Checklist

- [x] One-pager prêt (`02-investor-one-pager.md`) — avec montant de financement encore à compléter
- [x] Pitch deck prêt en contenu (`03-pitch-deck.md`) — mise en forme visuelle restant à faire
- [ ] Démo fonctionnelle accessible (pas seulement en local) — bloquée par l'absence d'hébergement
- [x] État produit vérifié — audit réalisé le 30/09/2026, code lu et tests exécutés réellement
- [ ] Chiffres vérifiés et cohérents — **point ouvert** : incohérence du plafond de coût IA non
      tranchée (`05-modele-economique.md`)
- [ ] Besoin financier défini — montant non fixé (`12-besoin-financement.md`)
- [ ] Utilisation des fonds définie — dépend du montant (`13-utilisation-des-fonds.md`)
- [ ] Structure juridique vérifiée — statut inconnu de ce dépôt, à confirmer par le fondateur
- [ ] Cap table vérifiée — n'existe pas dans le dépôt
- [x] FAQ préparée (`11-faq-investisseur.md`)
- [ ] Data room minimale prête — index construit (`14-data-room-index.md`), mais plusieurs
      documents qu'il référence n'existent pas encore (statuts, cap table, avis juridique)
- [ ] Dépôt Git consolidé (commits poussés, chantiers en worktree tranchés) — **non fait** au
      30/09/2026
- [ ] Statut réglementaire du module Financement & Investisseurs clarifié — **non fait**

## Peut commencer la prospection (contacts exploratoires, non structurés)

**Oui, dès aujourd'hui**, pour :
- des échanges informels avec des business angels ou des profils spécialisés IA/SaaS, en étant
  transparent sur le stade (pas de traction, produit en développement actif) ;
- des candidatures à des incubateurs ou accélérateurs, dont le programme peut justement aider à
  combler les manques identifiés ci-dessus (structure juridique, montant, traction) ;
- des demandes d'avis ou de retours, sans objet de financement immédiat.

Les documents `01`, `02`, `11`, `16`, `18`, `19`, `20` sont utilisables tels quels pour ce niveau de
contact, en gardant les mentions `[À DÉFINIR]` visibles plutôt que de les improviser à l'oral.

## Doit être prêt avant un investissement réel (terme sheet, due diligence engagée)

**Non — pas avant que ces points soient réglés :**
1. Statut réglementaire du module Financement & Investisseurs clarifié par un professionnel du
   droit (`10-risques-et-reponses.md`, point 1) — c'est le point le plus bloquant identifié par cet
   audit pour une levée engageant réellement des investisseurs sur ce module.
2. Structure juridique de l'entreprise établie et cap table documentée.
3. Montant recherché et utilisation des fonds fixés avec des données réelles, pas des `[À DÉFINIR]`.
4. Dépôt Git consolidé — une due diligence technique découvrirait autrement la fragmentation
   actuelle (6 commits non poussés, 79 fichiers non commités, 3 branches non fusionnées), ce qui
   nuirait à la crédibilité alors que le problème se résout en quelques heures.
5. Incohérence du plafond de coût IA tranchée, pour ne pas présenter un modèle économique qui ne
   résiste pas à une question de suivi.

**En résumé** : la prospection exploratoire peut commencer maintenant, sur la base de la solidité
technique réelle du produit. Une levée structurée, avec engagement financier d'un investisseur, ne
devrait pas être scellée avant que les cinq points ci-dessus soient traités — ce ne sont pas des
mois de travail, mais ce sont des décisions et des vérifications qui n'ont, à la date de cet audit,
pas encore été faites.
