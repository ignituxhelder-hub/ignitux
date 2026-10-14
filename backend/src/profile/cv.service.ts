import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SaveCvDto } from './dto/cv.dto.js';

export interface ExperienceVue {
  poste: string;
  entreprise: string | null;
  debut: string | null;
  fin: string | null;
  enCours: boolean;
  description: string | null;
}

export interface FormationVue {
  diplome: string;
  etablissement: string | null;
  annee: number | null;
}

export interface CvVue {
  experiences: ExperienceVue[];
  formations: FormationVue[];
}

function propre(valeur: string | null | undefined): string | null {
  const t = valeur?.trim();
  return t ? t : null;
}

/**
 * LE CV — décrit par la personne, ligne par ligne.
 *
 * Pas d'import de fichier : un PDF importé se lit mal, se stocke lourd, et
 * contient des données (adresse, photo, date de naissance) dont Ignitux n'a
 * aucun usage. Décrire son parcours en quelques lignes datées donne à IGINI
 * exactement ce qui sert — et rien d'autre.
 */
@Injectable()
export class CvService {
  constructor(private readonly prisma: PrismaService) {}

  async lire(userId: string): Promise<CvVue> {
    const [experiences, formations] = await Promise.all([
      this.prisma.user_experiences.findMany({
        where: { user_id: userId },
        orderBy: { position: 'asc' },
      }),
      this.prisma.user_formations.findMany({
        where: { user_id: userId },
        orderBy: { position: 'asc' },
      }),
    ]);
    return {
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
    };
  }

  async enregistrer(userId: string, cv: SaveCvDto): Promise<CvVue> {
    for (const e of cv.experiences) {
      // Comparaison de chaînes AAAA-MM : l'ordre alphabétique est l'ordre
      // chronologique, sans conversion.
      if (e.debut && e.fin && !e.enCours && e.fin < e.debut) {
        throw new BadRequestException(
          `« ${e.poste} » : la date de fin est avant la date de début.`,
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.user_experiences.deleteMany({ where: { user_id: userId } }),
      this.prisma.user_formations.deleteMany({ where: { user_id: userId } }),
      this.prisma.user_experiences.createMany({
        data: cv.experiences.map((e, position) => ({
          user_id: userId,
          poste: e.poste.trim(),
          entreprise: propre(e.entreprise),
          debut: e.debut ?? null,
          // Un poste en cours n'a pas de fin, même si l'écran en a gardé une.
          fin: e.enCours ? null : (e.fin ?? null),
          en_cours: e.enCours ?? false,
          description: propre(e.description),
          position,
        })),
      }),
      this.prisma.user_formations.createMany({
        data: cv.formations.map((f, position) => ({
          user_id: userId,
          diplome: f.diplome.trim(),
          etablissement: propre(f.etablissement),
          annee: f.annee ?? null,
          position,
        })),
      }),
    ]);

    return this.lire(userId);
  }
}
