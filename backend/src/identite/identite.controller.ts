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
}
