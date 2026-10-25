import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { OffresController } from './offres.controller.js';
import { OffresService } from './offres.service.js';

/**
 * La page des offres. Plus `@Global` : depuis les crédits IGINI, aucun
 * module ne vérifie plus de droit lié à une offre.
 */
@Module({
  // `AuthModule` et `PassportModule` parce que le contrôleur pose
  // `@UseGuards(JwtAuthGuard)` : sans eux, Nest ne résout pas la garde et
  // **l'application entière refuse de démarrer**.
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [OffresController],
  providers: [OffresService],
})
export class OffresModule {}
