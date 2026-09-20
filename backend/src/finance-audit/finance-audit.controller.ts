import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { FinanceAuditService } from './finance-audit.service.js';

/**
 * La coherence financiere d'UN projet, rendue a qui a le droit de le lire.
 *
 * L'audit GLOBAL n'a aucune route, et ce n'est pas un oubli : il parcourt
 * les livres d'Ignitux et les registres de tous les porteurs. Le publier
 * derriere une simple authentification donnerait a n'importe quel compte une
 * vue sur l'activite de tout le monde. Il demande un role d'exploitant qui
 * n'existe pas encore ; en attendant, il se lance depuis la console.
 */
@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class FinanceAuditController {
  constructor(private readonly audit: FinanceAuditService) {}

  @Get(':id/audit-financier')
  projectAudit(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.audit.projectAudit(user.id, id);
  }
}
