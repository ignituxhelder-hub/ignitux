import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';
import { MENTION_PATERNITE, pourAffichage } from './config/identite-ignitux.js';
import { PrismaService } from './prisma/prisma.service.js';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async getHealth() {
    try {
      // Requête triviale pour vérifier que la connexion à la base répond
      // réellement, pas seulement que le process Nest est en vie.
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Base de données inaccessible.');
    }

    return { status: 'ok' };
  }

  /**
   * Les mentions légales. Publique, et sans jeton — c'est le propre d'une
   * mention légale d'être lisible avant d'avoir un compte.
   *
   * Ce qui n'est pas configuré rend `null` plutôt qu'une valeur plausible :
   * une adresse inventée sur cette page serait pire que son absence, parce
   * qu'elle aurait l'air d'une réponse.
   *
   * L'IBAN n'y figure que masqué. Il n'existe aucune route qui le rende
   * entier, et ce n'est pas un oubli.
   */
  @Get('mentions-legales')
  getMentionsLegales() {
    return { ...pourAffichage(), paternite: MENTION_PATERNITE };
  }
}
