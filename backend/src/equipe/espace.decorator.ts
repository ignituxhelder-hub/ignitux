import {
  createParamDecorator,
  ForbiddenException,
  Injectable,
  SetMetadata,
  type ExecutionContext,
  type PipeTransform,
} from '@nestjs/common';
import type { Domaine } from './domaines.js';
import { noterEspaceResolu } from './contexte-espace.js';
import { EN_TETE_ESPACE, EspaceService } from './espace.service.js';

/**
 * L'ESPACE DANS LES CONTRÔLEURS — mode d'emploi (repris de `feat/equipe`).
 *
 *     @Get()
 *     lister(@Espace('argent') ownerId: string) {
 *       return this.service.lister(ownerId);          // propriété des données
 *     }
 *
 * Pourquoi un décorateur + un pipe : un décorateur de paramètre
 * (`createParamDecorator`) ne peut pas recevoir de service injecté, mais un
 * pipe passé en argument le peut — Nest instancie `ResoudreEspacePipe` dans
 * le module du contrôleur, et `EspaceService` y est visible parce que
 * `EquipeModule` est global. Aucun import à ajouter dans les modules métier.
 *
 * Le pipe pose aussi la résolution sur la requête (`req.espace`), où
 * l'intercepteur global la relit pour le journal d'activité.
 *
 * `@Espace(...)` marque en plus la méthode (métadonnée `ESPACE_DOMAINE`) :
 * l'intercepteur refuse (403) toute requête portant un `X-Espace` étranger
 * vers une route NON marquée. Une route qui ne se délègue pas échoue donc
 * fermée au lieu d'écrire en silence dans l'espace du membre.
 */

export const ESPACE_DOMAINE = 'ignitux:espace-domaine';
export const HORS_ESPACE = 'ignitux:hors-espace';

/** Ce que la résolution laisse sur la requête. */
export interface EspaceResolu {
  ownerId: string;
  domaine: Domaine;
}

export interface RequeteAvecEspace {
  user?: { id?: string };
  headers: Record<string, string | string[] | undefined>;
  espace?: EspaceResolu;
}

interface DemandeEspace {
  domaine: Domaine;
  requete: RequeteAvecEspace;
}

const LireDemandeEspace = createParamDecorator(
  (domaine: Domaine, ctx: ExecutionContext): DemandeEspace => ({
    domaine,
    requete: ctx.switchToHttp().getRequest<RequeteAvecEspace>(),
  }),
);

@Injectable()
export class ResoudreEspacePipe implements PipeTransform<DemandeEspace, Promise<string>> {
  constructor(private readonly espaces: EspaceService) {}

  async transform(demande: DemandeEspace): Promise<string> {
    const userId = demande.requete.user?.id;
    if (!userId) {
      // Route montée sans JwtAuthGuard : erreur de câblage, pas un refus d'accès.
      throw new ForbiddenException('Espace indéterminable.');
    }
    const ownerId = await this.espaces.resoudre(userId, demande.requete.headers[EN_TETE_ESPACE], demande.domaine);
    // Sans contexte ouvert par l'intercepteur, un espace étranger est refusé :
    // il n'y aurait ni journal d'activité ni refus des routes non marquées.
    if (!noterEspaceResolu(userId, ownerId) && ownerId !== userId) {
      throw new ForbiddenException('Espace indéterminable.');
    }
    demande.requete.espace = { ownerId, domaine: demande.domaine };
    return ownerId;
  }
}

/**
 * Rend l'`ownerId` effectif pour ce domaine : le mien, ou celui du
 * propriétaire de l'espace sélectionné (en-tête `X-Espace`) si j'y ai un
 * rôle qui couvre le domaine — sinon 404 « Espace introuvable. ».
 */
export function Espace(domaine: Domaine): ParameterDecorator {
  return (target, cle, index) => {
    if (cle !== undefined) {
      const methode = (target as Record<string | symbol, unknown>)[cle];
      Reflect.defineMetadata(ESPACE_DOMAINE, domaine, methode as object);
    }
    LireDemandeEspace(domaine, ResoudreEspacePipe)(target, cle, index);
  };
}

/**
 * Route indifférente à l'espace sélectionné : l'en-tête `X-Espace` y est
 * ignoré (ex. lister mes espaces, une notice fixe). À n'utiliser que pour
 * des routes qui ne lisent ni n'écrivent les données d'un espace — chacune
 * est listée, avec sa raison, dans `couverture-espaces.spec.ts`.
 */
export const HorsEspace = () => SetMetadata(HORS_ESPACE, true);
