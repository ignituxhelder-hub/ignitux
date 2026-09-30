# Dossier investisseur — IGNITUX

Document de référence de cet audit. Les autres fichiers du dossier résument ou reformatent ce qui
est établi ici ; en cas de doute sur un chiffre, c'est ce document qui fait foi.

**Grille de classification utilisée pour chaque élément audité :**

| Code | Signification |
|---|---|
| A | Fonctionnel et démontré (code + test qui passe + preuve d'exécution réelle) |
| B | Fonctionnel mais partiellement démontré (code + test, jamais vérifié en conditions réelles/navigateur) |
| C | Codé mais désactivé |
| D | Partiellement développé |
| E | Concept / documentation uniquement |
| F | Dépendance externe nécessaire |
| G | Décision du fondateur nécessaire |
| H | Risque technique |
| I | Risque juridique / réglementaire |
| J | Risque commercial |

---

## 0. Méthode et limites de cet audit

Effectué le 29-30/09/2026, par lecture directe du code source (pas seulement des documents), par
exécution réelle des suites de tests unitaires backend et frontend, et par inspection de l'état Git
réel (branches, commits, fichiers non commités). Croisé avec la Bible IGNITUX (édition du
27/09/2026) et la documentation interne existante (`docs/`, `PRICING.md`, `ESTIMATION.md`,
`RAPPORT-SESSION.md`).

**Non fait par cet audit** : exécution des ~250 tests de bout en bout (nécessite une base Postgres
`ignitux_test` non montée ici), vérification navigateur, lecture ligne par ligne des trois branches
de travail isolées (seulement leur ampleur, leurs commits et leur statut).

---

## 1. Audit technique réel, domaine par domaine

### 1.1 Architecture backend — A

NestJS, Prisma 7 (`@prisma/adapter-pg`) sur PostgreSQL (Supabase). Validation d'environnement
centralisée (Zod) qui fait échouer le démarrage si la configuration est incomplète **[Code,
Architecture]**. Modules bien séparés par domaine (`auth`, `projects`, `igini/*`, `constitution`,
`crm`, `billing`, `financing`, `ledger`, `investors`, `banking`, `compliance`, `marketplace`,
`offres`, `roles`, `applications`) — vérifié par listing direct des dossiers le 30/09/2026.

### 1.2 Architecture frontend — A / B

Next.js (App Router), React, TypeScript, pas de librairie de state management (contexte React).
**30 pages** (`page.tsx`) recensées le 30/09/2026 par comptage direct, contre 26 annoncées par la
Bible (27/09/2026) — l'écart vient des pages `accueil`, `roles`, et des applications ajoutées
(`agenda`, `caisse`, `immobilier`, `publicite`, `stocks`, `vehicules`). Une partie de ces fichiers
est non commitée sur `main` (voir §1.11). Classé B (partiellement démontré) parce qu'aucune
vérification humaine en navigateur n'a eu lieu récemment sur les derniers ajouts, en dehors des
contrôles automatiques (contraste WCAG calculé depuis le CSS, structure du balisage) **[Code,
Architecture]**.

### 1.3 Base de données — A

Trois bases sur une même instance Supabase : `postgres` (développement), `ignitux_prod` (vierge de
données de développement), `ignitux_test` (bout en bout, refuse de démarrer ailleurs) **[Bible,
Architecture]**. Un dossier `backend/prisma/migrations/` existe désormais (vérifié présent le
30/09/2026) — un point de dette technique documenté le 19/09/2026 (« aucune migration versionnée »)
semble donc résolu, mais ce dossier est **non commité** sur `main` **[Git]** : à vérifier avant de
l'annoncer comme acquis (voir §1.11).

### 1.4 Authentification et sécurité — A / G

JWT via Passport, mots de passe hashés (bcrypt), rate-limiting **[Bible, README]**. Aucun secret en
clair détecté dans les fichiers lus lors de cet audit (seul `.env.example` a été consulté,
délibérément — jamais un `.env` réel). Vérification d'email non obligatoire : un compte non vérifié
reste pleinement utilisable — **décision produit non tranchée**, pas un oubli **[Bible, Status]**.
`MailService` journalise au lieu d'envoyer réellement tant qu'aucun fournisseur n'est choisi — donc
réinitialisation de mot de passe et vérification d'email **ne peuvent atteindre personne en
production actuellement** **[Bible, ResteAFaire]** — classé **F** (dépendance externe : choix d'un
fournisseur d'email) et **G** (décision fondateur sur l'obligation de vérification).

### 1.5 IGINI — les 5 générateurs et 5 moteurs transverses — A (codé) / C (désactivé)

Code complet, vérifié en pipeline réel une fois par générateur le 19-20/09/2026 **[Bible, Pricing]**.
**Actuellement éteints** par la variable `IGINI_AI_ENABLED` : lu directement dans
`backend/src/igini/claude/generators-availability.ts` le 30/09/2026 — tout ce qui n'est pas
exactement `'false'` laisse les générateurs actifs, et le verrou est posé avant tout appel réseau
**[Code]**. C'est une **décision de budget en attente**, pas un défaut technique — classé **C** puis
**G**. Les 5 moteurs transverses (Mémoire, Connaissance, Workflow, Score, Automation) sont codés et
testés ; Automation n'appelle jamais Claude et journalise chaque exécution **[Bible, Architecture]** — A.

**Capacité récente non documentée dans la Bible** : depuis le 28/09/2026 (commit `644dc92`, non
poussé vers GitHub), le générateur Analyser peut déclencher jusqu'à 5 recherches web réelles par
appel, sourcées depuis les résultats effectivement renvoyés par l'API (jamais inventées par le
modèle), avec coût journalisé séparément **[Pricing §13, Code]**. Classé **A** côté code/tests, **B**
côté vérification réelle (générateurs éteints, jamais éprouvé en conditions réelles).

