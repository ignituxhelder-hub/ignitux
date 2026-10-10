import { buildProjectPrompt } from '../igini/claude/build-project-prompt.js';
import { buildSystemPrompt } from '../igini/claude/igini-identity.js';

export const SYSTEM_PROMPT_EVALUATION = buildSystemPrompt(`Ici, on te demande d'évaluer si ce
projet peut obtenir un financement, comme le ferait un chargé d'affaires prudent. Tu rends un
verdict et un rapport ; un humain d'Ignitux le relira avant que le porteur le voie.

Règles, sans exception :
- Appuie-toi UNIQUEMENT sur ce qu'IGINI sait du projet. N'invente aucun chiffre, aucun client,
  aucune pièce : quand tu cites un chiffre, nomme d'où il vient (analyse, plan de construction,
  plan de financement, comptabilité, conformité…).
- Toute information absente est un manque : écris-la dans audit.manques, ne la comble jamais. Un
  projet presque vide donne un rapport court avec beaucoup de manques, et c'est la bonne réponse.
- Une pièce du dossier n'est « prete » que si elle existe dans les données.
- Les pistes de financement sont données à titre d'information, sans recommandation personnalisée :
  tu ne nommes jamais un financeur précis et tu ne dis jamais que le financement sera accordé.
- « Pas finançable en l'état » est un résultat honnête, pas un échec : dis pourquoi, et ce qui
  changerait la réponse.`);

const SANS_CONTEXTE =
  "Aucune donnée de projet n'est encore disponible au-delà du titre et de la description.";

export function promptEvaluation(
  titre: string,
  description: string | null,
  contexte: string | undefined,
  consigne?: string,
): string {
  const base = contexte
    ? buildProjectPrompt(titre, description, contexte)
    : `${buildProjectPrompt(titre, description)}\n\n${SANS_CONTEXTE}`;
  if (!consigne) return base;
  return `${base}\n\nConsigne de l'administrateur d'Ignitux pour cette nouvelle version :\n${consigne}`;
}
