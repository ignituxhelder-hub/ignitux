# PROGRESS — session autonome du 19/09/2026

## ⚠️ Écart constaté avant de commencer (important pour comprendre ce rapport)

Le prompt de lancement décrivait le projet comme étant en **« Phase 1 (Fondations) »** d'une
roadmap en 8 phases, avec un frontend "prévu" et un futur "Knowledge Engine" en Phase 2.

**Ce n'était déjà plus l'état réel du dépôt au moment du lancement** — vérifié directement, pas
supposé : le frontend existait déjà (auth, projets, communauté, collaboration, 4 moteurs IGINI),
le "Knowledge Engine" existait déjà (moteur Connaissance, testé, avec visualisation en graphe), et
167 tests backend + 43 tests frontend passaient déjà. État détaillé : [`docs/status.md`](docs/status.md).

**Décision prise** : continuer sur l'état réel plutôt que rejouer une Phase 1 déjà dépassée, en
gardant l'esprit des règles données (pas de confirmation pour des choix mineurs, contournement
documenté des blocages, tests systématiques, commits réguliers) appliqué aux vrais chantiers
d'auth/fondations qui restaient réellement incomplets.

## Ce qui a été fait cette session

### 1. Réinitialisation de mot de passe + vérification d'email (le vrai chantier "auth" restant)

Ces deux fonctionnalités étaient documentées comme **bloquées** depuis plusieurs sessions,
faute de service d'envoi d'email. Plutôt que de rester bloqué (règle 6), j'ai construit :

- **`backend/src/mail/`** — `MailService`, qui journalise l'email au lieu de l'envoyer (aucun
  fournisseur réel configuré — décision produit qui n'a pas été prise). Conçu pour qu'un vrai
  fournisseur (Resend, SES…) se branche plus tard sans toucher au reste du code.
- **`backend/src/auth-tokens/`** — tokens à usage unique (hash SHA-256 stocké, jamais le token en
  clair), `PasswordResetService`, `EmailVerificationService`. Routes :
  `POST /auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`,
  `/auth/verify-email/resend`. Protection contre l'énumération d'emails (même réponse 204 que le
  compte existe ou non).
- Nouvelle table `auth_tokens` + colonne `users.email_verified_at` (changement additif uniquement,
  aucune donnée existante touchée).
- **Frontend** : `/forgot-password`, `/reset-password`, `/verify-email`, lien "Mot de passe
  oublié ?" sur la page de connexion.
- **Testé unitairement** (29 nouveaux tests) **et en conditions réelles** contre le serveur
  backend réel : inscription → token de vérification récupéré dans les logs → vérification réussie
  → réutilisation du même token rejetée → même séquence pour la réinitialisation → connexion avec
  le nouveau mot de passe réussie, avec l'ancien refusée. Données de test nettoyées ensuite.

**Limite assumée et documentée** (`docs/decisions.md`) : la vérification d'email n'est pas
obligatoire — un compte non vérifié peut quand même se connecter et tout utiliser. Décider de
l'imposer (et où) est un choix produit que je n'ai pas pris à ta place.

### 2. Changement de mot de passe pour un utilisateur connecté

Troisième pièce manquante de l'auth, indépendante des deux premières (pas besoin d'email) :
`PATCH /auth/me/password`, exige le mot de passe actuel. **Bug attrapé avant de committer** : la
première version renvoyait 401 en cas de mauvais mot de passe actuel, ce que le frontend interprète
partout ailleurs comme "session expirée" et déconnecte l'utilisateur — un simple mot de passe
actuel mal tapé aurait donc déconnecté la personne au lieu de simplement afficher une erreur. Le
test frontend a détecté le problème avant tout commit ; corrigé en renvoyant 403 à la place (voir
`docs/decisions.md`). Testé en conditions réelles (mauvais mot de passe rejeté, bon accepté,
connexion avec le nouveau mot de passe confirmée). Page `/account` ajoutée côté frontend.

### 3. Documentation tenue à jour en continu

`docs/status.md`, `docs/architecture.md`, `docs/decisions.md` mis à jour au fil de l'eau plutôt
qu'en une seule fois à la fin, pour rester exploitables même si la session s'arrête en cours.

### 4. Incident opérationnel rencontré et résolu

En ajoutant ~15 nouveaux fichiers d'un coup, le serveur de dev (`nest start --watch`) n'a pas
détecté les nouvelles routes (404 sur les nouveaux endpoints alors que `tsc`/tests passaient).
Diagnostiqué (pas juste réessayé à l'aveugle) : le watcher n'avait pas repris les nouveaux
fichiers. Redémarré proprement (aucune perte de données, la base est indépendante du process) —
routes confirmées présentes après redémarrage. **À savoir pour la suite** : après un ajout massif
de nouveaux fichiers backend, un redémarrage manuel du serveur de dev peut être nécessaire.

### 5. Accès collaborateur étendu aux 4 moteurs transverses (backend + frontend)

Jusqu'ici, un collaborateur invité sur un projet voyait le projet et l'historique des 5
générateurs, mais pas la mémoire, la connaissance, les tâches ou le score — strictement réservés
au propriétaire (`assertOwnsProject`). Ce n'était pas cohérent avec le principe de collaboration
déjà en place ailleurs.

- **Backend** : nouvelle fonction `assertHasProjectAccess` (propriétaire OU collaborateur), à
  distinguer de `assertOwnsProject` (propriétaire seul, toujours utilisée pour toute écriture :
  créer une tâche, enregistrer un souvenir, créer un concept, changer un statut, gérer les
  collaborateurs). Appliquée en lecture seule à `WorkflowService.listTasks`,
  `ScoringService.getScoreCard`, `MemoryService.search` et `KnowledgeService.listConcepts`
  (donc aussi `getGraph`/`summarize` qui en dépendent).
- Détail architectural découvert en le faisant : `memories`/`concepts` sont rattachés à
  `user_id` avec un `project_id` optionnel (pas purement `project_id` comme `tasks`) — la forme de
  la requête change donc selon qu'un `projectId` est fourni ou non, pas seulement la fonction de
  vérification d'accès.
- Testé unitairement (nouveaux cas "un collaborateur peut lire...") et **en conditions réelles**
  avec deux comptes réels : un collaborateur invité voit bien les données liées au projet du
  propriétaire (pas seulement les siennes), et reçoit un 404 avant d'avoir été invité.
- **Frontend** : les 4 sections (`ScoreSection`, `TasksSection`, `MemorySection`,
  `KnowledgeSection`) sont maintenant affichées aux collaborateurs, pas seulement au propriétaire
  (`frontend/src/app/projects/[id]/page.tsx`). Nouvelle prop `readOnly` sur `TasksSection`,
  `MemorySection`, `KnowledgeSection` (`engine-sections.tsx`) : masque les formulaires de
  création/liaison et remplace le sélecteur de statut de tâche (modifiable) par un simple libellé
  pour un non-propriétaire, afin d'éviter qu'un collaborateur soumette une action que le backend
  refuserait de toute façon (même pattern que celui déjà utilisé pour les 5 générateurs IA). La
  gestion des collaborateurs elle-même reste réservée au propriétaire.
- `docs/architecture.md` corrigé : la phrase "ne couvre pas encore les 4 moteurs transverses"
  était devenue fausse et a été mise à jour.
- Nouveaux tests frontend (3) vérifiant que les formulaires d'écriture sont bien masqués en lecture
  seule ; test existant du mode "collaborateur" mis à jour (il affirmait à tort que ces sections
  étaient invisibles, maintenant qu'elles le sont en lecture seule).

### 6. `ANTHROPIC_API_KEY` enfin configurée et débloquée — premier test IA réel réussi

L'utilisateur a fourni une clé API en cours de session. Ajoutée à `backend/.env` (fichier
gitignoré, rien commité), confirmée présente sur disque (le blocage précédent — le fichier restait
inchangé malgré plusieurs tentatives — ne se reproduit pas cette fois). Serveur de dev redémarré
pour charger la nouvelle variable.

**Premier essai** : compte + projet de test créés, `POST /projects/:id/analyze` appelé. La clé
était valide et acceptée par Anthropic, mais l'appel a échoué avec `invalid_request_error` —
« Your credit balance is too low to access the Anthropic API ». Aucun coût engagé (échec avant
génération de tokens). Projet de test supprimé.

**Après que l'utilisateur a ajouté du crédit au compte, deuxième essai (même procédure, nouveau
compte/projet de test)** : succès complet. Le générateur "Analyser" a produit une vraie analyse de
faisabilité via `claude-opus-5` (résumé, score de faisabilité, forces, risques, prochaines étapes),
cohérente et exploitable, sur un cas fictif (food-truck de crêpes) en ~31 secondes. **C'est le
premier appel IA réel réussi de tout le projet** — jusqu'ici, les 5 générateurs n'avaient été
vérifiés que par des tests unitaires avec Claude mocké. Projet et compte de test supprimés/nettoyés
après coup.

