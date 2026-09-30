# Vérification d'identité et mandats — fondations pour « Ignitux mandataire »

30 septembre 2026. Design validé avec Helder en session de brainstorming.

Sous-projet transverse au chantier « Ignitux crée l'entreprise » (voir
`docs/superpowers/specs/2026-09-28-generateur-former-design.md`, sous-projet
1/4 « Former »). Ce lot ne dépose rien lui-même — il construit la brique de
confiance (qui est cette personne, quelle autorisation elle a donnée) dont
les sous-projets 2 à 4 (statuts, dépôt du dossier, rattachement) auront
besoin pour agir au nom de quelqu'un.

## Pourquoi

Pour que Former, puis la génération des statuts, puis le dépôt du dossier
aient un sens de bout en bout, Ignitux doit à un moment pouvoir dire à
l'INPI/guichet unique : « je dépose ceci pour le compte de telle personne,
avec son accord ». Aujourd'hui rien de tout cela n'existe : pas de
vérification d'identité, pas de mécanisme de mandat, aucun module ne gère
ce qu'un dépôt réel exige.

## Décision validée avec Helder : rôle juridique

**Ignitux agit comme mandataire** : il dépose/signe pour le compte de la
personne, sur la base d'un mandat qu'elle a explicitement donné — pas comme
simple outil de préparation où la personne dépose elle-même.

**Ce choix s'appuie sur la pratique observée** chez des plateformes de
formalités déjà en activité (LegalPlace, LegalStart et équivalents), qui
opèrent ainsi sous mandat simple, sans statut professionnel réglementé,
tant qu'elles ne fournissent pas de conseil juridique personnalisé — ce que
Former respecte déjà (« aide à la décision, jamais une décision prise à la
place de la personne »). **Ce n'est pas une confirmation juridique** :
avant qu'Ignitux dépose un premier dossier réel pour un vrai tiers, ce
point doit être validé par un avocat. Voir « Risques » en fin de document.

## Ce que ce lot construit

