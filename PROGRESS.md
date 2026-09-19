# PROGRESS — session autonome du 19/09/2026

## ⚠️ Écart constaté avant de commencer

Le prompt de lancement de cette session décrit le projet comme étant en **« Phase 1 (Fondations :
backend, base de données, auth) »** d'une roadmap en 8 phases, avec un frontend "prévu" (pas encore
construit) et une Phase 2 "Knowledge Engine" à venir après.

**Ce n'est pas l'état réel du dépôt.** Vérifié directement (pas une supposition) :

- Le frontend Next.js existe déjà et fonctionne (auth, projets, communauté, collaboration, 4 moteurs
  IGINI) — pas "prévu", déjà construit et testé (43 tests).
- Le "Knowledge Engine" (moteur Connaissance) mentionné comme Phase 2 future existe déjà et est
  testé, avec interface frontend et visualisation en graphe.
- Idem pour un moteur Mémoire, un moteur Workflow et un moteur Score — les 4 moteurs transverses
  existent déjà.
- 167 tests backend + 43 tests frontend passent au démarrage de cette session.
- État réel détaillé et à jour : [`docs/status.md`](docs/status.md), [`docs/architecture.md`](docs/architecture.md).

**Décision prise** : je continue sur l'état réel du dépôt plutôt que de rejouer une "Phase 1" déjà
largement dépassée. Je garde l'esprit des règles de travail autonome données (pas de confirmation
pour des choix mineurs, pas de destruction sans le signaler, tests systématiques, commits réguliers,
contournement documenté des blocages) et je les applique aux vrais chantiers restants — en priorité
ceux qui touchent l'auth/les fondations, comme demandé, puisqu'il en reste deux vrais : la
réinitialisation de mot de passe et la vérification d'email, toutes deux bloquées jusqu'ici par
l'absence d'un service d'envoi d'email.

## Session en cours — actions prévues

1. `MailService` — abstraction d'envoi d'email avec un transport de secours (log) par défaut, pour
   ne pas rester bloqué sans service d'email réel (règle 6 : contourner temporairement, documenter).
2. Réinitialisation de mot de passe (backend + tests + frontend).
3. Vérification d'email (backend + tests + frontend).
4. Vérification complète (tsc/lint/tests/build) après chaque étape.
5. Mise à jour de `docs/status.md` et `docs/decisions.md`.

Cette section sera remplacée par le vrai compte-rendu à la fin de la session.
