# Dossier de création — préparer le dépôt, sans déposer

Sous-projet 3 sur 4 du chantier « Ignitux crée l'entreprise » (voir
`2026-09-28-generateur-former-design.md`). Il consomme les statuts
(`2026-10-03-statuts-design.md`) et l'identité/mandat
(`2026-09-30-identite-mandats-design.md`).

## Décision (validée avec Helder, 2026-10-08)

Les deux : (1) un **paquet de pièces** prêt à déposer et (2) un **guide pas à pas**
du dépôt sur le guichet unique (formalites.entreprises.gouv.fr). **La personne dépose
elle-même.** Ignitux ne dépose rien et ne paie rien : le mandat existe mais n'est
pas utilisé ici, car le statut de mandataire attend l'avis d'un avocat (voir les
risques du spec identité-mandats). Les frais (annonce légale, greffe, dépôt du
capital) sont **annoncés**, jamais avancés.

## Ce que ce lot construit

1. **Liste des pièces** d'un projet, calculée à la volée, selon la forme juridique
   confirmée (`projects.confirmed_legal_form`). Chaque pièce a un état :
   `pret` | `a_faire` | `non_concerne`.
   - `forme_confirmee` : prête si `confirmed_legal_form` est posée.
   - `statuts` : prête si `company_bylaws.status === 'retenue'` ; `a_faire` sinon
     (brouillon ou absents) ; `non_concerne` pour micro-entreprise et EI.
   - `identite` : prête si le propriétaire a une `identity_verifications.status === 'validee'` ;
     `a_faire` sinon.
   - `mandat` : prêt si un `mandates` du projet est `active` et signé (`signed_at` non nul) ;
     informatif (le dépôt reste fait par la personne) — jamais bloquant.
   - `justificatif_siege` : toujours `a_faire` (Ignitux ne le connaît pas) — la personne
     le coche elle-même (case enregistrée).
   - `capital_depose` : `a_faire` pour EURL/SASU/SARL/SAS (attestation de dépôt de
     capital) ; coché par la personne ; `non_concerne` pour micro-entreprise/EI.
   - `declaration_beneficiaires` : `a_faire` pour les sociétés ; coché par la personne ;
     `non_concerne` pour micro-entreprise/EI.
