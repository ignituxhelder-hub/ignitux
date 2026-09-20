import { SetMetadata } from '@nestjs/common';
import type { RoleId } from './roles-catalogue.js';

export const REQUIRED_ROLE = 'ignitux:required-role';

/**
 * Réserve une route à un rôle.
 *
 * À poser sur les routes d'un **espace**, pas sur les routes d'un domaine.
 * La nuance compte : `/espaces/investisseur` exige le rôle investisseur, mais
 * `/investisseurs/moi/portefeuille` ne l'exige pas — il dérive déjà
 * l'investisseur du jeton, et quelqu'un dont l'argent est placé quelque part
 * doit pouvoir le lire même s'il n'a jamais coché la case.
 */
export const RequireRole = (role: RoleId) => SetMetadata(REQUIRED_ROLE, role);
