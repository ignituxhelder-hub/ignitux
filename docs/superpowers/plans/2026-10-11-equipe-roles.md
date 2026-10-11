# Équipe et rôles (livraison 1) — plan de construction

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal :** des rôles par projet (associé, salarié, comptable, observateur) appliqués partout côté
serveur, et l'interface qui suit.

**Architecture :** un module pur de droits + un point d'accès unique `exigerCapacite` qui remplace,
projet par projet, les contrôles « propriétaire » / « lecteur » des services.

**Tech Stack :** NestJS, Prisma 7, Vitest ; Next.js 15.

**Spec :** `docs/superpowers/specs/2026-10-11-equipe-roles-design.md`

## Global Constraints

- Rôles exactement : `proprietaire` (implicite, jamais stocké), `associe`, `salarie`, `comptable`,
  `observateur`. Capacités exactement celles du §3 de la spec.
- 404 sans accès au projet, 403 avec phrase lisible quand le rôle ne permet pas.
- Les filtres `owner_id` des modules de compte (compta, banque, facturation, CRM, agenda, immobilier,
  stocks) ne changent pas.
- Un appel IGINI déclenché par un associé est attribué au propriétaire (`usage.userId = ownerId`).
- Français partout ; commits sans accents, chemins explicites, `Co-Authored-By: Claude Opus 5.5`.
- Ne jamais pousser : Helder pousse ; migration avant le push.

## Review Focus

1. **Un salarié qui appelle directement une route de modification** (sans passer par l'interface) :
   403, jamais un succès → tests par module (tâche 3 à 6).
2. **Un ancien collaborateur** (ligne sans rôle explicite) : devient observateur, garde la lecture,
   perd toute écriture qu'il n'avait déjà pas → test tâche 1.
3. **Un associé qui épuise le quota** : c'est le quota du propriétaire qui baisse → test tâche 3.
4. **Le comptable** ne doit voir ni les tâches ni la mémoire du projet → tests tâche 4.
5. **Changement de rôle pendant qu'une personne a la page ouverte** : le serveur refuse selon le
   rôle courant, à chaque requête (pas de cache de droits) → test tâche 1.

---

### Task 1 : rôles, droits et point d'accès
- Migration `20261011140000_equipe_roles` + `role String @default("observateur")` sur
  `project_collaborators`.
- `backend/src/equipe/droits-equipe.ts` (+ spec : la matrice entière du §3).
- `backend/src/equipe/acces-projet.ts` : `accesProjet`, `exigerCapacite` (+ spec : 404/403/propriétaire,
  ancien collaborateur = observateur, rôle relu à chaque appel).
- Commit `feat(equipe): roles, tableau des droits et point d'acces unique`.

### Task 2 : l'équipe côté serveur
- `GET /projects/:id/mon-acces` ; collaborateurs avec rôle (POST avec rôle, PATCH rôle, liste avec
  rôle) ; email à la personne invitée (`MailService`, ne fait jamais échouer l'ajout).
- Tests contrôleur + service. Commit `feat(equipe): inviter avec un role, changer de role, mon-acces`.

### Task 3 : `projects.service` sous les droits
- Lectures → `voir_projet` (plans de financement → `voir_plan_financement`) ; modifications →
  `modifier_projet` ; générateurs/automatisation → `lancer_ia` avec attribution au propriétaire ;
  suppression → `supprimer_projet` ; équipe → `gerer_equipe` ; forme confirmée → `modifier_projet`.
- Tests : salarié 403 en modification ; associé lance un générateur attribué au propriétaire.
- Commit `feat(equipe): droits sur le projet et ses generateurs`.

### Task 4 : modules IGINI du projet
- `workflow`, `workflow-engine`, `execution` (exécuter une tâche = `lancer_ia`), `memory`,
  `knowledge`, `scoring`, `compliance` → capacités du §3.
- Tests : salarié coche une tâche ; comptable 404/403 sur tâches et mémoire ; observateur ne modifie rien.
- Commit `feat(equipe): droits sur les taches, la memoire et la conformite`.

### Task 5 : financement et évaluation
- `financing`, `investors` (partie projet), `participation`, `finance-audit`, `evaluation-financement`.
- Évaluation : demande = `demander_evaluation` ; liste/PDF = `voir_evaluation`, contenu toujours
  masqué tant que non validée.
- Commit `feat(equipe): droits sur le financement et l'evaluation`.

### Task 6 : documents juridiques
- `statuts`, `dossier-creation`, `immatriculation`, `identite/mandats` (partie projet) : lecture =
  `voir_documents_juridiques`, écriture = `actes_juridiques`.
- Commit `feat(equipe): droits sur les documents juridiques`.

### Task 7 : interface
- `api.ts` : `getMonAcces`, collaborateurs avec rôle, `changerRoleCollaborateur`.
- Fiche projet : étapes et boutons selon `capacites` ; section « Équipe » avec rôle à l'invitation,
  changement de rôle, description des rôles.
- Commit `feat(equipe): interface selon le role et gestion de l'equipe`.

### Task 8 : vérification et mise en ligne
- Suites complètes, e2e, build, démarrage réel ; revue finale ; consignes à Helder
  (migration puis push) ; vérification sur ignitux.com.
