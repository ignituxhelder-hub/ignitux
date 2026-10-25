import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { RoleGuard } from '../roles/role.guard.js';
import { RolesModule } from '../roles/roles.module.js';
import { AdminCreditsController, CreditsController } from './credits.controller.js';
import { CreditsService } from './credits.service.js';

/**
 * Les crédits IGINI. `CreditsService` est exporté pour `ClaudeService`, qui
 * réserve et rembourse à chaque appel IA, et pour l'évaluation de
 * financement, qui vérifie le solde avant de lancer sa génération.
 *
 * `AuthModule` + `PassportModule` pour `JwtAuthGuard`, `RolesModule` pour
 * `RoleGuard` — sans eux l'application refuse de démarrer, et les tests
 * unitaires ne le voient pas (même remarque qu'EvaluationModule).
 */
@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' }), RolesModule],
  controllers: [CreditsController, AdminCreditsController],
  providers: [CreditsService, RoleGuard],
  exports: [CreditsService],
})
export class CreditsModule {}