1. Un flux de **vérification d'identité** : la personne téléverse sa pièce
   d'identité, des contrôles automatiques gratuits s'exécutent, et un
   humain (Helder, aujourd'hui) valide les dossiers signalés avant qu'ils
   comptent comme vérifiés.
2. Un flux de **mandat** : pour un projet donné, la personne lit un texte
   de mandat fixe, donne son consentement explicite, et Ignitux conserve la
   preuve de cette signature.

## Ce que ce lot ne construit pas

- Aucun dépôt réel auprès de l'INPI/guichet unique — ça reste le sous-projet
  3 (« préparation du dossier de dépôt »), qui viendra *consommer* un mandat
  actif produit ici.
- Aucune vérification de vivacité (selfie vs pièce) : ça demanderait un
  prestataire payant ou un modèle de reconnaissance faciale auto-hébergé
  avec un vrai risque de faux positifs/négatifs — hors de portée d'une v1
  gratuite. Limite documentée, pas contournée en bricolant quelque chose de
  peu fiable.
- Aucune signature électronique qualifiée (Yousign, DocuSign…) : implique un
  prestataire payant, donc hors de ce lot — même principe que Caisse
  (`docs/superpowers/specs/...` plan applications) pour les prestataires non
  choisis.
- Aucun rôle de « vérificateur » distinct : le rôle `administrateur` existe
  déjà dans `user_roles` (`backend/prisma/schema.prisma:1434`) et suffit
  pour une v1 où Helder est seul à revoir les dossiers.

## Portée v1

### Vérification d'identité

- Types de documents acceptés : carte d'identité (recto + verso), passeport
  (page principale), titre de séjour (recto + verso).
- Contrôles automatiques, tous gratuits, exécutés à la soumission :
  - **OCR** (`tesseract.js`, local, sans appel réseau) pour extraire nom,
    prénom, date de naissance, numéro de document, date d'expiration.
  - **Validation MRZ** (bibliothèque `mrz`, ICAO 9303) quand le document en
    a une (cartes récentes, passeports) : le checksum de la zone lisible
    machine détecte un numéro trafiqué sans dépendre d'un service payant.
    Résultat stocké (`mrz_checksum_valid`), `null` si le document n'a pas
    de MRZ détectée — ce n'est pas un échec, juste une absence de signal.
  - **Expiration** : document expiré → statut automatiquement `rejetee`,
    pas besoin d'attendre une revue humaine pour ce cas-là.
  - **Cohérence du nom** : le nom extrait est comparé au nom du compte —
    une incohérence *signale* le dossier pour revue prioritaire, elle ne le
    rejette pas automatiquement (l'OCR se trompe, les gens ont des noms
    composés mal saisis ailleurs).
- **Revue humaine obligatoire avant validation** : même quand tous les
  contrôles automatiques passent, un `administrateur` doit explicitement
  valider (`POST /identite/verifications/:id/revue`) avant que le statut
  passe à `validee`. C'est le vrai garde-fou de cette v1 — les contrôles
  automatiques réduisent le travail de revue, ils ne le remplacent pas.
- Statuts : `en_attente` → `validee` | `rejetee` (avec motif).

### Mandat

- Un mandat est toujours rattaché à un projet (`project_id`) : on mandate
  Ignitux pour une entreprise précise, pas en général.
- Signer un mandat exige une vérification d'identité au statut `validee`
  pour le même compte — pas de mandat sans identité confirmée.
- Signature électronique simple (au sens eIDAS, pas qualifiée) : la
  personne relit le texte figé du mandat, coche une case de consentement,
  retape son nom complet. Ignitux enregistre : le texte exact lu (jamais
  réédité après coup, même si le texte type change plus tard), le nom
  retapé, l'horodatage, l'adresse IP.
- Un mandat peut être révoqué à tout moment par la personne qui l'a donné
  (cohérent avec l'art. 2003 du Code civil sur la révocation du mandat) :
  `POST /identite/mandats/:id/revoquer`, statut `active` → `revoquee`.

## Modèle de données (Prisma)

```prisma
model identity_verifications {
  id                          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  owner_id                    String    @db.Uuid
  owner                       users     @relation(fields: [owner_id], references: [id], onDelete: Cascade)
  document_type               String    // 'carte_identite' | 'passeport' | 'titre_sejour'
  document_front              Bytes
  document_back               Bytes?
  extracted_first_name        String?
  extracted_last_name         String?
  extracted_birth_date        DateTime? @db.Date
  extracted_document_number   String?
  extracted_expiry_date       DateTime? @db.Date
  mrz_checksum_valid          Boolean?
  name_matches_account        Boolean?
  status                      String    @default("en_attente") // 'en_attente' | 'validee' | 'rejetee'
  rejection_reason            String?
  reviewed_by                 String?   @db.Uuid
  reviewed_at                 DateTime? @db.Timestamptz(6)
  created_at                  DateTime? @default(now()) @db.Timestamptz(6)

  mandates                    mandates[]
  @@index([owner_id])
}

model mandates {
  id                       String                  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  owner_id                 String                  @db.Uuid
  owner                    users                   @relation(fields: [owner_id], references: [id], onDelete: Cascade)
  project_id               String                  @db.Uuid
  project                  projects                @relation(fields: [project_id], references: [id], onDelete: Cascade)
  identity_verification_id String                  @db.Uuid
  identity_verification    identity_verifications  @relation(fields: [identity_verification_id], references: [id], onDelete: Restrict)
  purpose                  String                  // libre en v1, ex. 'depot_creation_entreprise'
  mandate_text             String                  // texte figé au moment de la signature
  signed_full_name         String
  signed_at                DateTime                @db.Timestamptz(6)
  signer_ip                String
  status                   String                  @default("active") // 'active' | 'revoquee'
  revoked_at               DateTime?               @db.Timestamptz(6)
  created_at                DateTime?              @default(now()) @db.Timestamptz(6)

  @@index([owner_id])
  @@index([project_id])
}
```

`onDelete: Restrict` sur `identity_verification` : on ne doit jamais pouvoir
supprimer une vérification d'identité tant qu'un mandat s'appuie dessus —
la preuve doit survivre au mandat, pas l'inverse.

Comme pour chaque nouveau modèle ajouté jusqu'ici (`stock_items`,
`agenda_events`, etc.), les relations inverses doivent être déclarées sur
`users` (`identity_verifications identity_verifications[]`,
`mandates mandates[]`) et sur `projects` (`mandates mandates[]`) — sans
quoi Prisma refuse le schéma.

**Intégration RGPD** : les deux modèles doivent être ajoutés au mécanisme
d'export/suppression déjà en place (`backend/src/users/user-data-scope.ts`,
`user-data.service.ts`) au même titre que `crm_companies`, `stock_items`,
etc. — pas de nouveau mécanisme de rétention à inventer, on branche sur
l'existant. Conséquence naturelle : les pièces d'identité et mandats vivent
tant que le compte existe, et sont purgés avec lui.

## Backend

Nouveau module `backend/src/identite/`, même patron que `backend/src/crm/`
(controller/service/dto/spec) :