Point de vigilance signalé mais pas tranché : le modèle configuré (`claude-opus-5`,
`backend/src/igini/claude/claude.service.ts`) est le plus cher de la gamme — un usage de test
répété pourrait consommer vite le budget de 50€/mois. Rester sobre sur les futurs tests réels tant
que ce choix n'est pas revu.

### 7. Automation, Compliance, Marketplace — les trois chantiers à 0% de l'estimation

Suite à l'estimation (point précédent), demande explicite de construire ces trois chantiers.
Chacun avait une raison documentée d'être à 0% (pas juste "pas encore fait") — clarifié par 3
questions avant de coder plutôt que de fabriquer des décisions produit à ta place :

- **Automation** — tu as choisi l'automatisation complète, sans confirmation humaine (option qui
  inversait un choix précédemment documenté comme délibéré). Construit avec deux garde-fous non
  négociables de mon point de vue, pour que ce choix reste sûr : (1) **n'appelle jamais l'API
  Claude elle-même** — tout ce qu'elle fait est déterministe et gratuit, pour qu'un automatisme sans
  supervision ne puisse jamais faire déraper le budget IA sans qu'un humain le voie venir ; (2)
  **chaque exécution est journalisée** (`automation_runs`, visible dans l'UI) — la transparence
  après coup remplace la validation avant coup. Ce qu'elle fait concrètement : après chaque
  génération IA (ou manuellement via un bouton) elle crée une tâche `assignee: 'igini'` pour toute
  étape (analyse/plans) qui manque encore, ferme automatiquement cette tâche dès que l'étape existe,
  et relie automatiquement les concepts d'un même projet qui partagent un mot significatif. Testé
  unitairement (17 tests) et **en conditions réelles** : sur un projet vide, 5 tâches créées d'un
  coup ; après une vraie analyse, la tâche correspondante s'est fermée toute seule, sans un clic.
- **Compliance** — tu as choisi la France avec du contenu rédigé à partir de sources publiques
  citées. Livré : 12 démarches (statut juridique, guichet unique, SIREN/SIRET, URSSAF, régime
  fiscal, TVA, compte bancaire dédié, assurance, activité réglementée, hygiène alimentaire,
  domaine public, RGPD), chacune avec sa source (nom + URL vers le site officiel), suivies par
  projet (case à cocher). **Volontairement sans aucun chiffre précis** (seuils de TVA, plafonds…)
  qui périmerait vite et serait faux au bout de quelques mois — chaque point renvoie plutôt vers la
  source qui les tient à jour. Un disclaimer explicite ("ne remplace pas un avis d'expert-comptable,
  d'avocat…") est renvoyé par l'API et affiché en haut de la section, pas caché en petit.
- **Marketplace** — tu as choisi un simple annuaire, sans argent. Livré : profil (mentor ou
  investisseur, titre, bio, expertise), annuaire filtrable par rôle, mise en relation par message
  (pas de messagerie complète, juste un message + une boîte de réception). Aucune logique de
  paiement ni de gestion de participation, comme demandé.

**Frontend** : nouvelle page `/marketplace` (annuaire + mon profil + messages reçus), lien ajouté
dans la nav ; deux nouvelles sections sur la fiche projet (`ComplianceSection`,
`AutomationSection`), visibles par le propriétaire et les collaborateurs comme les 4 moteurs
transverses (lecture pour tous, le déclenchement manuel de l'automatisation et les cases à cocher
de conformité restant réservés au propriétaire).

**Testé** : 53 nouveaux tests backend (compliance, marketplace, automation, plus les mises à jour
de `projects.service`/`projects.controller` pour le déclenchement automatique), 10 nouveaux tests
frontend. Vérifié en conditions réelles avec un compte de test : création de projet → automatisation
manuelle (5 tâches créées) → conformité (une exigence cochée) → profil marketplace créé et listé →
vraie analyse IA → tâche d'automatisation fermée automatiquement. Tout supprimé après coup.

Deux décisions précédentes de `docs/decisions.md` sont explicitement révisées (pas supprimées en
silence) : "Pas de moteur d'automatisation" et "Collaborateur : lecture seule, pas d'accès aux 4
moteurs" — les deux entrées expliquent maintenant pourquoi et depuis quand ce n'est plus vrai.

### 8. Pipeline complet des 5 générateurs vérifié en conditions réelles

Suite à "continue et finis tout" : le générateur "Analyser" avait déjà été vérifié en conditions
réelles (point 6), mais pas les 4 autres. Un projet de test a été créé et les 5 générateurs
exécutés à la suite, dans l'ordre du pipeline : Analyser → Construire → Financer → Développer →
Transmettre. Résultat : les 5 ont produit un contenu cohérent, et chacun exploite correctement le
contexte des étapes précédentes (le plan de construction cite explicitement le score de faisabilité
de l'analyse, par exemple) — confirme que la mémoire commune entre étapes fonctionne aussi en
conditions réelles, pas seulement dans les tests avec mocks. Le score final est monté à
`confiance: 10` (5/5 étapes commencées), et Automation a fermé automatiquement les 4 tâches d'étape
restantes au fur et à mesure, sans confirmation — vérifie que le 5ᵉ moteur fonctionne aussi sur un
pipeline complet, pas seulement sur une seule génération isolée. Projet et compte de test créés
pour cette vérification supprimés après coup. Fait en parallèle, sans toucher aux serveurs de
dev : tu étais en train de naviguer sur le frontend pendant cette vérification (connexions actives
détectées avant de commencer), donc tout est passé par l'API directement pour ne pas perturber ta
session.

**C'est la dernière pièce manquante de la vérification IGINI** : les 5 générateurs sont maintenant
tous confirmés fonctionnels en conditions réelles, pas seulement en tests unitaires avec Claude
mocké — voir `docs/status.md`.

### 9. Nettoyage des données de test, bug d'affichage de l'automatisation, vérifications ciblées

Session en 5 chantiers demandés explicitement.

**9.1 — Données de test polluées : diagnostic différent de ce qui était annoncé.** Recherche des
chaînes « sdvxdv » / « xvxvxzvzxcbxc » dans **toutes** les tables de la base. Résultat : elles
n'étaient **pas** dans le projet « école de motocross » du compte principal
(`heldersimoes.ge@gmail.com`), qui est resté totalement vide et intact. Il existe en fait trois
projets « école motocross » sous trois comptes différents ; les entrées polluées étaient sous un
compte à email jetable (`sd@dd.co`), dans un projet dont le titre était « sdvxdv » au moment des
générations (19/09, 07:49) puis renommé « ecole de moto cross » cinq minutes après — les résumés
IA citaient donc encore verbatim l'ancien titre absurde. **3 enregistrements** (plans de
financement, développement, transmission) supprimés précisément par leur identifiant, après
vérification qu'aucune autre donnée du projet n'était concernée ; contrôle post-suppression :
plus aucune occurrence des deux chaînes nulle part.
**Pourquoi ça n'avait pas été nettoyé "comme annoncé"** : l'engagement de nettoyage tenu jusqu'ici
couvre les données créées par les scripts de vérification automatisée (toujours supprimées juste
après, traçable dans l'historique). Cette pollution-là vient d'un test fait manuellement dans le
navigateur, hors de toute session assistée — elle n'a jamais été vue, donc jamais "annoncée comme
nettoyée". Règle écrite dans `docs/decisions.md` pour la suite (projet dédié et explicitement
nommé `[TEST] …` pour tout test jetable, humain ou automatisé).
**Trou de nettoyage réel trouvé au passage** : les *projets* de test étaient bien supprimés, mais
pas les *comptes* (aucun endpoint de suppression de compte n'existe dans l'API). 9 comptes
`@example.com` résiduels supprimés en base, avec double garde-fou (domaine réservé RFC 2606 **et**
zéro projet rattaché).

**9.2 — Bug d'automatisation : c'était l'affichage, pas le moteur.** Vérifié d'abord dans le code,
puis en conditions réelles : le déclenchement automatique après génération **fonctionne** côté
backend (test dédié : une analyse réelle génère 4 tâches `assignee: igini` / `source: automation`
plus une exécution journalisée, sans le moindre appel manuel). Le vrai bug était côté frontend :
`TasksSection`, `AutomationSection`, `ScoreSection` et `KnowledgeSection` ne se rechargeaient qu'au
montage. Après une génération, l'automatisation tournait donc invisiblement, et un clic manuel
juste après affichait honnêtement « 0 tâche créée » — puisque le travail venait d'être fait
automatiquement quelques secondes plus tôt. Corrigé par un signal de rafraîchissement propagé après
chaque génération réussie, avec un **test de régression vérifié comme tel** : temporairement annulé
le correctif pour confirmer que le test échoue sans lui, puis restauré.

**9.3 — Marketplace de bout en bout** : profil mentor créé, visible dans l'annuaire, correctement
inclus par le filtre `role=mentor` et correctement **exclu** par `role=investisseur` ; message de
mise en relation envoyé d'un compte à l'autre, reçu dans la bonne boîte ; cloisonnement vérifié
(le porteur ne voit pas les messages du mentor) ; auto-contact refusé (400). **Absence de paiement
confirmée explicitement** par recherche de tous les termes liés au paiement dans l'intégralité du
code Marketplace : les seules occurrences sont le libellé de rôle « investisseur » et deux
commentaires qui affirment justement l'absence de paiement. Profil de test supprimé.

**9.4 — Les 4 générateurs, un par un, sur un cas non couvert.** Ces 4 générateurs avaient déjà été
vérifiés une heure plus tôt (point 8, en pipeline avec contexte). Plutôt que de repayer 4 appels
pour reprouver la même chose, le test a porté sur un cas **jamais couvert** : chaque générateur
lancé **sans analyse préalable** (chemin « contexte absent »). Les 4 ont réussi (Construire 45s,
Financer 38s, Développer 40s, Transmettre 46s), avec une pause de 20s entre chaque. Résultat
notable : le score final affiche `etincelle: null` — aucune analyse n'existant, le système refuse
d'inventer un chiffre, ce qui valide en conditions réelles la règle « pas de score fabriqué ».
Projet de test supprimé.

**9.5 — Piège opérationnel documenté** : `npm run build` lancé pendant qu'un serveur de dev tourne
casse ce dernier (cache `.next` partagé, toutes les pages en 500). Rencontré deux fois ; procédure
de récupération notée dans `docs/decisions.md`. Serveurs redémarrés proprement, tous deux vérifiés
opérationnels en fin de session.

## Bloqué — pas contourné, car un contournement serait mentir

- **Financement (modèle économique réel)** — inchangé, en attente d'une décision produit/légale sur
  un vrai modèle économique (abonnement ? commission ?). Non inventé.
- **Compliance hors France** — la structure supporte déjà un champ `country`, mais aucune autre
  source réglementaire fiable n'a été identifiée ; pas de contenu fabriqué pour un pays sans source.
- **Marketplace avec argent réel** (mentorat payant, prise de participation) — nécessiterait un
  cadrage légal/fiscal (KYC, DSP2…) non fait ; l'annuaire actuel reste volontairement sans argent.

## Décisions techniques prises (détail dans `docs/decisions.md`)

- Table `auth_tokens` unique et partagée pour les deux usages (reset + vérification), plutôt que
  deux tables séparées — même forme de données, distinguées par `purpose`.
- `MailService` isolé dans son propre module pour que brancher un vrai fournisseur plus tard soit
  un changement d'une seule classe.
- Vérification d'email non bloquante (voir limite ci-dessus).
- 403 (pas 401) pour un mauvais mot de passe actuel sur `/auth/me/password`, pour ne pas déclencher
  la déconnexion automatique du frontend sur une simple faute de frappe.
- Automation n'appelle jamais Claude elle-même (protection du budget) et journalise chaque
  exécution (`automation_runs`) pour rester consultable après coup.
- Compliance : contenu générique sans chiffres périssables, toujours sourcé, jamais présenté comme
  un avis juridique.
- Marketplace : aucune circulation d'argent tant qu'un cadrage légal/produit n'est pas fait.

## Suppressions faites (les seules de la session) et budget IA

Tous les changements de schéma sont additifs (nouvelles tables `compliance_requirements`,
`project_compliance_checks`, `marketplace_profiles`, `marketplace_contacts`, `automation_runs` ;
aucune colonne existante modifiée).

**Suppressions volontaires, toutes demandées ou strictement liées à du nettoyage de test** (point 9) :
- 3 enregistrements générés contenant les chaînes de test « sdvxdv »/« xvxvxzvzxcbxc », identifiés
  un par un par leur identifiant exact, jamais par un filtre large.
- 9 comptes de test `@example.com` sans aucun projet rattaché (double garde-fou dans le script).
- Les projets/profils de test créés pendant les vérifications de cette session.
**Aucune donnée d'un compte réel n'a été touchée** — le projet « école de motocross » du compte
principal était et reste vide et intact (vérifié avant et après).

**Budget IA** : **12 appels réels à l'API Claude** au total sur la session, tous pour vérifier que
quelque chose fonctionnait, jamais en boucle — 2 échecs avant génération (crédit insuffisant, coût
nul), 10 réussis (1 vérification de clé, 5 pour le pipeline complet du point 8, 1 pour prouver le
déclenchement automatique du point 9.2, 4 pour les générateurs sans contexte du point 9.4, avec
20s de pause entre chacun). Durée typique d'un appel : 38 à 46 secondes. Le budget de 50€/mois a
été entamé de façon bornée et volontaire ; aucun processus automatique ne peut en consommer seul
(voir la garantie d'`AutomationService`).

## Vérifié à chaque étape

- Backend : 261 tests (+94 depuis le début de session), `tsc --noEmit` propre, `oxlint` propre.
- Frontend : 68 tests (+25, dont un test de régression dont l'échec sans le correctif a été
  vérifié explicitement), `tsc --noEmit` propre, `eslint` propre, build de production réussi
  (14 routes).
- Base de données auditée en fin de session : zéro projet de test résiduel, zéro compte de test
  résiduel, zéro occurrence des chaînes de test recherchées.
- Serveurs de dev backend et frontend vérifiés opérationnels en fin de session.
- Tout poussé sur `main`, historique de commits clair (voir `git log`).

## Estimation chiffrée demandée en cours de session

Sur demande explicite, une estimation d'avancement (phase par phase) et de coût de développement a
été écrite dans [`ESTIMATION.md`](ESTIMATION.md) — audit du code réel, pas une extrapolation. Point
notable qui en ressort : le code des 5 générateurs IA (phase "IGINI") est écrit à ~85% mais vérifié
à ~0% en conditions réelles, faute de clé API — cohérent avec le blocage documenté ci-dessus.
**Remise à jour** après les points 7 et 8 (Automation/Compliance/Marketplace, puis vérification
complète des 5 générateurs) — voir `ESTIMATION.md`, section "Changements depuis la première
version".

## Prochaines étapes recommandées

1. **Décider si la vérification d'email doit être obligatoire**, et où (bloquer la connexion ?
   certaines actions seulement ?) — le mécanisme existe, il ne manque que la règle.
2. **Choisir un fournisseur d'email réel** quand la décision produit sera prise — un seul fichier à
   changer (`backend/src/mail/mail.service.ts`).
3. **Revoir le modèle Claude utilisé** (`claude-opus-5`, le plus cher de la gamme) si tu comptes
   utiliser les générateurs régulièrement — le budget de 50€/mois se consommera plus vite avec Opus
   qu'avec un modèle plus économique. Les 5 fonctionnent maintenant, c'est une question de coût, pas
   de fonctionnement.
4. **Décider un modèle économique** avant de développer davantage Financement — le texte généré
   existe, la logique d'abonnement/commission non.
5. **Trouver une source réglementaire fiable pour un deuxième pays**, si Compliance doit dépasser
   la France.
6. Le reste (refonte visuelle complète) reste en attente de validation par de vrais utilisateurs,
   comme documenté dans `docs/status.md`.

---

# 10. Session autonome — les neuf modules du cahier des charges

Session complète en mode autonome, sans validation intermédiaire, sur la liste des neuf modules
priorisés (Constitution, Mémoire, Workflow, Knowledge Graph, Offline First, CRM, Facturation,
Financement, Modules Pays).

**Le rapport détaillé de cette session est dans [`RAPPORT-SESSION.md`](RAPPORT-SESSION.md)** :
état avant/après par module, fichiers produits, décisions, blocages, dette restante, estimation du
travail restant. Cette section n'en garde que l'essentiel.

## 10.1 Ce qui a été construit

Huit lots livrés, chacun testé, typé, linté et compilé avant d'être commité :

1. **Constitution IGNITUX** — corpus de 12 articles, moteur de 5 règles réellement exécutables,
   journal des violations, audit sur données réelles, console `/constitution`.
2. **Mémoire IGINI** — `recall()` injecte enfin les souvenirs dans le contexte des 5 générateurs,
   recherche multi-termes, étiquettes, oubli réservé à l'auteur.
3. **Workflow Engine** — définitions, étapes, conditions évaluées sur l'état réel du projet,
   transitions, exécutions, journal, avancement automatique après génération.
4. **Knowledge Graph** — voisinage à profondeur bornée, plus court chemin, concepts isolés,
   recherche, suppressions.
5. **Offline First** — file d'attente d'écritures, cache de lecture daté, rejeu ordonné, bandeau
   d'état.
6. **CRM** — contacts, entreprises, interactions datées, pipeline.
7. **Facturation** — devis/factures/avoirs, numérotation sans trou, immuabilité après émission,
   règlements, export CSV.
8. **Financement IGNITUX** — apports, répartition des parts en événements datés, dividendes versés.

Plus un neuvième point, plus modeste : **Modules Pays** expose désormais la liste des pays
réellement couverts (la France seule), pour que la lacune soit visible au lieu d'être découverte
devant une liste vide.

## 10.2 Trois défauts trouvés et corrigés

- Le score `confiance` valait `0` en l'absence totale de données — un chiffre affiché sans donnée
  derrière. Trouvé par le moteur constitutionnel lui-même, dès son branchement.
- Aucune table générée par l'IA ne portait de trace de provenance : rien en base ne distinguait un
  contenu produit par Claude d'une saisie humaine. Deux colonnes ajoutées aux cinq tables.
- `tsc` échouait en permanence sur un import `supertest/types` non résolvable, ce qui privait le
  projet de sa vérification de types. Corrigé.

## 10.3 Chiffres de la session

- **290 tests ajoutés** : 375 → **665** (518 backend, 147 frontend), tous verts.
- 59 fichiers créés, 31 modifiés, ~12 200 lignes ajoutées (hors client Prisma généré).
- 16 nouveaux modèles Prisma (35 au total), 4 applications de schéma strictement additives.
- 3 nouvelles pages (`/constitution`, `/crm`, `/facturation`), 2 nouvelles sections projet.
- **Zéro appel à l'API Claude** : aucun des modules construits n'en avait besoin. Budget intact.

## 10.4 L'écart honnête de cette session

Beaucoup de code testé, **rien de vérifié à la main dans un navigateur**. La session s'est déroulée
sans supervision directe, et les tests unitaires tournent contre des dépendances mockées. La
priorité n°1 pour la suite est d'ouvrir l'application et de manipuler réellement les huit modules.

## 10.5 Ce qui reste bloqué sur une décision, pas sur du code

- **Le texte des 24 articles de la Constitution V1** n'a jamais été fourni (le brief porte la
  mention « (Insérer ici…) »). Le corpus actuel transcrit les 12 énoncés réellement donnés.
- **Le modèle économique chiffré** n'existe pas : aucun taux d'entrée, aucune règle de dilution,
  aucune formule de rachat. Financement suit ce qui est décidé, il ne le calcule pas.
- **Un second pays pour la conformité** demande une source officielle fiable, toujours absente.

---

# 11. Vérification des documents-cadres, Constitution V1 et modèle économique

## 11.1 Vérification des 5 documents-cadres contre le code réel

Les cinq `.docx` du dossier « ignitux document pratiques » ont été extraits et confrontés au
code, affirmation par affirmation. **Aucun `.docx` n'a été modifié** — les corrections à faire
sont listées ci-dessous pour être appliquées à la main.

### Ce qui est exact, vérifié dans le code

| Affirmation | Vérification |
|---|---|
| Mot de passe stocké haché, jamais en clair | `bcrypt.hash(password, 10)`, et un hash factice comparé quand l'email n'existe pas (protection contre l'attaque temporelle) |
| Sous-traitants = Supabase + Anthropic uniquement | Dépendances backend : seuls `@anthropic-ai/sdk` et `pg`/`@prisma/adapter-pg` sortent du serveur. Frontend : `next`, `react`, `react-dom`, rien d'autre. Aucun outil de mesure d'audience |
| Marketplace sans transaction financière | Aucune route de paiement, aucun champ bancaire. Le profil ne stocke que rôle, titre, bio, expertise ; le contact, un message |
| Automatisation : crée/ferme des tâches, n'appelle jamais l'IA | La seule occurrence de « Claude » dans `automation.service.ts` est le commentaire qui l'interdit. Actions réelles : `tasks.create`, `tasks.update`, `concept_links.create`, `automation_runs.create` |
| Score vide plutôt qu'un chiffre inventé | Les 5 champs de la fiche sont `number \| null` ; `etincelle` et `confiance` valent `null` sans donnée |
| Aucune action irréversible sans validation humaine | Les 4 suppressions présentes dans les moteurs sont toutes déclenchées par une action utilisateur explicite et gardées par une vérification de propriété. Aucun moteur ne supprime de lui-même |
| Le nom exact du modèle n'est pas cité | Les documents disent « Claude, développé par Anthropic » — le fournisseur, jamais `claude-opus-5`. Rien à corriger, c'est le bon niveau |

### Écart trouvé et corrigé dans le code

**La traçabilité IA existait en base mais n'était affichée nulle part.** La Charte affirme que
« chaque contenu produit par un générateur IGINI reste identifiable comme tel dans l'historique du
projet ». C'était vrai des colonnes `generated_by`/`generated_model`, et faux à l'écran : aucune
vue n'affichait la provenance. Un marqueur `ProvenanceBadge` a été ajouté sur les cinq cartes de
contenu généré. Un modèle inconnu s'y lit « modèle non tracé » et non « écrit par un humain » —
ce sont deux choses différentes.

### Corrections à faire dans les `.docx` (à appliquer à la main)

**Version du 19 septembre 2026, vérifiée champ par champ contre `prisma/schema.prisma`.** Elle
remplace la liste de la veille, qui était incomplète sur le CRM (elle ignorait deux tables sur
trois) et devenue fausse sur le Financement (elle disait qu'aucun calcul n'y était fait, ce qui a
cessé d'être vrai quand le modèle économique a été encodé). Les textes ci-dessous sont rédigés
pour être collés tels quels.

#### 1. CGU/RGPD, §2.2 « Données collectées » — la correction la plus importante

Remplacer la liste actuelle par :

> Dans le cadre de cette version de test, les données suivantes peuvent être collectées et
> stockées :
>
> - Adresse email et mot de passe (le mot de passe est stocké sous forme de hachage, jamais en
>   clair).
> - Contenus que vous saisissez : titres et descriptions de projets, tâches, éléments de mémoire,
>   concepts, commentaires, profils Marketplace, messages échangés via la mise en relation,
>   processus (workflows), collaborateurs invités sur un projet.
> - Contacts et relations professionnelles que vous saisissez concernant des tiers : nom, prénom,
>   adresse email, numéro de téléphone, fonction, notes libres, et étape de la relation
>   commerciale ; l'entreprise rattachée (raison sociale, secteur d'activité, site web, notes
>   libres) ; ainsi que l'historique des échanges que vous consignez vous-même (canal, résumé de
>   l'échange, date). Ces personnes n'ont pas donné leur consentement à figurer dans
>   l'Application — voir l'avertissement spécifique ci-dessous.
> - Documents de facturation que vous émettez : nom et coordonnées du client recopiés sur le
>   document, lignes détaillées, montants, taux de TVA que vous saisissez, statut du document, et
>   règlements enregistrés (montant, moyen de paiement, date).
> - Données de financement que vous saisissez : apports reçus (source, montant, date), détenteurs
>   de parts nommés, répartition du capital et son historique daté avec le motif de chaque
>   changement, et dividendes réellement versés. Les noms des détenteurs de parts peuvent
>   concerner des tiers.
> - Contenus générés par l'intelligence artificielle à partir de vos projets (analyses, plans).
> - Jetons techniques liés à l'authentification (réinitialisation de mot de passe, vérification
>   d'email) — à usage unique, jamais stockés en clair.
> - Journaux techniques d'exécution générés par l'Application : exécutions de vos processus,
>   actions du moteur d'automatisation, et démarches de conformité que vous cochez.
> - Journal technique des violations éventuelles des règles internes de l'Application (finalité :
>   sécurité et conformité, pas de profilage).
> - Horodatages techniques de création et de mise à jour des enregistrements. L'Application
>   n'enregistre ni votre adresse IP, ni votre navigateur, ni aucun traceur publicitaire ou outil
>   de mesure d'audience.

Ce que cette liste corrige par rapport à la précédente, et pourquoi :

- **le CRM, c'est trois tables, pas une.** `crm_contacts` (prénom, nom, email, téléphone,
  fonction, notes, type, étape), `crm_companies` (raison sociale, secteur, site, notes) et
  `crm_interactions` (canal, résumé, date). Les deux champs `notes` et le résumé d'échange sont
  du **texte libre sur une personne** : c'est la donnée la plus sensible de l'ensemble, et c'est
  précisément celle qu'on écrit sans y penser ;
