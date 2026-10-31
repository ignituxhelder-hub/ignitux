import { Module } from '@nestjs/common';
import { VitrineController } from './vitrine.controller.js';
import { VitrineService } from './vitrine.service.js';

/** Ce que la page d'accueil montre d'Ignitux (le compteur de projets). */
@Module({
  controllers: [VitrineController],
  providers: [VitrineService],
})
export class VitrineModule {}
