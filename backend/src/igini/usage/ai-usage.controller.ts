import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { PRICE_GRID_DATE, microEurToEur } from './ai-pricing.js';
import { AiUsageService, type UsageSummary } from './ai-usage.service.js';

/**
 * Ce que les générateurs IGINI ont consommé pour la personne connectée, sur
 * le mois en cours.
 *
 * Il n'y a **aucune** route donnant la vue de tout le monde : `monthlyTotal`
 * existe côté service, mais l'exposer demanderait un rôle d'exploitant que le
 * produit n'a pas encore. Publier un total global derrière une simple
 * authentification reviendrait à laisser n'importe quel compte lire le
 * chiffre d'affaires en creux. Tant que ce rôle n'existe pas, cette vue se
 * consulte en base.
 */
@ApiTags('igini')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('igini/usage')
export class AiUsageController {
  constructor(private readonly aiUsage: AiUsageService) {}

  @Get('mois-en-cours')
  async currentMonth(@CurrentUser() user: AuthenticatedUser) {
    return presenter(await this.aiUsage.monthlySummary(user.id));
  }
}

/**
 * Traduit le résumé interne en réponse d'API.
 *
 * Les micro-euros ne sortent pas tels quels : ils sont une unité de calcul,
 * pas une unité de lecture. En revanche la date de la grille sort, elle, à
 * chaque fois — un montant sans la date de son tarif est invérifiable, et
 * celui-ci est dérivé, pas facturé.
 */
function presenter(resume: UsageSummary) {
  return {
    periode: { depuis: resume.depuis.toISOString(), jusqua: resume.jusqua.toISOString() },
    appels: resume.appels,
    tokens: {
      entree: resume.tokensEntree,
      sortie: resume.tokensSortie,
      // Comprise dans la sortie, pas en plus : l'afficher à part évite de
      // croire qu'il faut l'additionner.
      dont_reflexion: resume.tokensReflexion,
    },
    cout: {
      euros: resume.coutEur,
      grille_du: PRICE_GRID_DATE,
      estimation: true,
      modeles_non_tarifes: resume.modelesNonTarifes,
    },
    par_generateur: resume.parGenerateur.map((ligne) => ({
      generateur: ligne.generateur,
      appels: ligne.appels,
      tokens_entree: ligne.tokensEntree,
      tokens_sortie: ligne.tokensSortie,
      dont_reflexion: ligne.tokensReflexion,
      cout_euros: ligne.coutMicroEur === null ? null : microEurToEur(ligne.coutMicroEur),
    })),
  };
}