- **la facturation stocke l'identité du client.** `client_name` et `client_details` sont
  recopiés et figés sur le document à l'émission. Une liste qui ne parle que de montants passe à
  côté de la seule donnée personnelle de tiers du module ;
- **le financement enregistre du constaté, pas du recherché.** Aucune table de « montant
  recherché » ni de « condition » n'existe. `equity_holders.name` est un nom de personne, qui
  peut être celui d'un tiers ;
- **rien n'est dit de l'adresse IP parce que rien n'est stocké.** Vérifié : aucun champ
  d'adresse IP, aucun user-agent, aucune dépendance de mesure d'audience dans le code. L'écrire
  est à l'avantage d'Ignitux, à condition que ça reste vrai.

#### 2. CGU/RGPD, §2.2 — avertissement à ajouter juste après la liste

> **Avertissement — contacts de tiers (CRM)** : si vous saisissez des informations concernant une
> personne tierce (contact professionnel, prospect, partenaire) dans le module CRM, vous devenez
> vous-même responsable du traitement de ces données au sens du RGPD à l'égard de cette personne.
> L'Application n'a pas connaissance du consentement de ce tiers. Pendant cette phase de test, il
> est demandé de ne pas saisir de coordonnées réelles de tiers dans le CRM.

C'est le paragraphe qui protège réellement les testeurs. S'il ne devait y avoir qu'une seule
correction appliquée avant d'ouvrir l'accès, c'est celle-ci.