- `IdentiteController` (`@UseGuards(JwtAuthGuard)`, `@CurrentUser()`) :
  - `POST /identite/verifications` — upload multipart (recto/verso),
    déclenche OCR + MRZ + contrôles, crée la ligne en `en_attente`.
  - `GET /identite/verifications` — les siennes.
  - `GET /identite/verifications/en-attente` — réservé `administrateur`
    (guard de rôle réutilisant `RolesService`/`user_roles`), file de revue.
  - `POST /identite/verifications/:id/revue` — réservé `administrateur`,
    body `{ decision: 'validee' | 'rejetee', motif? }`.
  - `POST /identite/mandats` — crée un mandat en attente de signature pour
    un projet (exige une vérification `validee`).
  - `POST /identite/mandats/:id/signer` — body `{ nomComplet, accepte: true }`,
    fige `mandate_text`, `signed_full_name`, `signed_at`, `signer_ip`.
  - `GET /identite/mandats` — les siens.
  - `POST /identite/mandats/:id/revoquer`.

- `IdentiteService` :
  - `soumettreDocument(ownerId, dto, fichiers)` : persiste les images,
    lance l'extraction OCR (`tesseract.js`), parse la MRZ si présente
    (`mrz`), calcule `name_matches_account` par comparaison normalisée
    (casse/accents) avec le nom du compte, rejette automatiquement si
    `extracted_expiry_date < aujourd'hui`.
  - `revoirVerification(adminId, verificationId, decision, motif?)`.
  - `creerMandat(ownerId, projectId, purpose)` : vérifie qu'une
    `identity_verification` `validee` existe pour ce compte, charge le
    texte type du mandat (une constante versionnée dans le code, pas en
    base — même principe que la Constitution : un texte engageant vit dans
    le code, relu comme lui).
  - `signerMandat(ownerId, mandateId, nomComplet, ip)`.
  - `revoquerMandat(ownerId, mandateId)`.

## Frontend

- Nouvelle page `/identite` : statut de vérification du compte (aucune,
  en attente, validée, rejetée + motif), formulaire d'upload recto/verso
  selon le type de document choisi. Bandeau honnête, même esprit que
  Banque/Caisse : « Ta pièce est lue automatiquement pour détecter les
  incohérences évidentes, mais c'est une personne qui valide avant que ton
  identité compte comme vérifiée. »
- Sur la page projet (`frontend/src/app/projects/[id]/`), nouvelle section
  mandat (à côté de `engine-sections.tsx`, sans s'y mêler — le mandat n'est
  pas un résultat de générateur IGINI) : si aucune vérification validée,
  lien vers `/identite` ; sinon, texte du mandat affiché intégralement,
  case à cocher, champ nom complet, bouton « Signer ». Une fois signé :
  date de signature, statut actif, bouton « Révoquer ce mandat ».
- Nouvelle page réservée `administrateur` (ex. `/identite/revue`) : file des
  vérifications `en_attente`, aperçu des documents et des champs extraits,
  boutons Valider/Rejeter avec motif.

## Sécurité et limites connues

- Les contrôles automatiques (OCR + MRZ + expiration + cohérence du nom)
  réduisent le travail de revue, ils ne prouvent pas l'authenticité d'un
  document falsifié avec soin — aucune vérification gratuite ne le peut.
  La revue humaine reste le seul vrai rempart contre la fraude en v1.
- Pas de vérification de vivacité : rien n'empêche quelqu'un de soumettre
  la pièce d'identité de quelqu'un d'autre. Limite documentée, pas résolue
  ici — à réévaluer si le volume ou le risque perçu grandit.
- Les images de documents sont stockées en base (Postgres `Bytes`), pas de
  nouveau service de stockage introduit. Compromis assumé pour une v1 sans
  dépendance payante ; à revisiter si la volumétrie devient un problème
  réel (pas avant qu'elle le soit).

## Risques à faire valider par un juriste (hors scope de ce lot, mais bloquants avant un dépôt réel)

1. Le statut de mandataire d'Ignitux pour déposer des formalités
   d'entreprise au nom d'un tiers — la pratique d'autres plateformes n'est
   pas une confirmation légale pour Ignitux.
2. Le niveau de signature électronique simple choisi est-il suffisant pour
   la valeur juridique d'un mandat de cette nature, ou une signature
   qualifiée devient-elle nécessaire dès qu'un dépôt réel a lieu ?
3. Obligations de conservation/traçabilité des pièces d'identité au-delà
   du RGPD général (ex. obligations spécifiques aux professions exerçant
   des formalités pour autrui, si elles s'appliquent à Ignitux).

Ces trois points ne bloquent pas la construction de ce lot (vérification +
mandat restent utiles pour préparer le sous-projet 3), mais bloquent tout
dépôt réel tant qu'ils ne sont pas tranchés.
