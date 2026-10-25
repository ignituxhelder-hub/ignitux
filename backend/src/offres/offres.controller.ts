import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OffresService } from './offres.service.js';

@ApiTags('offres')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('offres')
export class OffresController {
  constructor(private readonly offres: OffresService) {}

  /**
   * L'unique offre (gratuite) et le renvoi vers les crédits.
   *
   * `POST /offres/changer` a disparu avec les offres payantes : il n'y a
   * plus d'abonnement à choisir.
   */
  @Get()
  catalogue() {
    return this.offres.catalogue();
  }
}
