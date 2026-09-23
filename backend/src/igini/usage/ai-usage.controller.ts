import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { PRICE_GRID_DATE, microEurToEur } from './ai-pricing.js';
import { shouldWarn, type QuotaLimits, type QuotaVerdict } from './ai-quota.js';
import { offre } from '../../offres/offres-catalogue.js';
import { OffresService } from '../../offres/offres.service.js';
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
/** Assez pour lire un mois de travail, trop peu pour noyer un écran. */
const HISTORY_LIMIT = 200;

@ApiTags('igini')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('igini/usage')
export class AiUsageController {
  constructor(
    private readonly aiUsage: AiUsageService,
    private readonly offres: OffresService,
  ) {}

  /**
   * Les appels de la personne, du plus récent au plus ancien.
   *
   * Un total sans le détail n'est pas vérifiable : savoir qu'on a dépensé
   * 3,40 € ne dit pas sur quoi. La liste est bornée — on ne rend pas dix
   * mille lignes à un écran qui en montre cinquante.
   */
  @Get('historique')
  history(@CurrentUser() user: AuthenticatedUser) {
    return this.aiUsage.history(user.id, HISTORY_LIMIT);
  }

  @Get('mois-en-cours')
  async currentMonth(@CurrentUser() user: AuthenticatedUser) {
    const [resume, quota, offreId, appelsCeMois] = await Promise.all([
      this.aiUsage.monthlySummary(user.id),
      this.aiUsage.quotaFor(user.id),
      this.offres.offreDe(user.id),
      this.aiUsage.callsThisMonth(user.id),
    ]);
    return {
      ...presenter(resume),
      quota: presenterQuota(quota, this.aiUsage.limits(), {
        inclusesParLOffre: offre(offreId).capacites.appelsIaParMois,
        dejaUtilisees: appelsCeMois,
        offreId,
      }),
    };
  }
}

/**
 * Ce qu'il reste, dit avant le mur.
 *
 * Un plafond qui ne se découvre qu'en s'y cognant est un mauvais plafond :
 * la personne a préparé son travail, elle clique, et le produit lui apprend
 * à ce moment-là que c'était fini. L'avertissement se déclenche à un appel
 * près, ou à un cinquième du budget — assez tôt pour s'organiser, assez
 * tard pour ne pas devenir un décor qu'on n'aperçoit plus.
 */
function presenterQuota(
  verdict: QuotaVerdict,
  limites: QuotaLimits,
  offreEnCours: { inclusesParLOffre: number | null; dejaUtilisees: number; offreId: string },
) {
  // ── Deux plafonds, un seul chiffre à l'écran ──────────────────────────
  //
  // Le garde-fou technique protège la facture d'Ignitux ; l'offre est ce que
  // la personne a compris en souscrivant. Ils peuvent diverger — et ils ont
  // divergé : le repli technique était resté à 5 analyses, écrit du temps
  // d'une offre qui annonçait 5, pendant que Découverte était descendue à 3.
  // L'écran affichait donc « 5 analyses restantes » à quelqu'un que le
  // produit arrêterait à la troisième.
  //
  // Celui qui arrête en premier est le seul vrai. On affiche celui-là, et on
  // dit lequel c'est — un compteur qui se trompe de deux est pire qu'absent :
  // la personne organise son travail dessus.
  const resteOffre =
    offreEnCours.inclusesParLOffre === null
      ? null
      : Math.max(0, offreEnCours.inclusesParLOffre - offreEnCours.dejaUtilisees);
  const resteTechnique = verdict.remaining.calls;
  const restantAnalyses =
    resteOffre === null
      ? resteTechnique
      : resteTechnique === null
        ? resteOffre
        : Math.min(resteOffre, resteTechnique);

  return {
    autorise: verdict.allowed,
    plafond_atteint: verdict.breach,
    message: verdict.reason,
    // L'avertissement suit le plafond qui arrêtera vraiment : à un appel
    // près, comme avant, mais compté sur le bon chiffre.
    bientot_atteint: shouldWarn(verdict) || (restantAnalyses !== null && restantAnalyses <= 1),
    restant: {
      analyses: restantAnalyses,
      // null se lit « plafond de coût non applicable », pas « il reste de la
      // marge » : c'est le cas quand un modèle échappe à la grille.
      euros:
        verdict.remaining.costMicroEur === null
          ? null
          : microEurToEur(verdict.remaining.costMicroEur),
    },
    plafonds: {
      // Ce que l'offre annonce : le chiffre que la personne reconnaît.
      analyses_par_mois:
        resteOffre !== null && (resteTechnique === null || resteOffre <= resteTechnique)
          ? offreEnCours.inclusesParLOffre
          : limites.callsPerMonth,
      // Nommé, pour qu'un « il me restait 3 » se raccroche à quelque chose.
      analyses_selon: resteOffre !== null && (resteTechnique === null || resteOffre <= resteTechnique)
        ? `offre ${offreEnCours.offreId}`
        : 'budget Ignitux',
      euros_par_mois:
        limites.costMicroEurPerMonth === null
          ? null
          : microEurToEur(limites.costMicroEurPerMonth),
    },
  };
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
