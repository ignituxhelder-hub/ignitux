import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ConstitutionService } from './constitution.service.js';

/**
 * La Constitution est en lecture seule via l'API : elle vit dans le code
 * (constitution-articles.ts), sous revue de code et versionnée avec lui. Une
 * « interface d'administration » qui permettrait d'éditer les articles en
 * base à chaud transformerait le texte fondateur en donnée mutable sans
 * trace — exactement ce qu'un texte fondateur ne doit pas être. L'écran
 * frontend correspondant est donc une console d'audit, pas un éditeur.
 */
@ApiTags('constitution')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('constitution')
export class ConstitutionController {
  constructor(private readonly constitutionService: ConstitutionService) {}

  @Get('articles')
  listArticles(@Query('version') version?: string) {
    return this.constitutionService.listArticles(version);
  }

  @Get('rules')
  listRules() {
    return this.constitutionService.listRules();
  }

  @Get('audit')
  audit() {
    return this.constitutionService.audit();
  }

  @Get('violations')
  listViolations() {
    return this.constitutionService.listViolations();
  }
}
