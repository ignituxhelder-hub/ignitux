import {
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  type OnModuleInit,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { dansUnContexteEspace } from './contexte-espace.js';
import { ESPACE_DOMAINE, HORS_ESPACE, type RequeteAvecEspace } from './espace.decorator.js';
import { EN_TETE_ESPACE, ESPACE_PERSONNEL_SEULEMENT, espaceEtranger } from './espace.service.js';

const METHODES_LECTURE = new Set(['GET', 'HEAD', 'OPTIONS']);
const CHEMIN_MAX = 500;

/**
 * Rétention du journal d'activité des membres : 12 mois (registre des
 * traitements, docs/registre-de-traitements.md). Les lignes plus anciennes
 * sont supprimées au démarrage du serveur (`onModuleInit`, même si aucun
 * membre n'écrit plus jamais rien), puis au fil des écritures : à la
 * première après le démarrage, puis une fois toutes les PURGE_TOUTES_LES —
 * jamais en bloquant ni le démarrage ni la requête.
 */
export const RETENTION_ACTIVITE_JOURS = 365;
export const PURGE_TOUTES_LES = 200;
const JOUR_MS = 24 * 60 * 60 * 1000;

interface RequeteHttp extends RequeteAvecEspace {
  method: string;
  originalUrl?: string;
  url?: string;
}

/**
 * L'INTERCEPTEUR DES ESPACES (global, enregistré par EquipeModule).
 *
 * 1. **Fermé par défaut.** Une requête authentifiée qui porte un `X-Espace`
 *    étranger vers une route qui n'a ni `@Espace(...)` ni `@HorsEspace()`
 *    est refusée (403). Sans cela, une route pas encore migrée ignorerait
 *    l'en-tête et écrirait dans l'espace du membre en croyant écrire chez le
 *    propriétaire.
 * 2. **Journal d'activité.** Chaque requête non-GET résolue dans l'espace
 *    d'un autre (voir `ResoudreEspacePipe`) est inscrite dans
 *    `space_activity` : méthode, chemin sans chaîne de requête, statut — y
 *    compris quand elle échoue. L'écriture du journal ne casse jamais la
 *    requête : un échec est seulement journalisé côté serveur.
 * 3. **Contexte d'espace.** Chaque requête HTTP s'exécute dans un contexte
 *    d'espace neuf (`contexte-espace.ts`), que `ResoudreEspacePipe` remplit.
 *    Il sert de preuve de câblage : sans lui, le pipe refuse tout espace
 *    étranger (403 « Espace indéterminable. »), car sans cet intercepteur il
 *    n'y aurait ni refus des routes non marquées ni journal. Il ne filtre
 *    aucune lecture : les routes hors argent sont simplement refusées (point 1).
 */
@Injectable()
export class EspaceInterceptor implements NestInterceptor, OnModuleInit {
  private readonly logger = new Logger(EspaceInterceptor.name);
  /** Écritures du journal depuis le démarrage : cadence de la purge. */
  private ecritures = 0;

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Purge de démarrage : lancée sans être attendue (le démarrage ne dépend
   * pas de la base du journal), une erreur est seulement journalisée.
   */
  onModuleInit(): void {
    this.purger();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const requete = http.getRequest<RequeteHttp>();
    const userId = requete.user?.id;

    if (userId && espaceEtranger(userId, requete.headers[EN_TETE_ESPACE]) !== null) {
      const marquee = this.reflector.get<string | undefined>(ESPACE_DOMAINE, context.getHandler());
      const horsEspace = this.reflector.getAllAndOverride<boolean | undefined>(HORS_ESPACE, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!marquee && !horsEspace) throw new ForbiddenException(ESPACE_PERSONNEL_SEULEMENT);
    }

    // `next.handle()` lie l'exécution du contrôleur (pipes compris) au
    // contexte asynchrone courant : l'appeler DANS le contexte suffit.
    const suite = dansUnContexteEspace(() => next.handle());
    if (!userId || METHODES_LECTURE.has(requete.method)) return suite;

    return suite.pipe(
      tap({
        next: () => this.noter(requete, userId, http.getResponse<{ statusCode: number }>().statusCode),
        error: (erreur: unknown) =>
          this.noter(requete, userId, erreur instanceof HttpException ? erreur.getStatus() : 500),
      }),
    );
  }

  private noter(requete: RequeteHttp, acteurId: string, statut: number): void {
    const espace = requete.espace;
    if (!espace || espace.ownerId === acteurId) return;
    const chemin = (requete.originalUrl ?? requete.url ?? '').split('?')[0].slice(0, CHEMIN_MAX);
    try {
      this.prisma.space_activity
        .create({
          data: { owner_id: espace.ownerId, actor_id: acteurId, methode: requete.method, chemin, statut },
        })
        .catch((erreur: unknown) => this.signaler(erreur));
    } catch (erreur) {
      this.signaler(erreur);
    }
    if (this.ecritures++ % PURGE_TOUTES_LES === 0) this.purger();
  }

  /** Supprime les lignes de plus de 12 mois, sans attendre ni échouer. */
  private purger(): void {
    const limite = new Date(Date.now() - RETENTION_ACTIVITE_JOURS * JOUR_MS);
    try {
      this.prisma.space_activity
        .deleteMany({ where: { created_at: { lt: limite } } })
        .catch((erreur: unknown) => this.signaler(erreur, 'purgé'));
    } catch (erreur) {
      this.signaler(erreur, 'purgé');
    }
  }

  private signaler(erreur: unknown, quoi: 'écrit' | 'purgé' = 'écrit'): void {
    this.logger.warn(
      `Journal d'activité d'espace non ${quoi} : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
    );
  }
}
