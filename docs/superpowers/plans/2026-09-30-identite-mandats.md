# Vérification d'identité et mandats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire la vérification d'identité (upload de pièce + contrôles
automatiques gratuits + revue humaine) et les mandats (procuration liée à un
projet, signature électronique simple, révocation) qui permettront à
Ignitux d'agir comme mandataire dans le chantier « Ignitux crée
l'entreprise ».

**Architecture:** Un nouveau module NestJS `backend/src/identite/`, même
patron que `backend/src/crm/` (controller/service/dto). Deux tables Prisma
(`identity_verifications`, `mandates`) scopées `owner_id`. Trois surfaces
frontend : `/identite` (upload + statut, compte), une section mandat sur la
page projet, et `/identite/revue` (file de revue, réservée au rôle
`administrateur`).

**Tech Stack:** NestJS, Prisma/Postgres, `@nestjs/platform-express`
(upload multipart), `tesseract.js` (OCR local, aucun appel réseau), un
algorithme ICAO 9303 de validation de checksum MRZ écrit en interne (pas de
dépendance externe pour ça — l'algorithme est simple et se teste avec des
vecteurs calculés à la main, alors qu'une dépendance tierce pour ça ajoute
un risque de compatibilité pour un gain nul). Next.js/React côté frontend,
mêmes conventions que `frontend/src/app/crm/`.

**Spec:** `docs/superpowers/specs/2026-09-30-identite-mandats-design.md`

## Global Constraints

- Aucune vérification de vivacité (selfie) en v1 — hors scope, documenté
  comme limite connue.
- Aucun prestataire payant (KYC, signature électronique qualifiée) — hors
  scope de ce lot.
- Revue humaine obligatoire avant qu'une vérification passe à `validee` —
  les contrôles automatiques ne décident jamais seuls d'une validation.
- Le rôle `administrateur` existant (`user_roles`, catalogue
  `roles-catalogue.ts`) sert de garde pour la revue — pas de nouveau
  mécanisme de rôle.
- `identity_verifications` et `mandates` doivent être enregistrés dans
  `backend/src/users/user-data-scope.ts` (groupe `compte`) — un test
  existant (`user-data-scope.spec.ts`) échoue sinon.
- Les documents sont stockés en base (Postgres `Bytes`), pas de nouveau
  service de stockage.
- Types de documents acceptés : `carte_identite`, `passeport`,
  `titre_sejour`.
- Types MIME acceptés pour l'upload : `image/jpeg`, `image/png` uniquement.
  Taille max par fichier : 8 Mo.

## Review Focus

- Upload d'un fichier qui n'est ni JPEG ni PNG (PDF, exécutable renommé) →
  doit être rejeté proprement par le filtre de l'intercepteur, jamais
  planter le processus ni être stocké. Testé en Task 2.
- Document sans aucune zone MRZ détectable (texte OCR ne contenant aucune
  ligne de 30 ou 44 caractères `[A-Z0-9<]`) → `mrz_checksum_valid` doit
  rester `null`, jamais `false` par confusion avec un checksum invalide.
  Testé en Task 4.
- `display_name` du profil vide ou absent → la comparaison de cohérence du
  nom doit être ignorée proprement (`name_matches_account: null`), pas
  lever d'exception ni marquer une incohérence par défaut. Testé en Task 4.
- Tentative de signer un mandat alors qu'aucune `identity_verification`
  `validee` n'existe pour ce compte (aucune vérification, ou seulement
  `en_attente`/`rejetee`) → refusé explicitement (400), jamais un mandat
  créé sans preuve d'identité valide derrière. Testé en Task 6.
- Un administrateur qui tente de revoir une vérification déjà `validee` ou
  `rejetee` → refusé explicitement (409), pour ne jamais écraser
  silencieusement une décision déjà prise. Testé en Task 5.

---

### Task 1: Schéma Prisma, migration et intégration RGPD

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/users/user-data-scope.ts`
- Test: `backend/src/users/user-data-scope.spec.ts` (existant, pas modifié — sert à vérifier ce Task)

**Interfaces:**
- Produces: modèles Prisma `identity_verifications` et `mandates`, tous
  deux avec `owner_id`, et `mandates.project_id` + `mandates.identity_verification_id`.
  Tout code des tasks suivantes utilise ces noms de colonnes exacts.

- [ ] **Step 1: Ajouter les deux modèles au schéma**

Dans `backend/prisma/schema.prisma`, ajouter (n'importe où après le modèle
`projects`, par convention à la suite des autres modèles métier récents
comme `cash_register_entries`) :

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
  purpose                  String
  // Nullable : un mandat existe d'abord en attente de signature (créé par
  // creerMandat), puis ces quatre champs se remplissent ensemble au moment
  // de la signature (signerMandat) — jamais partiellement. `signed_at`
  // non-null est la façon de savoir qu'un mandat est signé, sans sentinel.
  mandate_text             String?
  signed_full_name         String?
  signed_at                DateTime?               @db.Timestamptz(6)
  signer_ip                String?
  status                   String                  @default("active") // 'active' | 'revoquee'
  revoked_at               DateTime?               @db.Timestamptz(6)
  created_at               DateTime?               @default(now()) @db.Timestamptz(6)

  @@index([owner_id])
  @@index([project_id])
}
```

Puis ajouter les relations inverses :

Sur `model users`, à la suite de `cash_register_entries cash_register_entries[]` :
```prisma
  identity_verifications    identity_verifications[]
  mandates                  mandates[]
```

Sur `model projects`, à la suite de sa dernière relation de liste existante :
```prisma
  mandates             mandates[]
```

- [ ] **Step 2: Générer et appliquer la migration en local**

```bash
cd backend
npx prisma migrate dev --name identite_et_mandats
```

Expected: la migration se crée sans erreur, `npx prisma validate` passe.

- [ ] **Step 3: Lancer le test existant qui doit maintenant échouer**

```bash
npx vitest run src/users/user-data-scope.spec.ts
```

Expected: FAIL — le test liste `identity_verifications` et `mandates`
comme tables présentes dans le schéma mais absentes de `USER_DATA_SCOPE`.

- [ ] **Step 4: Classer les deux tables dans `user-data-scope.ts`**

Dans `backend/src/users/user-data-scope.ts`, ajouter à la suite de
`subscriptions: exported('compte'),` :

```typescript
  // Vérification d'identité et mandats donnés à Ignitux pour agir comme
  // mandataire : même nature qu'un abonnement, une relation contractuelle
  // avec Ignitux, pas une donnée métier de projet.
  identity_verifications: exported('compte'),
  mandates: exported('compte'),
```

- [ ] **Step 5: Relancer le test, vérifier qu'il passe**

```bash
npx vitest run src/users/user-data-scope.spec.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/users/user-data-scope.ts
git commit -m "feat(identite): ajouter le schema identity_verifications et mandates"
```

---

### Task 2: Module Identite — soumission de document (sans OCR)

**Files:**
- Create: `backend/src/identite/identite.module.ts`
- Create: `backend/src/identite/identite.service.ts`
- Create: `backend/src/identite/identite.controller.ts`
- Create: `backend/src/identite/dto/identite.dto.ts`
- Create: `backend/src/identite/identite.service.spec.ts`
- Create: `backend/src/identite/identite.controller.spec.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/package.json` (ajout `@types/multer` en devDependency)

**Interfaces:**
- Consumes: `PrismaService` (`../prisma/prisma.service.js`),
  `JwtAuthGuard`/`CurrentUser`/`AuthenticatedUser`
  (`../auth/jwt-auth.guard.js`, `../auth/current-user.decorator.js`),
  `AuthModule` (`../auth/auth.module.js`).
- Produces: `IdentiteService.soumettreDocument(ownerId: string, documentType: string, front: Buffer, back: Buffer | null): Promise<identity_verifications>`
  et `IdentiteService.listerMesVerifications(ownerId: string)`. Tasks 3-6
  ajoutent des méthodes à ce même service, ne le recréent pas.

- [ ] **Step 1: Ajouter `@types/multer`**

```bash
cd backend
npm install --save-dev @types/multer
```

- [ ] **Step 2: Écrire le DTO**

Créer `backend/src/identite/dto/identite.dto.ts` :

```typescript
import { IsIn } from 'class-validator';

export const DOCUMENT_TYPES = ['carte_identite', 'passeport', 'titre_sejour'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export class SubmitDocumentDto {
  @IsIn(DOCUMENT_TYPES, {
    message: `documentType doit être l'un de : ${DOCUMENT_TYPES.join(', ')}.`,
  })
  documentType: DocumentType;
}
```

- [ ] **Step 3: Écrire le test du service (échoue d'abord)**

Créer `backend/src/identite/identite.service.spec.ts` :

```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { IdentiteService } from './identite.service.js';

