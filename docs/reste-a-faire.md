# Ce qui reste à faire — IGNITUX

26 septembre 2026. Inventaire honnête de ce qui n'est pas encore terminé,
classé par priorité. Ce qui bloque l'ouverture d'abord, ce qui peut attendre
ensuite.

---

## MISE À JOUR DU 8 OCTOBRE 2026

Fait depuis l'inventaire du 26 septembre, et maintenant dans `main` :
- Générateur « Former » (recommandation de forme juridique) et générateur de
  **Statuts** (brouillon puis « retenu », PDF, avertissement juridique).
- Vérification d'identité et mandats.
- Chat IGINI, boutique en ligne (Shopify, optionnelle), tâches IA.
- **Dossier de création** (8/10) : liste des pièces selon la forme, récapitulatif PDF,
  guide pas à pas du guichet unique, suivi du dépôt. La personne dépose elle-même ;
  Ignitux ne dépose ni ne paie rien.
- Export RGPD complété (14 tables qui n'étaient pas lues), avec un test qui l'empêche de se périmer.
- Confirmation avant de changer de forme quand des statuts sont retenus.
- Modèle de participation IGNITUX (100/0, droit de 5 % sur les dividendes) —
  sa relecture par un juriste n'a pas eu lieu (voir `docs/juridique/`).

**Migrations écrites mais appliquées nulle part** (base partagée de dev) :
`statuts`, `participation_ignitux`, `taches_ia`, `chat_igini`, `boutique`,
`identite_et_mandats`, `dossier_creation`. Avant de les appliquer : une ligne orpheline
`20261003120000_statuts` existe dans `_prisma_migrations` de la base partagée,
de propriétaire inconnu — l'identifier avant tout `migrate resolve`/`reset`.

**Reste à faire sans payer :**
- Rattacher le projet à l'entreprise immatriculée, avec compta et banque (sous-projet 4).
- Décider si des statuts retenus peuvent être déverrouillés quand la forme change.
- Décider si les photos de pièce d'identité entrent dans l'export RGPD (avis juridique).
- Lancer une première fois `npm run test:charge` contre le serveur local.
- Équipe : toujours reportée (permissions « chacun voit ce qu'il doit voir »).

---

## BLOQUANTS — sans ça, on n'ouvre pas

### 1. Hébergement et domaine *(attend Helder)*

Zéro ligne de code à écrire. Deux décisions :
- Choisir entre Railway (~15 $/mois) et Scalingo (~14,40 €/mois).
- Acheter le domaine (`ignitux.fr` ou `ignitux.com`).

Une fois le domaine en place, `verifier-production.mjs` passe de 1 bloquant
à 0 bloquant, et on peut déployer.

Voir [`hebergement.md`](hebergement.md) et [`deployer.md`](deployer.md).

### 2. Mot de passe SMTP *(attend Helder)*

`SMTP_PASSWORD` manque dans `.env.production`. Sans lui, `MAIL_TRANSPORT`
reste `log` et les mails (inscription, réinitialisation) ne partent pas.

---

## À FAIRE AVANT LE DÉPLOIEMENT *(code prêt ou quasi)*

### 3. ~~Brancher le rapporteur d'erreurs~~ — fait (26/09/2026)

`error.filter.ts` appelle maintenant `signalerErreur` pour toute réponse
5xx, avec la même référence que celle montrée à la personne. Les 4xx ne
sont pas signalées. Un collecteur injoignable ne change pas la réponse.
Reste l'adresse `ERREURS_WEBHOOK_URL` à poser au déploiement (point 7).

### 4. ~~Catégorie `error` manquante dans le module mémoire IGINI~~ — fait (26/09/2026)

### 5. ~~Tâches non créées pour 3 générateurs~~ — fait (26/09/2026)

`createFinancingPlanForOwner`, `createDevelopmentPlanForOwner` et
`createTransmissionPlanForOwner` appellent maintenant
`WorkflowService.createTasksFromSuggestions`, comme `analyser` et
`construire` le faisaient déjà.

### 6. ~~Routes mortes dans le module IGINI~~ — fait (26/09/2026)

`/memory/recall/:projectId` alimente maintenant la sous-liste « Ce dont
IGINI se souvient en priorité » de la section Mémoire, et
`/knowledge/concepts/:id/neighbourhood` permet de cliquer un concept du
graphe pour centrer l'affichage sur son voisinage direct (bouton « Centrer
sur tout le graphe » pour revenir à la vue complète).

---

## À FAIRE LE JOUR DU DÉPLOIEMENT

### 7. Collecteur d'erreurs externe

Choisir un service (Sentry, Highlight, Axiom, webhook maison) et poser
`ERREURS_WEBHOOK_URL` dans les variables de production. Sans lui, les
`Logger.error` restent dans le vide.

### 8. Sonde externe sur `/health`

UptimeRobot (gratuit) ou Better Uptime. Si le serveur tombe, personne ne le
sait à moins que quelqu'un essaie de se connecter.

### 9. ~~Sauvegarde planifiée~~ — fait (26/09/2026)

`.github/workflows/sauvegarde.yml` exécute `scripts/sauvegarde.mjs` puis
`verifier-sauvegarde.mjs` tous les jours (et à la demande). Le dépôt étant
public, l'export est chiffré (OpenSSL AES-256, PBKDF2) avant d'être déposé
en artefact — sinon les données réelles de production seraient publiques.
Reste, hors code : poser les deux secrets requis
(`SAUVEGARDE_DATABASE_URL`, `SAUVEGARDE_PASSPHRASE`) dans les réglages
GitHub une fois l'hébergement choisi (point 1) ; tant qu'ils manquent, le
workflow échoue proprement au lieu de rien envoyer.

---

## APRÈS L'OUVERTURE *(ne bloque pas)*

### 10. ~~Historique de scores côté frontend~~ — fait (26/09/2026)

`GET /projects/:projectId/scores/historique` est maintenant affiché sur la
fiche projet (`ScoreHistorySection`) : une courbe SVG dessinée à la main
par score, sans interpolation entre deux relevés, avec un message dédié
tant qu'aucun historique n'existe.

### 11. SIRET et TVA intracommunautaire

`IGNITUX_IDENTIFIANT` et `IGNITUX_TVA` restent vides tant que
l'immatriculation n'est pas faite. Prévu.

### 12. ~~Conformité RGPD formelle~~ — pour l'essentiel fait (26/09/2026)

Ce point affirmait des choses fausses : la suppression de compte existe et
fonctionne depuis longtemps (`DeleteAccountSection`,
`frontend/src/app/account/page.tsx`), tout comme l'export
(`ExportSection`, même fichier, branchées sur `user-data.service.ts`
`exportUserData`/`previewDeletion`/`deleteAccount`). Et il n'y a jamais eu
de page de confidentialité publique : le seul texte CGU/Confidentialité est
un `.docx` privé, hors dépôt, jamais lié depuis l'app — sa publication est
une décision à prendre séparément par Helder, pas une tâche de code.

Ce qui manquait vraiment est maintenant en place :
- le registre de traitements
  ([`docs/registre-de-traitements.md`](registre-de-traitements.md)), dérivé
  table par table de `user-data-scope.ts` ;
- une mention factuelle sur `/account` (« Cookies et stockage local ») —
  pas un bandeau de consentement, puisqu'Ignitux ne pose aucun cookie
  (authentification 100 % `localStorage`, aucun `credentials: true`, aucun
  script de suivi).

Reste, hors code : la décision de Helder de publier ou non un jour une page
de confidentialité publique à partir du `.docx` existant.

### 13. Tests de charge

La capacité réelle n'est pas mesurée. Le plafond connu est le budget IA
(≈ 360 analyses gratuites/mois à 50 €/mois). Ce n'est pas urgent pour une
bêta de 10-30 personnes.

Outil disponible depuis le 26/09/2026 : `npm run test:charge` (dans
`backend/`) envoie une rafale de requêtes concurrentes à une route locale
via [autocannon](https://github.com/mcollina/autocannon) et rapporte
requêtes/s, latence et erreurs — voir `backend/scripts/charge.mjs`. Il
refuse de viser autre chose que `localhost`/`127.0.0.1`. Reste à l'exécuter
une première fois contre le serveur réel (pas seulement le serveur de test
jetable utilisé pour valider le script) et à décider d'un seuil qui
inquiète, si jamais l'usage grossit.

### 14. Compte Shopify Partner *(attend Helder, avant tout usage réel de la Boutique en ligne)*

Le code (`backend/src/boutique-en-ligne/`) est prêt et testé, mais rien ne
peut fonctionner sans une vraie application Shopify Partner créée dans son
tableau de bord — `SHOPIFY_API_KEY`/`SHOPIFY_API_SECRET` restent vides tant
que ça n'existe pas. Trois points à trancher à ce moment-là, pas avant :

- **Mode de distribution.** Une application « personnalisée » (custom
  distribution) ne s'installe que sur une seule boutique. Connecter les
  boutiques de plusieurs entrepreneurs différents demande une distribution
  publique (peut rester non répertoriée), qui passe par une revue Shopify
  et impose les webhooks RGPD obligatoires (`customers/data_request`,
  `customers/redact`, `shop/redact`) — non implémentés ici, hors périmètre
  de cette première version.
- **Version de l'API.** `SHOPIFY_API_VERSION` (dans
  `shopify-admin-client.ts`) est fixée à `2025-01` au moment d'écrire ce
  code (27/09/2026) ; Shopify ne garde chaque version qu'environ 12 mois.
  À vérifier et mettre à jour contre la documentation Shopify du moment
  avant la création de l'application réelle.
- **`read_orders` protégé.** Lire les commandes exige l'approbation
  Shopify pour les « données client protégées », une démarche séparée de
  la création de l'application elle-même.

---

## VISION 2.0 — travaux futurs

Voir [`vision-v2-analyse.md`](vision-v2-analyse.md) pour l'analyse
architecturale complète.

En résumé : la base de données, l'API et le moteur constitutionnel sont
réutilisables tels quels. Ce qui change, c'est la couche d'expérience :
navigation par applications plutôt que par pages, onboarding guidé par
IGINI, activation progressive des modules.

Cela représente un chantier de plusieurs mois, indépendant de l'ouverture
de la bêta actuelle. Le plan est dans [`ignitux-os.md`](ignitux-os.md).

**Premier pas fait (26/09/2026), sans toucher à la base :**

- Catalogue des applications en code (`backend/src/applications/`), 19
  disponibles et 1 prévue (équipe — reportée, voir ci-dessous), chacune avec
  son cadre légal quand il existe. Stocks, Agenda, Caisse (point
  d'intégration manuel), Immobilier, Véhicules et Publicité sont passées de
  « prévue » à « disponible » le 27/09/2026.
- Moteur d'activation pur : ce qui sert est affiché, IGINI propose au plus
  deux applications au bon moment, le reste attend. `GET /me/applications`.
- Lanceur `/accueil` : c'est là qu'on arrive après la connexion.
- Application installable (manifeste, icônes, démarrage sur le lanceur).
- Prête pour Windows, Android, iPhone et iPad :
  - bouton « Installer » (Chrome, Edge) et chemin Partager sur Safari iOS ;
  - écrans de démarrage iOS et marges d'encoche ;
  - captures pour le Microsoft Store ;
  - `assetlinks.json` pour Google Play ;
  - `scripts/installable.mjs` en CI.

  Les boutiques et la vérification sur de vrais appareils attendent le
  domaine en HTTPS et les comptes développeur. Voir
  [`applications-natives.md`](applications-natives.md).

**Ignitux fonctionne comme un système (26/09/2026) :**

- Une application à la fois, plein écran. En haut, une barre avec son nom,
  « ← Bureau » et « Fermer ». En bas, une barre des tâches : le bureau, puis
  les applications ouvertes. Chacune se rouvre là où on l'a laissée. Le
  même fonctionnement sur téléphone et sur ordinateur
  (`frontend/src/components/systeme.tsx`, `frontend/src/lib/systeme.ts`).
- Les applications ne se font plus de liens entre elles : « Tous mes
  outils » et les « ← Retour aux projets » ont disparu au profit du système.
- Bureau personnalisable : « Organiser mon bureau » ouvre la boutique pour
  ajouter une application, ou en retirer une (aucune donnée effacée).
  IGINI continue de proposer. Ce que la personne choisit est enregistré
  sur son compte, donc le même sur tous ses appareils :
  `PUT /me/applications/:id`, table `user_applications`, inclus dans
  l'export RGPD.
- Dossier « Entreprise » sur le bureau : comme sur un téléphone, une seule
  icône regroupe tout ce qui n'est pas Mes projets — le reste des
  applications, les réglages secondaires (Mon offre, Consommation IA,
  Constitution) et les applications prévues. Elle s'ouvre en plein écran,
  avec son propre défilement de pages ; le bureau ne garde que Mes
  projets, Profil, le dossier et « Organiser mon bureau »
  (`frontend/src/app/accueil/page.tsx`).
- **À faire par toi : `prisma db push` sur la base de production** (ajout
  d'une table, rien de supprimé — vérifier le diff avant). La base de
  test e2e (`ignitux_test`) attend le même ajout.

**Suite, dans l'ordre :** jetons de rafraîchissement, préfixe `/v1`,
migration organisations et adhésions, IGINI conversationnel.