### 1.6 Le moteur constitutionnel — A

Vérifié en lisant intégralement `backend/src/constitution/constitution-articles.ts` (309 lignes) et
`constitution-rules.ts` (414 lignes) le 30/09/2026 : **24 articles**, dont **exactement 12 marqués
`enforced`** et 12 `declared`, couverts par **exactement 16 règles exécutables** (comptées une par
une dans le tableau `CONSTITUTION_RULES`). Ce chiffre **confirme exactement** celui de la Bible
(« 24 articles, dont 12 sont appliqués par 16 règles exécutables ») et contredit des documents plus
anciens du dépôt (`docs/architecture.md` : « 11 de ses 24 » ; `docs/status.md` du 20/09 et
`RAPPORT-SESSION.md`/`docs/audit-ouverture.md` du 19/09 : chiffres encore inférieurs) — ces documents
plus anciens sont **obsolètes**, la Bible et le code sont alignés et à jour. Un test échoue si un
article `enforced` n'a aucune règle qui le couvre (garde-fou anti-péremption, vérifié dans le code)
**[Code confirme Bible]**.

**Découverte notable, non signalée par aucun document** : une règle `roles-separes` (article 13) et
un module `backend/src/roles/` complet (avec page frontend `/roles`) existent dans le code pour
séparer les données visibles selon qu'une personne agit comme entrepreneur ou comme investisseur —
cette fonctionnalité (« espaces » / séparation des rôles) **n'est décrite nulle part dans la
Bible**. Écart Bible → code réel, voir §2.

### 1.7 Offline First (article 16) — **écart majeur avec la Bible**

La Bible (27/09/2026) affirme : *« l'application ne démarre pas hors ligne, faute de vérification
possible sur un vrai navigateur »*. Or :

- `frontend/public/sw.js` (service worker fonctionnel) **existe et est commité depuis le
  24/09/2026** (commit `35b1e20`, message : *« l'application s'ouvre enfin sans réseau »*) **[Git]** ;
- `docs/rapport-final.md` (26/09/2026, non commité) affirme explicitement : *« Le produit fonctionne
  hors ligne : on peut écrire sans réseau, et c'est envoyé au retour de la connexion »* **[Doc]** ;
