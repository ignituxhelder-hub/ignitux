# FAQ investisseur — questions difficiles

Pour chaque question : réponse courte, réponse développée, preuve, information manquante.

## 1. Pourquoi IGNITUX ?

**Courte** : parce qu'accompagner un projet de bout en bout (idée → construction → financement →
développement → transmission) demande aujourd'hui de jongler entre des outils dispersés.
**Développée** : IGNITUX unifie ce parcours autour d'IGINI, avec des modules concrets pour l'argent
et la conformité, sous un principe de confiance vérifiable dans le code (aucun chiffre inventé,
aucune écriture financière qui mélange deux comptabilités).
**Preuve** : moteur constitutionnel exécutable **[Code]**.
**Manque** : validation par de vrais utilisateurs.

## 2. Pourquoi maintenant ?

**Courte** : l'IA généraliste est devenue accessible, mais sans structure ni garde-fous.
**Développée** : le moment permet de construire un accompagnement structuré au-dessus de modèles
comme Claude, avec des garanties que les assistants génériques n'offrent pas.
**Preuve** : `backend/src/igini/claude/` — usage structuré de Claude Opus 5 avec journalisation
complète des coûts **[Code]**.
**Manque** : aucune donnée de marché sourcée sur le "momentum" **[À DÉFINIR]**.

## 3. Pourquoi vous ?

**Courte** : **[À DÉFINIR — Fondateur]** — cette réponse ne peut venir que du fondateur (parcours,
expertise, motivation).
**Preuve** : la rigueur du produit lui-même (tests, revues de sécurité internes) peut servir de
preuve indirecte de la capacité d'exécution.
**Manque** : présentation du parcours du fondateur.

## 4. Pourquoi quelqu'un utiliserait IGNITUX plutôt que ChatGPT/Claude/autres outils ?

**Courte** : parce qu'un chat généraliste ne tient pas de mémoire de projet structurée, ne gère pas
la facturation ou la comptabilité, et n'offre aucune garantie contre les réponses inventées.
**Développée** : IGNITUX combine l'IA à des modules métiers réels et à un moteur qui refuse
structurellement certains types d'erreurs (chiffres inventés, mélange de comptabilités) — un chat
généraliste ne peut pas offrir cette garantie par construction.
**Preuve** : règles `score-sans-source`, `provenance-usurpee`, `caisses-separees` dans
`backend/src/constitution/constitution-rules.ts` **[Code]**.
**Manque** : preuve d'usage réel comparatif.

## 5. Quelle est votre différence ?

Voir question 4 et `07-technologie.md`. **Manque** : positionnement concurrentiel sourcé
(`09-concurrence.md`).

## 6. Qui paie ?

**Courte** : le porteur de projet, via un abonnement mensuel unique à 20,00 €, qui comprend
l'évaluation de financement (vendue 99,00 € à part avant le 10/10/2026).
**Preuve** : `backend/src/offres/offres-catalogue.ts` **[Code]**.
**Manque** : aucun payeur réel à ce jour.

## 7. Pourquoi paierait-il ?

**Courte** : pour débloquer les cinq générateurs IA et, à partir de l'offre Construction, les outils
de gestion complets (comptabilité, facturation, banque, financement).
**Manque** : validation que ce découpage correspond à une volonté de payer réelle — non testé
auprès d'utilisateurs.

## 8. Comment acquérir les premiers clients ?

**Courte** : **[À DÉFINIR — Fondateur]**. Aucune stratégie d'acquisition testée n'existe dans le
dépôt.
**Manque** : hypothèse de premier canal, budget, cible précise.

## 9. Quelle est la taille du marché ?

**Courte** : **[À DÉFINIR]** — aucune donnée sourcée dans le dépôt.
**Manque** : tout. Ne pas répondre avec un chiffre non sourcé.

## 10. Qui sont les concurrents ?

Voir `09-concurrence.md` — catégories identifiées, pas de cartographie chiffrée à ce jour.

## 11. Qu'est-ce qui est réellement construit ?

**Courte** : un produit complet en code — comptes, projets, IGINI (5 générateurs), moteur
constitutionnel, CRM, facturation, comptabilité, banque, financement, investisseurs, conformité
France, communauté, marketplace.
**Preuve** : lecture directe du code et exécution des tests le 29-30/09/2026 **[Code, Test]**.
**Manque** : rien à ajouter — voir `04-dossier-investisseur.md` pour le détail complet.

## 12. Qu'est-ce qui ne l'est pas ?

**Courte** : aucun encaissement réel, générateurs IA désactivés, pas d'hébergement public, pas de
fournisseur d'email réel, rôle des Gardiens non codé, trois chantiers avancés non fusionnés dans
`main`.
**Preuve** : voir `04-dossier-investisseur.md` §1.

