import type { Provider } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { EspaceService } from './espace.service.js';

/**
 * POUR LES TESTS SEULEMENT (exclu du build, voir tsconfig.build.json).
 *
 * Un contrôleur qui utilise `@Espace(...)` fait instancier
 * `ResoudreEspacePipe` dans son module, et ce pipe réclame `EspaceService`
 * (fourni en production par le module global `EquipeModule`). Un module de
 * test qui ne monte que le contrôleur doit donc le fournir.
 *
 * C'est la VRAIE résolution, sur une base où personne n'est collaborateur de
 * rien : sans en-tête `X-Espace`, l'utilisateur agit chez lui (son id) ; avec
 * un espace étranger, 404 « Espace introuvable. ».
 */
export function espaceSansMembres(): Provider {
  const prisma = {
    project_collaborators: { findMany: async () => [] },
    // Aucun choix d'accès enregistré (jamais lu : personne n'est collaborateur).
    space_members: { findUnique: async () => null, findMany: async () => [] },
  } as unknown as PrismaService;
  return { provide: EspaceService, useValue: new EspaceService(prisma) };
}