- la configuration d'intégration continue présente localement (non commitée, voir §1.11) contient une
  étape qui démarre un vrai navigateur Chromium, coupe le réseau, et vérifie que l'application
  s'ouvre quand même (`scripts/hors-ligne.mjs`) **[Code]**.

L'article reste marqué `declared` (et non `enforced`) dans le code — **à raison** : aucune règle
serveur ne peut constater qu'un navigateur a bien reçu un service worker. Mais cela ne veut pas dire
que la fonctionnalité n'existe pas : la Bible confond ici « non vérifiable par une règle du moteur
constitutionnel » et « non fonctionnel ». **Classé A (fonctionnel, démontré par un test navigateur
réel dans la CI locale), avec un écart de documentation à corriger dans la Bible.**

### 1.8 Modules « argent » — CRM, Facturation, Comptabilité, Banque, Financement, Investisseurs — A (code) / F, I

Tous existent en code avec fichiers de test dédiés, listés directement le 30/09/2026 : `crm/`,
`billing/`, `ledger/`, `banking/`, `financing/`, `investors/`. Règles métier vérifiées dans le code
constitutionnel : séparation stricte des caisses IGNITUX/utilisateur (`caisses-separees`), un
investisseur traverse les projets mais jamais son argent (`investissements-non-melanges`), le porteur
reste majoritaire (`majorite-du-porteur`), rapprochement bancaire dans la même caisse
(`rapprochement-dans-la-meme-caisse`) — quatre règles constitutionnelles dédiées, toutes `blocking`
**[Code]**.

Prix vérifiés directement dans `backend/src/offres/offres-catalogue.ts` le 30/09/2026 : Découverte
0 €/1 projet/Analyser seul/3 générations mensuelles ; Entrepreneur 9,90 €/mois, projets illimités, 5
générateurs, 30 générations mensuelles ; Construction 59,00 €/mois, 35 générations mensuelles, plus
comptabilité/facturation/banque/investisseurs/collaborateurs illimités. Évaluation de financement :
99,00 €, explicitement non présentée comme un abonnement (avertissement obligatoire testé). **Ces
chiffres confirment exactement la Bible.**

**Aucun encaissement réel n'existe** : `docs/en-attente-paiement.md` (26/09/2026, non commité)
confirme qu'aucun fournisseur de paiement n'est branché et qu'aucun webhook n'existe pour le champ
`provider_ref` de la table `subscriptions` — classé **F**.

**Risque réglementaire non traité (I)** : le module Financement & Investisseurs organise des apports,
une répartition de parts, des dividendes et des conditions de rachat entre porteurs de projet et
investisseurs, pour de l'argent réel. Aucun document du dépôt ne discute du statut réglementaire
d'une telle activité en France (financement participatif, intermédiation, conseil en investissement).
**C'est, à notre connaissance du dépôt, la question juridique la plus sérieuse de cet audit** — voir
`10-risques-et-reponses.md`.

### 1.9 Conformité — B / I

Module `backend/src/compliance/` : 12 démarches pour la France, sourcées individuellement, avec
avertissement explicite « ce n'est pas un avis juridique » **[Bible, Status]**. Suisse et Portugal :
aucun contenu, faute de sources officielles identifiées — décision assumée de ne rien inventer
**[Bible, Status]**. Classé **F** (dépend de sources externes) pour l'extension internationale.

### 1.10 Tests, qualité, CI/CD — A / H

**Exécution réelle par cet audit, le 29-30/09/2026, sur la machine de développement** :

| Suite | Fichiers | Tests | Résultat |
|---|---|---|---|
| Backend (`npx vitest run`) | 93 | 1204 | 1203 verts, **1 échec** (timeout à 30 s sur un test statistique de répartition, `src/investors/distribution.spec.ts`, 20 000 tirages) |
| Frontend (`npx vitest run`) | 52 | 499 | 490 verts, **9 échecs** (tous des timeouts à 5 s, pages projet/finances/collaborateurs) |