#### 3. CGU/RGPD, §2.2, dernière ligne — nuance sur les données bancaires

Remplacer « Aucune donnée bancaire ou de paiement n'est collectée à ce stade… » par :

> Aucun identifiant bancaire ou de paiement (IBAN, numéro de carte) n'est collecté, et aucune
> transaction de paiement ne transite par l'Application. Le module Facturation vous permet en
> revanche d'enregistrer vous-même, à titre purement déclaratif, le montant d'un règlement et sa
> catégorie de moyen de paiement (virement, espèces, carte, chèque, autre). Cette catégorie est
> un simple libellé : aucune coordonnée bancaire réelle n'est demandée, transmise ni conservée.

Formulation à ne pas retenir : « sans traitement ni stockage sécurisé de moyens de paiement
réels ». Elle se lit « on les stocke, mais mal ». Dans un document RGPD, c'est le pire
malentendu possible, et il est involontaire : `billing_payments.method` est une **catégorie**
(`virement | especes | carte | cheque | autre`), pas un identifiant.

#### 4. Trame de décision, §2 — statut du module Financement

Remplacer « module explicitement mis de côté du développement technique, en attente de cette
décision » par :

> **Statut actuel** : le code du module existe (apports reçus, détenteurs de parts, historique
> daté de la répartition du capital, dividendes réellement versés). Depuis la formalisation du
> modèle économique, le code applique deux règles chiffrées, et uniquement celles-là : la
> répartition d'entrée 51 % entrepreneur / 49 % IGNITUX, et la part de 5 % prélevée sur les
> dividendes réellement versés. Il ne calcule ni valorisation du projet, ni prix de rachat, ni
> seuils de rentabilité, d'autonomie ou de stabilité déclenchant le rachat : le modèle nomme ces
> objectifs sans les chiffrer, et les fabriquer reviendrait à décider à la place de l'entrepreneur
> du moment où il peut racheter ses parts. La question de fond — quel rôle juridique IGNITUX
> joue-t-il dans un financement — reste entière et en attente de cette décision.

