# État du projet

Dernière vérification : 20/09/2026. Mis à jour à chaque changement notable — pas reconstruit de
mémoire, toujours en relançant les vérifications ci-dessous.

## Comment vérifier ces chiffres soi-même

```bash
cd backend  && npx tsc --noEmit && npm run lint && npx vitest run
cd frontend && npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

Les tests de bout en bout ont besoin d'une vraie base et se lancent à part :

```bash
cd backend && npm run test:e2e
```

Au 20/09/2026 : **681 tests unitaires backend**, **109 tests de bout en bout**, **216 tests
frontend**, lint et type-check propres des deux côtés. **132 routes HTTP**, **42 tables**,
**15 pages**.

## Trois bases, séparées depuis le 19/09/2026

| Base | Usage |
|---|---|
| `postgres` | développement, et pour l'instant le déploiement de test |
| `ignitux_prod` | vraies personnes — vierge de toute donnée de développement |
| `ignitux_test` | tests de bout en bout, qui refusent de tourner ailleurs |

Même instance Supabase, donc données isolées mais pas infrastructure. Voir `docs/decisions.md`.

## Complet et testé

- **Comptes** — inscription/connexion JWT, bcrypt, rate-limiting, réinitialisation de mot de passe,
  vérification d'email, changement de mot de passe. **Limite** : `MailService` journalise au lieu
  d'envoyer, tant qu'aucun fournisseur n'est choisi — donc les deux premiers flux ne peuvent pas
  atteindre un utilisateur réel.
- **Données personnelles (RGPD)** — export complet au format JSON, aperçu de suppression, et
  suppression de compte exigeant le mot de passe. L'export dit aussi ce qu'il ne contient pas. Un
  test lit `schema.prisma` et échoue si une table n'est pas classée : l'export ne peut pas se
  périmer en silence.
- **Projets** — CRUD, visibilité publique/privée, collaboration multi-comptes.
- **Constitution** — les 24 articles de la V1, dont **11 appliqués** par **13 règles exécutables**
  branchées sur de vrais points d'écriture. Journal des violations, audit qui mesure 9 articles à
  partir de comptages réels en base. Un test échoue si un article déclaré appliqué n'a pas de
  règle.
- **4 moteurs transverses** (mémoire, connaissance, workflow, score) — lecture ouverte aux
  collaborateurs, écriture réservée au porteur.
- **Automation (5ᵉ moteur)** — agit sans confirmation préalable, mais n'appelle jamais l'IA et
  journalise chaque exécution.
- **CRM** — entreprises, contacts, historique d'échanges. **Attention RGPD** : contient des
  données de tiers (voir `PROGRESS.md` §11.1).
- **Facturation** — devis, factures, avoirs, règlements, export CSV, numérotation sans trou,
  immuabilité après émission. **Ce n'est pas un logiciel certifié** : l'avertissement accompagne
  chaque réponse de l'API.
- **Financement** — apports, détenteurs de parts, historique daté de la répartition, dividendes
  réellement versés. Le modèle 51/49 est encodé, la part perpétuelle de 5 % calculée, et la
  majorité du porteur protégée par le moteur constitutionnel.
- **Rachat progressif** — les trois conditions du modèle (rentabilité, autonomie, stabilité) sont
  définies **par le porteur lui-même**, qui déclare aussi quand elles sont atteintes. Ignitux ne
  fabrique aucun seuil et ne calcule aucun prix de rachat.
- **Compliance (France)** — 12 démarches, toutes sourcées individuellement. Pas un avis juridique.
- **Marketplace** — annuaire mentors/investisseurs, mise en relation par message. Aucune
  circulation d'argent.
- **Communauté** — projets publics, encouragements.
- **Interrupteur IA** — `IGINI_AI_ENABLED=false` bloque les 5 générateurs **en amont de tout appel
  réseau**. Un test vérifie que l'appel n'est jamais émis.

## Partiel

- **Offline First (article 16)** — la file d'écriture et le cache de lecture daté existent et sont
  solides ; les données déjà chargées restent consultables hors ligne et les écritures sont mises
  en file. Mais **l'application ne démarre pas hors ligne** : il n'y a pas de service worker, et
  il n'y en aura pas tant qu'aucune vérification navigateur réelle n'est possible. L'article reste
  donc marqué « énoncé », ce qui est la formulation honnête.
- **Knowledge graph** — visualisation SVG réelle, mais alimentation manuelle ; l'auto-liaison par
  mot-clé reste une heuristique, pas une extraction sémantique.
- **Vérification d'email** — un compte non vérifié reste pleinement utilisable. Choix délibéré
  tant que la décision produit n'est pas prise.
- **Les 5 générateurs IGINI** — code complet, et vérifiés en pipeline réel le 19/09/2026. Ils sont
  **actuellement éteints** faute de décision sur le budget.

## Bloqué (décision ou ressource externe nécessaire)

Chacun de ces points attend une réponse précise — la question exacte est dans `ESTIMATION.md`.

- **Fournisseur d'email** — lequel ? Le branchement ne touche qu'une classe.
- **Budget et modèle IA** — quel plafond, sur quel modèle ? Rallumer est une variable
  d'environnement. `claude-opus-5` est le plus cher de la gamme.
- **Les Gardiens (article 17)** — qui est Gardien, et que peut-il empêcher ? Sans réponse à la
  seconde question, le rôle n'a pas de traduction en code.
- **Montage juridique du 51/49** — contrat généré par Ignitux, ou modèle rédigé ailleurs ?
- **Compliance hors France** — la structure supporte déjà le champ `country` ; il manque des
  sources officielles pour la Suisse et le Portugal. Fabriquer du contenu réglementaire serait
  dangereux.
- **Marketplace avec transactions** — sortirait du cadre actuel (KYC, DSP2).

## Ce qui n'a jamais été vérifié

**Rien de ce qui a été construit depuis le 19/09 n'a été regardé dans un navigateur.** Les tests
couvrent la logique, les routes, les refus, les cascades, le contraste des couleurs et la
structure du balisage — pas le rendu réel sur un écran, encore moins sur un téléphone. C'est à
cela que sert la session avec les deux testeurs.

## Hors scope, par choix assumé (pas un oubli)

- **Scores fabriqués** — un score renvoie `null` plutôt qu'un chiffre inventé sans donnée réelle.
- **Service worker** — voir « Partiel » ci-dessus : c'est une limite de vérification, pas un
  désintérêt.
- **Hébergement public** — le déploiement de test est en réseau local, ce qui suffit pour des
  testeurs sur le même WiFi et n'expose pas la base sur Internet.
