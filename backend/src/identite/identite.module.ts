import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { RoleGuard } from '../roles/role.guard.js';
import { RolesModule } from '../roles/roles.module.js';
import { IdentiteController } from './identite.controller.js';
import { IdentiteService } from './identite.service.js';
import { MandatsService } from './mandats.service.js';

// RolesModule exporte RolesService mais pas RoleGuard lui-même : pour que
// @UseGuards(RoleGuard) puisse l'instancier dans IdentiteController, RoleGuard
// doit être déclaré ici comme provider — Nest résout alors ses propres
// dépendances (Reflector, global ; RolesService, via l'import de RolesModule
// ci-dessous) normalement.
@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' }), RolesModule],
  controllers: [IdentiteController],
  providers: [IdentiteService, MandatsService, RoleGuard],
  exports: [IdentiteService, MandatsService],
})
export class IdentiteModule {}