Formulation à ne pas retenir : « aucun calcul n'y est fait — ni taux, ni dilution, ni formule de
rachat ». C'était vrai jusqu'au 19 septembre et ça ne l'est plus : `financing-model.ts` encode le
51/49 et calcule `perpetualShareCents()`. Écrire « aucun calcul » dans une trame de décision
ferait décider sur une base fausse.

#### 5. Trame de décision, §1, ligne sur les frais fixes

« module Facturation, actuellement à 0 % » est périmé. Le module existe (devis, factures, avoirs,
règlements, export CSV, numérotation sans trou, immuabilité après émission). Remplacer par
« module Facturation, désormais fonctionnel côté code ».

#### 6. Documents-cadres, §5, item CGV

Remplacer l'item actuel par :

> **Conditions Générales de Vente (CGV)** — toujours pas nécessaires : aucun paiement ne transite
> par l'Application. Le module Facturation existe désormais dans le code (génération de documents
> déclaratifs) mais ne traite aucune transaction réelle ; la décision d'un modèle payant reste à
> trancher (voir Trame de décision §1).

#### 7. Feuille de route documentaire, §2, ligne « Conditions de facturation »

> Le module Facturation existe désormais dans le code (génération de documents déclaratifs). Les
> mentions légales obligatoires sur les factures (numérotation, TVA le cas échéant, mentions de
> retard) restent à valider avec un expert-comptable avant toute émission de facture réelle.

