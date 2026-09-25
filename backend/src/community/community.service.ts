import { Injectable, NotFoundException } from '@nestjs/common';
import { ConstitutionService } from '../constitution/constitution.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * COMMUNAUTÉ — la partie IGNITUX (pas IGINI) qui permet à un porteur de
 * projet de rendre son projet visible aux autres utilisateurs, et de
 * recevoir des encouragements. Volontairement minimal : pas de messagerie
 * privée, pas de mise en relation avec des mentors/investisseurs, pas de
 * classement — juste de la visibilité et des encouragements, en attendant
 * une vraie spec pour aller plus loin.
 *
 * ── Qui a fait quoi, et ce qu'on en dit ─────────────────────────────────
 *
 * Jusqu'au 25 septembre 2026, un projet publié ici n'arrivait qu'avec son
 * titre, sa description et sa date. **Aucun auteur.** L'article 21 de la
 * Constitution dit pourtant : « Les créateurs conservent la reconnaissance de
 * leurs idées. » Une idée exposée sans son porteur ne lui en laisse aucune.
 * Les commentaires souffraient du même trou à l'envers : ils partaient avec un
 * `author_id`, c'est-à-dire un identifiant technique que personne ne peut
 * lire.
 *
 * Ce qui est exposé désormais : le **nom d'affichage** du porteur, et lui
 * seul. Jamais l'adresse email — elle est privée par défaut (article 13), et
 * la publier transformerait la communauté en annuaire à moissonner.
 *
 * Et quand la personne n'a pas renseigné de nom, on rend `null`. Pas
 * « Anonyme », qui laisserait croire à un choix qu'elle n'a pas fait ; pas son
 * email non plus. `null` se lit « on ne sait pas », et l'interface le dit avec
 * ses mots.
 */

/**
 * Ce qu'un projet public montre de son porteur : un nom, ou rien.
 *
 * Écrit une fois et réutilisé, parce qu'un second endroit qui oublierait
 * `display_name` et prendrait l'email est exactement l'accident qu'on veut
 * rendre impossible.
 */
const PORTEUR_VISIBLE = {
  select: {
    profile: { select: { display_name: true } },
  },
} as const;

// La relation s'appelle `owner` sur `projects` et `author` sur les
// commentaires. Écrite `user` dans une première version, elle a fait répondre
// 500 à toute la communauté — et aucun test unitaire ne pouvait le voir : ils
// simulent Prisma, donc ils vérifiaient la forme que je venais d'inventer. La
// validation réelle l'a attrapé en une seconde.
const PROJET_PUBLIC = {
  id: true,
  title: true,
  description: true,
  created_at: true,
  owner: PORTEUR_VISIBLE,
} as const;

type LignePorteur = { profile: { display_name: string | null } | null } | null;

/** Aplatit la jointure : l'interface n'a pas à connaître notre schéma. */
function nomDuPorteur(user: LignePorteur): string | null {
  return user?.profile?.display_name ?? null;
}

@Injectable()
export class CommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly constitution: ConstitutionService,
  ) {}

  async listPublicProjects() {
    const projets = await this.prisma.projects.findMany({
      where: { is_public: true },
      select: PROJET_PUBLIC,
      orderBy: { created_at: 'desc' },
    });

    // Article 21, vérifié plutôt qu'espéré. Ce que la règle regarde est que
    // la requête a bien ramené le porteur — pas qu'il a un nom : quelqu'un
    // qui n'a pas rempli son nom d'affichage n'est pas une violation, c'est
    // une information manquante. Ce qui serait une violation, c'est que
    // `PROJET_PUBLIC` perde sa jointure un jour et que les projets
    // redeviennent anonymes sans que rien ne s'y oppose.
    await this.constitution.guard({
      kind: 'expose_public_project',
      carriesAuthor: projets.every((projet) => 'owner' in projet),
    });

    return projets.map(({ owner, ...projet }) => ({
      ...projet,
      porteur: nomDuPorteur(owner),
    }));
  }

  async getPublicProject(id: string) {
    const project = await this.prisma.projects.findFirst({
      where: { id, is_public: true },
      select: PROJET_PUBLIC,
    });
    if (!project) {
      throw new NotFoundException('Projet introuvable.');
    }

    await this.constitution.guard(
      { kind: 'expose_public_project', carriesAuthor: 'owner' in project },
      { projectId: id },
    );

    const { owner, ...reste } = project;
    return { ...reste, porteur: nomDuPorteur(owner) };
  }

  private async assertProjectIsPublic(projectId: string): Promise<void> {
    const project = await this.prisma.projects.findFirst({
      where: { id: projectId, is_public: true },
    });
    if (!project) {
      throw new NotFoundException('Projet introuvable.');
    }
  }

  async listComments(projectId: string) {
    await this.assertProjectIsPublic(projectId);
    const commentaires = await this.prisma.community_comments.findMany({
      where: { project_id: projectId },
      select: {
        id: true,
        project_id: true,
        content: true,
        created_at: true,
        author_id: true,
        author: PORTEUR_VISIBLE,
      },
      orderBy: { created_at: 'desc' },
    });
    // `author_id` reste : l'interface s'en sert pour savoir si un commentaire
    // est le sien. Ce qui s'y ajoute est le nom, pour que les autres soient
    // lisibles par quelqu'un plutôt que par une base de données.
    return commentaires.map(({ author, ...commentaire }) => ({
      ...commentaire,
      auteur: nomDuPorteur(author),
    }));
  }

  async addComment(authorId: string, projectId: string, content: string) {
    await this.assertProjectIsPublic(projectId);
    const cree = await this.prisma.community_comments.create({
      data: { project_id: projectId, author_id: authorId, content },
      select: {
        id: true,
        project_id: true,
        content: true,
        created_at: true,
        author_id: true,
        author: PORTEUR_VISIBLE,
      },
    });
    // La même forme que `listComments`, et ce n'est pas une coquetterie :
    // l'interface ajoute le commentaire à sa liste sans recharger. S'il
    // arrivait sans nom d'auteur, celui qu'on vient d'écrire serait le seul
    // anonyme de la page — jusqu'au prochain rechargement.
    const { author, ...commentaire } = cree;
    return { ...commentaire, auteur: nomDuPorteur(author) };
  }
}
