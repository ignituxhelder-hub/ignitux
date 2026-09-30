# Audit Investor Readiness — IGNITUX

**Date de l'audit** : 30/09/2026.
**Méthode** : lecture directe du code (backend, frontend, configuration, CI), exécution réelle des
suites de tests unitaires backend et frontend, lecture intégrale de la Bible IGNITUX et de la
documentation interne existante, inspection de l'état Git réel du dépôt (commits, branches,
fichiers non commités). Aucun chiffre de marché, de revenu, d'utilisateur ou de traction n'a été
inventé. Voir `04-dossier-investisseur.md` pour le détail complet, preuve par preuve.

**Ce que cet audit n'a pas fait** : il n'a pas exécuté les ~250 tests de bout en bout (nécessitent
une base Postgres dédiée non montée pendant cet audit), il n'a pas ouvert l'application dans un
navigateur, il n'a pas vérifié les branches de travail isolées ligne par ligne (seulement leur
existence, leur ampleur et leurs messages de commit).

---

## 1. Où en est IGNITUX aujourd'hui ?

IGNITUX est une plateforme réelle et substantielle, pas une maquette : NestJS + Prisma + PostgreSQL
côté serveur, Next.js + React + TypeScript côté interface **[Code]**. Sur cette exécution du
30/09/2026 : **1204 tests unitaires backend** (1203 verts, 1 échec par timeout — voir §2) et
**499 tests unitaires frontend** (490 verts, 9 échecs par timeout) **[Test]**. La Bible (27/09/2026)
annonçait 1586 tests tous verts et environ 250 tests de bout en bout **[Bible]** — l'écart vient de
développements ajoutés depuis, actuellement non commités (voir §3).

Le produit couvre un périmètre large et cohérent avec sa vision : comptes et authentification,
gestion de projets multi-collaborateurs, cinq générateurs IA (Analyser, Construire, Financer,
Développer, Transmettre) actuellement **éteints par décision volontaire** (pas un bug), un moteur
« Constitution » qui bloque réellement certaines écritures en base, et des modules « argent »
complets en code : CRM, facturation, comptabilité en partie double, banque, financement de projet,
registre d'investisseurs, marketplace, conformité France **[Code], [Bible]**.

**Le point le plus important de cet audit** : l'état du dépôt Git est **fragmenté**. Il existe
aujourd'hui, en parallèle du travail visible sur la branche `main` :

- **6 commits sur `main` non poussés vers GitHub** **[Git]** ;
- **79 fichiers modifiés ou nouveaux sur `main`, non commités**, en place depuis plusieurs jours —
  dont l'intégralité du chantier « poste de travail » (bureau, barre des tâches, PWA installable) et,
  fait notable, **la Bible elle-même** (`docs/IGNITUX-la-bible.pdf` n'est pas versionnée) **[Git]** ;
- **trois branches de travail isolées (« worktrees »), jamais fusionnées dans `main`**, contenant
  chacune un chantier avancé et testé : un orchestrateur conversationnel pour IGINI (16 commits, a
  déjà passé une revue de sécurité/logique), un sixième générateur « Former » de recommandation de
  forme juridique (8 commits, développement TDD en cours), et une intégration Shopify complète pour
  une boutique en ligne (16 commits, a déjà passé une revue qui a corrigé deux failles de sécurité
  réelles) **[Git]**.

Concrètement : **le produit qu'un investisseur verrait en clonant `main` aujourd'hui est en retrait
par rapport à ce qui existe réellement sur la machine de développement.** C'est une bonne nouvelle
sur le fond (plus de valeur construite que ce que `main` seul montre) et un risque opérationnel réel
sur la forme (rien de tout cela n'est sauvegardé sur GitHub, rien n'est passé par la CI, une panne de
poste de travail ferait perdre un travail non trivial). Voir §8 et `10-risques-et-reponses.md`.

## 2. Qu'est-ce qui est réellement démontré ?

Démontré = code existant, couvert par des tests automatisés qui passent, sur `main`.

- **Comptes, authentification, projets, collaboration, RGPD** (export, suppression) — solide,
  couvert par des tests **[Code], [Bible]**.
- **Le moteur constitutionnel** — 24 articles, **12 appliqués par 16 règles exécutables** branchées
  sur de vrais points d'écriture (comptabilité, financement, mémoire, workflow…), vérifié en lisant
  intégralement `constitution-articles.ts` et `constitution-rules.ts` le 30/09/2026. Ce chiffre
  confirme exactement celui de la Bible **[Code confirme Bible]**.
- **L'interrupteur IA** — les 5 générateurs sont coupés en un point unique, avant tout appel réseau ;
  vérifié dans le code (`generators-availability.ts`) **[Code]**.
- **Le démarrage hors connexion (article 16, Offline First)** — contrairement à ce que dit la Bible
  (« l'application ne démarre pas hors ligne »), le code montre qu'un service worker fonctionnel
  existe et est **commité depuis le 24/09/2026**, et la configuration d'intégration continue locale
  (non commitée, voir §3) inclut un test réel dans un navigateur Chromium qui coupe le réseau et
  vérifie que l'application s'ouvre quand même **[Code contredit Bible — voir `04-dossier-investisseur.md` §2]**.
- **Les modules « argent »** (CRM, facturation, comptabilité, banque, financement, investisseurs,
  marketplace) existent en code, avec séparation stricte des caisses et tests dédiés **[Code]**.
- **Aucun encaissement réel n'existe** : aucune intégration Stripe/Mollie/autre, le champ
  `provider_ref` de la table `subscriptions` n'est relié à aucun webhook **[Doc: en-attente-paiement.md]**.
- **Aucun utilisateur réel, aucun revenu, aucune traction commerciale** à ce jour — voir
  `08-traction-et-validation.md`. Ce point n'est adouci nulle part dans ce dossier.

## 3. Qu'est-ce qui manque ?

Trois catégories bien distinctes, à ne pas confondre :

**A. Manque = décision du fondateur, pas du code** [Bible, ResteAFaire] : hébergement, domaine,
fournisseur d'email, budget IA à ouvrir, rôle des « Gardiens » (article 17), montage juridique du
51/49, fournisseur de paiement, SIRET/immatriculation.

**B. Manque = intégration de travail déjà fait** : le chantier « poste de travail »/PWA (non commité
sur `main`), l'orchestrateur conversationnel IGINI, le générateur « Former », la boutique Shopify
(ces trois derniers dans des worktrees isolées, jamais mergées, jamais passées en CI sur `main`).

**C. Manque réellement, au sens où rien n'existe** : encaissement réel, structure juridique
d'entreprise documentée dans le dépôt, cap table, tout document de valorisation, toute preuve de
traction commerciale, une analyse de marché sourcée, une revue juridique du statut réglementaire du
module Financement & Investisseurs (risque non traité à ce jour — voir `10-risques-et-reponses.md`).

## 4. Peut-on commencer à contacter des investisseurs ?

**Oui, pour une prise de contact exploratoire et non structurée — pas encore pour une levée
structurée.** Le produit est réel, le niveau d'exigence technique et éthique (traçabilité, refus des
chiffres inventés, séparation des caisses) est un vrai argument différenciant et démontrable. Mais
sans montant recherché, sans structure juridique clarifiée, sans traction et sans data room minimale,
une discussion structurée de financement ne peut pas aboutir. Détail objectif dans
`23-go-no-go-investisseurs.md`.

## 5. Quels documents sont déjà disponibles ?

`docs/IGNITUX-la-bible.pdf`, `docs/architecture.md`, `docs/modele-economique.md`,
`docs/vision.md`, `PRICING.md`, `docs/reste-a-faire.md`, `docs/registre-de-traitements.md`, et
l'ensemble des audits techniques internes (`docs/status.md`, `docs/audit-ouverture.md`,
`docs/validation-finale.md`, `docs/rapport-final.md`). Aucun document commercial, juridique ou
financier destiné à un investisseur n'existait avant ce dossier.

