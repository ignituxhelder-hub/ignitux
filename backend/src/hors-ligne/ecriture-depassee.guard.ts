import { type CanActivate, ConflictException, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EN_TETE_ESPACE, EspaceService } from '../equipe/espace.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type CibleDatee,
  ECRITURE_DATEE,
  EN_TETE_CAPTURE,
} from './ecriture-depassee.decorator.js';
import { NOM_LISIBLE, RESSOURCES_DATEES } from './ressources-datees.js';

interface RequeteExaminee {
  headers: Record<string, string | string[] | undefined>;
  params: Record<string, string | undefined>;
  user?: { id?: string };
}

/**
 * Le garde des écritures revenues du froid.
 *
 * Il ne s'intéresse qu'aux requêtes qui portent `x-ignitux-capture-age`,
 * c'est-à-dire aux seules écritures rejouées depuis la file hors ligne. Tout
 * le reste passe sans qu'il fasse la moindre requête en base.
 *
 * ── Pourquoi il est monté par contrôleur et non globalement ──────────────
 *
 * Un garde global s'exécute AVANT les gardes de contrôleur, donc avant
 * `JwtAuthGuard`. Il répondrait alors à quelqu'un qui n'est pas connecté, et
 * la différence entre un 409 et un 401 lui dirait si un identifiant existe.
 * Monté après l'authentification, il ne parle qu'à des gens déjà identifiés.
 *
 * ── Il ne parle qu'à qui a déjà accès à la ressource ─────────────────────
 *
 * Être connecté ne suffit pas : son 409 dit que la ligne existe et quand
 * elle a changé. Chaque lecteur de `ressources-datees.ts` vérifie donc
 * l'accès avec la règle du contrôleur (rôle sur le projet, espace argent
 * ouvert, propriétaire du CRM). Sans accès, le garde laisse passer, et le
 * contrôleur répond son 404 ou son 403 comme s'il n'existait pas.
 *
 * ── Il se trompe toujours du même côté ───────────────────────────────────
 *
 * Ressource introuvable ou inaccessible, paramètre absent, en-tête
 * illisible, personne non identifiée : il laisse passer et laisse le
 * contrôleur trancher. Refuser à tort bloque le travail réel de quelqu'un ;
 * laisser passer à tort ramène au comportement d'avant ce fichier. Entre les
 * deux erreurs, la seconde est la moins chère, et c'est celle qu'il
 * choisit — délibérément.
 */
@Injectable()
export class EcritureDepasseeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly espaces: EspaceService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const cible = this.reflector.getAllAndOverride<CibleDatee | undefined>(ECRITURE_DATEE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!cible) return true;

    const requete = context.switchToHttp().getRequest<RequeteExaminee>();
    const brut = requete.headers[EN_TETE_CAPTURE];
    const entete = Array.isArray(brut) ? brut[0] : brut;
    // Pas d'en-tête : écriture envoyée en direct, rien à comparer.
    if (entete === undefined) return true;

    const age = Number(entete);
    if (!Number.isFinite(age) || age < 0) return true;

    const identifiant = requete.params[cible.parametre];
    if (!identifiant) return true;

    // Personne d'identifié : le garde est monté sans `JwtAuthGuard`, ce qui
    // est une erreur de câblage — pas une raison de répondre à un inconnu.
    const userId = requete.user?.id;
    if (!userId) return true;

    const ligne = await RESSOURCES_DATEES[cible.ressource]({
      prisma: this.prisma,
      id: identifiant,
      userId,
      proprietaireArgent: () => this.espaces.resoudre(userId, requete.headers[EN_TETE_ESPACE], 'argent'),
    });
    // Introuvable ou inaccessible : le contrôleur rendra son 404 (ou son
    // 403), qui dit mieux que nous pourquoi — et ne dit rien de plus à qui
    // n'a pas accès. Le garde n'a pas à inventer une réponse à sa place.
    //
    // `updated_at` vide : la ligne ne sait pas quand elle a changé, il n'y a
    // donc rien à comparer. Refuser sur une date manquante reviendrait à
    // bloquer une écriture sur un soupçon, ce qui n'est pas un motif.
    if (!ligne?.updated_at) return true;

    // L'instant de capture, reconstitué sur l'horloge du serveur — la seule
    // dont les deux dates comparées ici proviennent.
    const capture = Date.now() - age;
    if (ligne.updated_at.getTime() <= capture) return true;

    throw new ConflictException({
      statusCode: 409,
      message:
        `${NOM_LISIBLE[cible.ressource]} a changé pendant que tu étais hors ligne. ` +
        "Ta modification n'a pas été appliquée, pour ne pas effacer la version plus " +
        'récente sans te le dire. Ouvre-le, regarde ce qu’il contient maintenant, et ' +
        'refais ta modification si elle a toujours lieu d’être.',
      modifieA: ligne.updated_at.toISOString(),
      captureA: new Date(capture).toISOString(),
    });
  }
}
