# IGNITUX V1 — Test privé — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Amener IGNITUX à une V1 utilisable par un petit groupe de testeurs invités : compte, connexion, tous les générateurs IGINI de bout en bout, historique, PWA installable, protections de coût/sécurité, minimum légal RGPD, déployée en ligne (backend Render/Railway, frontend Vercel).

**Architecture:** Le backend NestJS et le frontend Next.js existants sont déjà très avancés (build + tests passent, aucun générateur n'est un stub). Le travail restant est surtout de l'**intégration et de la mise en conformité** : nettoyer l'état git, fusionner un générateur déjà prêt dans un worktree isolé, retirer du périmètre bêta deux modules déjà codés mais hors scope V1, écrire les pages légales manquantes, activer le garde-fou de coût déjà construit, puis déployer.

**Tech Stack:** NestJS 12, Prisma 7 (Postgres/Supabase), Next.js 15 / React 19, Vitest, `@anthropic-ai/sdk`, Render ou Railway (backend), Vercel (frontend).

**Spec:** `docs/superpowers/specs/2026-09-30-v1-test-prive.md`

## Global Constraints

- Budget IA total ≤ 50 €/mois — déjà modélisé (`PRICING.md` : 2 €/utilisateur/mois) et appliqué par `backend/src/igini/usage/ai-quota.ts` ; ne jamais l'affaiblir.
- `ANTHROPIC_API_KEY` ne doit jamais apparaître côté frontend (vérifié : 0 occurrence dans `frontend/src` — à revérifier après tout changement touchant l'API).
- Isolation stricte par utilisateur sur toutes les requêtes Prisma (`owner_id`/`user_id`) — vérifiée sur le code existant, ne jamais l'affaiblir.
- Hors scope V1 (ne pas construire de nouveau) : multi-pays, scores Étincelle, rôles mentor/investisseur, marketplace, mode hors-ligne, applications sur les stores.
- Tout code produit reste simple : c'est une V1 de test, pas une nouvelle architecture.
- Toute action irréversible, tout compte/paiement à créer, tout secret manquant, tout texte légal à valider → **STOP**, ne pas continuer sans réponse de Helder.
- Tout texte visible par un utilisateur est en français simple.

## Review Focus

1. Un testeur supprime son compte puis se réinscrit avec le même email → doit fonctionner proprement, sans erreur de contrainte unique orpheline (Tâche 1, à tester en Tâche 9).
2. Un testeur dépasse son quota IA du jour/mois → message d'erreur clair en français, jamais une erreur 500 brute (Tâche 5).
3. Un testeur installe l'app depuis Safari iPhone puis Chrome Android → "Ajouter à l'écran d'accueil" fonctionne des deux côtés (déjà vérifié OK par l'audit ; retest en Tâche 9 sur la version en ligne, pas seulement en local).
4. Un testeur modifie l'URL pour deviner l'identifiant d'un projet qui n'est pas le sien → reçoit une erreur, jamais les données d'un autre (déjà vérifié côté code ; retest en Tâche 9).
5. Le serveur mail n'est pas configuré en production → la réinitialisation de mot de passe échoue silencieusement pour un testeur qui a oublié son mot de passe (Tâche 7/8 : soit configurer un vrai SMTP, soit vérifier que le message d'erreur est clair).

---

## Décisions déjà prises (pas de question nécessaire — cohérent avec ta propre demande)

