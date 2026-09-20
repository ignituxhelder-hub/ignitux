import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ConstitutionService } from './constitution.service.js';

/**
 * La Constitution est en lecture seule via l'API : elle vit dans le code
 * (constitution-articles.ts), sous revue de code et versionnée avec lui. Une
 * « interface d'administration » qui permettrait d'éditer les articles en
 * base à chaud transformerait le texte fondateur en donnée mutable sans
 * trace — exactement ce qu'un texte fondateur ne doit pas être. L'écran
 * frontend correspondant est donc une console d'audit, pas un éditeur.
 *
 * ── Qui peut lire quoi ───────────────────────────────────────────────────
 *
 * Le **texte** — préambule, articles, règles — est public, sans compte. Il
 * l'était déjà en droit : `user-data-scope.ts` l'exclut de l'export RGPD au
 * motif que c'est un « document public, identique pour tout le monde ». Il
 * ne l'était pas en fait, et quelqu'un qui hésitait à s'inscrire ne pouvait
 * pas lire la Constitution du produit auquel il allait confier son projet.
 * Pour un produit dont la devise est « la vérité avant tout », c'était un
 * écart entre ce qui est dit et ce qui est fait.
 *
 * L'**audit** et le **journal des refus** restent authentifiés, et le
 * journal ne rend que les refus de la personne qui le demande.
 */
@ApiTags('constitution')
@Controller('constitution')
export class ConstitutionController {
  constructor(private readonly constitutionService: ConstitutionService) {}

  @Get('preamble')
  getPreamble() {
    return this.constitutionService.getPreamble();
  }

  @Get('articles')
  listArticles(@Query('version') version?: string) {
    return this.constitutionService.listArticles(version);
  }

  @Get('rules')
  listRules() {
    return this.constitutionService.listRules();
  }

  /**
   * État réel du respect de la Constitution, article par article.
   *
   * Authentifié : les lignes `measured` comptent sur toute la base, ce qui
   * dit indirectement le volume d'activité d'Ignitux. Aucune donnée
   * personnelle n'y figure, mais ce n'est pas une information à rendre à qui
   * passe.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('audit')
  audit() {
    return this.constitutionService.audit();
  }

  /** Les refus qui concernent la personne connectée, et personne d'autre. */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('violations')
  listViolations(@CurrentUser() user: AuthenticatedUser) {
    return this.constitutionService.listViolations(user.id);
  }
}
