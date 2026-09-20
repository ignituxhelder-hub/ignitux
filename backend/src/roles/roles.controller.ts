import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SetActiveRoleDto, SetRolesDto } from './dto/roles.dto.js';
import { RequireRole } from './require-role.decorator.js';
import { RoleGuard } from './role.guard.js';
import { ROLES } from './roles-catalogue.js';
import { RolesService } from './roles.service.js';
import { SpacesService } from './spaces.service.js';

/**
 * LES RÔLES ET LEURS ESPACES.
 *
 * Le catalogue est public : savoir ce qu'Ignitux propose de devenir ne
 * demande pas de compte. Tout le reste dérive du jeton — aucune route ne
 * prend un identifiant de personne en paramètre, donc aucune ne peut être
 * écrite pour lire les rôles ou le portefeuille de quelqu'un d'autre.
 */
@ApiTags('roles')
@Controller()
export class RolesController {
  constructor(
    private readonly roles: RolesService,
    private readonly spaces: SpacesService,
  ) {}

  /** Le catalogue, sans compte : ce qu'on peut être, et ce qui n'est pas ouvert. */
  @Get('roles')
  catalogue() {
    return {
      roles: ROLES.map((role) => ({ ...role, domains: [...role.domains] })),
      notice:
        'Un rôle est une vue, pas un dossier : il ne détient aucune donnée et en retirer ' +
        "un n'efface rien. Les rôles marqués comme non ouverts sont prévus par " +
        "l'architecture et ne mènent encore nulle part.",
    };
  }

  @Get('roles/moi')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.roles.myRoles(user.id);
  }

  @Put('roles/moi')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  setMine(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetRolesDto) {
    return this.roles.setRoles(user.id, dto.roles);
  }

  /** Bascule de mode. Ne touche à aucune donnée : change ce qui est montré. */
  @Put('roles/moi/actif')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  setActive(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetActiveRoleDto) {
    return this.roles.setActiveRole(user.id, dto.role);
  }

  @Get('espaces/entrepreneur')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RoleGuard)
  @RequireRole('entrepreneur')
  entrepreneur(@CurrentUser() user: AuthenticatedUser) {
    return this.spaces.entrepreneurSpace(user.id);
  }

  @Get('espaces/investisseur')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RoleGuard)
  @RequireRole('investisseur')
  investisseur(@CurrentUser() user: AuthenticatedUser) {
    return this.spaces.investorSpace(user.id);
  }
}
