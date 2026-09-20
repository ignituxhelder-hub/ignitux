import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RolesService } from '../roles/roles.service.js';
import {
  completionFor,
  fieldsForRoles,
  PROFILE_FIELDS,
  toAskAt,
  type Completion,
  type FieldMoment,
  type ProfileField,
  type ProfileValues,
} from './profile-fields.js';

/** Les colonnes de `user_profiles`, dans l'ordre du catalogue. */
const COLONNES = PROFILE_FIELDS.map((f) => f.id);
const LISTES = new Set(
  PROFILE_FIELDS.filter((f) => f.kind === 'liste').map((f) => f.id),
);

export interface ProfileView {
  values: ProfileValues;
  completion: Completion;
  /** Les champs applicables, avec leur raison d'être. */
  fields: ProfileField[];
}

/**
 * LE PROFIL — ce qu'Ignitux sait de la personne.
 *
 * Deux principes, tous deux issus du même constat : un formulaire qui
 * demande beaucoup et n'explique rien fait fuir avant que le produit ait
 * montré quoi que ce soit.
 *
 * 1. **Rien n'est demandé à l'inscription.** Chaque champ porte le moment
 *    où il devient utile, et c'est à ce moment-là qu'on le pose.
 * 2. **Rien n'est stocké sans usage.** Le catalogue est le seul endroit où
 *    l'on décide qu'un champ mérite d'exister, et il exige une raison.
 *
 * Le service écrit aussi dans la mémoire personnelle : ce que la personne
 * dit d'elle-même est un fait la concernant, et IGINI doit pouvoir s'en
 * souvenir d'un projet à l'autre. C'est le seul endroit du produit qui
 * écrit un souvenir sans projet.
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
  ) {}

  private async lire(userId: string): Promise<ProfileValues> {
    const ligne = await this.prisma.user_profiles.findUnique({ where: { user_id: userId } });
    const valeurs: ProfileValues = {};
    for (const colonne of COLONNES) {
      const brut = ligne ? (ligne as unknown as Record<string, unknown>)[colonne] : null;
      valeurs[colonne] = LISTES.has(colonne)
        ? ((brut as string[] | undefined) ?? [])
        : ((brut as string | null | undefined) ?? null);
    }
    return valeurs;
  }

  private async rolesDe(userId: string): Promise<string[]> {
    return (await this.roles.myRoles(userId)).roles;
  }

  async view(userId: string): Promise<ProfileView> {
    const [valeurs, roles] = await Promise.all([this.lire(userId), this.rolesDe(userId)]);
    return {
      values: valeurs,
      completion: completionFor(roles, valeurs),
      fields: fieldsForRoles(roles),
    };
  }

  /** Les champs à poser à ce moment du parcours, et pas déjà remplis. */
  async ask(userId: string, moment: FieldMoment): Promise<ProfileField[]> {
    const [valeurs, roles] = await Promise.all([this.lire(userId), this.rolesDe(userId)]);
    return toAskAt(moment, roles, valeurs);
  }

  /**
   * Enregistre ce que la personne a bien voulu dire.
   *
   * Une clé absente n'est pas touchée : un écran qui ne pose que deux
   * questions ne doit pas effacer les huit autres réponses. Une clé inconnue
   * du catalogue est ignorée en silence plutôt que refusée — elle vient d'un
   * client d'une version antérieure, pas d'une attaque.
   */
  async save(userId: string, entrees: ProfileValues): Promise<ProfileView> {
    const data: Record<string, string | string[] | null> = {};
    for (const champ of PROFILE_FIELDS) {
      if (!(champ.id in entrees)) continue;
      const valeur = entrees[champ.id];
      if (champ.kind === 'liste') {
        data[champ.id] = Array.isArray(valeur) ? valeur.filter((v) => typeof v === 'string') : [];
      } else {
        const texte = typeof valeur === 'string' ? valeur.trim() : '';
        data[champ.id] = texte === '' ? null : texte;
      }
    }

    await this.prisma.user_profiles.upsert({
      where: { user_id: userId },
      create: { user_id: userId, ...data },
      update: data,
    });

    await this.rappelerDansLaMemoire(userId, data);
    return this.view(userId);
  }

  /**
   * Ce que la personne dit d'elle-même devient un souvenir personnel.
   *
   * Sans projet : c'est un fait sur elle, pas sur un de ses projets, et il
   * doit la suivre d'un projet à l'autre. Un souvenir par champ plutôt qu'un
   * bloc, pour qu'un changement d'avis remplace la bonne ligne.
   *
   * Rien n'y marque la provenance, faute de colonne pour le faire : ces
   * souvenirs sont écrits par la personne elle-même, jamais déduits, et
   * c'est le seul endroit du produit qui en crée sans projet.
   */
  private async rappelerDansLaMemoire(
    userId: string,
    data: Record<string, string | string[] | null>,
  ): Promise<void> {
    for (const champ of PROFILE_FIELDS) {
      if (!(champ.id in data)) continue;
      const valeur = data[champ.id];
      const texte = Array.isArray(valeur) ? valeur.join(', ') : valeur;
      if (!texte) continue;

      const contenu = `${champ.label} : ${texte}`;
      const existant = await this.prisma.memories.findFirst({
        where: { user_id: userId, project_id: null, content: { startsWith: `${champ.label} : ` } },
      });

      if (existant) {
        if (existant.content !== contenu) {
          await this.prisma.memories.update({
            where: { id: existant.id },
            data: { content: contenu },
          });
        }
        continue;
      }

      await this.prisma.memories.create({
        data: {
          user_id: userId,
          project_id: null,
          content: contenu,
          // « fact » : un état déclaré, pas une décision ni un apprentissage.
          category: 'fact',
          // `memories` ne porte pas de colonne de provenance : la table
          // n en a jamais eu, et en inventer une ici aurait fait echouer
          // l ecriture en silence — ce qui s est produit au premier essai.
          tags: [],
        },
      });
    }
  }
}