2. **Récapitulatif PDF** (`pdfkit`, déjà présent) : forme, siège, capital, associés
   (depuis les statuts s'ils existent), état de chaque pièce, frais à prévoir
   (texte indicatif, daté, avec renvoi vers les sources officielles), avertissement
   « document d'aide, pas un conseil juridique ». Même règles que le PDF des statuts :
   tampon mémoire, `Cache-Control: no-store`.
3. **Guide pas à pas** (données statiques côté backend, par famille de forme) : suite
   ordonnée d'étapes, chacune avec un titre, un texte simple, un lien officiel.
   Sociétés : rédiger/retenir les statuts → déposer le capital → publier l'annonce
   légale → déposer le dossier au guichet unique → recevoir le Kbis/SIREN.
   Micro-entreprise/EI : déclarer l'activité au guichet unique → recevoir le SIREN.
4. **État du dépôt** : `creation_filings` (une ligne par projet) — `status`
   `preparation` | `depose`, `checked_items` (liste des pièces cochées à la main),
   `deposited_at`, `filing_reference`. « Marquer comme déposé » enregistre la date et la
   référence saisie ; réversible tant que rien d'autre ne dépend (pas de verrou).

## Ce que ce lot ne construit pas

- Aucun dépôt réel, aucun appel à un service de l'État, aucun paiement.
- Aucune utilisation du mandat pour agir à la place de la personne.
- Rattachement à l'entreprise immatriculée et lien compta/banque (sous-projet 4).
- Aucun nouveau service payant ni nouvelle dépendance npm.

## Modèle de données (Prisma, additif)

```
model creation_filings {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  owner_id         String    @db.Uuid
  owner            users     @relation(fields: [owner_id], references: [id], onDelete: Cascade)
  project_id       String    @unique @db.Uuid
  project          projects  @relation(fields: [project_id], references: [id], onDelete: Cascade)
  status           String    @default("preparation") // 'preparation' | 'depose'
  checked_items    String[]  @default([])
  deposited_at     DateTime? @db.Timestamptz(6)
  filing_reference String?
  created_at       DateTime? @default(now()) @db.Timestamptz(6)
  updated_at       DateTime? @updatedAt @db.Timestamptz(6)

  @@index([owner_id])
}
```
Relation inverse sur `users` et `projects`. Migration SQL écrite à la main (jamais
appliquée par ce lot), dossier `backend/prisma/migrations/20261008120000_dossier_creation`.
Classée `exported('projets_et_contenus')` dans `user-data-scope.ts` ET lue par
`exportUserData` (le test `user-data-export-coverage.spec.ts` l'exige).

## API (module `backend/src/dossier-creation/`, `JwtAuthGuard`, propriétaire seulement)

Sous `projects/:projectId/dossier-creation` (tous les accès passent par la vérification
propriétaire du projet, comme `StatutsService.findForOwner` ; non-propriétaire → 404) :
- `GET` → `{ forme, pieces: [{id, titre, etat, detail}], etapes: [...], filing }`
- `PATCH` → corps `{ checkedItems: string[] }` (ids parmi les pièces cochables
  `justificatif_siege`, `capital_depose`, `declaration_beneficiaires` ; tout autre id → 400)
- `POST depose` → corps `{ filingReference?: string (max 100) }` ; 409 si déjà `depose`
- `POST rouvrir` → repasse en `preparation` (efface date et référence) ; 409 si pas `depose`
- `GET pdf` → récapitulatif PDF

Pas d'appel Claude. Pas d'enregistrement dans `GENERATOR_NAMES`.

## Frontend

Nouvelle section « Dossier de création » dans la fiche projet, sur le même principe
que `statuts-section.tsx` : montée dans l'étape `forme-juridique` sous la section
Statuts, propriétaire seulement. Elle affiche : la liste des pièces avec leur état
(texte + pastille, pas seulement la couleur), les cases à cocher des pièces manuelles
(label lié à chaque case), le guide en étapes numérotées avec liens externes
(`target="_blank" rel="noopener noreferrer"`), le bouton « Télécharger le récapitulatif
(PDF) », et « Marquer comme déposé » (avec champ référence facultatif) / « Rouvrir ».
Texte permanent : « Ignitux prépare ton dossier ; c'est toi qui le déposes sur le guichet
unique. Rien n'est payé ni déposé par Ignitux. Aide à la préparation, pas un conseil
juridique. » Les mutations ne passent jamais par la file hors ligne (ajouter les routes à
`ECRITURES_JAMAIS_EN_FILE` dans `frontend/src/lib/api.ts`). Conventions de test :
voir les specs de `statuts-section` (vrai `api.ts`, `mockApiRoutes`, jamais
`vi.mock('@/lib/api.js')`, id/htmlFor ou aria-label sur chaque champ).

## Cas limites à couvrir par des tests

- Forme non confirmée : pièces limitées à `forme_confirmee: a_faire`, pas d'erreur.
- Micro-entreprise/EI : statuts, capital, bénéficiaires `non_concerne`.
- Statuts en brouillon (pas retenus) : `statuts: a_faire`.
- Identité en attente ou rejetée : `identite: a_faire` avec détail.
- Projet d'un autre utilisateur : 404, jamais de fuite ; collaborateur lecture seule : 404.
- `PATCH` avec id inconnu ou doublons : 400 ; tableau vide accepté.
- `depose` deux fois : 409 ; `rouvrir` sans dépôt : 409.
- PDF sans statuts ni identité : se génère quand même.
