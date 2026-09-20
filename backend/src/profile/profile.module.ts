import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { RolesModule } from '../roles/roles.module.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';

/**
 * Le profil se lit à travers les rôles : les questions posées à un
 * investisseur ne sont pas celles d'un entrepreneur, et personne ne doit
 * répondre aux deux séries sans tenir les deux rôles.
 */
@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' }), RolesModule],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