describe('IdentiteService — soumission de document', () => {
  let service: IdentiteService;
  let prisma: {
    identity_verifications: { create: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      identity_verifications: { create: vi.fn(), findMany: vi.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [IdentiteService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(IdentiteService);
  });

  it('crée une vérification en_attente avec les octets fournis', async () => {
    const front = Buffer.from('recto');
    const back = Buffer.from('verso');
    prisma.identity_verifications.create.mockResolvedValue({ id: 'v1', status: 'en_attente' });

    await service.soumettreDocument('user-1', 'carte_identite', front, back);

    expect(prisma.identity_verifications.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        owner_id: 'user-1',
        document_type: 'carte_identite',
        document_front: front,
        document_back: back,
        status: 'en_attente',
      }),
    });
  });

  it('refuse une carte d’identité sans verso', async () => {
    await expect(
      service.soumettreDocument('user-1', 'carte_identite', Buffer.from('recto'), null),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepte un passeport sans verso', async () => {
    prisma.identity_verifications.create.mockResolvedValue({ id: 'v1' });
    await expect(
      service.soumettreDocument('user-1', 'passeport', Buffer.from('page'), null),
    ).resolves.toBeDefined();
  });

  it('liste les vérifications du propriétaire, plus récentes en premier', async () => {
    prisma.identity_verifications.findMany.mockResolvedValue([]);
    await service.listerMesVerifications('user-1');
    expect(prisma.identity_verifications.findMany).toHaveBeenCalledWith({
      where: { owner_id: 'user-1' },
      orderBy: { created_at: 'desc' },
    });
  });
});
```

- [ ] **Step 4: Run — vérifier l'échec**

```bash
npx vitest run src/identite/identite.service.spec.ts
```

Expected: FAIL — `identite.service.js` n'existe pas.

- [ ] **Step 5: Implémenter le service**

Créer `backend/src/identite/identite.service.ts` :

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { type DocumentType } from './dto/identite.dto.js';

/**
 * IDENTITÉ ET MANDATS — la brique de confiance sur laquelle s'appuiera un
 * jour un dépôt réel auprès de l'INPI/guichet unique (sous-projet 3 du
 * chantier « Ignitux crée l'entreprise »). Ce service ne dépose rien : il
 * vérifie qui est la personne et enregistre l'autorisation qu'elle donne.
 */
@Injectable()
export class IdentiteService {
  constructor(private readonly prisma: PrismaService) {}

  async soumettreDocument(
    ownerId: string,
    documentType: DocumentType,
    front: Buffer,
    back: Buffer | null,
  ) {
    // Le passeport n'a qu'une page à présenter ; carte d'identité et titre
    // de séjour ont un recto et un verso, tous deux nécessaires pour lire
    // le nom (souvent au verso sur les anciens modèles).
    if (documentType !== 'passeport' && !back) {
      throw new BadRequestException(
        `Un ${documentType === 'carte_identite' ? 'recto ET un verso' : 'recto et un verso'} sont requis pour ce type de document.`,
      );
    }

    return this.prisma.identity_verifications.create({
      data: {
        owner_id: ownerId,
        document_type: documentType,
        document_front: front,
        document_back: back,
        status: 'en_attente',
      },
    });
  }

  listerMesVerifications(ownerId: string) {
    return this.prisma.identity_verifications.findMany({
      where: { owner_id: ownerId },
      orderBy: { created_at: 'desc' },
    });
  }

  async findVerificationForOwner(ownerId: string, verificationId: string) {
    const verification = await this.prisma.identity_verifications.findFirst({
      where: { id: verificationId, owner_id: ownerId },
    });
    if (!verification) {
      throw new NotFoundException('Vérification introuvable.');
    }
    return verification;
  }
}
```

- [ ] **Step 6: Run — vérifier le succès**

```bash
npx vitest run src/identite/identite.service.spec.ts
```

Expected: PASS (4 tests)

- [ ] **Step 7: Écrire le test du contrôleur**

Créer `backend/src/identite/identite.controller.spec.ts` :

```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { IdentiteController } from './identite.controller.js';
import { IdentiteService } from './identite.service.js';

describe('IdentiteController', () => {
  let controller: IdentiteController;
  // Typé en dictionnaire plutôt qu'avec les méthodes précises : les Tasks 5
  // et 6 ajoutent des méthodes à ce même mock (listerEnAttente,
  // revoirVerification...) sans revenir modifier cette déclaration — un
  // type figé sur les seules méthodes de cette task casserait la
  // compilation dès la prochaine.
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = { soumettreDocument: vi.fn(), listerMesVerifications: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [IdentiteController],
      providers: [{ provide: IdentiteService, useValue: service }],
    }).compile();
    controller = moduleRef.get(IdentiteController);
  });

  const user = { id: 'user-1', email: 'a@b.c' };

  it('transmet recto/verso au service', async () => {
    service.soumettreDocument.mockResolvedValue({ id: 'v1' });
    const front = { buffer: Buffer.from('r'), mimetype: 'image/jpeg' } as Express.Multer.File;
    const back = { buffer: Buffer.from('v'), mimetype: 'image/jpeg' } as Express.Multer.File;

    await controller.soumettre(user, { documentType: 'carte_identite' }, {
      front: [front],
      back: [back],
    });

    expect(service.soumettreDocument).toHaveBeenCalledWith(
      'user-1',
      'carte_identite',
      front.buffer,
      back.buffer,
    );
  });

  it('rejette si aucun fichier recto n’est fourni', async () => {
    await expect(
      controller.soumettre(user, { documentType: 'passeport' }, {}),
    ).rejects.toThrow(BadRequestException);
  });

  it('liste les vérifications de l’utilisateur courant', async () => {
    service.listerMesVerifications.mockResolvedValue([]);
    await controller.mesVerifications(user);
    expect(service.listerMesVerifications).toHaveBeenCalledWith('user-1');
  });
});

describe('fileFilter', () => {
  it('rejette un fichier qui n’est ni JPEG ni PNG', () => {
    const callback = vi.fn();
    fileFilter(null, { mimetype: 'application/pdf' } as Express.Multer.File, callback);
    expect(callback).toHaveBeenCalledWith(expect.any(BadRequestException), false);
  });

  it('accepte un fichier JPEG', () => {
    const callback = vi.fn();
    fileFilter(null, { mimetype: 'image/jpeg' } as Express.Multer.File, callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('accepte un fichier PNG', () => {
    const callback = vi.fn();
    fileFilter(null, { mimetype: 'image/png' } as Express.Multer.File, callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });
});
```

Importer `fileFilter` en tête du fichier de test, à la suite de
`IdentiteController` : `import { fileFilter, IdentiteController } from './identite.controller.js';`
(le fichier n'exporte pas encore `fileFilter` à ce stade — normal, c'est
justement ce que l'implémentation du Step 9 ajoute).

- [ ] **Step 8: Run — vérifier l'échec**

```bash
npx vitest run src/identite/identite.controller.spec.ts
```

Expected: FAIL — `identite.controller.js` n'existe pas.

- [ ] **Step 9: Implémenter le contrôleur**

Créer `backend/src/identite/identite.controller.ts` :

```typescript
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SubmitDocumentDto } from './dto/identite.dto.js';
import { IdentiteService } from './identite.service.js';

const TAILLE_MAX_OCTETS = 8 * 1024 * 1024;
const TYPES_MIME_ACCEPTES = new Set(['image/jpeg', 'image/png']);

export function fileFilter(
  _req: unknown,
  file: Express.Multer.File,
  callback: (error: Error | null, accept: boolean) => void,
) {
  if (!TYPES_MIME_ACCEPTES.has(file.mimetype)) {
    callback(new BadRequestException('Seuls les fichiers JPEG ou PNG sont acceptés.'), false);
    return;
  }
  callback(null, true);
}

@ApiTags('identite')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('identite')
export class IdentiteController {
  constructor(private readonly identiteService: IdentiteService) {}

  @Post('verifications')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'front', maxCount: 1 },
        { name: 'back', maxCount: 1 },
      ],
      { limits: { fileSize: TAILLE_MAX_OCTETS }, fileFilter },
    ),
  )
  soumettre(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitDocumentDto,
    @UploadedFiles() files: { front?: Express.Multer.File[]; back?: Express.Multer.File[] },
  ) {
    const front = files.front?.[0];
    if (!front) {
      throw new BadRequestException('Le recto du document est requis.');
    }
    const back = files.back?.[0] ?? null;

    return this.identiteService.soumettreDocument(
      user.id,
      dto.documentType,
      front.buffer,
      back ? back.buffer : null,
    );
  }

  @Get('verifications')
  mesVerifications(@CurrentUser() user: AuthenticatedUser) {
    return this.identiteService.listerMesVerifications(user.id);
  }
}
```

- [ ] **Step 10: Run — vérifier le succès**

```bash
npx vitest run src/identite/identite.controller.spec.ts
```

Expected: PASS (6 tests)

- [ ] **Step 11: Créer le module et l'enregistrer**

Créer `backend/src/identite/identite.module.ts` :

```typescript
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { IdentiteController } from './identite.controller.js';
import { IdentiteService } from './identite.service.js';

@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [IdentiteController],
  providers: [IdentiteService],
  exports: [IdentiteService],
})
export class IdentiteModule {}
```

Dans `backend/src/app.module.ts`, ajouter l'import à la suite de celui de
`StocksModule` :

```typescript
import { IdentiteModule } from './identite/identite.module.js';
```

Et ajouter `IdentiteModule,` dans le tableau `imports` du module racine, à
la suite de `StocksModule,`.

- [ ] **Step 12: Run la suite complète du backend**

```bash
npx vitest run
```

Expected: PASS — aucune régression.

- [ ] **Step 13: Commit**

```bash
git add backend/src/identite backend/src/app.module.ts backend/package.json backend/package-lock.json
git commit -m "feat(identite): soumission de document d'identite (sans OCR)"
```

---

### Task 3: Extraction OCR (tesseract.js)

**Files:**
- Create: `backend/src/identite/ocr-extraction.ts`
- Create: `backend/src/identite/ocr-extraction.spec.ts`
- Modify: `backend/src/identite/identite.service.ts`
- Modify: `backend/src/identite/identite.service.spec.ts`
- Modify: `backend/package.json` (ajout `tesseract.js`)

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: `extraireTexte(image: Buffer): Promise<string>` dans
  `ocr-extraction.ts` — Task 4 l'utilise pour en tirer les champs
  structurés (MRZ, dates, nom).

- [ ] **Step 1: Ajouter la dépendance**

```bash
cd backend
npm install tesseract.js
```

- [ ] **Step 2: Écrire le test d'extraction (échoue d'abord)**

Créer `backend/src/identite/ocr-extraction.spec.ts` :

```typescript
import { describe, expect, it } from 'vitest';
import { extraireTexte } from './ocr-extraction.js';

// Ce test ne vérifie pas la précision de l'OCR sur une vraie pièce
// d'identité (impossible sans fixture réelle et hors de portée d'un test
// unitaire) : il vérifie que le pipeline tourne de bout en bout sur une
// image synthétique et rend une chaîne, ce qui suffit à garantir que
// l'intégration tesseract.js fonctionne dans cet environnement.
describe('extraireTexte', () => {
  it('retourne une chaîne (éventuellement vide) sans lever d’exception', async () => {
    // 1x1 PNG blanc — aucun texte à reconnaître, mais le pipeline doit
    // tourner sans erreur et rendre une chaîne.
    const pngBlanc = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const texte = await extraireTexte(pngBlanc);
    expect(typeof texte).toBe('string');
  }, 30000);
});
```

- [ ] **Step 3: Run — vérifier l'échec**

```bash
npx vitest run src/identite/ocr-extraction.spec.ts
```

Expected: FAIL — `ocr-extraction.js` n'existe pas.

- [ ] **Step 4: Implémenter l'extraction**

Créer `backend/src/identite/ocr-extraction.ts` :

```typescript
import { createWorker } from 'tesseract.js';

/**
 * OCR local, sans appel réseau : `tesseract.js` télécharge son modèle de
 * langue une première fois puis tourne entièrement en local. Aucun
 * document envoyé à un tiers — condition posée par la spec (v1 gratuite).
 */
export async function extraireTexte(image: Buffer): Promise<string> {
  const worker = await createWorker('fra');
  try {
    const {
      data: { text },
    } = await worker.recognize(image);
    return text;
  } finally {
    await worker.terminate();
  }
}
```