## 13. Pourquoi les générateurs IGINI sont-ils actuellement désactivés ?

**Courte** : décision de budget IA en attente, pas un problème technique.
**Développée** : le verrou est posé volontairement, avant tout appel réseau, pour qu'aucune dépense
ne soit possible tant que le budget n'est pas décidé.
**Preuve** : `backend/src/igini/claude/generators-availability.ts` **[Code]**.
**Manque** : décision du fondateur sur le budget à ouvrir.

## 14. Quel est le coût IA ?

**Courte** : mesuré à environ 0,05 € par génération en moyenne, 0,35 € pour un pipeline complet
(les cinq générateurs une fois chacun).
**Preuve** : mesure réelle sur 55 appels, `PRICING.md`, Bible chapitre 3 **[Bible, Pricing]**.
**Attention** : le plafond de 2 €/mois annoncé comme « 10 % du prix » ne correspond à aucune offre
réelle actuelle — voir `05-modele-economique.md`, à clarifier avant de citer ce taux.

## 15. Comment protégez-vous les données ?

**Courte** : export RGPD complet, aperçu de suppression, suppression de compte avec mot de passe
requis, registre de traitements tenu à jour.
**Preuve** : `backend/src/users/user-data.service.ts`, `docs/registre-de-traitements.md` **[Code,
Doc]**.
**Manque** : pas de page de politique de confidentialité publique liée depuis l'application à ce
jour (seul un `.docx` privé existe) **[ResteAFaire]**.

## 16. Comment fonctionne la Constitution ?

**Courte** : 24 articles, dont 12 sont appliqués par 16 règles exécutables qui bloquent réellement
certaines écritures en base.
**Preuve** : lecture intégrale du code le 30/09/2026, chiffres confirmés **[Code]**.
**Manque** : les articles 16 (Offline First — en réalité fonctionnel, voir §1.7 du dossier
principal) et 17 (Les Gardiens — réellement absent) restent `declared`.

## 17. Comment fonctionne le modèle de participation ?

**Courte** : le porteur de projet reste majoritaire (règle `majorite-du-porteur`, bloquante). La
structure de départ actuelle est 51 % porteur / 49 % IGNITUX, mais c'est une valeur de départ propre
à chaque accord, pas une règle fixe. La part d'IGNITUX ne peut que baisser, par paliers validés par
IGNITUX, sans aucune règle de temps, jusqu'à 0 %. À ce moment seulement, IGNITUX conserve 5 % des
dividendes effectivement distribués (ce n'est pas une part de capital), et le porteur garde l'accès à
l'écosystème IGNITUX selon son accord.
**Preuve** : `backend/src/participation/`, `backend/src/constitution/constitution-rules.ts`,
`docs/decisions.md` (« La participation d'IGNITUX ») **[Code, Doc]**.
**Manque** : **aucun contrat juridique généré** pour ce modèle à ce jour, et le droit sur les
dividendes n'a pas été relu par un juriste — c'est un suivi, pas un montage juridique **[Status]**.
Voir aussi le point réglementaire de `10-risques-et-reponses.md`.

## 18. Quels sont les risques juridiques ?

Voir `10-risques-et-reponses.md`, point 1 (statut réglementaire du module Financement &
Investisseurs) — le plus important identifié par cet audit.

## 19. Pourquoi investir maintenant ?

**Courte** : **[À DÉFINIR — Fondateur]**. Cet audit ne peut pas répondre à la place du fondateur sans
inventer une justification.
**Élément factuel disponible** : le produit a atteint un niveau de maturité technique rare pour son
stade (moteur constitutionnel exécutable, CI mature, plusieurs chantiers déjà avancés), ce qui peut
réduire le risque d'exécution perçu par un investisseur — mais ce n'est pas en soi une raison
d'investir « maintenant » plutôt que plus tard.

## 20. Quelle est la vision à 5 ans ?

**Courte** : devenir un système d'exploitation d'entreprise piloté par IGINI, avec une adaptation
réglementaire par pays.
**Preuve** : Bible, chapitre 9, feuille de route détaillée jusqu'en 2030 **[Bible]**.
**Manque** : hypothèses de croissance chiffrées (utilisateurs, revenu) — non disponibles sans
traction réelle.

## 21. Que permettra précisément l'investissement ?

**Courte** : **[À DÉFINIR]** — dépend du scénario retenu, voir `12-besoin-financement.md` et
`13-utilisation-des-fonds.md`.

## 22. Que se passe-t-il si le financement n'arrive pas ?

**Courte** : **[À DÉFINIR — Fondateur]**. Élément factuel : les blocages de mise en bêta
(hébergement, domaine, email) représentent un coût mensuel faible (~30-60 €/mois), ce qui signifie
qu'une non-levée ne bloque pas nécessairement une première mise en ligne modeste, contrairement à un
scénario d'accélération.
