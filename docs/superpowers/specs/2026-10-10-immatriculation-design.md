# Immatriculation — rattacher le projet à l'entreprise créée

Sous-projet 4 sur 4 du chantier « Ignitux crée l'entreprise » (voir
`2026-09-28-generateur-former-design.md`). Fait suite au dossier de création
(`2026-10-08-dossier-creation-design.md`).

## Décision (validée avec Helder, 2026-10-10)

Quatre points, tous gratuits :
1. Une **fiche d'immatriculation** par projet, saisie par la personne après son dépôt.
2. Les **devis/factures** du projet affichent l'identité légale de l'émetteur.
3. Le **dossier de création** passe à « immatriculée » quand la fiche existe.
4. Une **écriture de capital proposée** en comptabilité, jamais écrite sans un clic.

Hors lot : vérification en ligne du SIREN (service de l'État ou fournisseur), toute
modification de documents déjà émis, rattachement automatique de comptes bancaires.

## 1. Fiche d'immatriculation

Table `company_registrations` (une ligne par projet, `project_id @unique`) :
`id`, `owner_id`, `project_id`, `siren` (9 chiffres), `siret` (14 chiffres, facultatif),
`vat_number` (facultatif), `legal_name`, `head_office`, `registered_on` (date, `@db.Date`),
`capital_entry_id` (uuid nullable, voir §4), `created_at`, `updated_at`. Relations inverses
sur `users` et `projects`, FK `ON DELETE CASCADE`, index sur `owner_id`.

Validation (fonctions pures testées, dans `backend/src/immatriculation/`) :
- SIREN : exactement 9 chiffres, clé de Luhn valide (espaces tolérés à la saisie, retirés).
- SIRET : 14 chiffres, Luhn valide, et ses 9 premiers chiffres égalent le SIREN.
  (Exception connue : La Poste, SIREN 356000000 — non gérée, la saisie échoue avec un message clair.)
- TVA intracommunautaire française : `FR` + 2 caractères de clé + SIREN ; la clé
  `(12 + 3 × (SIREN mod 97)) mod 97` doit correspondre quand la clé est numérique ;
  accepter la clé alphanumérique sans la vérifier. Facultative.
- `legal_name` 1–200 caractères, `head_office` 1–300, `registered_on` ≤ aujourd'hui + 1 jour
  et ≥ 2000-01-01. Aucune donnée inventée : rien n'est pré-rempli par Ignitux sauf le siège et
  la dénomination proposés depuis les statuts retenus s'ils existent (la personne les confirme).

Routes sous `projects/:projectId/immatriculation` (`JwtAuthGuard`, **propriétaire seulement** ;
non-propriétaire et collaborateur → 404 « Projet introuvable. ») :
- `GET` → `{ registration: {...} | null, suggestion: { legalName, headOffice } | null }`
- `PUT` → crée ou remplace la fiche (corps camelCase validé, `forbidNonWhitelisted`) ; ne
  modifie jamais les documents déjà émis. 409 si le SIREN est déjà utilisé par un AUTRE projet
  du même propriétaire (index unique `(owner_id, siren)`).
- `DELETE` → supprime la fiche (le projet repasse « non immatriculé ») ; refusé (409) si une
  écriture de capital a été enregistrée à partir d'elle (`capital_entry_id` non nul).

## 2. Mentions légales de l'émetteur sur les devis/factures

Aujourd'hui `billing_documents` n'a aucune identité d'émetteur. Ajouter
`issuer_details String?` (texte multi-lignes figé **à l'émission**, comme `client_details`) :
si le projet du document a une fiche d'immatriculation au moment de l'émission, on y écrit :
dénomination, forme juridique (`projects.confirmed_legal_form`), capital (depuis les statuts
retenus, en euros, seulement s'il est connu), siège, SIREN (+ SIRET si présent), TVA si présente.
Sans fiche ou sans projet : `null`, comportement actuel inchangé. Les documents déjà émis ne
changent jamais (pas de rétro-remplissage). Le brouillon n'a pas de snapshot (rempli à
l'émission). Exposé par l'API existante des documents et affiché dans l'interface de
facturation (bloc « Émetteur » sur un document émis qui en a un). L'avertissement
`BILLING_DISCLAIMER` reste inchangé et visible.

## 3. Dossier de création → « immatriculée »

Dans `backend/src/dossier-creation/`, la réponse de `GET` ajoute `immatriculee: boolean` et
`registration: { siren, registeredOn } | null`. La section frontend affiche un bandeau
« Immatriculée le … — SIREN … » et un lien vers la fiche quand elle existe ; sinon une
invitation « Saisis ton SIREN quand tu l'as reçu » (après dépôt). Aucun changement de
`filing.status` automatique.

## 4. Écriture de capital proposée (jamais automatique)

Seulement pour les formes à personne morale avec des statuts **retenus** (capital connu en
centimes) et une fiche d'immatriculation. Le backend expose
`GET .../immatriculation/capital` → `{ proposition: { montantCents, libelle, lignes: [...] } | null, dejaEnregistree: boolean }`
et `POST .../immatriculation/capital` qui enregistre l'écriture : **Débit** compte de banque
(512) / **Crédit** capital social (101) du montant du capital. Règles :
- L'implémenteur lit `backend/src/ledger/` (ledger.service.ts, chart-of-accounts.ts,
  ledger-owner.ts, journal-entry.ts) et passe par `recordEntry` avec le propriétaire
  `{ type: 'user', id: ownerId }` — jamais de contournement du moteur constitutionnel ni de la
  séparation des caisses. Si les comptes 512/101 n'existent pas dans le plan de l'utilisateur,
  les ouvrir via le service (`openAccount`) avec les libellés du plan comptable du dépôt, sinon
  refuser avec un message clair — ne rien inventer.
- Idempotence : une seule écriture par fiche ; `capital_entry_id` est posé dans la même
  transaction logique ; un second POST → 409. Garde par `updateMany` conditionnel sur
  `capital_entry_id: null` + vérification du compte avant d'écrire.
- Confirmation explicite côté interface (« Enregistrer cette écriture dans ma comptabilité »),
  avec le montant et les comptes affichés ; jamais d'enregistrement en arrière-plan.
- Si l'enregistrement du ledger réussit mais que la pose de `capital_entry_id` échoue, le
  message d'erreur le dit (état incohérent signalé, pas masqué).
Si la tenue du ledger de ce lot s'avère impossible sans toucher à des règles existantes, NE PAS
forcer : livrer §1–§3 et laisser §4 non fait avec une note claire dans le rapport.

## Frontend

Nouvelle section « Immatriculation » dans la fiche projet (propriétaire seulement), montée
dans l'étape `forme-juridique` sous « Dossier de création » : formulaire (SIREN, SIRET, TVA,
dénomination, siège, date) avec libellés liés (id/htmlFor), erreurs de validation serveur
affichées, pré-remplissage depuis `suggestion` à confirmer, suppression avec confirmation,
bloc capital avec confirmation. Écritures jamais mises en file hors ligne (ajouter les routes
`PUT`/`DELETE`/`POST capital` à `ECRITURES_JAMAIS_EN_FILE`). Facturation : afficher « Émetteur »
sur un document émis qui a `issuer_details`. Texte permanent : « Ces informations viennent de
toi (Kbis, avis de situation). Ignitux ne les vérifie pas auprès de l'État. »

## Migration

Additive, écrite à la main, jamais appliquée par ce lot :
`backend/prisma/migrations/20261010100000_immatriculation/` (table `company_registrations`,
colonne `billing_documents.issuer_details`). `company_registrations` classée
`exported('projets_et_contenus')` dans `user-data-scope.ts` et lue par `exportUserData`
(`user-data-export-coverage.spec.ts` doit passer).

## Cas limites à tester

SIREN/SIRET/TVA invalides (longueur, Luhn, SIRET ≠ SIREN, clé TVA fausse) ; doublon de SIREN
sur un autre projet du même propriétaire ; non-propriétaire / collaborateur → 404 sur toutes
les routes ; PUT répété (remplacement) ; DELETE avec écriture de capital → 409 ; émission avec
et sans fiche (snapshot figé, pas de rétro-remplissage, document déjà émis inchangé) ;
capital : statuts brouillon ou absents → pas de proposition ; double POST → 409 ; comptes
manquants ; micro/EI → pas de proposition de capital.
