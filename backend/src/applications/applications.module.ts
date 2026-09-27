import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { ApplicationsController } from './applications.controller.js';
import { ApplicationsService } from './applications.service.js';

/**
 * LES APPLICATIONS — ce qu'une personne voit en ouvrant Ignitux.
 *
 * Ce module ne stocke rien : il lit des compteurs et laisse le moteur
 * d'activation décider. `AuthModule` et `PassportModule` parce que le
 * contrôleur pose `JwtAuthGuard` (voir `offres.module.ts` pour ce qui arrive
 * sans eux). `OffresService` vient d'un module global.
 */
@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
})
export class ApplicationsModule {}
