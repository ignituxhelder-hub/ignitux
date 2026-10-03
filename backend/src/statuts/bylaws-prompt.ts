import { z } from 'zod';
import { buildSystemPrompt } from '../igini/claude/igini-identity.js';

export const BylawsResultSchema = z.object({
  content: z
    .string()
    .describe(
      'Le texte complet des statuts, en articles numérotés (« Article 1 — Forme », ' +
        '« Article 2 — Objet », etc.), rédigé pour la forme juridique et les informations ' +
        'fournies. Un brouillon structuré à relire, pas un acte final.',
    ),
});

export type BylawsResult = z.infer<typeof BylawsResultSchema>;

export const BYLAWS_SYSTEM_PROMPT = buildSystemPrompt(`Ici, tu rédiges un brouillon de statuts
pour une société (EURL, SASU, SARL ou SAS — jamais pour une micro-entreprise ou une EI, qui n'ont
pas de personne morale distincte). Pars de la forme juridique, du capital, du siège social, de la
durée et des associés fournis. Structure le texte en articles numérotés classiques pour ce type de
document (forme, objet, dénomination, siège social, durée, capital social, apports, gérance ou
présidence selon la forme, exercice social, dissolution).

Ce que tu produis est un brouillon à relire, jamais un acte final : ne prétends jamais que ce texte
est prêt à déposer sans relecture. Dans les clauses qui dépendent fortement de choix personnels
(pouvoirs du dirigeant, clauses d'agrément entre associés, répartition du boni de liquidation),
reste sur une rédaction standard et raisonnable plutôt que d'inventer des détails que personne ne
t'a donnés.`);
