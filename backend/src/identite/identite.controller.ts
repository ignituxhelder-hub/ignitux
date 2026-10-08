import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Req,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequireRole } from '../roles/require-role.decorator.js';
import { RoleGuard } from '../roles/role.guard.js';
import {
  CreateMandateDto,
  FACES_DOCUMENT,
  type FaceDocument,
  ReviewVerificationDto,
  SignMandateDto,
  SubmitDocumentDto,
} from './dto/identite.dto.js';
import { IdentiteService } from './identite.service.js';
import { MandatsService } from './mandats.service.js';
import { TEXTE_MANDAT } from './mandate-text.js';

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
  constructor(
    private readonly identiteService: IdentiteService,
    private readonly mandatsService: MandatsService,
  ) {}

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
  async soumettre(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitDocumentDto,
    @UploadedFiles() files: { front?: Express.Multer.File[]; back?: Express.Multer.File[] },
  ) {
    // Méthode async (pas seulement pour le `return` qui est déjà une
    // promesse) : le throw ci-dessous doit devenir un rejet de promesse,
    // pas une exception synchrone — sinon `expect(controller.soumettre(...))
    // .rejects` plante avant même d'atteindre `.rejects`, puisque l'appel
    // lève avant que expect() ne reçoive quoi que ce soit.
    const front = files.front?.[0];
    if (!front) {
      throw new BadRequestException('Le recto du document est requis.');
    }
    const back = files.back?.[0] ?? null;

    return this.identiteService.soumettreDocumentPourUtilisateur(
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

  @Get('verifications/en-attente')
  @UseGuards(RoleGuard)
  @RequireRole('administrateur')
  enAttente() {
    return this.identiteService.listerEnAttente();
  }

  /**
   * Une face de la pièce, en binaire (image/png ou image/jpeg), pour
   * l'aperçu — jamais dans les réponses JSON de liste. Propriétaire ou
   * administrateur seulement : le contrôle vit dans le service, parce qu'il
   * n'est pas binaire comme RoleGuard (« propriétaire OU rôle »).
   * `no-store` : une pièce d'identité ne doit rester dans aucun cache.
   */
  @Get('verifications/:id/document/:face')
  @Header('Cache-Control', 'no-store')
  async document(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('face', new ParseEnumPipe(FACES_DOCUMENT)) face: FaceDocument,
  ) {
    const { contenu, type } = await this.identiteService.lireDocument(user.id, id, face);
    return new StreamableFile(contenu, { type });
  }

  @Post('verifications/:id/revue')
  @UseGuards(RoleGuard)
  @RequireRole('administrateur')
  @HttpCode(HttpStatus.OK)
  revoir(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewVerificationDto,
  ) {
    return this.identiteService.revoirVerification(admin.id, id, dto.decision, dto.motif);
  }

  /** Le texte que la personne lit avant de signer — celui que signerMandat figera. */
  @Get('mandats/texte')
  texteMandat() {
    return { texte: TEXTE_MANDAT };
  }

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
}
