# Traction et validation — sans rien enjoliver

Ce document applique strictement la règle « aucune fausse traction, aucun chiffre inventé ». S'il
paraît sévère, c'est volontaire : c'est le document qui protège le fondateur d'une question à
laquelle il n'aurait pas de réponse solide en rendez-vous.

## Traction commerciale : aucune

- **Utilisateurs réels** : 0 confirmé par le dépôt.
- **Revenu** : 0 — aucun encaissement réel n'existe, aucun fournisseur de paiement n'est branché
  **[Doc: en-attente-paiement.md]**.
- **Rétention, activation, conversion** : non mesurables sans utilisateurs.
- **Testeurs** : la documentation interne mentionne une session prévue avec deux testeurs
  (`docs/status.md`, 20/09/2026) mais **aucun retour de cette session n'est documenté dans le dépôt
  actuel** — **[À VÉRIFIER auprès du fondateur]** : cette session a-t-elle eu lieu, et si oui, quels
  retours en sont sortis ?

**Ne jamais présenter ce point autrement.** Un investisseur qui pose une question directe sur les
utilisateurs doit recevoir cette réponse, pas une reformulation optimiste.

## Ce qui EST validé, et qui constitue une forme différente de preuve

Ce n'est pas de la traction commerciale, mais c'est une validation réelle et vérifiable :

- **Couverture de test substantielle et exécutée réellement** : 1204 tests backend + 499 tests
  frontend exécutés le 29-30/09/2026, grande majorité verte (détail des 10 échecs — tous des
  timeouts — dans `07-technologie.md`) **[Test]**.
- **Vérification de bout en bout contre une vraie base de données** : environ 250 tests, selon la
  Bible (non ré-exécutés par cet audit) **[Bible]**.
- **Vérification navigateur réelle en intégration continue** pour le démarrage hors ligne et
  l'installabilité (Chromium, dans `.github/workflows/ci.yml` — voir la nuance sur l'état commité de
  ce fichier dans `04-dossier-investisseur.md` §1.10) **[Code]**.
- **Mesure réelle du coût IA** sur 55 appels effectifs, pas une estimation théorique **[Bible,
  Pricing]**.
- **Trois cycles de revue interne documentés** dans les branches de travail isolées, dont deux ont
  identifié et corrigé des failles de sécurité réelles avant toute mise en production (voir
  `04-dossier-investisseur.md` §1.11) — c'est une preuve de rigueur d'ingénierie, présentable comme
  telle.

## Comment présenter honnêtement ce point à un investisseur

« Nous n'avons pas encore d'utilisateurs ni de revenu. Ce que nous avons, c'est un produit construit
avec un niveau de rigueur technique inhabituel à ce stade — plus de 1700 tests automatisés, un moteur
qui empêche structurellement certaines erreurs coûteuses (mélange de comptabilités, chiffres
inventés), et des cycles de revue de sécurité déjà menés sur les prochains chantiers. » C'est un
argument sur la **qualité d'exécution**, pas sur la **traction** — les deux ne doivent jamais être
confondus dans un pitch.

## Ce qu'il faut construire avant de pouvoir remplir ce document autrement

1. Lever les blocages de mise en ligne (hébergement, domaine, email — voir `12-besoin-financement.md`).
2. Ouvrir une bêta, même restreinte.
3. Documenter systématiquement les retours (ce qui n'a, à notre connaissance du dépôt, jamais été
   fait de façon structurée jusqu'ici).
