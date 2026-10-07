import { z } from 'zod';

/**
 * CE QUE RENVOIE IGINI QUAND ON LUI CONFIE UNE TÂCHE.
 *
 * Deux issues honnêtes : un livrable qu'elle a vraiment produit (un texte,
 * un brouillon, un tableau), ou des instructions quand elle ne peut pas le
 * faire à la place de la personne (démarche en ligne, signature, paiement).
 * Le genre dit lequel des deux, pour que l'écran ne présente jamais des
 * instructions comme un travail terminé.
 */
export const ExecutionResultSchema = z.object({
  kind: z
    .enum(['livrable', 'instructions'])
    .describe(
      "'livrable' si tu as produit le travail demandé ; 'instructions' si la personne doit le faire elle-même.",
    ),
  titre: z.string().describe('Titre court du résultat, en français.'),
  contenu: z
    .string()
    .describe('Le livrable lui-même, ou l’explication de ce que la personne doit faire.'),
  etapes: z
    .array(z.string())
    .optional()
    .describe('Étapes à suivre dans l’ordre, pour des instructions. Absent pour un livrable.'),
});

export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

/** Texte stocké : le contenu, suivi des étapes en liste numérotée s'il y en a. */
export function formaterResultat(resultat: ExecutionResult): string {
  const etapes = resultat.etapes?.length
    ? '\n\n' + resultat.etapes.map((etape, i) => `${i + 1}. ${etape}`).join('\n')
    : '';
  return `${resultat.contenu}${etapes}`;
}
