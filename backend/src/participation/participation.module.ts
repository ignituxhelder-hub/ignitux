import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { ConstitutionModule } from '../constitution/constitution.module.js';
import { ParticipationController } from './participation.controller.js';
import { ParticipationService } from './participation.service.js';

/**
 * La participation d'IGNITUX : l'accord, ses paliers, le droit sur les
 * dividendes. Construit à côté de `financing/` — qui suit le capital et reste
 * la seule autorité sur qui détient quelle part — et jamais à sa place.
 */
@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' }), ConstitutionModule],
  controllers: [ParticipationController],
  providers: [ParticipationService],
  exports: [ParticipationService],
})
export class ParticipationModule {}
