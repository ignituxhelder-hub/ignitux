import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { VitrineService } from './vitrine.service.js';

/**
 * Public, sans connexion : la page d'accueil lit ici le compteur de projets.
 * Rien de personnel n'en sort — un nombre arrondi, ou `null` sous le seuil.
 */
@ApiTags('vitrine')
@Controller('vitrine')
export class VitrineController {
  constructor(private readonly vitrine: VitrineService) {}

  @Get('compteur')
  async compteur(): Promise<{ projets: number | null }> {
    return { projets: await this.vitrine.projetsAffiches() };
  }
}