- [ ] **Step 5: Run — vérifier le succès**

```bash
npx vitest run src/identite/ocr-extraction.spec.ts
```

Expected: PASS (le premier run peut prendre du temps : téléchargement du
modèle de langue français par tesseract.js)

- [ ] **Step 6: Brancher l'extraction dans `soumettreDocument`**

Ajouter le test dans `backend/src/identite/identite.service.spec.ts`, à la
suite des tests existants :

```typescript
vi.mock('./ocr-extraction.js', () => ({ extraireTexte: vi.fn() }));

// ... dans le describe existant, après les 4 tests déjà présents :
it('lance l’extraction OCR sur le recto après la création', async () => {
  const { extraireTexte } = await import('./ocr-extraction.js');
  vi.mocked(extraireTexte).mockResolvedValue('texte simulé');
  prisma.identity_verifications.create.mockResolvedValue({ id: 'v1' });

  await service.soumettreDocument('user-1', 'passeport', Buffer.from('page'), null);

  expect(extraireTexte).toHaveBeenCalledWith(Buffer.from('page'));
});
```

- [ ] **Step 7: Run — vérifier l'échec**

```bash
npx vitest run src/identite/identite.service.spec.ts
```

Expected: FAIL — `soumettreDocument` n'appelle pas encore `extraireTexte`.

- [ ] **Step 8: Appeler l'extraction dans le service**

Dans `backend/src/identite/identite.service.ts`, ajouter l'import :

```typescript
import { extraireTexte } from './ocr-extraction.js';
```