## 6. Quels documents doivent être créés ?

Ceux que ce dossier vient de produire (`docs/investisseurs/`) couvrent le narratif, le produit, les
risques et la prospection. Restent à créer, **et cela ne peut être fait que par toi ou avec un
professionnel** : statuts de société (si non encore faits), cap table, tout document contractuel du
montage 51/49, un modèle financier chiffré réel (le squelette est dans `13-utilisation-des-fonds.md`
et `05-modele-economique.md`, les chiffres sont à toi).

## 7. Quelles informations le fondateur doit fournir ?

Liste complète et priorisée dans `22-informations-a-fournir-par-le-fondateur.md`. Les plus
bloquantes (P0) : montant recherché, structure juridique actuelle, répartition du capital,
existence ou non de premiers utilisateurs/revenus, décision sur la fusion des trois chantiers en
worktree avec `main`.

## 8. Quels sont les principaux risques/questions ?

1. **Fragmentation du dépôt** (§1) — risque technique le plus concret et le plus immédiatement
   actionnable : rien n'empêche de le résoudre avant le premier rendez-vous.
2. **Statut réglementaire du module Financement & Investisseurs** — faire circuler de l'argent
   d'investissement entre porteurs de projet et investisseurs, avec parts, dividendes et rachat,
   touche potentiellement à une activité réglementée (intermédiation en financement participatif,
   conseil en investissement) en France. Aucun document du dépôt ne traite cette question. **C'est la
   question juridique la plus sérieuse de tout cet audit** — voir `10-risques-et-reponses.md`.
3. **Aucune traction, aucun revenu** — à assumer frontalement, jamais à maquiller.
4. **Dépendance à un seul fondateur** — `docs/decisions.md` et la Constitution (article 23,
   « Indépendance du Fondateur ») évoquent le sujet sans qu'aucun dispositif concret n'existe.
5. **Coût IA et grille tarifaire non recalculés** sur les prix réellement en vigueur (9,90 € /
   59,00 €) — le plafond de 2 €/mois d'IA par utilisateur payant a été calculé sur une hypothèse de
   prix à 20 €/mois qui ne correspond à aucune offre réelle. Voir `05-modele-economique.md`.

## 9. Quelle est la prochaine étape concrète ?

Dans l'ordre, avant tout premier rendez-vous structuré :

1. **Décider du sort des trois chantiers en worktree** (fusionner, différer, ou abandonner) et
   pousser les 6 commits en attente sur `main` — un après-midi de décision et de Git, pas un
   chantier de développement.
2. **Faire trancher par un professionnel du droit** la question réglementaire du §8.2.
3. **Décider du montant recherché et de la structure juridique** — remplir
   `22-informations-a-fournir-par-le-fondateur.md`, section P0.
4. **Relire `23-go-no-go-investisseurs.md`** et cocher ce qui peut l'être avant de fixer un premier
   rendez-vous.

Ce dossier ne dit pas « IGNITUX est prêt ». Il dit : *voici ce qui est prêt* (le produit, sa
rigueur technique, sa cohérence), *voici ce qui ne l'est pas* (structure, chiffres, traction,
intégration du travail existant), *voici ce que tu peux envoyer aujourd'hui* (le one-pager, en étant
transparent sur le stade), et *voici ce que tu dois décider toi-même* (§8.2, le montant, la
structure).
