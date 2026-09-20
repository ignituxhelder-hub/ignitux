import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { JourneyController } from './journey.controller.js';
import { JourneyService } from './journey.service.js';

/**
 * Le parcours : Découvrir → Construire → Transmettre.
 *
 * Ne détient aucune donnée et n'en écrit aucune. Il lit ce que les autres
 * modules ont produit et en déduit ce qu'il faut montrer — même principe
 * que les espaces de rôles : une lecture, pas un magasin.
 */
@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [JourneyController],
  providers: [JourneyService],
  exports: [JourneyService],
})
export class JourneyModule {}
