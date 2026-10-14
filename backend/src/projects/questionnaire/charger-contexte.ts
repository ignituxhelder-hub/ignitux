import type { PrismaService } from '../../prisma/prisma.service.js';
import { contextePersonne } from '../../profile/contexte-personne.js';
import { contexteProjet } from './contexte-projet.js';
import { lireReponses } from './questionnaire-catalogue.js';

/**
 * Ce que la personne a déclaré — sur elle et sur ce projet — lu en base.
 *
 * Les deux blocs restent séparés dans le texte (chacun a son en-tête), mais
 * se chargent ensemble : ils ont la même nature (des faits déclarés, jamais
 * déduits) et le même traitement d'échec.
 *
 * L'échec est avalé : une analyse ne doit pas échouer parce qu'un profil ou
 * un questionnaire n'a pas pu être lu. Elle sera simplement moins bien
 * renseignée, ce qui est exactement l'état d'avant.
 */
export async function chargerContexteDeclare(
  prisma: PrismaService,
  ownerId: string,
  projectId: string,
): Promise<string | undefined> {
  const [personne, projet] = await Promise.all([
    chargerPersonne(prisma, ownerId),
    chargerProjet(prisma, projectId),
  ]);
  const blocs = [personne, projet].filter((b): b is string => Boolean(b));
  return blocs.length > 0 ? blocs.join('\n') : undefined;
}

async function chargerPersonne(prisma: PrismaService, ownerId: string): Promise<string | null> {
  try {
    const [profil, projetsPortes, experiences, formations] = await Promise.all([
      prisma.user_profiles.findUnique({ where: { user_id: ownerId } }),
      prisma.projects.count({ where: { owner_id: ownerId } }),
      prisma.user_experiences.findMany({
        where: { user_id: ownerId },
        orderBy: { position: 'asc' },
      }),
      prisma.user_formations.findMany({
        where: { user_id: ownerId },
        orderBy: { position: 'asc' },
      }),
    ]);
    return contextePersonne(
      profil,
      { projetsPortes },
      {
        experiences: experiences.map((e) => ({
          poste: e.poste,
          entreprise: e.entreprise,
          debut: e.debut,
          fin: e.fin,
          enCours: e.en_cours,
          description: e.description,
        })),
        formations: formations.map((f) => ({
          diplome: f.diplome,
          etablissement: f.etablissement,
          annee: f.annee,
        })),
      },
    );
  } catch {
    return null;
  }
}

async function chargerProjet(prisma: PrismaService, projectId: string): Promise<string | null> {
  try {
    const [projet, questionnaire, questionsIgini] = await Promise.all([
      prisma.projects.findUnique({ where: { id: projectId }, select: { sector: true } }),
      prisma.project_questionnaires.findUnique({ where: { project_id: projectId } }),
      prisma.project_igini_questions.findMany({
        where: { project_id: projectId },
        orderBy: { position: 'asc' },
      }),
    ]);
    return contexteProjet({
      reponses: lireReponses(questionnaire?.reponses),
      secteur: projet?.sector ?? null,
      questionsIgini,
    });
  } catch {
    return null;
  }
}
