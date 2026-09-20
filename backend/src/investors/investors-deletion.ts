import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Le nom qui remplace celui d'un investisseur parti.
 *
 * Neutre et reconnaissable : le registre du porteur doit rester lisible
 * — « quelqu'un a mis 1 000 € ici » — sans nommer personne.
 */
export const INVESTISSEUR_RETIRE = 'Investisseur retiré';

/**
 * CE QUI ARRIVE AU REGISTRE QUAND QUELQU'UN SUPPRIME SON COMPTE.
 *
 * Fonction libre plutôt que méthode de service, pour la même raison que
 * `ledgerDeletionOperations` : `UserDataService` vit dans `UsersModule`, dont
 * `InvestorsModule` dépend indirectement. L'injecter fermerait le cycle.
 *
 * ── La question, et pourquoi elle est difficile ─────────────────────────
 *
 * Un investisseur qui s'en va a mis de l'argent dans les projets **d'autres
 * personnes**. Effacer ses participations falsifierait leurs registres :
 * l'argent est réellement entré chez eux, et il devra bien ressortir. Mais
 * laisser son nom dans le registre de quelqu'un d'autre, c'est conserver une
 * donnée personnelle après une demande d'effacement.
 *
 * La sortie est celle que le produit prend déjà ailleurs : **le fait reste,
 * l'identité part.** La ligne d'investissement survit, détachée de toute
 * personne. Le porteur continue de voir qu'il doit 1 000 € à quelqu'un ; il
 * ne voit plus qui.
 *
 * Symétriquement, un **porteur** qui s'en va ne peut pas emporter le registre
 * des sommes qu'on lui a confiées : son projet disparaît, le registre se
 * détache et lui survit, avec le titre recopié à l'ouverture.
 *
 * Aucune participation, aucun mouvement n'est supprimé. C'est la règle du
 * module et elle ne souffre pas d'exception : un historique d'investissement
 * qu'on peut effacer ne prouve rien.
 */
export function investorsDeletionOperations(prisma: PrismaService, userId: string) {
  return [
    // L'investisseur perd son compte et son nom, garde ses lignes.
    prisma.investors.updateMany({
      where: { user_id: userId },
      data: { user_id: null, display_name: INVESTISSEUR_RETIRE, note: null },
    }),
    // Le porteur se détache des registres qu'il avait ouverts. Le lien vers
    // `projects` tombe de lui-même (SET NULL) quand ses projets partent en
    // cascade ; ici on retire la personne.
    prisma.financed_projects.updateMany({
      where: { entrepreneur_user_id: userId },
      data: { entrepreneur_user_id: null },
    }),
  ];
}
