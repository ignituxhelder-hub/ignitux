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

/**
 * POUR UNE EXIGENCE DE CONFORMITÉ, CE QUE LA SOURCE DIT D'ABORD.
 *
 * La personne ne devrait pas avoir à ouvrir la fiche officielle pour savoir
 * ce qu'elle y trouverait : IGINI la lit et en retient ce qui touche CE
 * projet. Vide si la page n'a pas pu être lue — le texte le dira, plutôt que
 * de remplir ce champ de mémoire.
 */
export const ExecutionConformiteSchema = ExecutionResultSchema.extend({
  ce_que_dit_la_source: z
    .array(z.string())
    .describe(
      'Les 3 à 5 points de la page officielle lue qui concernent ce projet, en phrases courtes. Tableau vide si tu n’as pas pu lire la page.',
    ),
});

export type ExecutionConformite = z.infer<typeof ExecutionConformiteSchema>;

/** Une page réellement lue, telle que ClaudeService la reconstruit. */
export interface PageLueAffichee {
  url: string;
  titre: string | null;
  luLe: string | null;
}

function dateCourte(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
}

/**
 * Texte stocké pour une exigence : ce que dit la source, le travail préparé,
 * puis la preuve de lecture.
 *
 * La ligne « IGINI a lu » vient de `pagesLues`, donc des blocs renvoyés par
 * l'API — jamais de ce que le modèle a écrit. Sans page lue, l'avertissement
 * passe EN TÊTE : un brouillon fait de mémoire ne doit pas pouvoir se faire
 * passer pour un brouillon fait à partir de la source.
 */
export function formaterConformite(
  resultat: ExecutionConformite,
  pagesLues: PageLueAffichee[],
  source: { name: string; url: string },
): string {
  const parties: string[] = [];
  if (pagesLues.length === 0) {
    parties.push(
      `⚠️ IGINI n’a pas pu lire la page officielle (${source.url}). Ce qui suit est préparé sans elle : vérifie sur la source avant d’agir.`,
    );
  }
  const points = pagesLues.length > 0 ? resultat.ce_que_dit_la_source : [];
  if (points.length > 0) {
    parties.push(['Ce que dit la source pour ton projet :', ...points.map((p) => `- ${p}`)].join('\n'));
  }
  parties.push(formaterResultat(resultat));
  if (pagesLues.length > 0) {
    parties.push(
      [
        'IGINI a lu :',
        ...pagesLues.map((page) => {
          const quand = dateCourte(page.luLe);
          return `- ${page.titre ? `${page.titre} — ` : ''}${page.url}${quand ? ` (le ${quand})` : ''}`;
        }),
      ].join('\n'),
    );
  }
  return parties.join('\n\n');
}
