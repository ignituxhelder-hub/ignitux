# État du projet

Dernière vérification : 19/09/2026. Mis à jour à chaque changement notable — pas reconstruit de
mémoire, toujours en relançant les vérifications ci-dessous.

## Comment vérifier ces chiffres soi-même

```bash
cd backend && npx tsc --noEmit -p tsconfig.build.json && npm run lint && npx vitest run
cd frontend && npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

Au 19/09/2026 : **261 tests backend**, **67 tests frontend**, lint et type-check propres des deux
côtés, build frontend réussi (14 routes).

## Complet et testé

- **Comptes** — inscription/connexion JWT, bcrypt, rate-limiting, réinitialisation de mot de passe,
  vérification d'email, et changement de mot de passe une fois connecté (voir `docs/decisions.md`
  pour la limite du `MailService` qui accompagne les deux premiers — journalisé, pas de vrai envoi
  tant qu'aucun fournisseur n'est choisi).
- **Projets** — CRUD, visibilité publique/privée, collaboration multi-comptes (backend + frontend).
- **5 générateurs IGINI** — code complet (schémas Zod, prompts, persistance, mémoire commune
  correcte), testés unitairement, et **désormais vérifiés en conditions réelles, les 5, en
  pipeline complet** le 19/09/2026 (clé API configurée, compte crédité) : Analyser → Construire →
  Financer → Développer → Transmettre exécutés à la suite sur un même projet de test, chacun
  produisant un résultat cohérent et exploitant correctement le contexte des étapes précédentes
  (ex : le plan de construction cite explicitement le score de faisabilité de l'analyse). Le score
  final (`confiance: 10`) et la fermeture automatique des 4 tâches d'étape par Automation ont aussi
  été vérifiés dans la foulée. Projet de test supprimé après coup. **À surveiller** : le modèle
  configuré (`claude-opus-5`, `backend/src/igini/claude/claude.service.ts`) est le plus cher de la
  gamme — un usage régulier de test peut consommer vite le budget de 50€/mois ; passer à un modèle
  plus économique pour l'expérimentation est une option à décider, pas encore tranchée.
- **4 moteurs transverses** (mémoire, connaissance, workflow, score) — CRUD réels, avec interface
  frontend, accessibles en lecture au propriétaire ET aux collaborateurs du projet (écriture
  réservée au propriétaire).
- **Communauté** — projets publics, encouragements, confidentialité vérifiée avec deux comptes réels.
- **Automation (5ᵉ moteur)** — contrairement aux 4 moteurs ci-dessus, celui-ci agit sans confirmation
  humaine préalable : après chaque génération IA (et manuellement via un bouton), il crée/ferme des
  tâches d'étape (`assignee: 'igini'`, `source: 'automation'`) et relie automatiquement les concepts
  qui partagent un mot significatif. Testé unitairement et **vérifié en conditions réelles** (5
  tâches créées sur un projet vide, tâche fermée automatiquement après une vraie analyse). Deux
  garde-fous volontaires : il n'appelle jamais l'API Claude lui-même (pour ne jamais consommer le
  budget IA sans supervision), et chaque exécution est journalisée (`automation_runs`, visible dans
  l'UI) pour rester consultable après coup — voir `backend/src/igini/automation/automation.service.ts`.
- **Compliance (France)** — liste de référence de 12 démarches réglementaires (création,
  fiscalité, social, activités réglementées…), rédigée à partir de sources publiques citées
  individuellement (service-public.fr, URSSAF, impots.gouv.fr, INSEE, CNIL…), suivie par projet
  (case à cocher). **Ce n'est pas un avis juridique** — disclaimer explicite renvoyé par l'API et
  affiché dans l'UI. Volontairement générique et non exhaustif : pas de montants/seuils précis qui
  périmeraient (TVA, plafonds…), chaque point renvoie vers la source qui les tient à jour. Limité à
  la France pour l'instant — voir `backend/src/compliance/compliance-requirements.ts`.
- **Marketplace (annuaire mentors/investisseurs)** — profil (rôle, titre, bio, expertise),
  annuaire filtrable, mise en relation par message. **Aucune circulation d'argent** (pas de
  paiement, pas de gestion de participation) — choix assumé, voir `docs/decisions.md`.

## Partiel

- **Knowledge graph** — vraie visualisation SVG, mais alimentation manuelle uniquement (pas
  d'extraction automatique depuis les plans générés) — l'auto-liaison par mot-clé du moteur
  Automation est une première brique dans cette direction, mais reste une heuristique simple, pas
  une extraction sémantique.
- **Vérification d'email** — le compte reste utilisable sans vérifier son email (aucune route n'est
  bloquée par `email_verified_at`). Choix délibéré pour ne pas verrouiller l'accès tant que la
  décision produit ("faut-il l'exiger, et où ?") n'est pas prise — voir `docs/decisions.md`.

## Bloqué (décision ou ressource externe nécessaire)

- **Financement (modèle économique réel)** — le générateur `igini/financing/` produit un texte de
  plan, mais aucune logique d'abonnement, d'investissement ou d'équité n'existe. Nécessite une
  décision produit/légale.
- **Compliance hors France** — la structure (table `compliance_requirements`, endpoints, UI) est
  générique et supporte déjà un champ `country`, mais aucun contenu n'existe pour un autre pays.
  Nécessite une vraie source réglementaire fiable par pays ciblé.
- **Marketplace avec transactions financières** — si un jour de l'argent doit circuler (mentorat
  payant, prise de participation), cela sort du cadre actuel et nécessite un cadrage légal/fiscal
  (KYC, DSP2…) qui n'a pas été fait.

## Hors scope, par choix assumé (pas un oubli)

- Architecture offline-first.
- Scores de confiance/réputation fabriqués — un score renvoie `null` plutôt qu'un chiffre inventé
  quand il n'y a pas de vraie donnée.
- Refonte de l'identité visuelle/UX — l'identité actuelle (fond sombre, accent orange) est conservée
  tant que le produit n'est pas validé par de vrais utilisateurs.