- **Auth : on garde le JWT + bcrypt maison**, pas de réécriture vers Supabase Auth. Le système actuel est déjà testé, sécurisé, et isole bien chaque utilisateur ; Supabase reste utilisé comme base Postgres. Réécrire l'authentification serait un gros risque pour zéro bénéfice sur une V1 de test. (Tu avais écrit "de préférence" — si tu tiens vraiment à Supabase Auth, dis-le et on en discute, sinon je continue comme ça.)
- **Portefeuille investisseur et Mentors & investisseurs (marketplace) sont masqués pour la bêta.** Ces deux modules existent déjà dans le code (construits avant cette conversation), mais toi-même tu as mis "rôles mentor/investisseur" et "marketplace" hors scope V1, et le module investisseur n'a jamais été revu par un juriste. Je les masque du bureau et j'empêche leur activation pendant la bêta (le code reste là, rien n'est supprimé, réactivable en une ligne plus tard).
- **La boutique en ligne (Shopify) et le chat libre avec IGINI ne sont pas fusionnés pour cette V1.** Ce sont deux branches de travail réelles et avancées, mais aucune des deux n'est demandée dans ta liste V1 — les fusionner ajouterait du risque (conflits avec le code juste livré) sans bénéfice pour le test. Elles restent disponibles pour une V2.

---

## Task 1 — Nettoyer l'état de `main` et obtenir une base de tests fiable

**Files:**
- Modifier/committer : les ~50 fichiers déjà modifiés/ajoutés listés par `git status` (PWA, observability, tests).
- Créer (commit) : `backend/prisma/migrations/20260929144415_baseline/` (actuellement non suivi par git).
- Vérifier : `frontend/src/app/projects/[id]/engine-sections.tsx` (le correctif `MemoryCategory` doit être présent), `frontend/src/app/investisseur/page.tsx` et `frontend/src/app/investisseur/page.spec.tsx` (un test échoue réellement : le composant affiche "Mon portefeuille", le test attend "Portefeuille global").

**Interfaces:** Aucune nouvelle interface — ce sont des correctifs et des commits sur du code existant.

- [ ] **Étape 1 : relire `git status` et regrouper les fichiers par sujet logique** (PWA/manifest, observability/rapporteur d'erreurs, correctifs de tests, docs) pour faire des commits clairs plutôt qu'un seul gros commit.
- [ ] **Étape 2 : committer chaque groupe** avec un message conventionnel (`feat(pwa): ...`, `fix(observability): ...`, etc.).
- [ ] **Étape 3 : committer `backend/prisma/migrations/` séparément** avec le message `chore(db): commit the baseline Prisma migration` — sans cette étape, personne d'autre (ni un déploiement propre) ne peut recréer la base.
- [ ] **Étape 4 : relancer les tests backend seul**, sans aucun autre process npm en parallèle (pour éliminer le bruit mémoire constaté pendant l'audit) :
  ```
  cd backend && npm test
  ```
  Attendu : 1206/1206. Si un échec persiste hors timeout mémoire, investiguer avant de continuer.
- [ ] **Étape 5 : relancer les tests frontend seul**, sans build en parallèle :
  ```
  cd frontend && npm test
  ```
  Attendu : au moins 498/499 (le vrai échec `investisseur` reste à corriger à l'étape suivante).
- [ ] **Étape 6 : corriger le test `investisseur` qui échoue réellement.** Lire `frontend/src/app/investisseur/page.tsx` ligne du titre et `page.spec.tsx` ligne de l'assertion `Portefeuille global` — aligner l'un sur l'autre (le texte affiché à l'écran fait foi ; corriger le test s'il est en retard sur le composant, ou l'inverse si le composant a une régression). Comme ce module sera masqué en Tâche 3, ce correctif est rapide et sert juste à ne pas laisser un test rouge dans le dépôt.
- [ ] **Étape 7 : relancer `npm test` frontend une dernière fois** → 499/499 attendu.
- [ ] **Étape 8 : commit final** : `test: stabilize investisseur page test`.

---

## Task 2 — Fusionner le 6ᵉ générateur (forme juridique) depuis `feat/generateur-former`

Ce générateur recommande une forme juridique (micro-entreprise/EI/EURL/SASU/SARL/SAS) en s'appuyant sur Claude + recherche web, avec les hypothèses toujours affichées explicitement. Il est déjà fini, testé, et **sans aucun conflit** avec `main` (le point de fusion de la branche est exactement le commit actuel de `main`).

**Files:**
- Fusion de la branche `feat/generateur-former` (voir `backend/src/igini/former/`, intégration dans `backend/src/projects/projects.service.ts`, `frontend/src/app/.../forme-juridique-resultat.tsx`).
- Nouvelles tables Prisma : `legal_form_recommendations`, `legal_form_assumptions`, `legal_form_alternatives`, `legal_form_sources`.

**Interfaces:**
- Consomme : le pipeline de génération existant (`ClaudeService.generateStructuredOutput`, `AiUsageService.assertWithinQuota`) — mêmes signatures que les 5 autres générateurs.
- Produit : un enregistrement `legal_form_recommendations` par projet, déclenché automatiquement quand une analyse obtient ≥ 8/10, ou manuellement.

- [ ] **Étape 1 :** `git merge feat/generateur-former` dans `main` (aucun conflit attendu — si un conflit apparaît malgré tout, s'arrêter et comprendre pourquoi avant de résoudre).
- [ ] **Étape 2 :** régénérer le client Prisma (`cd backend && npx prisma generate`).
- [ ] **Étape 3 :** générer une vraie migration versionnée pour les 4 nouvelles tables (main vient de passer de `db push` à des migrations versionnées, cette branche a été faite avant ce changement) :
  ```
  cd backend && npx prisma migrate dev --name add_legal_form_recommendation
  ```
- [ ] **Étape 4 :** `cd backend && npm run build && npm test` → attendu build ok, 0 échec réel.
- [ ] **Étape 5 :** `cd frontend && npm run build && npm test` → attendu build ok (vérifier qu'aucune régression `engine-sections.tsx` ne réapparaît), 0 échec réel.
- [ ] **Étape 6 :** commit : `feat(igini): fusionner le générateur de forme juridique`.

---

## Task 3 — Restreindre le bureau au périmètre V1

**Files:**
- Modifier : `backend/src/applications/applications-catalogue.ts` (ou le service qui compose la liste pour un utilisateur, `backend/src/applications/applications.service.ts`).
- Modifier : `backend/src/roles/roles-catalogue.ts` / `roles.service.ts` (limiter les rôles proposables).

**Interfaces:**
- Consomme : `APPLICATIONS: readonly Application[]` et `ROLES` existants — aucun changement de forme, juste un filtre.
- Produit : la même fonction `findApplication`/liste du bureau, mais sans `portefeuille` (Portefeuille investisseur) ni `reseau` (Mentors & investisseurs / `/marketplace`) tant que la bêta est active ; le rôle `investisseur` n'est plus proposable à la sélection.

- [ ] **Étape 1 :** ajouter une constante `MASQUEES_EN_BETA_V1: ApplicationId[] = ['portefeuille', 'reseau']` dans `applications-catalogue.ts`, et filtrer ces ids dans la fonction qui compose le bureau d'un utilisateur (`applications.service.ts`) quand `process.env.IGNITUX_BETA_V1 !== 'false'` (activé par défaut, désactivable plus tard sans redéploiement de code).
- [ ] **Étape 2 :** dans `roles-catalogue.ts`/`roles.service.ts`, faire que la sélection de rôle ne propose que `entrepreneur` pendant la bêta (même logique de flag) ; garder `investisseur` déclaré dans le vocabulaire (rien ne casse pour un utilisateur qui l'aurait déjà, aucun utilisateur existant n'en a).
- [ ] **Étape 3 :** vérifier que les routes `/investisseur` et `/marketplace` elles-mêmes refusent l'accès pendant la bêta plutôt que de juste ne plus apparaître dans le bureau (redirection propre vers `/accueil`, pas une page cassée) — c'est le vrai garde-fou, le masquage du bureau n'est que du confort.
- [ ] **Étape 4 :** tests : ajouter/mettre à jour les specs de `applications.service.spec.ts` et `roles.service.spec.ts` pour couvrir "pendant la bêta, `portefeuille` et `reseau` n'apparaissent pas" et "le rôle investisseur n'est pas proposable".
- [ ] **Étape 5 :** `npm test` backend + frontend → 0 échec.
- [ ] **Étape 6 :** commit : `feat: limiter le bureau et les rôles au périmètre de la bêta V1`.

---

## Task 4 — Pages légales minimales (RGPD) + avertissement "indicatif"

**⚠️ STOP après cette tâche : le texte légal doit être validé par Helder avant que de vrais testeurs y accèdent.** Le texte ci-dessous est un premier jet raisonnable pour une bêta de test gratuite, en français, pas un avis juridique définitif.

**Files:**
- Créer : `frontend/src/app/confidentialite/page.tsx`
- Créer : `frontend/src/app/cgu/page.tsx`
- Créer : `frontend/src/app/mentions-legales/page.tsx`
- Modifier : `frontend/src/app/account/page.tsx` (ajouter des liens vers les 3 pages, à côté de "Supprimer mon compte" ligne 236).
- Modifier : `frontend/src/app/signup/page.tsx` (case à cocher "j'ai lu et j'accepte les CGU" obligatoire avant inscription).
- Modifier : les vues qui affichent une recommandation juridique/fiscale (`forme-juridique-resultat.tsx`, `constitution/page.tsx`) — ajouter la mention indicative.

**Interfaces:** trois pages statiques simples (pas de nouvel état global), plus une prop/condition sur le formulaire d'inscription existant.

- [ ] **Étape 1 : créer `/confidentialite`.** Contenu à adapter avec Helder (raison sociale/adresse/email viendront de `IGNITUX_RAISON_SOCIALE`/`IGNITUX_ADRESSE`/`IGNITUX_EMAIL`, déjà exigées par le serveur en production) :
  - Qui collecte les données (Ignitux, coordonnées).
  - Quelles données (compte, projets, résultats des générateurs, usage IA) — s'appuyer sur `docs/registre-de-traitements.md`, déjà écrit et tenu à jour automatiquement.
  - Pourquoi (fournir le service, rien d'autre — pas de revente, pas de publicité).
  - Sous-traitants : Anthropic (génération IA), hébergeur de base de données, hébergeur d'infrastructure.
  - Durée de conservation : tant que le compte existe ; suppression immédiate et totale à la demande (déjà vrai en code).
  - Droits RGPD (accès, rectification, effacement, portabilité) et comment les exercer : page "Mon compte" → export et suppression, déjà fonctionnels.
  - Mention "version test" : ce service est en phase de test privé, pas encore un produit commercial public.
- [ ] **Étape 2 : créer `/cgu`.** Contenu :
  - Objet : accès à IGINI pendant une phase de test privé, gratuite, sur invitation.
  - Absence de garantie de disponibilité ou de continuité du service pendant la bêta.
  - Les recommandations d'IGINI (forme juridique, analyses, plans financiers) sont **indicatives**, générées par IA, et ne remplacent pas l'avis d'un professionnel (comptable, avocat, expert-comptable) — reprendre cette phrase mot pour mot partout où c'est pertinent.
  - Les testeurs s'engagent à ne pas partager leurs identifiants et à signaler les bugs.
  - Résiliation : suppression du compte possible à tout moment, par le testeur ou par Ignitux (fin de la phase de test).
- [ ] **Étape 3 : créer `/mentions-legales`.** Identité de l'éditeur (variables d'env légales), hébergeur (à compléter une fois choisi en Tâche 7), contact.
- [ ] **Étape 4 :** lier les 3 pages depuis `/account` (section en bas, avant ou après "Supprimer mon compte").
- [ ] **Étape 5 :** ajouter une case à cocher obligatoire sur `/signup` ("J'ai lu et j'accepte les [conditions d'utilisation](/cgu) et la [politique de confidentialité](/confidentialite)"), désactiver le bouton d'inscription tant qu'elle n'est pas cochée. Test : `signup/page.spec.tsx` vérifie que l'inscription est bloquée sans la case cochée.
- [ ] **Étape 6 :** ajouter la mention indicative directement sur les écrans de résultat des générateurs à caractère juridique/fiscal (forme juridique, constitution) — un petit encart visible, pas une ligne perdue en bas de page.
- [ ] **Étape 7 :** `npm test` frontend → 0 échec, build ok.
- [ ] **Étape 8 :** commit : `feat(legal): ajouter les pages RGPD minimales et l'avertissement indicatif`.
- [ ] **Étape 9 : STOP.** Envoyer le texte des 3 pages à Helder pour validation avant la Tâche 8 (déploiement réel visible par les testeurs). Le travail peut continuer sur les tâches suivantes en attendant sa réponse, mais la mise en ligne finale (Tâche 8) attend son "OK" sur ce texte précis.

---

## Task 5 — Calibrer et activer le contrôle de coût IA pour la bêta

Le garde-fou existe déjà (`backend/src/igini/usage/ai-quota.ts`, `AiUsageService.assertWithinQuota`, `IGINI_AI_ENABLED`). Il faut juste le régler pour un petit groupe de testeurs et l'activer en production.

**Files:**
- Modifier : `backend/src/offres/offres-catalogue.ts` (quota du plan attribué aux testeurs bêta).
- Modifier : `backend/.env.example` (documenter la valeur recommandée pour la bêta).

**Interfaces:**
- Consomme : `checkQuota()` existant (coût €/mois/utilisateur + nombre d'appels/mois).
- Produit : aucune nouvelle interface, juste des valeurs de configuration.

- [ ] **Étape 1 :** relire `offres-catalogue.ts` pour voir le plan par défaut attribué à un nouvel utilisateur et son quota d'appels/mois.
- [ ] **Étape 2 :** calculer un plafond raisonnable pour la bêta : avec `DEFAULT_COST_MICRO_EUR_PER_MONTH` à 2 €/utilisateur/mois, un groupe de 10 testeurs actifs reste sous 20 €/mois, largement sous les 50 €. Documenter ce calcul dans un commentaire à côté de la constante.
- [ ] **Étape 3 :** vérifier que le message d'erreur renvoyé quand le quota est dépassé est clair et en français (Review Focus #2) — lire le texte exact retourné par `checkQuota()` et, si besoin, l'ajuster pour qu'il dise concrètement "tu as atteint ta limite de X analyses ce mois-ci" plutôt qu'un message technique.
- [ ] **Étape 4 :** documenter dans `backend/.env.example` que `IGINI_AI_ENABLED=true` est requis en production (actuellement `false` par défaut car désactivé en CI/dev).
- [ ] **Étape 5 :** `npm test` backend (specs de `ai-quota` et `offres`) → 0 échec.
- [ ] **Étape 6 :** commit : `chore(igini): calibrer le quota IA pour la bêta privée`.

---

## Task 6 — Préparer la configuration de déploiement (sans déployer)

**Files:**
- Créer : `docs/deploiement-v1.md` (liste consolidée des variables d'environnement + procédure).
- Vérifier : `backend/Dockerfile`, `frontend/Dockerfile` (déjà présents et sains d'après l'audit CI) — Render/Railway peuvent démarrer directement depuis un Dockerfile, donc pas de nouveau fichier de config obligatoire ; Vercel build nativement le frontend Next.js (ne pas utiliser le Dockerfile frontend pour Vercel).

**Interfaces:** aucune — documentation et vérification uniquement.

- [ ] **Étape 1 :** écrire `docs/deploiement-v1.md` avec la liste complète des variables d'environnement (déjà identifiées par l'audit) et, pour chacune, sa valeur pour la bêta :

  **Backend (Render ou Railway) :**
  | Variable | Valeur bêta |
  |---|---|
  | `NODE_ENV` | `production` |
  | `DATABASE_URL` | fournie par Helder (Supabase, base `ignitux_prod`, pas `postgres`) |
  | `JWT_SECRET` | généré (`openssl rand -base64 48`), différent de dev |
  | `JWT_EXPIRES_IN` | `1d` |
  | `FRONTEND_URL` | URL Vercel finale, en `https://` |
  | `TRUST_PROXY` | `1` (Render/Railway sont derrière un proxy) |
  | `MAIL_TRANSPORT` | `smtp` si un fournisseur est configuré (Tâche 7), sinon `log` en sachant que la réinitialisation de mot de passe sera indisponible |
  | `MAIL_FROM`, `SMTP_HOST/PORT/USER/PASSWORD` | fournies par Helder si `smtp` |
  | `ENABLE_API_DOCS` | `false` |
  | `IGNITUX_RAISON_SOCIALE`, `IGNITUX_ADRESSE`, `IGNITUX_EMAIL` | fournies par Helder (obligatoires, le serveur refuse de démarrer sans) |
  | `PAIEMENT_FOURNISSEUR` | `aucun` |
  | `ANTHROPIC_API_KEY` | fournie par Helder |
  | `IGINI_AI_ENABLED` | `true` |
  | `PORT` | injecté par l'hébergeur |

  **Frontend (Vercel) :**
  | Variable | Valeur bêta |
  |---|---|
  | `NEXT_PUBLIC_API_URL` | URL du backend Render/Railway — **doit être définie avant le build**, pas seulement au démarrage |

- [ ] **Étape 2 :** vérifier que `backend/src/config/production-preflight.ts` couvre bien toutes ces variables et refuse un démarrage silencieusement incomplet (déjà confirmé par l'audit — juste relire pour être sûr avant le vrai déploiement).
- [ ] **Étape 3 :** commit : `docs(deploiement): préparer la liste des variables et la procédure V1`.

---

## Task 7 — STOP : comptes et secrets à fournir par Helder

Rien de codable ici — instructions précises pour toi, clic par clic. Réponds avec les informations demandées et je passe à la Tâche 8.

1. **Hébergement backend — Render ou Railway** (les deux ont un plan gratuit/pas cher suffisant pour une bêta) :
   - Aller sur https://render.com (ou https://railway.app), créer un compte (email ou GitHub).
   - Créer un nouveau "Web Service" branché sur ce dépôt GitHub, dossier `backend/`, build via Dockerfile.
   - Ne pas encore cliquer sur "Deploy" — dis-moi juste "compte créé" et je te donnerai les réglages exacts (variables d'environnement de la Tâche 6) au moment de déployer.
2. **Hébergement frontend — Vercel** :
   - Aller sur https://vercel.com, créer un compte, "Import Project" depuis ce dépôt GitHub, dossier `frontend/`.
   - Pareil, ne pas encore déployer.
3. **Base de données de production** : soit tu as déjà un projet Supabase, soit il faut en créer un sur https://supabase.com (compte gratuit) → nouveau projet → récupérer la "Connection string" (mode "Transaction pooler", pas "Session") dans Project Settings → Database. **Donne-moi cette URL de connexion en message privé, jamais dans un fichier du dépôt.**
4. **Clé Anthropic (IGINI)** : si tu n'as pas encore de clé API de production séparée de ta clé de développement, va sur https://console.anthropic.com, section API Keys, crée-en une nouvelle dédiée à la production. Donne-la-moi en message privé.
5. **Identité légale minimale** (obligatoire pour que le serveur démarre) : donne-moi la raison sociale à afficher, l'adresse, et l'email de contact à utiliser dans les mentions légales et les emails.
6. **Email (optionnel pour la bêta, recommandé)** : sans ça, "mot de passe oublié" ne fonctionnera pas. Un compte gratuit sur Brevo (https://brevo.com) donne un accès SMTP suffisant pour un petit groupe — dis-moi si tu veux qu'on le configure ou si on laisse ça de côté pour ce premier test.
7. **Nom de domaine** : pas obligatoire — Render/Railway et Vercel donnent chacun une URL gratuite (`*.onrender.com`/`*.up.railway.app` et `*.vercel.app`), suffisante pour un test privé.

- [ ] **STOP — attendre les informations 1 à 5 ci-dessus (6 et 7 sont optionnelles) avant de continuer.**

---

## Task 8 — Déployer réellement

**Files:** aucun nouveau fichier — configuration sur les tableaux de bord Render/Railway et Vercel, à partir des informations de la Tâche 7.

- [ ] **Étape 1 :** sur Render/Railway, configurer les variables d'environnement backend (tableau de la Tâche 6), déclencher le déploiement, suivre les logs de build.
- [ ] **Étape 2 :** une fois le backend démarré, exécuter la migration de production **une seule fois** : `npx prisma migrate deploy` (via la console de l'hébergeur ou en local avec `DATABASE_URL` pointée sur la prod) — action irréversible sur une base réelle, donc vérifier deux fois l'URL avant de lancer.
- [ ] **Étape 3 :** vérifier `GET /ready` sur l'URL backend en production → doit répondre en bonne santé (aucune table manquante).
- [ ] **Étape 4 :** sur Vercel, configurer `NEXT_PUBLIC_API_URL` avec l'URL backend de production, déclencher le build, vérifier qu'il compile.
- [ ] **Étape 5 :** revenir sur Render/Railway et mettre à jour `FRONTEND_URL` avec l'URL Vercel finale (pour que CORS accepte les requêtes du frontend).
- [ ] **Étape 6 :** commit (doc uniquement) : `docs(deploiement): noter les URLs de production` dans `docs/deploiement-v1.md` (jamais de secret dedans, seulement les URLs publiques).

---

## Task 9 — Vérification finale bout-en-bout + livrables

- [ ] **Étape 1 :** sur l'URL Vercel en production, avec un vrai navigateur (pas juste `curl`) : créer un compte, se déconnecter, se reconnecter.
- [ ] **Étape 2 :** utiliser chaque générateur IGINI (Analyser, Construire, Financer, Développer, Transmettre, Forme juridique) sur un projet de test, vérifier que chaque résultat apparaît bien dans l'historique du projet.
- [ ] **Étape 3 :** vérifier la page Consommation IA — le coût de ces tests doit y apparaître.
- [ ] **Étape 4 :** vérifier que `/investisseur` et `/marketplace` ne sont pas accessibles pendant la bêta (Tâche 3).
- [ ] **Étape 5 :** vérifier l'installation PWA sur un vrai téléphone (Android et/ou iPhone) depuis l'URL de production.
- [ ] **Étape 6 :** vérifier les pages `/confidentialite`, `/cgu`, `/mentions-legales` sont bien en ligne et lisibles.
- [ ] **Étape 7 :** supprimer le compte de test créé à l'étape 1, vérifier que les données ont bien disparu (relister via l'API si besoin) — Review Focus #1 : re-créer un compte avec le même email juste après, vérifier que ça marche sans erreur.
- [ ] **Étape 8 :** rédiger les livrables finaux pour Helder (lien en ligne, ce qui a été fait, ce qui reste à améliorer, guide 5 lignes pour les testeurs).

---

## Self-Review

**1. Couverture de la spec :** DB/migrations (T1), comptes (déjà existant + T4 case CGU), générateurs de bout en bout (T2, déjà vérifiés pour les 5 premiers), frontend complet (déjà vérifié, T3 pour le périmètre), protections clé/quota/erreurs (déjà vérifié + T5), légal RGPD (T4), PWA (déjà vérifié, T9 retest en ligne), mise en ligne (T6-T8), vérification finale (T9). Tout est couvert.

**2. Placeholders :** aucun texte "TBD"/"à compléter plus tard" laissé dans les tâches — le texte légal de T4 est un vrai premier jet, pas un espace vide (mais reste explicitement soumis à validation, ce qui est différent d'un placeholder technique).

**3. Cohérence des types/noms :** `MASQUEES_EN_BETA_V1`, `IGNITUX_BETA_V1`, `IGINI_AI_ENABLED` utilisés de façon cohérente entre T3/T5/T6.

**4. Review Focus :** les 5 points ont chacun leur tâche/étape de test associée (voir table ci-dessus).
