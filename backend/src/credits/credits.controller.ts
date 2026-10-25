import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequireRole } from '../roles/require-role.decorator.js';
import { RoleGuard } from '../roles/role.guard.js';
import { presenterBareme } from './bareme.js';
import { CreditsService } from './credits.service.js';
import { AjusterCreditsDto } from './dto/ajuster-credits.dto.js';

/**
 * « Mes crédits » — et le barème, lisible par tous.
 *
 * Aucune route ne porte `@Espace` : les crédits sont personnels (classe
 * « refusée en espace étranger » de l'intercepteur Équipe). Un membre ne
 * lit jamais le solde d'un propriétaire en se plaçant dans son espace ; il
 * voit le prix d'une action avant de la lancer, et c'est le propriétaire qui
 * paie (voir ClaudeService).
 */
@ApiTags('credits')
@Controller('credits')
export class CreditsController {
  constructor(private readonly credits: CreditsService) {}

  /** Le solde, le barème et les 100 derniers mouvements de la personne connectée. */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  vue(@CurrentUser() user: AuthenticatedUser) {
    return this.credits.vue(user.id);
  }

  /**
   * Le barème — public, sans connexion : la page d'accueil (« Combien ça
   * coûte ? ») affiche les mêmes prix que le serveur applique. Il ne dit rien
   * de personne, ni le coût interne d'un appel.
   */
  @Get('bareme')
  bareme() {
    return presenterBareme();
  }
}

/**
 * L'administration des crédits : liste des comptes avec leur solde, et
 * ajustements avec motif. Rôle `administrateur` sur toutes les routes, comme
 * la revue des évaluations.
 */
@ApiTags('credits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RoleGuard)
@RequireRole('administrateur')
@Controller('admin/credits')
export class AdminCreditsController {
  constructor(private readonly credits: CreditsService) {}

  /** `?page=1&parPage=50&recherche=adresse` — 100 comptes par page au plus. */
  @Get()
  comptes(
    @Query('page') page?: string,
    @Query('parPage') parPage?: string,
    @Query('recherche') recherche?: string,
  ) {
    return this.credits.comptes({
      page: page === undefined ? undefined : Number(page),
      parPage: parPage === undefined ? undefined : Number(parPage),
      recherche,
    });
  }

  /** Ajoute ou retire des crédits, motif obligatoire. Jamais sous zéro (409). */
  @Post(':userId')
  ajuster(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AjusterCreditsDto,
  ) {
    return this.credits.crediter({
      ownerId: userId,
      actorId: admin.id,
      kind: 'ajustement_admin',
      credits: dto.credits,
      motif: dto.motif,
    });
  }
}
