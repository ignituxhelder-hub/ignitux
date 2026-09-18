import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ClaudeService } from '../claude/claude.service.js';

const ProjectAnalysisSchema = z.object({
  summary: z.string().describe("Résumé en 2 à 3 phrases de l'idée et de son potentiel"),
  feasibility_score: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe('Score de faisabilité de 1 (très risqué) à 10 (très solide)'),
  strengths: z.array(z.string()).describe('3 à 5 points forts du projet'),
  risks: z.array(z.string()).describe('3 à 5 risques ou angles morts'),
  next_steps: z.array(z.string()).describe('3 à 5 prochaines actions concrètes recommandées'),
});

export type ProjectAnalysisResult = z.infer<typeof ProjectAnalysisSchema>;

const SYSTEM_PROMPT = `Tu es l'analyste d'Ignitux, une plateforme qui aide des porteurs de projet à
transformer une idée en réalité. On te donne le titre et la description d'une idée de projet.
Évalue-la avec honnêteté et bienveillance : sois concret, évite le remplissage générique, et
adapte le niveau d'exigence à ce qui est décrit (une idée à un stade précoce n'est pas jugée
comme un business plan complet).`;

@Injectable()
export class AnalysisService {
  constructor(private readonly claude: ClaudeService) {}

  analyzeProject(title: string, description: string | null): Promise<ProjectAnalysisResult> {
    return this.claude.generateStructuredOutput({
      schema: ProjectAnalysisSchema,
      system: SYSTEM_PROMPT,
      userContent: `Titre : ${title}\nDescription : ${description ?? '(aucune description fournie)'}`,
      logContext: "Échec de l'analyse du projet via Claude",
      userErrorMessage: "L'analyse a échoué, réessaie dans un instant.",
    });
  }
}