#### 8. Modèles de documents futurs, §2.4 — Conditions de facturation

> Le module Facturation existe désormais techniquement. Les mentions légales obligatoires
> (numérotation, TVA le cas échéant, mentions de retard de paiement) restent à valider avec un
> expert-comptable avant toute émission de facture réelle — le code ne garantit pas à lui seul la
> conformité fiscale du document produit.

Cette nuance rejoint mot pour mot ce que l'API renvoie déjà avec chaque liste de documents (voir
`billing-legal.ts` : « ce n'est pas pour autant un logiciel de facturation certifié »).

#### 9. Registre des traitements (Modèles de documents futurs, §4.1) — 3 lignes à ajouter

| Traitement | Finalité | Données concernées | Durée de conservation | Destinataires |
|---|---|---|---|---|
| CRM | Suivi de contacts professionnels | Nom, prénom, email, téléphone, fonction, **notes libres** de tiers ; entreprise rattachée ; **résumés d'échanges** | [à définir] | Interne + Supabase |
| Facturation | Émission de documents déclaratifs | **Nom et coordonnées du client**, montants, TVA saisie, catégorie de moyen de paiement | [à définir] | Interne + Supabase |
| Financement | Suivi du capital et des dividendes | Apports reçus, **noms des détenteurs de parts**, répartition datée, dividendes versés | [à définir] | Interne + Supabase |

### Recommandation pour la phase de test à 2 personnes

Le point 2 se règle en une phrase dans le message d'invitation : demander aux testeurs de ne pas
saisir de vrais contacts dans le module Relations. C'est ce qui a été retenu, et c'est dans le
message qui leur est envoyé (voir §12.3).

## 11.2 Constitution IGNITUX V1 — les 24 articles officiels

Le texte officiel a été transmis. Il remplace le corpus provisoire `principes-fondateurs`, qui
disait explicitement ne pas être la V1 : les deux coexistent en base sous des versions distinctes,
ce que le champ `version` avait été conçu pour permettre.

- **24 articles semés**, vérifié en base : 14 `declared`, 10 `enforced`.
- **Cinq nouvelles règles exécutables**, chacune branchée sur un point d'appel réel :
  - `transition-inexplicable` (art. 11) — le moteur de workflow refuse de franchir une étape dont
    il ne sait pas énoncer la raison ;
  - `memoire-sans-auteur` (art. 12) — un souvenir sans auteur est refusé ;
  - `partage-par-defaut` (art. 13) — un projet naît privé ; la règle attrape une régression où
    `is_public` passerait à `true` par défaut ;
  - `regle-locale-sans-source` (art. 15) — une démarche réglementaire sans source officielle est
    refusée au semis ;
  - `majorite-du-porteur` (art. 22) — une répartition qui ferait passer le porteur sous la
    majorité est refusée, y compris à sa propre demande.
- **Le préambule** (mission, devise, méthode) est exposé et affiché en tête de `/constitution`.
- Un article marqué `enforced` sans règle qui le couvre fait échouer un test — c'est l'article 24
  (Constitution Suprême) qui se vérifie lui-même.

**Note d'honnêteté conservée** : la colonne « Vérifié par le code » n'est pas dans la
Constitution. C'est un constat technique sur ce que notre moteur contrôle, et l'interface le dit
désormais explicitement. Marquer `declared` l'article 16 (Offline First) alors que le module
existe est volontaire : les données déjà chargées restent consultables et les écritures sont mises
en file, mais l'application ne démarre pas hors ligne. Idem pour l'article 17 (Les Gardiens) :
aucun rôle « Gardien » n'existe dans le produit, le marquer `enforced` annoncerait un dispositif
inexistant.

## 11.3 Modèle économique — 51/49, rachat progressif, 5 % perpétuels

Le modèle est désormais défini et encodé. L'avertissement qui disait « le modèle économique
chiffré n'est pas défini à ce jour » était vrai hier et est devenu faux : il a été remplacé.

Ce que le code applique :

- répartition d'entrée **51 % porteur / 49 % Ignitux**, avec un test qui vérifie que 51 % suffit
  à satisfaire la règle de majorité dès le premier jour ;
- **part perpétuelle de 5 %** calculée sur les dividendes réellement versés — la règle est exacte,
  donc calculable, contrairement à tout le reste ;
- **la majorité du porteur est protégée par le moteur constitutionnel** : une écriture qui la
  ferait tomber est refusée.

Ce que le code refuse toujours de calculer, et pourquoi :

- **les seuils de rachat** (rentabilité, autonomie, stabilité) : le modèle les nomme sans les
  chiffrer. Fabriquer des seuils reviendrait à décider à la place du porteur du moment où il peut
  racheter ses parts ;
- **la valorisation du projet** : aucune méthode n'a été choisie, donc aucun prix de rachat ne
  peut en être déduit ;
- **les dividendes prévisionnels** : un dividende se constate après coup.

## 11.4 État après cette étape

**687 tests verts** (539 backend, 148 frontend), types, lint et builds propres. Semis V1 vérifié
en base réelle, zéro violation journalisée. Toujours **aucun appel à l'API Claude** sur cette
session.

---

# 12. Direction artistique et déploiement de test (19 septembre 2026)

## 12.1 « La boussole et le feu »

L'interface avait un accent orange et rien autour. Elle a maintenant une direction artistique
tenue par deux formes, et une règle qui les sépare.

**Le feu** — l'Étincelle de l'article 3. Chaud, en dégradé, jamais plat. Il ne sert qu'à ce que la
personne déclenche elle-même : boutons d'action, marque, étincelle de chargement.

**La boussole** — « la vérité avant tout ». Froide, géométrique, discrète : anneaux gradués,
points cardinaux, filets d'acier. Elle sert à tout ce que le produit *constate*.