**Lecture honnête de ce résultat** : les 10 échecs sont *tous* des dépassements de délai, jamais une
assertion de valeur fausse — un indice de machine sous contrainte de ressources plutôt qu'une
régression fonctionnelle, mais cet audit ne peut pas l'affirmer avec certitude sans ré-exécuter ces
tests isolément sur une machine différente. **Ce dossier ne reprend donc pas l'affirmation de la
Bible (« 1586 tests, tous au vert ») sans la nuancer** : au 30/09/2026, sur cette machine, ce n'est
pas ce qui a été observé. Le nombre de tests a aussi augmenté (1204 + 499 = 1703 contre 1586) parce
que du code non commité en ajoute.

Les tests de bout en bout (~250, Bible) n'ont **pas** été exécutés par cet audit.

**CI/CD** : `.github/workflows/ci.yml`, tel qu'il existe actuellement sur le disque (**mais modifié,
non commité** — voir §1.11), est nettement plus complet que ce que la Bible décrit : lint,
vérification de types (deux fois côté backend), tests unitaires, build, vérification que les
dépendances de production suffisent, **et** un job de bout en bout sur une base Postgres jetable
(sans toucher à Supabase), **et** un job qui construit et démarre réellement les images Docker, **et**
un job qui vérifie dans un vrai Chromium que l'application s'ouvre hors ligne et s'installe. **Ce
niveau de CI n'est pas garanti être celui qui tourne réellement sur GitHub aujourd'hui**, puisque le
fichier est modifié localement sans avoir été poussé — à vérifier (`git diff origin/main -- 
.github/workflows/ci.yml`).

### 1.11 État réel du dépôt Git — **H, à traiter en priorité**

Constat détaillé, vérifié directement le 30/09/2026 :

- **6 commits sur `main` non poussés vers l'origine distante.**
- **79 fichiers modifiés ou non suivis sur `main`**, incluant : la totalité du chantier « poste de
  travail » (bureau, barre des tâches — `frontend/src/components/systeme.tsx`), le lanceur
  d'applications (`frontend/src/app/accueil/`), toute la préparation PWA (manifeste, icônes, écrans
  de démarrage, `assetlinks.json`), un nouveau rapporteur d'erreurs backend, le dossier
  `backend/prisma/migrations/`, et **cinq documents de fond non versionnés**, dont
  `docs/IGNITUX-la-bible.pdf` elle-même, `docs/rapport-final.md`, `docs/vision-v2-analyse.md`,
  `docs/ignitux-os.md`, `docs/applications-natives.md`, `docs/en-attente-paiement.md`.
- **Trois branches de travail isolées (« worktrees »), jamais fusionnées dans `main`** :

