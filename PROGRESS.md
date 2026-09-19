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

## Bloqué — pas contourné, car un contournement serait mentir

- **Génération IA réelle (les 5 générateurs IGINI)** — `ANTHROPIC_API_KEY` toujours absente de
  `backend/.env` au moment de clore cette session (vérifié directement, fichier inchangé). Ce point
  a déjà fait l'objet d'un long diagnostic dans une session précédente (l'utilisateur pensait
  l'avoir ajoutée à plusieurs reprises, sans que ça se reflète dans le fichier réel) — je n'ai pas
  de nouvelle piste à essayer sans une information supplémentaire de la part de l'utilisateur, donc
  je n'ai pas retenté à l'aveugle une énième fois.
- **Financement (modèle économique réel)**, **Modules pays**, **Communauté avancée** — inchangés,
  toujours en attente de décisions/sources externes (voir `docs/status.md`). Je n'ai pas inventé de
  modèle économique, de contenu réglementaire, ou de spec pour ces trois, car le faire serait
  fabriquer du contenu présenté comme fiable sans l'être — contraire à la devise du projet.

## Décisions techniques prises (détail dans `docs/decisions.md`)

- Table `auth_tokens` unique et partagée pour les deux usages (reset + vérification), plutôt que
  deux tables séparées — même forme de données, distinguées par `purpose`.
- `MailService` isolé dans son propre module pour que brancher un vrai fournisseur plus tard soit
  un changement d'une seule classe.
- Vérification d'email non bloquante (voir limite ci-dessus).
- 403 (pas 401) pour un mauvais mot de passe actuel sur `/auth/me/password`, pour ne pas déclencher
  la déconnexion automatique du frontend sur une simple faute de frappe.

## Rien de destructif

Tous les changements de schéma sont additifs (nouvelle table, nouvelle colonne nullable). Aucune
donnée existante modifiée ou supprimée. Aucun appel payant déclenché (le budget IA de 50€/mois n'a
pas été entamé — aucun appel à l'API Claude n'a été fait, la clé n'étant toujours pas configurée).

## Vérifié à chaque étape

- Backend : 208 tests (+41 depuis le début de session), `tsc --noEmit` propre, `oxlint` propre.
- Frontend : 57 tests (+14), `tsc --noEmit` propre, `eslint` propre, build de production réussi
  (13 routes).
- Tout poussé sur `main`, historique de commits clair (voir `git log`).

## Estimation chiffrée demandée en cours de session

Sur demande explicite, une estimation d'avancement (phase par phase) et de coût de développement a
été écrite dans [`ESTIMATION.md`](ESTIMATION.md) — audit du code réel, pas une extrapolation. Point
notable qui en ressort : le code des 5 générateurs IA (phase "IGINI") est écrit à ~85% mais vérifié
à ~0% en conditions réelles, faute de clé API — cohérent avec le blocage documenté ci-dessus.

## Prochaines étapes recommandées

1. **Débloquer la clé Claude** — vérifier une dernière fois `backend/.env` toi-même avec
   `type backend\.env` (ou `Get-Content` en PowerShell) et coller le résultat exact si ça ne
   correspond toujours pas à ce qui est attendu ; sinon, c'est prêt à tester dès que la clé y est.
2. **Décider si la vérification d'email doit être obligatoire**, et où (bloquer la connexion ?
   certaines actions seulement ?) — le mécanisme existe, il ne manque que la règle.
3. **Choisir un fournisseur d'email réel** quand la décision produit sera prise — un seul fichier à
   changer (`backend/src/mail/mail.service.ts`).
4. Le reste (financement, modules pays, communauté avancée, refonte visuelle complète) reste en
   attente de tes décisions, comme documenté dans `docs/status.md`.
