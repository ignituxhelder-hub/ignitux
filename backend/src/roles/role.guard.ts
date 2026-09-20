import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_ROLE } from './require-role.decorator.js';
import { findRole } from './roles-catalogue.js';
import { RolesService } from './roles.service.js';

/**
 * Le garde des espaces.
 *
 * Il rend 403 et non 401 : la personne est bien identifiée, c'est l'espace
 * qui ne la concerne pas. Un 401 la déconnecterait, ce qui serait faux et
 * brutal — elle a un compte valide, elle n'a simplement pas pris ce rôle.
 *
 * Le message dit lequel manque et comment le prendre. Un refus qui n'indique
 * pas la sortie n'est qu'un mur.
 */
@Injectable()
export class RoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly roles: RolesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requis = this.reflector.getAllAndOverride<string | undefined>(REQUIRED_ROLE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requis) return true;

    const request = context.switchToHttp().getRequest<{ user?: { id?: string } }>();
    const userId = request.user?.id;
    if (!userId) {
      // Sans utilisateur, c'est JwtAuthGuard qui doit trancher, pas nous.
      // Refuser ici masquerait une route mal montée derrière un faux 403.
      throw new ForbiddenException('Rôle indéterminable.');
    }

    if (await this.roles.holdsRole(userId, requis)) return true;

    const definition = findRole(requis);
    throw new ForbiddenException(
      `Cet espace est réservé au rôle « ${definition?.label ?? requis} ». ` +
        'Tu peux le prendre depuis Mon compte — tes données actuelles ne bougeront pas.',
    );
  }
}
