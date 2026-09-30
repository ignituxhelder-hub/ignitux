# Risques et réponses

Classés par gravité perçue pour une discussion investisseur, pas par ordre du dépôt.

## 1. Risque juridique/réglementaire — statut du module Financement & Investisseurs (I)

**Le risque** : ce module organise, pour de l'argent réel, des apports de porteurs et d'investisseurs
dans des projets, une répartition de parts, le versement de dividendes, et des conditions de rachat
progressif **[Bible, Code — vérifié le 30/09/2026]**. En France, une activité qui met en relation des
investisseurs et des porteurs de projets pour du financement, ou qui gère des titres/parts pour le
compte de tiers, peut relever d'un statut réglementé (par exemple, selon la forme exacte de
l'activité : intermédiaire en financement participatif, conseiller en investissements participatifs,
ou un statut plus large de prestataire de services d'investissement). **Aucun document du dépôt ne
traite cette question**, et cet audit n'a trouvé trace d'aucune revue juridique sur ce point
précis.

**Ce que cela ne veut PAS dire** : cela ne veut pas dire qu'IGNITUX est en infraction — le module
pourrait très bien être conçu pour rester un simple outil de suivi entre les mains du porteur de
projet (registre, pas intermédiation active), ce qui changerait complètement l'analyse. C'est
précisément la question qu'un professionnel du droit doit trancher.

**Réponse à donner en entretien** : « Nous avons identifié ce point nous-mêmes lors d'un audit
interne et nous engageons une revue avec un professionnel du droit avant toute ouverture du module à
des investisseurs tiers réels. » C'est une réponse qui inspire confiance ; l'absence de réponse, ou
une réponse improvisée, ne le serait pas.

**Action recommandée** : faire trancher ce point **avant** tout rendez-vous où ce module serait
présenté comme opérationnel pour de vrais investisseurs.

## 2. Risque technique — fragmentation du dépôt (H)

**Le risque** : 6 commits non poussés, 79 fichiers non commités sur `main` (dont la Bible elle-même
et plusieurs documents de référence), et trois branches de travail avancées jamais fusionnées
**[Git, vérifié le 30/09/2026]**. Une panne matérielle ou une erreur de manipulation pourrait faire
perdre un travail non trivial, non sauvegardé sur GitHub.

**Réponse à donner en entretien** : ce point ne devrait idéalement pas se poser en entretien, parce
qu'il devrait être résolu avant — c'est une opération de quelques heures (commit, push, décision de
fusion), pas un chantier de développement. S'il est soulevé : « Nous travaillons avec des branches
isolées pour tester chaque fonctionnalité avant intégration ; la consolidation est planifiée. »

**Action recommandée** : traiter avant tout rendez-vous structuré — voir recommandation n°1 de
`00-AUDIT-INVESTOR-READINESS.md`.

## 3. Risque commercial — aucune traction, aucun revenu (J)

**Le risque** : le produit n'a aucun utilisateur ni revenu réel à ce jour.

**Réponse à donner en entretien** : assumer frontalement (voir `08-traction-et-validation.md`),
mettre en avant la maturité technique comme preuve de sérieux d'exécution, présenter un plan concret
et réaliste de mise en bêta (les blocages sont des achats simples, pas du développement).

## 4. Risque de dépendance au fondateur unique (H, J)

**Le risque** : `docs/decisions.md` et l'article constitutionnel 23 (« Indépendance du Fondateur »)
évoquent le sujet, mais aucun dispositif concret de continuité n'existe si le fondateur devenait
indisponible **[Code — article 23 reste `declared`, pas `enforced`]**.

**Réponse à donner en entretien** : reconnaître le point, indiquer si un recrutement ou un
conseiller est envisagé **[À DÉFINIR — Fondateur]**.

## 5. Risque produit — décisions en attente qui bloquent l'usage réel (G)

Vérification d'email non obligatoire, budget IA à ouvrir, rôle des « Gardiens » non défini, fournisseur
d'email non choisi **[Bible, ResteAFaire]**. Ce ne sont pas des inconnues techniques : ce sont des
décisions en attente, identifiées précisément, avec leur coût et leur impact déjà documentés dans le
dépôt. C'est un signe de rigueur (le produit ne fait pas semblant d'avoir tranché), à condition de
les présenter comme telles.

## 6. Risque de cohérence du modèle économique (J)

Le plafond de coût IA (2 €/mois) a été calculé sur un prix de référence (20 €/mois) qui ne
correspond à aucune des offres réellement lancées (9,90 € et 59,00 €) — détail dans
`05-modele-economique.md`. Risque : une question précise d'investisseur sur ce chiffre découvrirait
l'incohérence en direct. **Trancher avant toute présentation chiffrée du modèle économique.**

## 7. Risque de conformité internationale (F, I)

« One Brain, Multiple Regulations » n'a pas commencé — aucun pays autre que la France n'a de contenu
de conformité, faute de sources officielles identifiées, décision assumée pour ne rien inventer
**[Bible]**. Ce n'est pas un risque immédiat (le produit ne prétend pas couvrir d'autres pays) mais
limite l'argument d'expansion internationale tant qu'aucune source n'est identifiée.

## 8. Risque de protection de la propriété intellectuelle (G)

Aucune trace de dépôt de marque ou de protection formelle dans le dépôt — **[À DÉFINIR — Fondateur]**.
