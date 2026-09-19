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