| Worktree | Chantier | Commits vs `main` | Maturité observée |
|---|---|---|---|
| `.worktrees/chat-igini` | Orchestrateur conversationnel IGINI (chat à outils : 5 générateurs + lister les projets + rappeler les souvenirs) | 16 | A passé une revue finale ayant corrigé des bugs réels (épuisement de quota par le chat, visibilité d'un appel d'outil, analyse de marqueurs) ; arbre de travail propre |
| `.worktrees/generateur-former` | 6ᵉ générateur IGINI « Former » — recommandation automatique de forme juridique | 8 | Développement TDD actif, modifications non commitées présentes dans le worktree lui-même |
| `.claude/worktrees/boutique-en-ligne` | Intégration Shopify (boutique en ligne) | 16 | A passé une revue finale ayant corrigé **deux failles de sécurité réelles** (contrôle d'offre manquant sur 6 routes sur 7, fixation de session OAuth) |

**Ce que cela signifie pour un investisseur** : il existe davantage de valeur construite que ce que
`main` seul laisse voir — mais rien de cette valeur n'est aujourd'hui sauvegardé de façon fiable
(aucun push), rien n'est passé par la CI de `main`, et l'intégration de ces trois chantiers n'est
documentée dans aucun plan daté. C'est un risque technique concret et immédiatement actionnable
(voir recommandation en tête de `00-AUDIT-INVESTOR-READINESS.md`).

### 1.12 Documentation — B

Riche et honnête (c'est une qualité rare, cohérente avec la devise « la vérité avant tout ») mais
**fragmentée et pas toujours à jour** : plusieurs documents (`status.md`, `RAPPORT-SESSION.md`,
`ESTIMATION.md`, `docs/audit-ouverture.md`) datent du 19-20/09/2026 et contiennent des chiffres
dépassés par le code actuel (voir §1.6). La Bible elle-même contient au moins une affirmation
factuellement dépassée par le code (§1.7).

### 1.13 Déploiement — G, F

Aucun hébergement, aucun nom de domaine, aucun mot de passe SMTP de production **[ResteAFaire,
EnAttentePaiement]**. Ce sont des décisions et des achats (~15-30 €/mois au total), pas des chantiers
de code — le document `docs/rapport-final.md` (26/09/2026, non commité) l'affirme sans ambiguïté :
*« Ce qui manque, ce n'est plus du code : c'est un hébergement, un domaine et le mot de passe de
l'email. »*

---

## 2. Bible vs code réel — tableau des écarts

| Sujet | Bible (27/09/2026) | Code réel (30/09/2026) | Écart | Action recommandée |
|---|---|---|---|---|
| Offline First (art. 16) | « L'application ne démarre pas hors ligne » | Service worker fonctionnel, commité le 24/09, vérifié par un test navigateur réel en CI | La Bible est en retard sur son propre code | Corriger le chapitre 8 de la Bible |
| Recherche web dans Analyser | Non mentionnée | Capacité réelle depuis le 28/09 (commit non poussé), coût journalisé | Fonctionnalité postérieure à l'édition de la Bible | Ajouter à la prochaine édition |
| Séparation des rôles (« espaces » entrepreneur/investisseur) | Non mentionnée | Module `roles/` complet, page `/roles`, règle constitutionnelle dédiée | Fonctionnalité construite, absente de la Bible | Ajouter à la prochaine édition |
| Générateur « Former » (forme juridique) | Mentionné en une phrase comme « pas encore implémenté » | Développement réel en cours dans un worktree isolé (8 commits, TDD) | La Bible sous-estime l'avancement réel | Préciser le statut à la fusion |
| Orchestrateur conversationnel IGINI | Non mentionné (design/plan datés du 27/09, jour de la Bible) | Implémentation avancée dans un worktree isolé, revue de sécurité passée | Chantier bien plus avancé que « conçu seulement » | Décider d'une date de fusion et documenter |
| Boutique en ligne (Shopify) | Non mentionnée | Implémentation avancée dans un worktree isolé, deux failles de sécurité déjà corrigées | Absente de la vision documentée | Décider d'une date de fusion et documenter |
| Articles constitutionnels appliqués | 12/24, 16 règles | 12/24, 16 règles (vérifié ligne à ligne) | Aucun — confirmé | Aucune |
| Tests unitaires « tous au vert » | 1586, tous verts | 1703 dénombrés le 30/09, 10 échecs (timeouts) sur cette exécution | Chiffre daté, machine différente | Ré-exécuter sur une machine de référence avant toute communication externe du chiffre |
| Plafond de coût IA (2 €/mois) | Présenté comme 10 % d'un prix de vente à 20 €/mois | Aucune des trois offres réelles ne vaut 20 €/mois (9,90 € et 59,00 €) | Le calcul de référence ne correspond à aucune offre commercialisée | Le fondateur doit clarifier sur quelle offre ce taux s'applique, ou recalculer par offre |
| Nombre de pages frontend | 26 | 30 | Ajouts récents (accueil, roles, 6 « applications ») | Mettre à jour au prochain état des lieux |
| Versement du dépôt sur GitHub | Non traité par la Bible | 6 commits non poussés, 79 fichiers non commités, 3 worktrees non fusionnées | Écart opérationnel majeur | Voir §1.11 |

---

## 3. Investor Readiness — analyse par domaine

Pour chaque domaine : ce que nous avons / ce qui manque / ce qui peut être présenté immédiatement /
ce qui doit être préparé avant un rendez-vous sérieux / ce qui peut attendre.

### 1. Produit
- **Avons** : un produit large et cohérent, pas un MVP à une fonctionnalité — projets, IGINI,
  argent, communauté, conformité **[Code, Bible]**.
- **Manque** : intégration des trois chantiers en worktree ; vérification navigateur récente.
- **Présentable maintenant** : la démo du parcours de base (compte → projet → analyse) si les
  générateurs sont rallumés pour la démo, ou une capture d'écran/vidéo sinon.
- **À préparer avant rendez-vous** : décider si la démo se fait générateurs allumés (coût réel
  mesuré : ~0,05 €/génération) ou sur captures.
- **Peut attendre** : la fusion complète des trois worktrees.

### 2. Technologie
- **Avons** : stack moderne et cohérente, moteur constitutionnel exécutable (rare, différenciant),
  CI relativement mature **[Code]**.
- **Manque** : preuve que la CI décrite au §1.10 est bien celle qui tourne sur GitHub aujourd'hui.
- **Présentable maintenant** : `07-technologie.md`.
- **À préparer** : vérifier et, si besoin, pousser la CI à jour.
- **Peut attendre** : audit de sécurité externe formel.

### 3. Démonstration
- **Avons** : un produit qui tourne en local, testé.
- **Manque** : environnement de démonstration public stable (pas d'hébergement).
- **Présentable maintenant** : démo en local/partage d'écran.
- **À préparer** : décider hébergement + domaine (§1.13) si une démo distante est nécessaire.
- **Peut attendre** : démo mobile/PWA installée sur un vrai téléphone en conditions de rendez-vous.

### 4. Problème
- **Avons** : un narratif clair (accompagner une personne de l'idée à la transmission) **[Bible]**.
- **Manque** : preuve sourcée que ce problème est vécu par un segment identifié (pas de recherche
  utilisateur documentée dans le dépôt).
- **Présentable maintenant** : la formulation du problème telle qu'énoncée dans la Bible.
- **À préparer** : au moins quelques témoignages ou retours qualitatifs, si disponibles **[Fondateur]**.
- **Peut attendre** : étude de marché formelle.

### 5. Solution
- **Avons** : la méthode en 5 étapes, IGINI, la Constitution comme garde-fou de confiance.
- **Manque** : rien de majeur au niveau narratif — le point faible est la preuve d'usage, pas la
  description de la solution.
- **Présentable maintenant** : oui, en l'état.
- **À préparer** : rien de spécifique.
- **Peut attendre** : —

### 6. Marché
- **Avons** : rien de sourcé dans le dépôt.
- **Manque** : taille de marché, segments, données chiffrées — **tout est à construire avec des
  sources externes vérifiables**, voir `09-concurrence.md`.
- **Présentable maintenant** : rien de chiffré ; seulement le positionnement qualitatif.
- **À préparer** : une recherche de marché sourcée avant toute discussion chiffrée avec un fonds.
- **Peut attendre** : une segmentation fine par pays (cohérent avec « One Brain, Multiple
  Regulations », qui n'a pas commencé **[Bible]**).

### 7. Modèle économique
- **Avons** : trois offres claires, vérifiées dans le code, logique de coût marginal bien pensée
  (gratuit = pas de coût IA, payant = usage de l'IA) **[Code, Bible]**.
- **Manque** : cohérence du plafond de coût IA avec les prix réels (voir §2) ; aucun encaissement
  réel ; pas de projection d'unit economics avec un vrai volume d'utilisateurs.
- **Présentable maintenant** : le tableau des trois offres, tel quel.
- **À préparer** : trancher l'incohérence du plafond IA avant de le présenter comme une preuve de
  maîtrise des coûts.
- **Peut attendre** : modèle financier complet multi-année (données manquantes, voir fichier 22).

### 8. Traction
- **Avons** : rien à ce jour.
- **Manque** : tout — utilisateurs, revenus, rétention.
- **Présentable maintenant** : rien à présenter comme traction ; présenter à la place la maturité
  technique comme preuve de sérieux d'exécution.
- **À préparer** : un plan clair de première mise en bêta (l'hébergement/domaine sont les seuls
  blocages, §1.13).
- **Peut attendre** : tout indicateur de rétention/croissance, qui suppose des utilisateurs.

### 9. Acquisition clients
- **Avons** : rien de documenté dans le dépôt.
- **Manque** : une stratégie d'acquisition testée.
- **Présentable maintenant** : rien.
- **À préparer** : au minimum une hypothèse de premier canal (communauté, bouche-à-oreille,
  contenu) **[Fondateur]**.
- **Peut attendre** : un budget d'acquisition chiffré.

### 10. Concurrence
- **Avons** : rien de sourcé.
- **Manque** : cartographie des alternatives (assistants IA généralistes, outils de business plan,
  logiciels de gestion). Voir `09-concurrence.md`, volontairement incomplet.
- **Présentable maintenant** : le positionnement différenciant qualitatif (Constitution, refus des
  chiffres inventés, parcours de bout en bout).
- **À préparer** : une comparaison sourcée avant toute question directe d'un investisseur.
- **Peut attendre** : veille concurrentielle continue.

### 11. Différenciation
- **Avons** : un argument réel et démontrable — le moteur constitutionnel exécutable, le refus
  systématique des scores/chiffres inventés, la séparation stricte des caisses. Peu de produits
  peuvent montrer une règle de code qui bloque une écriture en base pour une raison éthique
  **[Code]**.
- **Manque** : rien à corriger, seulement à mettre en scène (voir `07-technologie.md`).

### 12. Propriété intellectuelle
- **Avons** : du code propriétaire substantiel.
- **Manque** : aucune trace de dépôt de marque, de protection formelle, ou de politique de licence
  dans le dépôt.
- **À définir par le fondateur** : statut de dépôt de marque « IGNITUX »/« IGINI », le cas échéant.

### 13. Équipe
- **Avons** : un fondateur (Helder Simoes), qui a travaillé avec une assistance IA extensive et
  documentée (ce qui peut se présenter comme une preuve de vélocité).
- **Manque** : toute information sur une équipe élargie, des conseillers, ou des collaborateurs
  **[Fondateur — non déductible du dépôt]**.

### 14. Structure juridique
- **Avons** : rien dans le dépôt (pas de statuts, pas de SIRET renseigné — `IGNITUX_IDENTIFIANT` et
  `IGNITUX_TVA` vides **[ResteAFaire]**).
- **Manque** : tout. **P0 absolu.**

### 15. Finances
- **Avons** : une analyse de coût IA rigoureuse et mesurée (`PRICING.md`).
- **Manque** : tout compte réel de l'entreprise (trésorerie, dépenses passées) — hors périmètre du
  dépôt de code, normal, mais à documenter séparément **[Fondateur]**.

### 16. Besoin de financement
- **Avons** : une base pour raisonner (coûts IA mesurés, coûts d'infrastructure identifiés dans
  `en-attente-paiement.md`).
- **Manque** : un montant. Voir `12-besoin-financement.md` pour trois scénarios construits sans
  inventer de chiffre non sourcé.

### 17. Utilisation des fonds
- Voir `13-utilisation-des-fonds.md` — structure prête, montants à confirmer avec le fondateur.

### 18. Roadmap
- **Avons** : une feuille de route détaillée et réaliste dans la Bible (T4 2026 → 2030) **[Bible]**.
- **Manque** : son actualisation avec les trois chantiers en worktree, qui anticipent déjà une partie
  du jalon T2 2027 (« IGINI parle »).

### 19. Risques
- Voir `10-risques-et-reponses.md` — en particulier le risque réglementaire du module Financement &
  Investisseurs (§1.8), le plus sérieux identifié par cet audit.

### 20. Gouvernance
- **Avons** : une Constitution exécutable, un concept de « Gardiens » énoncé.
- **Manque** : le rôle des Gardiens n'a aucune traduction en code à ce jour, et aucun dispositif de
  continuité si le fondateur unique devenait indisponible (article 23, « Indépendance du
  Fondateur », reste `declared`) **[Code, Bible]**.
