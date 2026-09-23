import { Global, Module } from '@nestjs/common';
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
  imports: [PrismaModule],
  controllers: [OffresController],
  providers: [OffresService],
  exports: [OffresService],
})
export class OffresModule {}
