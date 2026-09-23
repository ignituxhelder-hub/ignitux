import { Global, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OffresController } from './offres.controller.js';
import { OffresService } from './offres.service.js';

/**
 * Global, et c'est délibéré.
 *
 * Les droits se vérifient partout : à la création d'un projet, devant
 * chaque générateur, à l'entrée des outils de gestion. Passer par un import
 * explicite dans chacun de ces modules produirait une dizaine de lignes
 * identiques, et surtout un oubli le jour où un module naîtra sans y
 * penser — un module qui compile et ne vérifie rien.
 */
@Global()
@Module({
  // `AuthModule` et `PassportModule` parce que le contrôleur pose
  // `@UseGuards(JwtAuthGuard)` : sans eux, Nest ne résout pas la garde et
  // **l'application entière refuse de démarrer**. Les tests unitaires ne
  // pouvaient pas l'attraper — ils instancient les services un par un, sans
  // jamais assembler le graphe. C'est la suite de bout en bout qui l'a vu,
  // à la première exécution contre une vraie base.
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' }), PrismaModule],
  controllers: [OffresController],
  providers: [OffresService],
  exports: [OffresService],
})
export class OffresModule {}