La règle entre les deux est une décision de fond, pas un goût : **une donnée mesurée n'est jamais
en flamme.** Une interface qui mettrait un score en dégradé orange aurait l'air d'affirmer ce
qu'elle ne fait que rapporter. C'est la raison d'être de la classe `.notice` (encart neutre) et de
`.pill` (pastille d'état) : elles existent pour que le constat ait une forme à lui.

La marque elle-même dit la même chose : **le Nord de la boussole est la flamme**. Ce qui oriente,
c'est l'Étincelle de la personne — pas l'outil.

Livré : `frontend/src/components/ignitux-mark.tsx` (marque et bloc de marque, réutilisés sur
l'accueil, la connexion, l'inscription et la liste des projets), `frontend/src/app/icon.svg`
(le favicon existant — une étoile à quatre branches orange — devient la boussole complète, même
idée poussée jusqu'au bout), et une réécriture complète de `globals.css` — jeu de
jetons élargi, fond d'ambiance en braise, cartes avec filet de lumière, boutons en dégradé,
titres de section portant une aiguille de boussole, barre de navigation qui passe à la ligne au
lieu de déborder.

Aucun nom de classe existant n'a été supprimé : les écrans non retouchés héritent du nouveau style
sans modification. Les 151 tests frontend passent sans avoir eu à être ajustés à l'apparence.

## 12.2 Interrupteur des générateurs IA

Le test à deux personnes se fait **sans budget IA**. Les 5 générateurs (Analyser, Construire,
Financer, Développer, Transmettre) sont donc éteints — et la façon de les éteindre compte.

**Ce qui a été écarté : retirer la clé API.** Sans clé, l'appel part quand même, échoue côté SDK,
et le testeur voit une erreur. Une erreur dit « c'est cassé ». Or ce n'est pas cassé, c'est
volontairement éteint, et ces deux messages ne doivent pas se ressembler.

**Ce qui a été fait** : une variable `IGINI_AI_ENABLED`. À `"false"`, le verrou se déclenche dans
`ClaudeService.generateStructuredOutput`, **en amont de tout appel réseau**. Les cinq générateurs
passent par ce point unique : aucun ne peut être oublié, et un sixième serait couvert d'office.

Trois propriétés voulues :

- **la dépense est impossible, pas seulement découragée.** Une interface qui se contenterait de
  griser un bouton laisserait l'API atteignable pour qui la connaît. Un test vérifie que le mock
  d'appel réseau n'est **jamais** invoqué quand l'interrupteur est sur `false` ;
- **l'interface sait avant de proposer.** `GET /igini/status` (public, comme `/health`) permet au
  frontend d'afficher « Fonctionnalité IA non disponible pour ce test » à la place du bouton,
  dans un encart neutre — pas un message d'erreur rouge ;
- **dans le doute, on propose.** Si le statut n'est pas encore arrivé, si la requête échoue, ou si
  la réponse est malformée, le bouton reste. Annoncer « indisponible » à tort empêcherait
  quelqu'un d'utiliser une fonctionnalité qui marche. Seule une réponse explicite du serveur
  éteint l'affichage.

Une valeur mal orthographiée (`False`, `0`, `non`) **ne coupe rien** : l'état par défaut d'Ignitux
est un produit complet, et éteindre une fonctionnalité doit être une décision écrite, pas le
résultat d'une variable oubliée.

## 12.3 Déploiement temporaire — réseau local

**Date** : 19 septembre 2026. **Raison** : test unique avec 2 personnes de l'entourage, sur le
même réseau WiFi. **Nature** : temporaire.

**Mode retenu : réseau local**, pas d'hébergement public. Les testeurs étant sur le même WiFi, une
URL publique n'apportait rien et aurait exposé l'API — donc la base Supabase — sur Internet pour
un test d'une heure. Le service tourne depuis le poste du porteur :

| | |
|---|---|
| Adresse partagée | `http://192.168.1.12:3001` |
| Backend | `node dist/main.js`, port 3000, `IGINI_AI_ENABLED=false`, `ANTHROPIC_API_KEY` vidée |
| Frontend | `next start -H 0.0.0.0 -p 3001`, construit avec `NEXT_PUBLIC_API_URL=http://192.168.1.12:3000` |
| Base | Supabase existante — **la même qu'en développement** |

**Les secrets ne sont jamais dans le code, les journaux ni l'URL** : `DATABASE_URL` et
`JWT_SECRET` restent dans `backend/.env`, qui n'est pas versionné. Le `.env` du poste **contient
une vraie clé Anthropic** — c'est précisément pourquoi le processus de test est lancé avec
`ANTHROPIC_API_KEY=` vidée en plus de l'interrupteur : deux verrous indépendants plutôt qu'un.

### Auto-test avant ouverture

Parcours complet rejoué avec un compte dédié (ni celui du porteur, ni ceux des testeurs), contre
le déploiement réel, en envoyant l'`Origin` du frontend pour éprouver aussi CORS : **51
vérifications, 0 échec**. Inscription, connexion, création de projet (privé par défaut), les 5
générateurs répondant **503 avec un message lisible** et non 500, les 4 moteurs transverses
utilisables à la main, Conformité, Marketplace, Constitution, Communauté, CRM, Facturation, et
les 10 pages du frontend.

Un écart trouvé et corrigé avant ouverture : `.brand-word` reposait sur `background-clip: text`
avec `color: transparent`. Sur un navigateur sans support, le nom de la marque aurait été
**invisible**. Replié derrière `@supports`, couleur pleine par défaut.

### Comment arrêter proprement ce déploiement

1. Arrêter les deux processus (`next start` sur 3001, `node dist/main.js` sur 3000).
2. Reconstruire le frontend **sans** la variable LAN — `npm run build` dans `frontend/` — sinon
   le prochain démarrage local continuerait d'appeler `http://192.168.1.12:3000`.
3. Relancer les serveurs de développement habituels (`npm run start:dev`, `npm run dev`).
   L'interrupteur n'étant passé qu'en ligne de commande, les générateurs redeviennent actifs
   d'eux-mêmes — **rien à annuler dans `.env`**.
4. Supprimer les comptes de test s'ils ne servent plus : `testeur1@ignitux.test`,
   `testeur2@ignitux.test`, et les comptes `autotest.claude.*@ignitux.test`.

### Point RGPD à dire aux testeurs

Le §11.1 (points 1 et 2) reste ouvert : la liste des données collectées des CGU **n'inclut pas** les
contacts CRM de tiers. Tant que le `.docx` n'est pas corrigé, les testeurs doivent être invités à
**ne pas saisir de vrais contacts** dans le module Relations. Une phrase dans le message
d'invitation suffit, et c'est ce qui a été retenu.

## 12.4 État après cette étape

**703 tests verts** (552 backend, 151 frontend), types, lint et builds propres des deux côtés.
Déploiement LAN vérifié par 51 contrôles réels. Toujours **aucun appel à l'API Claude** sur cette
session — et désormais, sur cet environnement, aucun n'est possible.

---

# 13. Droit d'accès et droit à l'effacement (19 septembre 2026)

## 13.1 Le défaut

En corrigeant la liste RGPD du §11.1, on a écrit noir sur blanc **dix catégories de données
collectées**. Un audit du code juste après a montré que le seul endpoint du module `users` était
`POST /users/signup` : aucune route pour récupérer ces données, aucune pour les effacer. Les CGU
annonçaient des droits que le code ne savait pas exercer.

C'est exactement le même défaut que la traçabilité IA du §11.1 : une promesse tenue à moitié.
Documenter soigneusement des données qu'on ne sait ni rendre ni supprimer aggrave le problème au
lieu de le régler — le document donne une assurance qui n'existe pas.

## 13.2 Le garde-fou qui empêche l'export de se périmer

`user-data-scope.ts` classe **chaque table du schéma** : soit exportée dans un groupe, soit exclue
avec un motif écrit. Il n'y a pas de troisième possibilité.

Le test lit `prisma/schema.prisma` et vérifie qu'aucun modèle n'échappe à cette classification.
**Ajouter une table sans la classer fait échouer les tests** — au moment où c'est facile à
corriger, et non le jour où quelqu'un demande ses données. Le test inverse existe aussi : une
table classée mais supprimée du schéma échoue également, sinon l'export planterait sur une
requête vers rien. Un troisième test vérifie que la lecture du fichier trouve bien des modèles,
sans quoi les deux premiers passeraient sur une liste vide.

C'est la même mécanique que « chaque article `enforced` est couvert par une règle » (§11.2), et
pour la même raison : une promesse qui ne peut pas se périmer silencieusement.

Les 35 modèles sont couverts. Trois exclusions, motivées dans le fichier d'export lui-même :
jetons d'authentification (matériel de sécurité, sans valeur pour la personne), démarches de
conformité de référence et texte de la Constitution (identiques pour tout le monde).

## 13.3 Ce que le code fait, et pourquoi

**L'export dit aussi ce qu'il ne contient pas.** Un fichier qui se présente comme « toutes tes
données » sans lister ses exclusions ment par omission. Le bloc `non_inclus` reprend les motifs.

**L'export avertit sur les tiers.** Il contient l'intégralité du CRM — donc des coordonnées et
des notes libres sur des personnes qui n'ont rien demandé. Le fichier le dit : « en le
téléchargeant tu en deviens le gardien ».

**La suppression s'annonce avant de s'exécuter.** L'article 8 interdit d'engager une action
irréversible sans validation humaine. `GET /users/me/deletion-preview` renvoie le décompte et,
surtout, les conséquences que la personne ne peut pas deviner :

- **une facture émise doit être conservée dix ans**, et cette obligation lui incombe, pas à
  Ignitux ;
- **les messages envoyés disparaissent aussi chez leurs destinataires**, qui les avaient reçus ;
- **les projets d'autrui ne sont pas supprimés** — seul l'accès est perdu ;
- l'historique de répartition du capital part avec le reste, et Ignitux n'en garde aucune copie.

Un compte vide ne reçoit aucun de ces avertissements : six alertes sur des données inexistantes
rendraient les vraies invisibles.

**Le mot de passe est redemandé.** Un jeton volé ou un onglet resté ouvert ne doit pas suffire à
effacer un compte. Refus en **403 et non 401** : un 401 déclenche la déconnexion automatique
côté frontend, et un mot de passe mal tapé déconnecterait au lieu d'afficher une erreur — le même
piège que celui déjà rencontré sur le changement de mot de passe.

**Le journal constitutionnel est anonymisé, pas effacé.** `constitution_violations` est la seule
table qui référence `users` **sans clé étrangère** : rien n'y cascade, et l'identifiant d'un
compte supprimé y survivrait. On retire l'identifiant et on garde la ligne, dans la même
transaction que la suppression. Le fait reste vérifiable, la personne disparaît.

## 13.4 Deux défauts trouvés en écrivant les tests

**Le hash du mot de passe partait dans l'export.** Le service faisait confiance au `select` de
Prisma pour exclure `password_hash`. Ça marchait, mais il aurait suffi d'élargir ce `select` un
jour — pour ajouter un champ — pour que le hash se retrouve dans un fichier destiné à circuler
par email. L'objet exporté est désormais **recomposé explicitement** : seul ce qui est écrit
sort. Deux protections plutôt qu'une sur le champ le plus dangereux du projet.

**L'export atterrissait dans le `localStorage`.** Côté frontend, `request()` recopie **toute
réponse GET réussie** dans le stockage local pour le mode hors ligne. Utile pour une liste de
projets ; inacceptable pour un export qui contient tout le CRM, et qui serait resté en clair dans
le navigateur longtemps après la fermeture de l'onglet. Ajout d'un `skipOfflineCache`, appliqué à
l'export et à l'aperçu de suppression, avec un test qui vérifie aussi qu'une lecture ordinaire
continue d'être mise en cache — sinon le premier test passerait pour une mauvaise raison.

## 13.5 Vérification

- **27 contrôles réels contre la vraie base Postgres** : compte créé avec des données dans chaque
  module, export relu champ par champ (dont la note libre sur un tiers), aperçu, refus sur
  mauvais mot de passe, suppression, puis vérification que la reconnexion échoue, que le projet
  est inaccessible et que l'email est libéré. Le test nettoie ses propres comptes.
- Lancés sur une **seconde instance backend (port 3100)** pour ne pas perturber le déploiement de
  test en cours sur le 3000.
- **745 tests verts** (584 backend, 161 frontend), lint et types propres des deux côtés.

## 13.6 Un piège de build désamorcé

`next build` lancé pendant qu'un `next start` sert le même `.next` corrompt le répertoire en
cours de lecture, et le site répond 500 — y compris pour quelqu'un en train de l'utiliser. Le
piège a déjà coûté une panne sur ce projet.

`next.config.ts` accepte désormais `NEXT_DIST_DIR` :

    NEXT_DIST_DIR=.next-verif npm run build

vérifie que tout compile sans toucher à ce qui est servi. C'est ce qui a permis de valider le
build de ce lot pendant que le déploiement de test tournait.

**Le déploiement de test n'a pas été mis à jour** : il sert toujours la version du §12, cohérente
et vérifiée. Le rebuild et le redémarrage attendent la fin de la session des testeurs.

---

# 14. Rachat progressif des parts (19 septembre 2026)

## 14.1 La pièce qui manquait

Le document du modèle économique listait six transformations possibles : tables SQL, contrats,
moteur de participation, historique des parts, calcul des dividendes, **workflow de progression**.
Cinq étaient faites (§11.3). La sixième restait ouverte, et pour une raison précise : le modèle
conditionne le rachat à trois objectifs — *rentabilité*, *autonomie*, *stabilité* — qu'il **nomme
sans les chiffrer**.

Le §11.3 avait donc refusé de les calculer, et ce refus reste juste. Mais refuser de calculer
n'obligeait pas à ne rien construire.

## 14.2 Le déplacement : c'est le porteur qui écrit la règle

Inventer des seuils (« rentable = trois mois de bénéfice ») reviendrait à décider à la place du
porteur du moment où il peut racheter ses parts, sur des chiffres qu'Ignitux aurait fabriqués —
exactement ce que l'article 10 interdit.

Alors **le porteur écrit lui-même ce que chaque condition veut dire pour son projet, et c'est lui
qui déclare qu'elle est atteinte.** Ignitux conserve, date et compte. Rien de plus.

Ce n'est pas un pis-aller. Une condition écrite noir sur blanc *avant* d'être atteinte est
beaucoup plus difficile à réinterpréter après coup — par le porteur comme par Ignitux. C'est
précisément ce qu'un modèle 51/49 avec rachat progressif a besoin de rendre solide.

Trois garanties en découlent, chacune testée :

- **une condition non définie ne peut pas être déclarée atteinte.** Sinon on pourrait cocher
  « rentabilité atteinte » sans avoir jamais dit ce que « rentable » voulait dire. Le serveur
  répond 400 avec une phrase qui l'explique ;
- **réécrire une définition remet la condition à « non atteinte ».** Une déclaration ne peut pas
  survivre au changement de ce qu'elle déclarait ;
- **on ne se prononce pas sur une progression incomplète.** `allReached` vaut `null` tant que les
  trois ne sont pas écrites : répondre « non, le rachat n'est pas possible » sur des conditions
  que personne n'a définies serait une affirmation infondée. Même logique que
  `founderHasMajority` sur une répartition qui ne boucle pas à 100 %.

Et même quand les trois sont atteintes, l'écran le dit sans avancer de chiffre : « le prix reste à
négocier, Ignitux ne le calcule pas ». Aucune méthode de valorisation n'a été choisie.

## 14.3 Le garde-fou de la veille a fonctionné

La nouvelle table `buyback_objectives` a été poussée en base. **Le test de couverture du schéma
écrit au §13.2 a échoué dans la minute** :

    AssertionError: expected [ 'buyback_objectives' ] to deeply equal []

C'est exactement ce pour quoi il avait été écrit : une table ajoutée sans être classée dans le
périmètre des données personnelles casse le build, au lieu de manquer silencieusement à l'export
RGPD jusqu'au jour où quelqu'un demande ses données. La table a été classée dans le groupe
`financement`, et l'export la contient — vérifié en base réelle.

## 14.4 Prudence sur la base de production

La base Supabase est la même en développement et pour la session de test. Avant d'y toucher, le
SQL a été inspecté :

    npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script

Résultat : un `CREATE TABLE`, deux `CREATE INDEX`, un `ADD FOREIGN KEY`. **Aucun `DROP`, aucun
`ALTER` sur une table existante.** Purement additif, donc sans risque pour les données en place.
La règle à garder : sur cette base, on lit le diff avant de pousser.

## 14.5 Vérification

- **32 contrôles réels** contre le déploiement LAN et la vraie base : état initial, définition,
  refus de déclarer une condition non définie, refus d'une condition hors modèle, les trois
  atteintes, annulation par réécriture, présence dans l'export RGPD, suppression du compte de
  test, et les 8 pages du frontend.
- **769 tests verts** (600 backend, 169 frontend), lint et types propres des deux côtés.
- Toujours **aucun appel à l'API Claude**.

## 14.6 Déploiement remis en service

Les deux processus du §12.3 s'étaient arrêtés entre-temps. Ils ont été relancés **avec tout le
travail des §13 et §14** : même adresse `http://192.168.1.12:3001`, générateurs IA toujours
éteints (vérifié : `generatorsEnabled: false`, et un générateur appelé répond 503 avec son
message lisible).

Les testeurs disposent donc maintenant, en plus : du bouton « Télécharger mes données », de la
suppression de compte avec aperçu, et de la section « Rachat progressif des parts ».