Modifier `soumettreDocument` pour lancer l'extraction sur le recto avant la
création (le résultat texte sera exploité par Task 4 ; pour l'instant on se
contente de l'appeler et de logger, sans encore rien stocker de structuré) :

```typescript
  async soumettreDocument(
    ownerId: string,
    documentType: DocumentType,
    front: Buffer,
    back: Buffer | null,
  ) {
    if (documentType !== 'passeport' && !back) {
      throw new BadRequestException(
        `Un ${documentType === 'carte_identite' ? 'recto ET un verso' : 'recto et un verso'} sont requis pour ce type de document.`,
      );
    }

    const texteOcr = await extraireTexte(front);

    return this.prisma.identity_verifications.create({
      data: {
        owner_id: ownerId,
        document_type: documentType,
        document_front: front,
        document_back: back,
        status: 'en_attente',
        // Task 4 remplira les champs extraits structurés à partir de
        // `texteOcr` ; pour l'instant rien n'est encore dérivé.
      },
    });
  }
```

(La variable `texteOcr` est reprise et exploitée dès la Task 4 — ne pas la
laisser inutilisée générerait une erreur de lint entre les deux tasks ;
c'est attendu, Task 4 s'enchaîne immédiatement dessus.)

- [ ] **Step 9: Run — vérifier le succès**

```bash
npx vitest run src/identite/identite.service.spec.ts
```

Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add backend/src/identite backend/package.json backend/package-lock.json
git commit -m "feat(identite): extraction OCR du recto via tesseract.js"
```

---

### Task 4: Validation MRZ, expiration et cohérence du nom

**Files:**
- Create: `backend/src/identite/mrz-checksum.ts`
- Create: `backend/src/identite/mrz-checksum.spec.ts`
- Create: `backend/src/identite/champs-extraits.ts`
- Create: `backend/src/identite/champs-extraits.spec.ts`
- Modify: `backend/src/identite/identite.service.ts`
- Modify: `backend/src/identite/identite.service.spec.ts`

**Interfaces:**
- Produces: `validerChecksumMrz(mrz: string[]): boolean | null` et
  `extraireChampsStructures(texteOcr: string): ChampsExtraits` où
  `ChampsExtraits = { dateNaissance?: Date; dateExpiration?: Date; numeroDocument?: string; mrzValide: boolean | null }`.
  `IdentiteService.soumettreDocument` prend un paramètre additionnel
  `nomCompte: string | null` (le `display_name` du profil, `null` si absent).
  **Scope explicite** : `prenom`/`nom` structurés ne sont PAS extraits en
  v1 (le format du nom en ligne 1 de la MRZ a ses propres subtilités de
  parsing, non nécessaires ici) — la cohérence du nom (voir Step 9 plus
  bas) compare directement le texte OCR brut au nom du compte, sans passer
  par une extraction structurée du nom. `dateExpiration` en revanche EST
  nécessaire dès cette task : la spec exige un rejet automatique des
  documents expirés (voir Step 11bis), qui ne peut pas attendre une
  itération ultérieure.

- [ ] **Step 1: Écrire les tests du checksum ICAO 9303 (échouent d'abord)**

Créer `backend/src/identite/mrz-checksum.spec.ts` :

```typescript
import { describe, expect, it } from 'vitest';
import { validerChecksumMrz } from './mrz-checksum.js';

// Vecteurs construits à la main avec l'algorithme ICAO 9303 : chaque
// caractère vaut sa valeur (0-9), 10+position alphabet pour A-Z, 0 pour
// '<', pondéré 7/3/1 en boucle, somme mod 10 = chiffre de contrôle.
// Ligne TD3 (passeport, 44 caractères) construite pour ce test :
// numéro de document 'L898902C3' (check digit 6, valeur connue du manuel
// ICAO 9303 Part 4, exemple officiel), reprise telle quelle.
describe('validerChecksumMrz', () => {
  it('valide une ligne MRZ TD3 dont les chiffres de contrôle sont corrects', () => {
    // Exemple officiel ICAO 9303 Part 4 §4.2.2 (passeport de démonstration).
    const ligne2 = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';
    expect(validerChecksumMrz([ligne2])).toBe(true);
  });

  it('rejette une ligne MRZ TD3 dont un chiffre de contrôle est altéré', () => {
    const ligne2Alteree = 'L898902C36UTO7408122F1204159ZE184226B<<<<<19';
    expect(validerChecksumMrz([ligne2Alteree])).toBe(false);
  });

  it('rend null quand aucune ligne ne fait 30 ou 44 caractères', () => {
    expect(validerChecksumMrz(['trop court'])).toBeNull();
  });

  it('rend null pour une liste vide', () => {
    expect(validerChecksumMrz([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run — vérifier l'échec**

```bash
npx vitest run src/identite/mrz-checksum.spec.ts
```

Expected: FAIL — `mrz-checksum.js` n'existe pas.

- [ ] **Step 3: Implémenter l'algorithme de checksum**

Créer `backend/src/identite/mrz-checksum.ts` :

```typescript
/**
 * Checksum ICAO 9303 — l'algorithme est indépendant du format (TD1/TD2/TD3),
 * seule la position des champs change selon le format. Cette fonction
 * valide le chiffre de contrôle global porté en dernière position de la
 * ligne 2 d'un passeport (TD3, 44 caractères) : c'est le contrôle
 * automatique gratuit le plus solide qui existe pour détecter un document
 * trafiqué, sans dépendre d'un service payant.
 *
 * Écrit en interne plutôt qu'avec une dépendance tierce : l'algorithme
 * tient en quelques lignes et se teste avec des vecteurs calculés à la
 * main (voir mrz-checksum.spec.ts) — une dépendance externe ajouterait un
 * risque de compatibilité pour un gain nul.
 */
const POIDS = [7, 3, 1];

function valeurCaractere(char: string): number {
  if (char === '<') return 0;
  if (char >= '0' && char <= '9') return char.charCodeAt(0) - '0'.charCodeAt(0);
  if (char >= 'A' && char <= 'Z') return char.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
  throw new Error(`Caractère MRZ invalide : ${char}`);
}

function checksum(champ: string): number {
  let somme = 0;
  for (let i = 0; i < champ.length; i++) {
    somme += valeurCaractere(champ[i]) * POIDS[i % 3];
  }
  return somme % 10;
}

/**
 * Valide le chiffre de contrôle composite d'une ligne MRZ TD3 (passeport,
 * 44 caractères). Rend `null` quand aucune ligne de longueur MRZ standard
 * (30 = TD1, 44 = TD3) n'est trouvée — absence de signal, pas un échec.
 *
 * TD1 (carte d'identité, 3 lignes de 30) n'est pas encore couvert : les
 * positions de champs de ce format doivent être vérifiées contre la
 * spécification ICAO 9303 Part 5 avant d'y étendre ce contrôle — laissé
 * pour une itération suivante plutôt que de risquer des positions
 * incorrectes non vérifiables sans pièce réelle sous la main.
 */
export function validerChecksumMrz(lignes: string[]): boolean | null {
  const ligneTd3 = lignes.find((l) => l.length === 44 && /^[A-Z0-9<]+$/.test(l));
  if (!ligneTd3) return null;

  // Ligne 2 du TD3 : positions 0-9 = numéro de document + check digit,
  // 13-19 = date de naissance + check digit, 21-27 = expiration + check
  // digit, 43 = check digit composite sur des plages fixes de la ligne.
  const numeroEtCheck = ligneTd3.slice(0, 10);
  const naissanceEtCheck = ligneTd3.slice(13, 20);
  const expirationEtCheck = ligneTd3.slice(21, 28);
  const composite =
    numeroEtCheck + naissanceEtCheck + expirationEtCheck + ligneTd3.slice(28, 43);

  const checkNumero = checksum(numeroEtCheck.slice(0, 9)) === Number(numeroEtCheck[9]);
  const checkNaissance = checksum(naissanceEtCheck.slice(0, 6)) === Number(naissanceEtCheck[6]);
  const checkExpiration = checksum(expirationEtCheck.slice(0, 6)) === Number(expirationEtCheck[6]);
  const checkComposite = checksum(composite) === Number(ligneTd3[43]);

  return checkNumero && checkNaissance && checkExpiration && checkComposite;
}
```

- [ ] **Step 4: Run — vérifier le succès**

```bash
npx vitest run src/identite/mrz-checksum.spec.ts
```

Expected: PASS (4 tests). Si le vecteur officiel ICAO ne passe pas du
premier coup, revérifier les offsets ci-dessus contre ICAO 9303 Part 4
§4.2.2 avant de suspecter l'algorithme de checksum lui-même (celui-ci est
le composant le plus simple et le plus fiable de cette task).

- [ ] **Step 5: Écrire les tests d'extraction des champs structurés**

Créer `backend/src/identite/champs-extraits.spec.ts` :

```typescript
import { describe, expect, it } from 'vitest';
import { extraireChampsStructures } from './champs-extraits.js';

describe('extraireChampsStructures', () => {
  it('détecte une ligne MRZ TD3 et rend mrzValide en conséquence', () => {
    const texte = `PASSEPORT\nP<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10\n`;
    const champs = extraireChampsStructures(texte);
    expect(champs.mrzValide).toBe(true);
  });

  it('extrait la date d’expiration et le numéro de document d’une ligne MRZ TD3', () => {
    // Même ligne officielle ICAO : naissance 740812 (12/08/1974),
    // expiration 120415 (15/04/2012), numéro 'L898902C3' (le '<' de
    // bourrage en position 9 du champ numéro est retiré).
    const texte = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';
    const champs = extraireChampsStructures(texte);
    expect(champs.numeroDocument).toBe('L898902C3');
    expect(champs.dateNaissance?.toISOString().slice(0, 10)).toBe('1974-08-12');
    expect(champs.dateExpiration?.toISOString().slice(0, 10)).toBe('2012-04-15');
  });

  it('rend mrzValide null et les champs dérivés absents quand aucune ligne MRZ n’est présente', () => {
    const champs = extraireChampsStructures('CARTE NATIONALE D IDENTITE\nNé le 12/08/1974');
    expect(champs.mrzValide).toBeNull();
    expect(champs.dateExpiration).toBeUndefined();
  });

  it('ne lève jamais d’exception sur un texte vide', () => {
    expect(() => extraireChampsStructures('')).not.toThrow();
  });
});
```

- [ ] **Step 6: Run — vérifier l'échec**

```bash
npx vitest run src/identite/champs-extraits.spec.ts
```

Expected: FAIL — `champs-extraits.js` n'existe pas.

- [ ] **Step 7: Implémenter l'extraction structurée**

Créer `backend/src/identite/champs-extraits.ts` :

```typescript
import { validerChecksumMrz } from './mrz-checksum.js';

export interface ChampsExtraits {
  mrzValide: boolean | null;
  dateNaissance?: Date;
  dateExpiration?: Date;
  numeroDocument?: string;
}

/**
 * Complète une année à deux chiffres MRZ en année complète : si les deux
 * chiffres dépassent l'année courante à deux chiffres, on suppose le
 * siècle précédent (une naissance ne peut pas être dans le futur), sinon
 * le siècle courant. Même heuristique pour la date d'expiration — une
 * pièce réelle n'expire jamais assez loin dans le passé pour que ça pose
 * problème avant longtemps.
 */
function anneeComplete(yy: number, anneeReference: number): number {
  const siecleCourant = Math.floor(anneeReference / 100) * 100;
  const anneeCourante2Chiffres = anneeReference % 100;
  return yy > anneeCourante2Chiffres ? siecleCourant - 100 + yy : siecleCourant + yy;
}

function dateDepuisMrz(yymmdd: string, anneeReference: number): Date | undefined {
  if (!/^\d{6}$/.test(yymmdd)) return undefined;
  const annee = anneeComplete(Number(yymmdd.slice(0, 2)), anneeReference);
  const mois = Number(yymmdd.slice(2, 4));
  const jour = Number(yymmdd.slice(4, 6));
  return new Date(Date.UTC(annee, mois - 1, jour));
}

/**
 * Isole les lignes qui ressemblent à de la MRZ (30 ou 44 caractères,
 * alphabet MRZ strict) dans le texte brut rendu par l'OCR, valide leur
 * checksum, et pour une ligne TD3 (passeport) en extrait aussi le numéro
 * de document et les deux dates — nécessaires au rejet automatique des
 * documents expirés (voir IdentiteService.soumettreDocument).
 *
 * `prenom`/`nom` structurés ne sont volontairement pas extraits ici : le
 * format du nom en ligne 1 a ses propres règles de troncature, non
 * nécessaires puisque la cohérence du nom (voir IdentiteService) compare
 * directement le texte OCR brut, sans passer par un champ structuré.
 *
 * TD1 (carte d'identité) n'est pas encore couvert, même limite que pour
 * `validerChecksumMrz` — voir sa documentation.
 */
export function extraireChampsStructures(
  texteOcr: string,
  maintenant: Date = new Date(),
): ChampsExtraits {
  const lignesMrz = texteOcr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => (l.length === 30 || l.length === 44) && /^[A-Z0-9<]+$/.test(l));

  const mrzValide = validerChecksumMrz(lignesMrz);
  const ligneTd3 = lignesMrz.find((l) => l.length === 44);
  if (!ligneTd3) {
    return { mrzValide };
  }

  const anneeReference = maintenant.getUTCFullYear();
  return {
    mrzValide,
    numeroDocument: ligneTd3.slice(0, 9).replace(/</g, ''),
    dateNaissance: dateDepuisMrz(ligneTd3.slice(13, 19), anneeReference),
    dateExpiration: dateDepuisMrz(ligneTd3.slice(21, 27), anneeReference),
  };
}
```

- [ ] **Step 8: Run — vérifier le succès**

```bash
npx vitest run src/identite/champs-extraits.spec.ts
```

Expected: PASS (4 tests)

- [ ] **Step 9: Écrire les tests de cohérence du nom et d'expiration dans le service**

Ajouter à `backend/src/identite/identite.service.spec.ts` (le mock de
`./ocr-extraction.js` existe déjà depuis Task 3) :

```typescript
it('marque name_matches_account à null quand le compte n’a pas de nom affiché', async () => {
  const { extraireTexte } = await import('./ocr-extraction.js');
  vi.mocked(extraireTexte).mockResolvedValue('texte sans nom exploitable');
  prisma.identity_verifications.create.mockResolvedValue({ id: 'v1' });

  await service.soumettreDocument('user-1', 'passeport', Buffer.from('page'), null, null);

  expect(prisma.identity_verifications.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ name_matches_account: null }),
  });
});

it('stocke le résultat de la validation MRZ', async () => {
  const { extraireTexte } = await import('./ocr-extraction.js');
  vi.mocked(extraireTexte).mockResolvedValue('AUCUNE MRZ ICI');
  prisma.identity_verifications.create.mockResolvedValue({ id: 'v1' });

  await service.soumettreDocument('user-1', 'passeport', Buffer.from('page'), null, null);

  expect(prisma.identity_verifications.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ mrz_checksum_valid: null }),
  });
});

it('rejette automatiquement un document dont la date d’expiration MRZ est passée', async () => {
  const { extraireTexte } = await import('./ocr-extraction.js');
  // Même ligne MRZ officielle ICAO utilisée dans champs-extraits.spec.ts :
  // expiration 12/04/2012, largement passée à la date où ce test tourne.
  vi.mocked(extraireTexte).mockResolvedValue('L898902C36UTO7408122F1204159ZE184226B<<<<<10');
  prisma.identity_verifications.create.mockResolvedValue({ id: 'v1' });

  await service.soumettreDocument('user-1', 'passeport', Buffer.from('page'), null, null);

  expect(prisma.identity_verifications.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      status: 'rejetee',
      rejection_reason: 'Document expiré.',
    }),
  });
});

it('laisse un document non expiré en_attente', async () => {
  const { extraireTexte } = await import('./ocr-extraction.js');
  vi.mocked(extraireTexte).mockResolvedValue('AUCUNE MRZ ICI');
  prisma.identity_verifications.create.mockResolvedValue({ id: 'v1' });

  await service.soumettreDocument('user-1', 'passeport', Buffer.from('page'), null, null);

  expect(prisma.identity_verifications.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ status: 'en_attente', rejection_reason: null }),
  });
});
```

- [ ] **Step 10: Run — vérifier l'échec**

```bash
npx vitest run src/identite/identite.service.spec.ts
```

Expected: FAIL — `soumettreDocument` ne prend pas encore de 5e paramètre
`nomCompte`, n'écrit pas encore `mrz_checksum_valid`/`name_matches_account`,
et ne rejette pas encore automatiquement un document expiré.

- [ ] **Step 11: Brancher l'extraction structurée dans le service**

Dans `backend/src/identite/identite.service.ts`, ajouter l'import :

```typescript
import { extraireChampsStructures } from './champs-extraits.js';
```

Remplacer la signature et le corps de `soumettreDocument` :

```typescript
  async soumettreDocument(
    ownerId: string,
    documentType: DocumentType,
    front: Buffer,
    back: Buffer | null,
    nomCompte: string | null,
  ) {
    if (documentType !== 'passeport' && !back) {
      throw new BadRequestException(
        `Un ${documentType === 'carte_identite' ? 'recto ET un verso' : 'recto et un verso'} sont requis pour ce type de document.`,
      );
    }

    const texteOcr = await extraireTexte(front);
    const champs = extraireChampsStructures(texteOcr);
    const nomCoherent = this.comparerNoms(nomCompte, texteOcr);
    // Seul contrôle qui court-circuite la revue humaine : la spec est
    // explicite là-dessus (« pas besoin d'attendre une revue humaine pour
    // ce cas-là »), contrairement à une incohérence de nom qui, elle,
    // signale seulement pour priorité de revue sans jamais rejeter seule.
    const expire = champs.dateExpiration ? champs.dateExpiration.getTime() < Date.now() : false;

    return this.prisma.identity_verifications.create({
      data: {
        owner_id: ownerId,
        document_type: documentType,
        document_front: front,
        document_back: back,
        status: expire ? 'rejetee' : 'en_attente',
        rejection_reason: expire ? 'Document expiré.' : null,
        mrz_checksum_valid: champs.mrzValide,
        name_matches_account: nomCoherent,
      },
    });
  }

  /**
   * Compare le nom du compte au texte OCR brut, en normalisant casse et
   * accents. `null` quand le compte n'a pas de nom affiché — une absence
   * de signal, jamais une incohérence par défaut. Un vrai rapprochement
   * champ à champ (une fois `champs-extraits.ts` étendu à l'extraction du
   * nom lui-même) affinera ceci dans une itération suivante ; en
   * attendant, un simple test de présence du nom normalisé dans le texte
   * OCR reste un signal utile pour prioriser la revue humaine.
   */
  private comparerNoms(nomCompte: string | null, texteOcr: string): boolean | null {
    if (!nomCompte || nomCompte.trim().length === 0) return null;
    // \p{Diacritic} (échappement Unicode, flag `u`) plutôt qu'une plage de
    // points de code écrite en dur : plus lisible, et insensible à tout
    // problème d'encodage qui pourrait corrompre des caractères combinants
    // recopiés tels quels dans le code source.
    const normalise = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
    return normalise(texteOcr).includes(normalise(nomCompte));
  }
```

- [ ] **Step 12: Mettre à jour le contrôleur pour passer le nom du compte**

Dans `backend/src/identite/identite.controller.ts`, le service a désormais
besoin du `display_name` du profil. Injecter `PrismaService` dans le
contrôleur serait redondant avec le service ; à la place, passer par le
service lui-même. Modifier l'appel dans `soumettre` :

```typescript
    return this.identiteService.soumettreDocumentPourUtilisateur(
      user.id,
      dto.documentType,
      front.buffer,
      back ? back.buffer : null,
    );
```

Et ajouter cette méthode d'enveloppe dans `identite.service.ts`, qui
résout le nom du compte puis délègue :

```typescript
  async soumettreDocumentPourUtilisateur(
    ownerId: string,
    documentType: DocumentType,
    front: Buffer,
    back: Buffer | null,
  ) {
    const profil = await this.prisma.user_profiles.findUnique({
      where: { user_id: ownerId },
      select: { display_name: true },
    });
    return this.soumettreDocument(ownerId, documentType, front, back, profil?.display_name ?? null);
  }
```

Mettre à jour le test du contrôleur
(`identite.controller.spec.ts`) : remplacer chaque occurrence de
`service.soumettreDocument` par `service.soumettreDocumentPourUtilisateur`
dans le mock et les assertions `toHaveBeenCalledWith('user-1', 'carte_identite', front.buffer, back.buffer)`
(4 arguments, sans `nomCompte` — cette méthode d'enveloppe le résout elle-même).

- [ ] **Step 13: Run la suite complète du module**

```bash
npx vitest run src/identite
```

Expected: PASS

- [ ] **Step 14: Commit**

```bash
git add backend/src/identite
git commit -m "feat(identite): validation MRZ (checksum ICAO 9303) et coherence du nom"
```

---

### Task 5: Revue administrateur

Le backend a déjà un mécanisme générique pour réserver une route à un rôle :
`RoleGuard` + le décorateur `@RequireRole(roleId)`
(`backend/src/roles/role.guard.ts`, `backend/src/roles/require-role.decorator.ts`),
qui s'appuie sur `RolesService.holdsRole` en interne. `'administrateur'` est
déjà un `RoleId` valide (`roles-catalogue.ts`). Pas besoin d'écrire un
nouveau guard : cette task réutilise celui-là, exactement comme il est déjà
utilisé ailleurs pour les routes d'« espace ».

**Files:**
- Modify: `backend/src/identite/identite.service.ts`
- Modify: `backend/src/identite/identite.service.spec.ts`
- Modify: `backend/src/identite/identite.controller.ts`
- Modify: `backend/src/identite/identite.controller.spec.ts`
- Modify: `backend/src/identite/identite.module.ts`
- Modify: `backend/src/identite/dto/identite.dto.ts`

**Interfaces:**
- Consumes: `RoleGuard` (`../roles/role.guard.js`), `RequireRole`
  (`../roles/require-role.decorator.js`), tous deux déjà existants.
- Produces: `IdentiteService.listerEnAttente()`,
  `IdentiteService.revoirVerification(verificationId: string, decision: 'validee' | 'rejetee', motif?: string): Promise<identity_verifications>`.

- [ ] **Step 1: Écrire les tests de revue dans le service**

Ajouter à `backend/src/identite/identite.service.spec.ts` :

```typescript
describe('IdentiteService — revue', () => {
  it('valide une vérification en_attente', async () => {
    prisma.identity_verifications.findFirst = vi.fn().mockResolvedValue({ id: 'v1', status: 'en_attente' });
    prisma.identity_verifications.update = vi.fn().mockResolvedValue({ id: 'v1', status: 'validee' });

    await service.revoirVerification('v1', 'validee');

    expect(prisma.identity_verifications.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: expect.objectContaining({ status: 'validee' }),
    });
  });

  it('refuse de revoir une vérification déjà tranchée', async () => {
    prisma.identity_verifications.findFirst = vi.fn().mockResolvedValue({ id: 'v1', status: 'validee' });

    await expect(service.revoirVerification('v1', 'rejetee', 'doublon')).rejects.toThrow(
      /déjà/i,
    );
  });

  it('exige un motif pour un rejet', async () => {
    prisma.identity_verifications.findFirst = vi.fn().mockResolvedValue({ id: 'v1', status: 'en_attente' });

    await expect(service.revoirVerification('v1', 'rejetee')).rejects.toThrow(/motif/i);
  });
});
```

- [ ] **Step 2: Run — vérifier l'échec**

```bash
npx vitest run src/identite/identite.service.spec.ts
```

Expected: FAIL — `revoirVerification` et `listerEnAttente` n'existent pas.

- [ ] **Step 3: Implémenter la revue dans le service**

Ajouter dans `backend/src/identite/identite.service.ts`, importer
`ConflictException` et `BadRequestException` (déjà importé) :

```typescript
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
```

Puis ajouter les méthodes :

```typescript
  listerEnAttente() {
    return this.prisma.identity_verifications.findMany({
      where: { status: 'en_attente' },
      orderBy: { created_at: 'asc' },
    });
  }

  async revoirVerification(
    verificationId: string,
    decision: 'validee' | 'rejetee',
    motif?: string,
  ) {
    const verification = await this.prisma.identity_verifications.findFirst({
      where: { id: verificationId },
    });
    if (!verification) {
      throw new NotFoundException('Vérification introuvable.');
    }
    if (verification.status !== 'en_attente') {
      throw new ConflictException(
        `Cette vérification est déjà ${verification.status} : une décision ne se reprend pas.`,
      );
    }
    if (decision === 'rejetee' && !motif) {
      throw new BadRequestException('Un motif est requis pour rejeter une vérification.');
    }

    return this.prisma.identity_verifications.update({
      where: { id: verificationId },
      data: {
        status: decision,
        rejection_reason: decision === 'rejetee' ? motif : null,
        reviewed_at: new Date(),
      },
    });
  }
```

- [ ] **Step 4: Run — vérifier le succès**

```bash
npx vitest run src/identite/identite.service.spec.ts
```

Expected: PASS

- [ ] **Step 5: Écrire les tests du contrôleur pour la revue**

Ajouter à `backend/src/identite/identite.controller.spec.ts` :

```typescript
it('expose la file en attente', async () => {
  service.listerEnAttente = vi.fn().mockResolvedValue([]);
  await controller.enAttente();
  expect(service.listerEnAttente).toHaveBeenCalled();
});

it('transmet la décision de revue', async () => {
  service.revoirVerification = vi.fn().mockResolvedValue({ id: 'v1' });
  await controller.revoir('v1', { decision: 'rejetee', motif: 'photo illisible' });
  expect(service.revoirVerification).toHaveBeenCalledWith('v1', 'rejetee', 'photo illisible');
});
```

- [ ] **Step 6: Run — vérifier l'échec**

```bash
npx vitest run src/identite/identite.controller.spec.ts
```

Expected: FAIL — `enAttente`/`revoir` n'existent pas sur le contrôleur.

- [ ] **Step 7: Ajouter le DTO de revue et les routes**

Dans `backend/src/identite/dto/identite.dto.ts`, ajouter :

```typescript
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewVerificationDto {
  @IsIn(['validee', 'rejetee'], { message: "decision doit être 'validee' ou 'rejetee'." })
  decision: 'validee' | 'rejetee';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motif?: string;
}
```

(fusionner cet import avec celui de `IsIn` déjà présent en haut du fichier
plutôt que de le dupliquer).

Dans `backend/src/identite/identite.controller.ts`, ajouter les imports
`Param`, `UseGuards` (déjà importé), `RoleGuard`, `RequireRole`,
`ReviewVerificationDto`, puis les routes :

```typescript
import { RequireRole } from '../roles/require-role.decorator.js';
import { RoleGuard } from '../roles/role.guard.js';
```

```typescript
  @Get('verifications/en-attente')
  @UseGuards(RoleGuard)
  @RequireRole('administrateur')
  enAttente() {
    return this.identiteService.listerEnAttente();
  }

  @Post('verifications/:id/revue')
  @UseGuards(RoleGuard)
  @RequireRole('administrateur')
  @HttpCode(HttpStatus.OK)
  revoir(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewVerificationDto) {
    return this.identiteService.revoirVerification(id, dto.decision, dto.motif);
  }
```

(`ParseUUIDPipe` et `Param` : ajouter à l'import déjà présent depuis
`@nestjs/common`.)

- [ ] **Step 8: Enregistrer `RoleGuard` dans le module**

`RolesModule` (`backend/src/roles/roles.module.ts`) exporte `RolesService`
mais pas `RoleGuard` lui-même (`exports: [RolesService]` seulement) : pour
que `@UseGuards(RoleGuard)` puisse l'instancier dans `IdentiteController`,
`RoleGuard` doit être déclaré comme provider directement dans
`IdentiteModule` — Nest résout alors ses propres dépendances
(`Reflector`, global ; `RolesService`, via l'import de `RolesModule`
ci-dessous) normalement. Dans `backend/src/identite/identite.module.ts` :

```typescript
import { RoleGuard } from '../roles/role.guard.js';
import { RolesModule } from '../roles/roles.module.js';
```

```typescript
@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' }), RolesModule],
  controllers: [IdentiteController],
  providers: [IdentiteService, RoleGuard],
  exports: [IdentiteService],
})
export class IdentiteModule {}
```

- [ ] **Step 9: Run — vérifier le succès puis la suite complète**

```bash
npx vitest run src/identite
```

Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add backend/src/identite
git commit -m "feat(identite): revue administrateur des verifications"
```

---

### Task 6: Mandats — création, signature, révocation

**Files:**
- Create: `backend/src/identite/mandate-text.ts`
- Create: `backend/src/identite/mandats.service.ts`
- Create: `backend/src/identite/mandats.service.spec.ts`
- Modify: `backend/src/identite/identite.controller.ts`
- Modify: `backend/src/identite/identite.controller.spec.ts`
- Modify: `backend/src/identite/dto/identite.dto.ts`
- Modify: `backend/src/identite/identite.module.ts`

**Interfaces:**
- Consumes: `assertOwnsProject` (`../prisma/assert-owns-project.js`).
- Produces: `MandatsService.creerMandat(ownerId, projectId, purpose)`,
  `MandatsService.signerMandat(ownerId, mandateId, nomComplet, ip)`,
  `MandatsService.revoquerMandat(ownerId, mandateId)`,
  `MandatsService.listerMesMandats(ownerId)`.

- [ ] **Step 1: Écrire le texte type du mandat**

Créer `backend/src/identite/mandate-text.ts` :

```typescript
/**
 * Texte engageant : vit dans le code, relu comme lui, jamais réédité après
 * coup — un mandat déjà signé fige sa propre copie de ce texte au moment
 * de la signature (voir `mandates.mandate_text`), donc modifier cette
 * constante n'affecte jamais un mandat déjà donné.
 */
export const TEXTE_MANDAT =
  "Par la présente, je mandate Ignitux pour préparer et déposer, en mon " +
  "nom et pour mon compte, les démarches administratives liées à la " +
  "création de mon entreprise (déclaration auprès du guichet unique de " +
  "l'INPI et des organismes concernés), sur la base des informations que " +
  "j'ai fournies. Ce mandat ne vaut que pour ce projet précis et peut être " +
  "révoqué à tout moment.";
```

- [ ] **Step 2: Écrire les tests du service de mandats (échouent d'abord)**

Créer `backend/src/identite/mandats.service.spec.ts` :

```typescript
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { MandatsService } from './mandats.service.js';

describe('MandatsService', () => {
  let service: MandatsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      identity_verifications: { findFirst: vi.fn() },
      projects: { findFirst: vi.fn() },
      mandates: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [MandatsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(MandatsService);
  });

  it('refuse de créer un mandat sans vérification d’identité validée', async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.identity_verifications.findFirst.mockResolvedValue(null);

    await expect(service.creerMandat('user-1', 'p1', 'depot_creation_entreprise')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('crée un mandat quand une vérification validée existe', async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.identity_verifications.findFirst.mockResolvedValue({ id: 'v1', status: 'validee' });
    prisma.mandates.create.mockResolvedValue({ id: 'm1' });

    await service.creerMandat('user-1', 'p1', 'depot_creation_entreprise');

    expect(prisma.mandates.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        owner_id: 'user-1',
        project_id: 'p1',
        identity_verification_id: 'v1',
        purpose: 'depot_creation_entreprise',
        status: 'active',
      }),
    });
  });

  it('signe un mandat et fige le texte et l’horodatage', async () => {
    prisma.mandates.findFirst.mockResolvedValue({ id: 'm1', owner_id: 'user-1', signed_at: null });
    prisma.mandates.update.mockResolvedValue({ id: 'm1' });

    await service.signerMandat('user-1', 'm1', 'Jean Dupont', '203.0.113.4');

    expect(prisma.mandates.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: expect.objectContaining({
        signed_full_name: 'Jean Dupont',
        signer_ip: '203.0.113.4',
        mandate_text: expect.stringContaining('mandate Ignitux'),
      }),
    });
  });

  it('refuse de signer un mandat déjà signé', async () => {
    prisma.mandates.findFirst.mockResolvedValue({ id: 'm1', owner_id: 'user-1', signed_at: new Date() });

    await expect(service.signerMandat('user-1', 'm1', 'Jean Dupont', '203.0.113.4')).rejects.toThrow();
  });

  it('révoque un mandat actif', async () => {
    prisma.mandates.findFirst.mockResolvedValue({ id: 'm1', owner_id: 'user-1', status: 'active' });
    prisma.mandates.update.mockResolvedValue({ id: 'm1', status: 'revoquee' });

    await service.revoquerMandat('user-1', 'm1');

    expect(prisma.mandates.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: expect.objectContaining({ status: 'revoquee' }),
    });
  });

  it('refuse de révoquer le mandat d’un autre compte', async () => {
    prisma.mandates.findFirst.mockResolvedValue(null);
    await expect(service.revoquerMandat('user-1', 'm1')).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 3: Run — vérifier l'échec**

```bash
npx vitest run src/identite/mandats.service.spec.ts
```

Expected: FAIL — `mandats.service.js` n'existe pas.

- [ ] **Step 4: Implémenter le service de mandats**

Créer `backend/src/identite/mandats.service.ts` :

```typescript
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { assertOwnsProject } from '../prisma/assert-owns-project.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TEXTE_MANDAT } from './mandate-text.js';

@Injectable()
export class MandatsService {
  constructor(private readonly prisma: PrismaService) {}

  async creerMandat(ownerId: string, projectId: string, purpose: string) {
    await assertOwnsProject(this.prisma, ownerId, projectId);

    const verification = await this.prisma.identity_verifications.findFirst({
      where: { owner_id: ownerId, status: 'validee' },
      orderBy: { created_at: 'desc' },
    });
    if (!verification) {
      throw new BadRequestException(
        "Aucune vérification d'identité validée pour ce compte : signe d'abord ton identité sur /identite.",
      );
    }

    return this.prisma.mandates.create({
      data: {
        owner_id: ownerId,
        project_id: projectId,
        identity_verification_id: verification.id,
        purpose,
        status: 'active',
        // mandate_text/signed_full_name/signed_at/signer_ip restent null
        // jusqu'à signerMandat : un mandat créé mais pas encore signé est
        // un état réel, pas une absence de données à masquer.
      },
    });
  }

  listerMesMandats(ownerId: string) {
    return this.prisma.mandates.findMany({
      where: { owner_id: ownerId },
      orderBy: { created_at: 'desc' },
    });
  }

  async signerMandat(ownerId: string, mandateId: string, nomComplet: string, ip: string) {
    const mandat = await this.findMandatForOwner(ownerId, mandateId);
    if (mandat.signed_at) {
      throw new ConflictException('Ce mandat est déjà signé.');
    }

    return this.prisma.mandates.update({
      where: { id: mandateId },
      data: {
        mandate_text: TEXTE_MANDAT,
        signed_full_name: nomComplet,
        signed_at: new Date(),
        signer_ip: ip,
      },
    });
  }

  async revoquerMandat(ownerId: string, mandateId: string) {
    const mandat = await this.findMandatForOwner(ownerId, mandateId);
    if (mandat.status === 'revoquee') {
      throw new ConflictException('Ce mandat est déjà révoqué.');
    }

    return this.prisma.mandates.update({
      where: { id: mandateId },
      data: { status: 'revoquee', revoked_at: new Date() },
    });
  }

  private async findMandatForOwner(ownerId: string, mandateId: string) {
    const mandat = await this.prisma.mandates.findFirst({
      where: { id: mandateId, owner_id: ownerId },
    });
    if (!mandat) {
      throw new NotFoundException('Mandat introuvable.');
    }
    return mandat;
  }
}
```

- [ ] **Step 5: Run — vérifier le succès**

```bash
npx vitest run src/identite/mandats.service.spec.ts
```

Expected: PASS

- [ ] **Step 6: Ajouter les DTO de mandat**

Dans `backend/src/identite/dto/identite.dto.ts`, ajouter :

```typescript
export class CreateMandateDto {
  @IsUUID()
  projectId: string;

  @IsString()
  @MaxLength(100)
  purpose: string;
}

export class SignMandateDto {
  @IsString()
  @MinLength(1, { message: 'nomComplet ne peut pas être vide.' })
  @MaxLength(200)
  nomComplet: string;
}
```

(ajouter `IsUUID`, `MinLength` à l'import `class-validator` en tête du
fichier s'ils n'y sont pas déjà.)

- [ ] **Step 7: Écrire les tests du contrôleur pour les mandats**

Ajouter à `backend/src/identite/identite.controller.spec.ts` (le
contrôleur reçoit maintenant `MandatsService` en plus de `IdentiteService`
— mettre à jour le `Test.createTestingModule` du fichier pour fournir les
deux) :

```typescript
it('crée un mandat pour le projet donné', async () => {
  mandats.creerMandat = vi.fn().mockResolvedValue({ id: 'm1' });
  await controller.creerMandat(user, { projectId: 'p1', purpose: 'depot_creation_entreprise' });
  expect(mandats.creerMandat).toHaveBeenCalledWith('user-1', 'p1', 'depot_creation_entreprise');
});

it('signe un mandat avec l’IP de la requête', async () => {
  mandats.signerMandat = vi.fn().mockResolvedValue({ id: 'm1' });
  const req = { ip: '203.0.113.4' } as any;
  await controller.signerMandat(user, 'm1', { nomComplet: 'Jean Dupont' }, req);
  expect(mandats.signerMandat).toHaveBeenCalledWith('user-1', 'm1', 'Jean Dupont', '203.0.113.4');
});

it('révoque un mandat', async () => {
  mandats.revoquerMandat = vi.fn().mockResolvedValue({ id: 'm1' });
  await controller.revoquerMandat(user, 'm1');
  expect(mandats.revoquerMandat).toHaveBeenCalledWith('user-1', 'm1');
});
```

Remplacer le `beforeEach` du même fichier (celui posé en Task 2 Step 7) par :

```typescript
import { MandatsService } from './mandats.service.js';

// ... dans describe('IdentiteController', ...) :
let mandats: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(async () => {
  service = { soumettreDocument: vi.fn(), listerMesVerifications: vi.fn() };
  mandats = { creerMandat: vi.fn(), signerMandat: vi.fn(), revoquerMandat: vi.fn(), listerMesMandats: vi.fn() };
  const moduleRef = await Test.createTestingModule({
    controllers: [IdentiteController],
    providers: [
      { provide: IdentiteService, useValue: service },
      { provide: MandatsService, useValue: mandats },
    ],
  }).compile();
  controller = moduleRef.get(IdentiteController);
});
```

- [ ] **Step 8: Run — vérifier l'échec**

```bash
npx vitest run src/identite/identite.controller.spec.ts
```

Expected: FAIL — le contrôleur ne connaît pas encore `MandatsService`.

- [ ] **Step 9: Brancher les routes de mandat dans le contrôleur**

Dans `backend/src/identite/identite.controller.ts`, importer
`MandatsService`, `CreateMandateDto`, `SignMandateDto`, et le décorateur
`Req` de `@nestjs/common`, puis injecter le service et ajouter les routes :

```typescript
  constructor(
    private readonly identiteService: IdentiteService,
    private readonly mandatsService: MandatsService,
  ) {}
```

```typescript
  @Post('mandats')
  @HttpCode(HttpStatus.CREATED)
  creerMandat(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMandateDto) {
    return this.mandatsService.creerMandat(user.id, dto.projectId, dto.purpose);
  }

  @Get('mandats')
  mesMandats(@CurrentUser() user: AuthenticatedUser) {
    return this.mandatsService.listerMesMandats(user.id);
  }

  @Post('mandats/:id/signer')
  signerMandat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignMandateDto,
    @Req() req: { ip: string },
  ) {
    return this.mandatsService.signerMandat(user.id, id, dto.nomComplet, req.ip);
  }

  @Post('mandats/:id/revoquer')
  revoquerMandat(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.mandatsService.revoquerMandat(user.id, id);
  }
```

- [ ] **Step 10: Enregistrer `MandatsService` dans le module**

Dans `backend/src/identite/identite.module.ts`, importer `MandatsService`
et l'ajouter à `providers` et `exports`.

- [ ] **Step 11: Run la suite complète du module puis du backend**

```bash
npx vitest run src/identite
npx vitest run
```

Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add backend/src/identite
git commit -m "feat(identite): creation, signature et revocation de mandats"
```

---

### Task 7: Frontend — page `/identite` (upload et statut)

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/app/identite/page.tsx`
- Create: `frontend/src/app/identite/page.spec.tsx`

**Interfaces:**
- Consumes: `api.getMesVerifications(token)`, `useAuth()`, `ApiError`
  (conventions existantes de `frontend/src/lib/api.ts` et
  `frontend/src/app/crm/page.tsx`).
- Produces: `api.soumettreDocumentIdentite(token, documentType, front, back)`,
  `api.getMesVerifications(token)` — Task 8 et Task 9 réutilisent le même
  fichier `api.ts` pour les mandats et la revue.

- [ ] **Step 1: Ajouter le helper multipart et les wrappers dans `api.ts`**

Dans `frontend/src/lib/api.ts`, ajouter à la suite de `requestCsv` (autour
de la ligne 147) :

```typescript
export type IdentityVerificationStatus = 'en_attente' | 'validee' | 'rejetee';

export interface IdentityVerification {
  id: string;
  documentType: string;
  status: IdentityVerificationStatus;
  rejectionReason: string | null;
  createdAt: string;
}

/**
 * L'upload de pièce d'identité envoie du `multipart/form-data` : contrairement
 * à `request`, on ne fixe jamais `Content-Type` ici — le navigateur doit
 * poser lui-même la frontière multipart, que `fetch` calcule à partir du
 * `FormData` fourni.
 */
async function requestMultipart<T>(path: string, token: string, form: FormData): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body.message === 'string' ? body.message : 'Une erreur est survenue.';
    throw new ApiError(message, res.status);
  }
  return body as T;
}
```

- [ ] **Step 2: Ajouter les wrappers dans l'objet `api`**

Dans `frontend/src/lib/api.ts`, à l'intérieur de `export const api = { ... }`
(ligne ~1699), ajouter :

```typescript
  soumettreDocumentIdentite(
    token: string,
    documentType: 'carte_identite' | 'passeport' | 'titre_sejour',
    front: File,
    back: File | null,
  ) {
    const form = new FormData();
    form.append('documentType', documentType);
    form.append('front', front);
    if (back) form.append('back', back);
    return requestMultipart<IdentityVerification>('/identite/verifications', token, form);
  },

  getMesVerifications(token: string) {
    return request<IdentityVerification[]>('/identite/verifications', {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
```

- [ ] **Step 3: Écrire le test de la page (échoue d'abord)**

Créer `frontend/src/app/identite/page.spec.tsx` :

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import IdentitePage from './page.js';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.js';

vi.mock('@/lib/api.js');
vi.mock('@/lib/auth.js');
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

describe('IdentitePage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ token: 'tok', isReady: true } as any);
  });

  it('affiche « Aucune vérification » quand la liste est vide', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([]);
    render(<IdentitePage />);
    expect(await screen.findByText(/aucune vérification/i)).toBeInTheDocument();
  });

  it('affiche le statut d’une vérification existante', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([
      { id: 'v1', documentType: 'passeport', status: 'en_attente', rejectionReason: null, createdAt: '2026-09-30T00:00:00.000Z' },
    ]);
    render(<IdentitePage />);
    expect(await screen.findByText(/en attente/i)).toBeInTheDocument();
  });

  it('affiche le motif de rejet quand une vérification est rejetée', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([
      { id: 'v1', documentType: 'passeport', status: 'rejetee', rejectionReason: 'photo illisible', createdAt: '2026-09-30T00:00:00.000Z' },
    ]);
    render(<IdentitePage />);
    expect(await screen.findByText(/photo illisible/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run — vérifier l'échec**

```bash
cd frontend
npx vitest run src/app/identite/page.spec.tsx
```

Expected: FAIL — `page.tsx` n'existe pas.

- [ ] **Step 5: Implémenter la page**

Créer `frontend/src/app/identite/page.tsx` :

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Brand } from '@/components/ignitux-mark';
import { api, ApiError, type IdentityVerification } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const LIBELLES_STATUT: Record<string, string> = {
  en_attente: 'En attente',
  validee: 'Validée',
  rejetee: 'Rejetée',
};

const LIBELLES_DOCUMENT: Record<string, string> = {
  carte_identite: "Carte d'identité",
  passeport: 'Passeport',
  titre_sejour: 'Titre de séjour',
};

/**
 * IDENTITÉ — la pièce qui rend un mandat possible.
 *
 * Bandeau honnête, même esprit que Banque/Caisse : les contrôles
 * automatiques réduisent le travail de revue, ils ne remplacent jamais la
 * personne qui valide avant qu'une identité compte comme vérifiée.
 */
export default function IdentitePage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [verifications, setVerifications] = useState<IdentityVerification[]>([]);
  const [documentType, setDocumentType] = useState<'carte_identite' | 'passeport' | 'titre_sejour'>(
    'carte_identite',
  );
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      setVerifications(await api.getMesVerifications(token));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger tes vérifications.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    void charger();
  }, [isReady, token, router, charger]);

  const soumettre = async (evenement: React.FormEvent) => {
    evenement.preventDefault();
    if (!token || !front) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await api.soumettreDocumentIdentite(token, documentType, front, back);
      setFront(null);
      setBack(null);
      await charger();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'envoyer ton document.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isReady || !token) return null;

  return (
    <main className="page">
      <div className="top-bar">
        <Brand />
        <Link href="/projects" className="muted">
          ← Retour aux projets
        </Link>
      </div>

      <h1>Vérification d&apos;identité</h1>
      <p className="notice">
        Ta pièce est lue automatiquement pour détecter les incohérences évidentes, mais c&apos;est
        une personne qui valide avant que ton identité compte comme vérifiée.
      </p>

      {error && <p className="error">{error}</p>}

      <form onSubmit={soumettre} className="card">
        <label>
          Type de document
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value as typeof documentType)}
          >
            <option value="carte_identite">Carte d&apos;identité</option>
            <option value="passeport">Passeport</option>
            <option value="titre_sejour">Titre de séjour</option>
          </select>
        </label>

        <label>
          Recto
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={(e) => setFront(e.target.files?.[0] ?? null)}
          />
        </label>

        {documentType !== 'passeport' && (
          <label>
            Verso
            <input
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => setBack(e.target.files?.[0] ?? null)}
            />
          </label>
        )}

        <button className="primary" type="submit" disabled={!front || isSubmitting}>
          {isSubmitting ? 'Envoi…' : 'Envoyer'}
        </button>
      </form>

      <h2>Mes vérifications</h2>
      {isLoading && <p className="loading">Chargement…</p>}
      {!isLoading && verifications.length === 0 && (
        <p className="muted">Aucune vérification pour l&apos;instant.</p>
      )}
      {verifications.map((v) => (
        <div key={v.id} className="card">
          <strong>{LIBELLES_DOCUMENT[v.documentType] ?? v.documentType}</strong>
          <p>{LIBELLES_STATUT[v.status] ?? v.status}</p>
          {v.status === 'rejetee' && v.rejectionReason && (
            <p className="error">{v.rejectionReason}</p>
          )}
        </div>
      ))}
    </main>
  );
}
```

- [ ] **Step 6: Run — vérifier le succès**

```bash
npx vitest run src/app/identite/page.spec.tsx
```

Expected: PASS (3 tests)

- [ ] **Step 7: Run la suite frontend complète et `tsc`**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/app/identite
git commit -m "feat(identite): page frontend de verification d'identite"
```

---

### Task 8: Frontend — section mandat sur la page projet

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/app/projects/[id]/mandat-section.tsx`
- Create: `frontend/src/app/projects/[id]/mandat-section.spec.tsx`
- Modify: `frontend/src/app/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `api.getMesVerifications`, `api.getMesMandats`,
  `api.creerMandat`, `api.signerMandat`, `api.revoquerMandat` (ajoutés ici).

- [ ] **Step 1: Ajouter les types et wrappers de mandat dans `api.ts`**

À la suite des wrappers d'identité ajoutés en Task 7 :

```typescript
export interface Mandate {
  id: string;
  projectId: string;
  purpose: string;
  mandateText: string;
  signedFullName: string;
  signedAt: string;
  status: 'active' | 'revoquee';
}
```

Et dans l'objet `api` :

```typescript
  getMesMandats(token: string) {
    return request<Mandate[]>('/identite/mandats', {
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  creerMandat(token: string, projectId: string, purpose: string) {
    return request<Mandate>('/identite/mandats', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ projectId, purpose }),
    });
  },

  signerMandat(token: string, mandateId: string, nomComplet: string) {
    return request<Mandate>(`/identite/mandats/${mandateId}/signer`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nomComplet }),
    });
  },

  revoquerMandat(token: string, mandateId: string) {
    return request<Mandate>(`/identite/mandats/${mandateId}/revoquer`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  },
```

- [ ] **Step 2: Écrire le test de la section (échoue d'abord)**

Créer `frontend/src/app/projects/[id]/mandat-section.spec.tsx` :

```typescript
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MandatSection } from './mandat-section.js';
import { api } from '@/lib/api.js';

vi.mock('@/lib/api.js');

describe('MandatSection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('invite à vérifier son identité quand aucune vérification n’est validée', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([]);
    vi.mocked(api.getMesMandats).mockResolvedValue([]);
    render(<MandatSection token="tok" projectId="p1" />);
    expect(await screen.findByText(/vérifier ton identité/i)).toBeInTheDocument();
  });

  it('propose de signer un mandat quand une vérification est validée', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([
      { id: 'v1', documentType: 'passeport', status: 'validee', rejectionReason: null, createdAt: '2026-09-30T00:00:00.000Z' },
    ]);
    vi.mocked(api.getMesMandats).mockResolvedValue([]);
    render(<MandatSection token="tok" projectId="p1" />);
    expect(await screen.findByRole('button', { name: /signer/i })).toBeInTheDocument();
  });

  it('affiche un mandat déjà signé avec un bouton de révocation', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([
      { id: 'v1', documentType: 'passeport', status: 'validee', rejectionReason: null, createdAt: '2026-09-30T00:00:00.000Z' },
    ]);
    vi.mocked(api.getMesMandats).mockResolvedValue([
      {
        id: 'm1',
        projectId: 'p1',
        purpose: 'depot_creation_entreprise',
        mandateText: 'texte',
        signedFullName: 'Jean Dupont',
        signedAt: '2026-09-30T00:00:00.000Z',
        status: 'active',
      },
    ]);
    render(<MandatSection token="tok" projectId="p1" />);
    expect(await screen.findByRole('button', { name: /révoquer/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run — vérifier l'échec**

```bash
npx vitest run src/app/projects/\[id\]/mandat-section.spec.tsx
```

Expected: FAIL — `mandat-section.tsx` n'existe pas.

- [ ] **Step 4: Implémenter la section**

Créer `frontend/src/app/projects/[id]/mandat-section.tsx` :

```tsx
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Mandate } from '@/lib/api';

/**
 * MANDAT — n'est pas un résultat de générateur IGINI, et vit donc à part
 * de `engine-sections.tsx` : c'est une autorisation que la personne donne,
 * pas une recommandation qu'IGINI produit.
 */
export function MandatSection({ token, projectId }: { token: string; projectId: string }) {
  const [identiteValidee, setIdentiteValidee] = useState(false);
  const [mandat, setMandat] = useState<Mandate | null>(null);
  const [nomComplet, setNomComplet] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const charger = useCallback(async () => {
    setIsLoading(true);
    try {
      const [verifications, mandats] = await Promise.all([
        api.getMesVerifications(token),
        api.getMesMandats(token),
      ]);
      setIdentiteValidee(verifications.some((v) => v.status === 'validee'));
      setMandat(mandats.find((m) => m.projectId === projectId) ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger le mandat.');
    } finally {
      setIsLoading(false);
    }
  }, [token, projectId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const creerEtSigner = async () => {
    if (!nomComplet.trim()) return;
    try {
      const cree = await api.creerMandat(token, projectId, 'depot_creation_entreprise');
      const signe = await api.signerMandat(token, cree.id, nomComplet);
      setMandat(signe);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de signer le mandat.');
    }
  };

  const revoquer = async () => {
    if (!mandat) return;
    try {
      const revoque = await api.revoquerMandat(token, mandat.id);
      setMandat(revoque);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de révoquer le mandat.');
    }
  };

  if (isLoading) return null;

  return (
    <div className="card">
      <h2>Mandat</h2>
      {error && <p className="error">{error}</p>}

      {!identiteValidee && (
        <p className="muted">
          Il faut d&apos;abord{' '}
          <Link href="/identite">vérifier ton identité</Link> avant de pouvoir signer un mandat
          pour ce projet.
        </p>
      )}

      {identiteValidee && !mandat && (
        <>
          <p>
            Ce mandat autorise Ignitux à préparer et déposer les démarches de création de cette
            entreprise en ton nom.
          </p>
          <label>
            Nom complet
            <input value={nomComplet} onChange={(e) => setNomComplet(e.target.value)} />
          </label>
          <button className="primary" type="button" onClick={creerEtSigner} disabled={!nomComplet.trim()}>
            Signer
          </button>
        </>
      )}

      {mandat && mandat.status === 'active' && (
        <>
          <p className="muted">
            Signé par {mandat.signedFullName} le {new Date(mandat.signedAt).toLocaleDateString('fr-FR')}.
          </p>
          <button type="button" onClick={revoquer}>
            Révoquer ce mandat
          </button>
        </>
      )}

      {mandat && mandat.status === 'revoquee' && <p className="muted">Ce mandat a été révoqué.</p>}
    </div>
  );
}
```

- [ ] **Step 5: Run — vérifier le succès**

```bash
npx vitest run "src/app/projects/[id]/mandat-section.spec.tsx"
```

Expected: PASS (3 tests)

- [ ] **Step 6: Monter la section sur la page projet**

Lire `frontend/src/app/projects/[id]/page.tsx` avant modification pour
repérer où `engine-sections.tsx` est monté (probablement après l'affichage
des informations du projet) et importer/monter `MandatSection` juste après,
avec les mêmes props `token`/`projectId` que celles déjà passées aux
composants voisins de cette page. Ne pas mélanger son rendu à celui
d'`engine-sections.tsx` — un nouveau bloc séparé dans le JSX, à sa suite.

- [ ] **Step 7: Run la suite frontend complète et `tsc`**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/app/projects
git commit -m "feat(identite): section mandat sur la page projet"
```

---

### Task 9: Frontend — page de revue administrateur `/identite/revue`

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/app/identite/revue/page.tsx`
- Create: `frontend/src/app/identite/revue/page.spec.tsx`

**Interfaces:**
- Consumes: `api.getVerificationsEnAttente(token)`,
  `api.revoirVerification(token, id, decision, motif?)` (ajoutés ici).

- [ ] **Step 1: Ajouter les wrappers dans `api.ts`**

```typescript
  getVerificationsEnAttente(token: string) {
    return request<IdentityVerification[]>('/identite/verifications/en-attente', {
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  revoirVerification(token: string, id: string, decision: 'validee' | 'rejetee', motif?: string) {
    return request<IdentityVerification>(`/identite/verifications/${id}/revue`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ decision, motif }),
    });
  },
```

- [ ] **Step 2: Écrire le test de la page (échoue d'abord)**

Créer `frontend/src/app/identite/revue/page.spec.tsx` :

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import RevuePage from './page.js';
import { api, ApiError } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.js';

vi.mock('@/lib/api.js');
vi.mock('@/lib/auth.js');
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

describe('RevuePage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ token: 'tok', isReady: true } as any);
  });

  it('affiche « Aucune vérification en attente » quand la file est vide', async () => {
    vi.mocked(api.getVerificationsEnAttente).mockResolvedValue([]);
    render(<RevuePage />);
    expect(await screen.findByText(/aucune vérification en attente/i)).toBeInTheDocument();
  });

  it('affiche un message clair quand l’accès est refusé (403)', async () => {
    vi.mocked(api.getVerificationsEnAttente).mockRejectedValue(new ApiError('Réservé aux administrateurs.', 403));
    render(<RevuePage />);
    expect(await screen.findByText(/réservé aux administrateurs/i)).toBeInTheDocument();
  });

  it('valide une vérification en un clic', async () => {
    vi.mocked(api.getVerificationsEnAttente).mockResolvedValue([
      { id: 'v1', documentType: 'passeport', status: 'en_attente', rejectionReason: null, createdAt: '2026-09-30T00:00:00.000Z' },
    ]);
    vi.mocked(api.revoirVerification).mockResolvedValue({
      id: 'v1', documentType: 'passeport', status: 'validee', rejectionReason: null, createdAt: '2026-09-30T00:00:00.000Z',
    });
    render(<RevuePage />);
    await userEvent.click(await screen.findByRole('button', { name: /valider/i }));
    expect(api.revoirVerification).toHaveBeenCalledWith('tok', 'v1', 'validee', undefined);
  });
});
```

- [ ] **Step 3: Run — vérifier l'échec**

```bash
npx vitest run src/app/identite/revue/page.spec.tsx
```

Expected: FAIL — `page.tsx` n'existe pas dans `identite/revue/`.

- [ ] **Step 4: Implémenter la page**

Créer `frontend/src/app/identite/revue/page.tsx` :

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Brand } from '@/components/ignitux-mark';
import { api, ApiError, type IdentityVerification } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const LIBELLES_DOCUMENT: Record<string, string> = {
  carte_identite: "Carte d'identité",
  passeport: 'Passeport',
  titre_sejour: 'Titre de séjour',
};

export default function RevuePage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [enAttente, setEnAttente] = useState<IdentityVerification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const charger = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      setEnAttente(await api.getVerificationsEnAttente(token));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger la file de revue.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    void charger();
  }, [isReady, token, router, charger]);

  const trancher = async (id: string, decision: 'validee' | 'rejetee', motif?: string) => {
    if (!token) return;
    try {
      await api.revoirVerification(token, id, decision, motif);
      await charger();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible d’enregistrer la décision.');
    }
  };

  if (!isReady || !token) return null;

  return (
    <main className="page">
      <div className="top-bar">
        <Brand />
        <Link href="/projects" className="muted">
          ← Retour aux projets
        </Link>
      </div>

      <h1>Revue des vérifications d&apos;identité</h1>

      {error && <p className="error">{error}</p>}
      {isLoading && <p className="loading">Chargement…</p>}
      {!isLoading && enAttente.length === 0 && !error && (
        <p className="muted">Aucune vérification en attente.</p>
      )}

      {enAttente.map((v) => (
        <div key={v.id} className="card">
          <strong>{LIBELLES_DOCUMENT[v.documentType] ?? v.documentType}</strong>
          <p className="muted">Soumise le {new Date(v.createdAt).toLocaleString('fr-FR')}</p>
          <button className="primary" type="button" onClick={() => trancher(v.id, 'validee')}>
            Valider
          </button>
          <button
            type="button"
            onClick={() => {
              const motif = window.prompt('Motif du rejet :');
              if (motif) void trancher(v.id, 'rejetee', motif);
            }}
          >
            Rejeter
          </button>
        </div>
      ))}
    </main>
  );
}
```

- [ ] **Step 5: Run — vérifier le succès**

```bash
npx vitest run src/app/identite/revue/page.spec.tsx
```

Expected: PASS (3 tests)

- [ ] **Step 6: Run la suite frontend complète et `tsc`**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/app/identite/revue
git commit -m "feat(identite): page de revue administrateur"
```

---

## Vérification finale (avant revue de branche complète)

- `cd backend && npx vitest run` — suite complète verte.
- `cd backend && npx tsc --noEmit`.
- `cd frontend && npx vitest run` — suite complète verte.
- `cd frontend && npx tsc --noEmit`.
- Vérification manuelle locale (jamais en ligne, cf. préférence de test en
  local) : téléverser une vraie photo de pièce d'identité sur `/identite`,
  observer le statut `en_attente`, se donner (ou donner à un second compte)
  le rôle `administrateur`, valider depuis `/identite/revue`, puis signer un
  mandat sur une page projet et vérifier qu'il apparaît bien listé et
  révocable.
- Rappeler dans `docs/decisions.md` ou `docs/reste-a-faire.md` les 3 risques
  juridiques de la spec (statut de mandataire, niveau de signature,
  obligations de conservation) comme bloquants avant tout dépôt réel —
  cohérent avec la note déjà en place pour le module Financement &
  Investisseurs.
