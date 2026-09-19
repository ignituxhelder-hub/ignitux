# État du projet

Dernière vérification : 19/09/2026. Mis à jour à chaque changement notable — pas reconstruit de
mémoire, toujours en relançant les vérifications ci-dessous.

## Comment vérifier ces chiffres soi-même

```bash
cd backend && npx tsc --noEmit -p tsconfig.build.json && npm run lint && npx vitest run
cd frontend && npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

Au 19/09/2026 : **199 tests backend**, **54 tests frontend**, lint et type-check propres des deux
côtés, build frontend réussi (13 routes).

## Complet et testé

- **Comptes** — inscription/connexion JWT, bcrypt, rate-limiting, réinitialisation de mot de passe,
  vérification d'email, et changement de mot de passe une fois connecté (voir `docs/decisions.md`
  pour la limite du `MailService` qui accompagne les deux premiers — journalisé, pas de vrai envoi
  tant qu'aucun fournisseur n'est choisi).
- **Projets** — CRUD, visibilité publique/privée, collaboration multi-comptes (backend + frontend).
- **5 générateurs IGINI** — code complet (schémas Zod, prompts, persistance, mémoire commune
  correcte). Testés unitairement. **Pas encore testés en conditions réelles avec succès** — la clé
  API est désormais configurée et acceptée par Anthropic, mais le compte n'a pas de crédit
  disponible ; voir la section Bloqué ci-dessous.
- **4 moteurs transverses** (mémoire, connaissance, workflow, score) — CRUD réels, avec interface
  frontend, accessibles en lecture au propriétaire ET aux collaborateurs du projet (écriture
  réservée au propriétaire).
- **Communauté** — projets publics, encouragements, confidentialité vérifiée avec deux comptes réels.

## Partiel

- **Knowledge graph** — vraie visualisation SVG, mais alimentation manuelle uniquement (pas
  d'extraction automatique depuis les plans générés).
- **Vérification d'email** — le compte reste utilisable sans vérifier son email (aucune route n'est
  bloquée par `email_verified_at`). Choix délibéré pour ne pas verrouiller l'accès tant que la
  décision produit ("faut-il l'exiger, et où ?") n'est pas prise — voir `docs/decisions.md`.

## Bloqué (décision ou ressource externe nécessaire)

- **Génération IA réelle** — `ANTHROPIC_API_KEY` est configurée dans `backend/.env` depuis le
  19/09/2026 (le blocage précédent, où le fichier restait inchangé malgré plusieurs tentatives, est
  résolu). **Testé en conditions réelles** : `POST /projects/:id/analyze` contacte bien l'API
  Anthropic et la clé est acceptée (organisation/workspace reconnus), mais la requête échoue avec
  `invalid_request_error` : **« Your credit balance is too low to access the Anthropic API »**.
  Autrement dit, ce n'est plus un problème de code ni de configuration — c'est un compte Anthropic
  sans crédit. Il faut ajouter des crédits (Plans & Billing sur console.anthropic.com), dans la
  limite du budget de 50€/mois déjà fixé, avant que les 5 générateurs puissent produire un résultat.
  Point d'attention une fois débloqué : le modèle configuré (`claude-opus-5`,
  `backend/src/igini/claude/claude.service.ts`) est le plus cher de la gamme — à surveiller de près
  vu le budget serré, un modèle plus économique pourrait être préférable pour un usage
  d'expérimentation régulier (décision produit, pas prise unilatéralement ici).
- **Financement (modèle économique réel)** — le générateur `igini/financing/` produit un texte de
  plan, mais aucune logique d'abonnement, d'investissement ou d'équité n'existe. Nécessite une
  décision produit/légale.
- **Modules pays (One Brain, Multiple Regulations)** — rien n'existe. Nécessite un pays cible et une
  source réglementaire fiable ; inventer du contenu légal serait dangereux à présenter comme fiable.
- **Communauté avancée** (mentors, investisseurs, mise en relation) — aucune spec.

## Hors scope, par choix assumé (pas un oubli)

- Architecture offline-first.
- Scores de confiance/réputation fabriqués — un score renvoie `null` plutôt qu'un chiffre inventé
  quand il n'y a pas de vraie donnée.
- Moteur d'automatisation qui exécute des tâches sans supervision humaine.
- Refonte de l'identité visuelle/UX — l'identité actuelle (fond sombre, accent orange) est conservée
  tant que le produit n'est pas validé par de vrais utilisateurs.
