import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { getEnv } from '../config/env.js';
import { CODE_CREDITS_INSUFFISANTS } from '../credits/credits-insuffisants.js';
import { exigerCapacite } from '../equipe/acces-projet.js';
import { readGeneratorsAvailability } from '../igini/claude/generators-availability.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ETAPES_ENCHAINEMENT,
  vueEnchainement,
  type ArretEnchainement,
  type EtapeEnchainement,
  type SuiviEnchainement,
  type VueEnchainement,
} from './enchainement-model.js';
import { ProjectsService } from './projects.service.js';

/** Quand l'erreur ne dit rien de lisible : une panne, pas un refus. */
export const MESSAGE_ETAPE_ECHOUEE =
  'IGINI n’a pas pu terminer cette étape. Rien n’a été débité pour elle : tu peux relancer la suite.';

/**
 * Lance et suit l'enchaînement IGINI d'un projet (voir enchainement-model.ts).
 *
 * Il tourne sur le serveur, pas dans la page : la personne peut fermer
 * l'onglet, les étapes continuent. Chaque étape passe par la même méthode que
 * son bouton — mêmes droits, même prix, même remboursement si elle échoue.
 *
 * Le suivi vit en mémoire, comme le verrou de Former l'a fait avant lui : un
 * seul serveur aujourd'hui. Un redémarrage interrompt l'étape en cours ; ce
 * qui était fait reste fait (c'est la base qui le dit), et relancer reprend
 * à la première étape manquante.
 */
@Injectable()
export class EnchainementService {
  private readonly logger = new Logger(EnchainementService.name);
  private readonly suivis = new Map<string, SuiviEnchainement>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async voir(demandeurId: string, projectId: string): Promise<VueEnchainement> {
    await exigerCapacite(this.prisma, demandeurId, projectId, 'voir_projet');
    return this.vue(projectId);
  }

  /**
   * Lance les étapes qui manquent, et rend la vue sans les attendre. Un
   * second clic pendant que ça tourne ne lance rien de plus.
   */
  async lancer(demandeurId: string, projectId: string): Promise<VueEnchainement> {
    await exigerCapacite(this.prisma, demandeurId, projectId, 'lancer_ia');

    // IGINI en pause : on le dit tout de suite, plutôt que de démarrer un
    // enchaînement qui s'arrêterait à la première étape.
    const disponibilite = readGeneratorsAvailability(getEnv().IGINI_AI_ENABLED);
    if (!disponibilite.enabled) throw new ServiceUnavailableException(disponibilite.reason);

    if (this.suivis.get(projectId)?.enCours) return this.vue(projectId);

    const faites = await this.etapesFaites(projectId);
    const aFaire = ETAPES_ENCHAINEMENT.filter((e) => !faites.has(e.id)).map((e) => e.id);
    if (aFaire.length === 0) {
      this.suivis.delete(projectId);
      return this.vue(projectId);
    }

    const suivi: SuiviEnchainement = { enCours: aFaire[0], arret: null };
    this.suivis.set(projectId, suivi);
    void this.derouler(demandeurId, projectId, aFaire, suivi);
    return this.vue(projectId);
  }

  private async derouler(
    demandeurId: string,
    projectId: string,
    aFaire: EtapeEnchainement[],
    suivi: SuiviEnchainement,
  ): Promise<void> {
    for (const etape of aFaire) {
      suivi.enCours = etape;
      try {
        // Lancée entre-temps depuis son propre bouton : ne pas la payer deux fois.
        if ((await this.etapesFaites(projectId)).has(etape)) continue;
        await this.executer(etape, demandeurId, projectId);
      } catch (error) {
        suivi.enCours = null;
        suivi.arret = arretPour(etape, error);
        if (!estUnRefus(error)) {
          this.logger.error(`Enchaînement IGINI en échec à l’étape ${etape} du projet ${projectId}.`, error as Error);
        }
        return;
      }
    }
    // Terminé : la base dit désormais tout, plus rien à suivre.
    this.suivis.delete(projectId);
  }

  private executer(etape: EtapeEnchainement, demandeurId: string, projectId: string): Promise<unknown> {
    switch (etape) {
      case 'analyser':
        return this.projectsService.analyzeForOwner(demandeurId, projectId);
      case 'former':
        return this.projectsService.recommendLegalFormForOwner(demandeurId, projectId);
      case 'construire':
        return this.projectsService.createBuildPlanForOwner(demandeurId, projectId);
      case 'financer':
        return this.projectsService.createFinancingPlanForOwner(demandeurId, projectId);
      case 'developper':
        return this.projectsService.createDevelopmentPlanForOwner(demandeurId, projectId);
    }
  }

  private async vue(projectId: string): Promise<VueEnchainement> {
    return vueEnchainement(await this.etapesFaites(projectId), this.suivis.get(projectId) ?? null);
  }

  private async etapesFaites(projectId: string): Promise<Set<EtapeEnchainement>> {
    const ou = { where: { project_id: projectId } };
    const [analyses, formes, construction, financement, developpement] = await Promise.all([
      this.prisma.analyses.count(ou),
      this.prisma.legal_form_recommendations.count(ou),
      this.prisma.build_plans.count(ou),
      this.prisma.financing_plans.count(ou),
      this.prisma.development_plans.count(ou),
    ]);
    const faites = new Set<EtapeEnchainement>();
    if (analyses > 0) faites.add('analyser');
    if (formes > 0) faites.add('former');
    if (construction > 0) faites.add('construire');
    if (financement > 0) faites.add('financer');
    if (developpement > 0) faites.add('developper');
    return faites;
  }
}

/** Un refus attendu (crédits, plafond, pause, droits) : il se dit, il ne se journalise pas comme une panne. */
function estUnRefus(error: unknown): boolean {
  if (!(error instanceof HttpException)) return false;
  const statut = error.getStatus();
  return statut < HttpStatus.INTERNAL_SERVER_ERROR || statut === HttpStatus.SERVICE_UNAVAILABLE;
}

/** Le refus du serveur, dit tel quel — c'est déjà une phrase pour la personne. */
function arretPour(etape: EtapeEnchainement, error: unknown): ArretEnchainement {
  if (!(error instanceof HttpException)) return { etape, message: MESSAGE_ETAPE_ECHOUEE, voirCredits: false };
  const corps = error.getResponse();
  if (typeof corps === 'string') return { etape, message: corps, voirCredits: false };
  const { message, code } = corps as { message?: unknown; code?: unknown };
  return {
    etape,
    message: typeof message === 'string' ? message : MESSAGE_ETAPE_ECHOUEE,
    voirCredits: code === CODE_CREDITS_INSUFFISANTS,
  };
}
