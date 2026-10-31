import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * En dessous de ce nombre, le compteur ne dit rien. Un petit chiffre dessert
 * plus qu'il ne rassure, et le volume d'activité d'Ignitux n'est pas à rendre
 * à qui passe (même raison que `GET /constitution/audit`, qui reste derrière
 * la connexion).
 */
export const SEUIL_COMPTEUR = 50;

/**
 * Arrondi à la dizaine inférieure : « Déjà 50 projets » reste vrai à 57, et
 * le chiffre ne bouge pas à chaque inscription.
 */
export const PAS_COMPTEUR = 10;

const DUREE_CACHE_MS = 10 * 60_000;

/**
 * LA VITRINE — ce que la page d'accueil peut dire d'Ignitux sans rien dire
 * de personne.
 *
 * Le compteur « Déjà N projets » est calculé ici, jamais saisi à la main :
 * un chiffre tapé dans un fichier finit par devenir faux, et la devise de
 * l'accueil est « La vérité avant tout ». Il compte les projets en cours (un
 * projet archivé n'y est plus), sans distinguer qui les porte.
 */
@Injectable()
export class VitrineService {
  private readonly logger = new Logger(VitrineService.name);
  private cache: { projets: number | null; jusqua: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Le nombre de projets à afficher, ou `null` sous le seuil. Gardé dix
   * minutes : chaque visite de l'accueil le demande, la base n'a pas à
   * recompter à chaque fois.
   */
  async projetsAffiches(): Promise<number | null> {
    const maintenant = Date.now();
    if (this.cache && this.cache.jusqua > maintenant) return this.cache.projets;

    let total: number;
    try {
      total = await this.prisma.projects.count({ where: { archived_at: null } });
    } catch (erreur) {
      // L'accueil n'affiche alors rien : mieux vaut pas de chiffre qu'une
      // page en erreur. L'échec n'est pas gardé, la visite suivante réessaie.
      this.logger.warn(`Compteur de projets indisponible : ${(erreur as Error).message}`);
      return null;
    }

    const projets = total < SEUIL_COMPTEUR ? null : Math.floor(total / PAS_COMPTEUR) * PAS_COMPTEUR;
    this.cache = { projets, jusqua: maintenant + DUREE_CACHE_MS };
    return projets;
  }
}
