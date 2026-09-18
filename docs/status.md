# État du projet

Dernière vérification : 18/09/2026. Mis à jour à chaque changement notable — pas reconstruit de
mémoire, toujours en relançant les vérifications ci-dessous.

## Comment vérifier ces chiffres soi-même

```bash
cd backend && npx tsc --noEmit -p tsconfig.build.json && npm run lint && npx vitest run
cd frontend && npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

Au 18/09/2026 : **167 tests backend**, **43 tests frontend**, lint et type-check propres des deux
côtés, build frontend réussi (8 routes).

## Complet et testé

- **Comptes** — inscription/connexion JWT, bcrypt, rate-limiting.
- **Projets** — CRUD, visibilité publique/privée, collaboration multi-comptes (backend + frontend).
- **5 générateurs IGINI** — code complet (schémas Zod, prompts, persistance, mémoire commune
  correcte). Testés unitairement. **Pas testés en conditions réelles avec succès** — voir la section
  Bloqué ci-dessous.
- **4 moteurs transverses** (mémoire, connaissance, workflow, score) — CRUD réels, avec interface
  frontend, strictement réservés au propriétaire du projet (pas encore aux collaborateurs).
- **Communauté** — projets publics, encouragements, confidentialité vérifiée avec deux comptes réels.

## Partiel

- **Collaboration** — le collaborateur voit le projet et l'historique des 5 générateurs, mais pas
  les 4 moteurs transverses.
- **Knowledge graph** — vraie visualisation SVG, mais alimentation manuelle uniquement (pas
  d'extraction automatique depuis les plans générés).

## Bloqué (décision ou ressource externe nécessaire)

- **Génération IA réelle** — `ANTHROPIC_API_KEY` doit être configurée dans `backend/.env` pour que
  les 5 générateurs fonctionnent de bout en bout. Sans elle, chaque appel échoue avec une erreur 500
  (message désormais spécifique — voir `docs/decisions.md`). **Statut au 18/09/2026 (soir) : en
  cours de configuration, pas encore confirmé fonctionnel avec une preuve réelle (diagnostic en
  cours sur pourquoi `backend/.env` n'affichait pas la clé lors des dernières vérifications).**
- **Financement (modèle économique réel)** — le générateur `igini/financing/` produit un texte de
  plan, mais aucune logique d'abonnement, d'investissement ou d'équité n'existe. Nécessite une
  décision produit/légale.
- **Modules pays (One Brain, Multiple Regulations)** — rien n'existe. Nécessite un pays cible et une
  source réglementaire fiable ; inventer du contenu légal serait dangereux à présenter comme fiable.
- **Communauté avancée** (mentors, investisseurs, mise en relation) — aucune spec.
- **Réinitialisation de mot de passe / vérification d'email** — nécessite un service d'envoi
  d'email, même blocage de principe que la clé Claude (décision + configuration externes).

## Hors scope, par choix assumé (pas un oubli)

- Architecture offline-first.
- Scores de confiance/réputation fabriqués — un score renvoie `null` plutôt qu'un chiffre inventé
  quand il n'y a pas de vraie donnée.
- Moteur d'automatisation qui exécute des tâches sans supervision humaine.
- Refonte de l'identité visuelle/UX — l'identité actuelle (fond sombre, accent orange) est conservée
  tant que le produit n'est pas validé par de vrais utilisateurs.
