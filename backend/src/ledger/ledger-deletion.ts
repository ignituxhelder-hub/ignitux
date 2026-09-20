import type { PrismaService } from '../prisma/prisma.service.js';
import { ownerWhere, userOwner } from './ledger-owner.js';

/**
 * CE QUI PART QUAND UNE PERSONNE SUPPRIME SON COMPTE.
 *
 * Fonction libre plutôt que méthode de service, et ce n'est pas un détail de
 * style : `UserDataService` vit dans `UsersModule`, dont `LedgerModule`
 * dépend indirectement (LedgerModule → AuthModule → UsersModule). L'injecter
 * fermerait le cycle. Une fonction qui reçoit Prisma n'a pas ce problème et
 * se teste sans rien démarrer.
 *
 * ── Pourquoi on supprime ici, alors qu'ailleurs on anonymise ─────────────
 *
 * Le journal des coûts IA (`ai_usage_events`) reste et perd seulement son
 * `user_id` : cette dépense est celle d'IGNITUX, elle a été facturée, et
 * l'effacer changerait un total déjà clos.
 *
 * La comptabilité d'une personne, elle, lui appartient entièrement. IGNITUX
 * n'a aucune raison de garder les livres de quelqu'un qui s'en va : les
 * conserver serait détenir des données sans nécessité, ce que l'article 13
 * refuse. Elle part donc pour de bon.
 *
 * Ce qui reste, c'est ce qui appartient à IGNITUX — et les écritures
 * d'IGNITUX qui désignaient une écriture supprimée perdent simplement ce
 * lien. Le fait reste dans les livres d'IGNITUX, l'identité part.
 */
export async function ledgerDeletionOperations(prisma: PrismaService, userId: string) {
  const owner = ownerWhere(userOwner(userId));

  const entries = await prisma.ledger_entries.findMany({ where: owner, select: { id: true } });
  const entryIds = entries.map((entry) => entry.id);

  return [
    // 1. Les écritures d'en face oublient leur contrepartie.
    prisma.ledger_entries.updateMany({
      where: { counterpart_entry_id: { in: entryIds } },
      data: { counterpart_entry_id: null },
    }),
    // 2. Les mouvements bancaires — y compris ceux d'IGNITUX, s'il en
    //    existait — oublient l'écriture qu'ils désignaient.
    prisma.bank_transactions.updateMany({
      where: { reconciled_entry_id: { in: entryIds } },
      data: { reconciled_entry_id: null },
    }),
    // 3. Les lignes sont retirées explicitement, et pas laissées à la
    //    cascade : `ledger_lines.account_id` est en `Restrict`, ce qui est
    //    voulu — un compte ne doit jamais disparaître en emportant des
    //    écritures en silence. Il faut donc vider les lignes avant les
    //    comptes, dans cet ordre.
    prisma.ledger_lines.deleteMany({ where: { entry_id: { in: entryIds } } }),
    prisma.ledger_entries.deleteMany({ where: owner }),
    prisma.bank_accounts.deleteMany({ where: owner }),
    prisma.ledger_accounts.deleteMany({ where: owner }),
  ];
}
