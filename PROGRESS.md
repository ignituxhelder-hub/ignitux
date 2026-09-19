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

1. **Trame de décision, §1, ligne sur les frais fixes** — « module Facturation, actuellement à
   0 % » est périmé. Le module existe (devis, factures, avoirs, règlements, export CSV,
   numérotation sans trou, immuabilité après émission). Remplacer par « module Facturation,
   désormais fonctionnel côté code ».
2. **Trame de décision, §2, statut** — « module explicitement mis de côté du développement
   technique » est périmé. Le suivi des apports, des parts et des dividendes existe.
   Remplacer par « suivi technique en place ; le modèle économique est désormais défini ».
3. **Feuille de route, §2, ligne « Conditions de facturation »** — même correction que le point 1.
4. **Modèles de documents futurs, §2.4** — même correction que le point 1.
5. **CGU/RGPD, §2.2 « Données collectées »** — **la correction la plus importante.** La liste
   omet des catégories qui existent maintenant en base et sont accessibles aux testeurs :
   - **contacts CRM** : nom, prénom, e-mail, téléphone et notes **de tiers** (prospects, clients
     du testeur). C'est un point RGPD sérieux : le testeur devient lui-même responsable de
     traitement pour ces personnes, qui n'ont jamais consenti à figurer dans Ignitux ;
   - **documents de facturation** : nom et coordonnées du client, montants, règlements ;
   - **données de financement** : apports, répartition des parts, dividendes versés ;
   - **processus (workflows) et leur journal d'exécution** ;
   - **collaborateurs de projet**, **jetons d'authentification** (hachés), **journal des
     violations constitutionnelles** (qui stocke un identifiant utilisateur).
6. **CGU/RGPD, §2.2, dernière ligne** — « Aucune donnée bancaire ou de paiement n'est collectée »
   demande une nuance. C'est exact pour les **identifiants** bancaires (aucun IBAN, aucun numéro
   de carte, aucune route de paiement). Ce n'est plus exact au sens large : le module Facturation
   enregistre des **montants** et un **moyen de paiement** (virement, espèces, carte, chèque).
   Formulation proposée : « Aucun identifiant bancaire (IBAN, numéro de carte) n'est collecté et
   aucun paiement ne transite par l'Application. Le module Facturation enregistre en revanche les
   montants et le moyen de paiement que tu saisis toi-même. »
7. **Registre des traitements (Modèles de documents futurs, §4.1)** — ajouter les trois lignes
   manquantes : CRM (données de tiers), Facturation, Financement.

### Recommandation pour la phase de test à 2 personnes

Le point 5 mérite une décision avant d'ouvrir aux testeurs : soit leur demander de ne pas saisir
de vrais contacts dans le CRM pendant le test, soit compléter la liste RGPD. La première option
est la plus simple et se règle en une phrase dans le message d'invitation.

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

Le §11.1 (point 5) reste ouvert : la liste des données collectées des CGU **n'inclut pas** les
contacts CRM de tiers. Tant que le `.docx` n'est pas corrigé, les testeurs doivent être invités à
**ne pas saisir de vrais contacts** dans le module Relations. Une phrase dans le message
d'invitation suffit, et c'est ce qui a été retenu.

## 12.4 État après cette étape

**703 tests verts** (552 backend, 151 frontend), types, lint et builds propres des deux côtés.
Déploiement LAN vérifié par 51 contrôles réels. Toujours **aucun appel à l'API Claude** sur cette
session — et désormais, sur cet environnement, aucun n'est possible.
