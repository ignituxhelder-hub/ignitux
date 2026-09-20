import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { ConstitutionModule } from '../constitution/constitution.module.js';
import { InvestorsModule } from '../investors/investors.module.js';
import { RoleGuard } from './role.guard.js';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';
import { SpacesService } from './spaces.service.js';

/**
 * LES RÔLES — qui je suis dans Ignitux, et donc ce que je vois.
 *
 * Ce module ne stocke qu'une chose : quels rôles une personne tient, et
 * lequel est actif. Tout le reste est emprunté aux modules qui détiennent
 * déjà la donnée — d'où l'import d'InvestorsModule plutôt qu'une deuxième
 * lecture des mouvements ici. Un espace assemble, il ne recopie pas.
 */
@Module({
  imports: [
    AuthModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConstitutionModule,
    InvestorsModule,
  ],
  controllers: [RolesController],
  providers: [RolesService, SpacesService, RoleGuard],
  exports: [RolesService],
})
export class RolesModule {}
