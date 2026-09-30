import { BadRequestException, Injectable } from '@nestjs/common';
import { ConstitutionService } from '../constitution/constitution.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type DataDomain,
  type RoleDefinition,
  ROLES,
  findRole,
  isRoleId,
  openRoles,
} from './roles-catalogue.js';

/** Ce qui retient un rôle : des données réelles qui en dépendent. */
export interface RoleAttachment {
  role: string;
  /** Ce qui existe, en clair, pour que le refus soit compréhensible. */
  detail: string;
  count: number;
}

export interface MyRoles {
  roles: string[];
  activeRole: string | null;
  /**
   * Les rôles non pris pour lesquels des données existent déjà. On ne les
   * accorde pas d'office : on le dit, et la personne décide.
   */
  suggestions: RoleAttachment[];
  catalogue: Array<Omit<RoleDefinition, 'domains'> & { domains: string[]; held: boolean }>;
}

/**
 * LES RÔLES — qui je suis dans Ignitux, et donc ce que je vois.
 *
 * Trois principes tiennent ce service :
 *
 * 1. **Un rôle ne possède rien.** Il n'existe pas de « projets du rôle
 *    entrepreneur » : il existe des projets, et un rôle qui les montre. La
 *    duplication est donc impossible par construction, pas par discipline.
 *
 * 2. **Retirer un rôle n'efface rien.** Fermer une porte n'est pas vider la
 *    pièce. Mais tant que la pièce est pleine, on refuse de murer la porte :
 *    laisser quelqu'un perdre de vue trois participations actives d'un clic
 *    serait pire qu'un refus.
 *
 * 3. **Un rôle fermé se dit fermé.** Mentor, expert, partenaire et
 *    administrateur existent dans le vocabulaire et nulle part ailleurs ;
 *    les proposer à la sélection serait promettre un espace qui n'existe pas.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly constitution: ConstitutionService,
  ) {}

  async myRoles(userId: string): Promise<MyRoles> {
    const [lignes, utilisateur] = await Promise.all([
      this.prisma.user_roles.findMany({ where: { user_id: userId }, orderBy: { role: 'asc' } }),
      this.prisma.users.findUnique({ where: { id: userId }, select: { active_role: true } }),
    ]);

    const tenus = lignes.map((ligne) => ligne.role);
    const suggestions = await this.suggestions(userId, tenus);

    return {
      roles: tenus,
      // Un mode actif qui ne correspond plus à un rôle tenu n'est pas une
      // erreur à signaler : c'est un reste. On le tait et on rend null.
      activeRole:
        utilisateur?.active_role && tenus.includes(utilisateur.active_role)
          ? utilisateur.active_role
          : null,
      suggestions,
      catalogue: ROLES.map((role) => ({
        ...role,
        domains: [...role.domains],
        held: tenus.includes(role.id),
      })),
    };
  }

  /**
   * Prend ou rend des rôles. La liste envoyée remplace la liste tenue :
   * l'écran montre des cases à cocher, l'API doit parler la même langue.
   */
  async setRoles(userId: string, demandes: readonly string[]): Promise<MyRoles> {
    const voulus = [...new Set(demandes)];

    for (const role of voulus) {
      if (!isRoleId(role)) {
        throw new BadRequestException(`Le rôle « ${role} » n'existe pas.`);
      }
      const definition = findRole(role);
      if (!definition?.available) {
        throw new BadRequestException(
          `Le rôle « ${definition?.label ?? role} » est prévu mais pas encore ouvert : ` +
            "aucun espace n'existe derrière, et te l'accorder ne te donnerait rien.",
        );
      }
    }

    if (voulus.length === 0) {
      throw new BadRequestException(
        'Il faut garder au moins un rôle : sans rôle, Ignitux ne saurait plus quoi te montrer.',
      );
    }

    const actuels = (
      await this.prisma.user_roles.findMany({ where: { user_id: userId }, select: { role: true } })
    ).map((ligne) => ligne.role);

    const retires = actuels.filter((role) => !voulus.includes(role));
    for (const role of retires) {
      const attaches = await this.attachments(userId, role);
      if (attaches.count > 0) {
        throw new BadRequestException(
          `Le rôle « ${findRole(role)?.label ?? role} » ne peut pas être retiré : ` +
            `${attaches.detail}. Rien n'est supprimé quand un rôle part, mais ces données ` +
            'deviendraient invisibles, et ce serait la pire façon de les perdre.',
        );
      }
    }

    const ajoutes = voulus.filter((role) => !actuels.includes(role));

    await this.prisma.$transaction([
      ...(retires.length > 0
        ? [this.prisma.user_roles.deleteMany({ where: { user_id: userId, role: { in: retires } } })]
        : []),
      ...ajoutes.map((role) =>
        this.prisma.user_roles.create({ data: { user_id: userId, role } }),
      ),
    ]);

    // Si le mode actif vient d'être retiré, on repositionne sur un rôle tenu
    // plutôt que de laisser la personne dans un espace qu'elle ne tient plus.
    const actif = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { active_role: true },
    });
    if (!actif?.active_role || !voulus.includes(actif.active_role)) {
      await this.prisma.users.update({
        where: { id: userId },
        data: { active_role: voulus[0] },
      });
    }

    return this.myRoles(userId);
  }

  /** Bascule de mode. Ne change aucune donnée : change ce qui est montré. */
  async setActiveRole(userId: string, role: string): Promise<MyRoles> {
    const tenu = await this.prisma.user_roles.findFirst({
      where: { user_id: userId, role },
      select: { id: true },
    });
    if (!tenu) {
      throw new BadRequestException(
        `Tu ne tiens pas le rôle « ${findRole(role)?.label ?? role} » : ` +
          "prends-le d'abord dans Mon compte.",
      );
    }
    await this.prisma.users.update({ where: { id: userId }, data: { active_role: role } });
    return this.myRoles(userId);
  }

  async holdsRole(userId: string, role: string): Promise<boolean> {
    const ligne = await this.prisma.user_roles.findFirst({
      where: { user_id: userId, role },
      select: { id: true },
    });
    return ligne !== null;
  }

  /**
   * Soumet une vue au moteur constitutionnel AVANT de la servir.
   *
   * C'est le point d'appel réel de la règle `roles-separes` : sans lui, la
   * séparation ne serait qu'une intention écrite dans un commentaire.
   */
  async assertViewIsSeparated(
    userId: string,
    role: string,
    domains: readonly DataDomain[],
  ): Promise<void> {
    await this.constitution.guard(
      { kind: 'serve_role_view', role, domains },
      { userId },
    );
  }

  /**
   * Ce qui rattache une personne à un rôle, en données réelles.
   *
   * Sert deux fois, et c'est voulu : pour refuser un retrait qui rendrait
   * des données invisibles, et pour signaler un rôle qu'il serait utile de
   * prendre. La même mesure répond aux deux questions.
   */
  private async attachments(userId: string, role: string): Promise<RoleAttachment> {
    if (role === 'entrepreneur') {
      const projets = await this.prisma.projects.count({ where: { owner_id: userId } });
      return {
        role,
        count: projets,
        detail: `${projets} projet(s) t'appartiennent`,
      };
    }

    if (role === 'investisseur') {
      const investisseurs = await this.prisma.investors.findMany({
        where: { user_id: userId },
        select: { id: true },
      });
      if (investisseurs.length === 0) {
        return { role, count: 0, detail: 'aucun investissement enregistré' };
      }
      const participations = await this.prisma.participations.count({
        where: { investor_id: { in: investisseurs.map((i) => i.id) } },
      });
      return {
        role,
        count: participations,
        detail: `${participations} participation(s) sont enregistrées à ton nom`,
      };
    }

    return { role, count: 0, detail: 'aucune donnée rattachée' };
  }

  /** Les rôles ouverts, non tenus, pour lesquels des données existent déjà. */
  private async suggestions(
    userId: string,
    tenus: readonly string[],
  ): Promise<RoleAttachment[]> {
    const resultats: RoleAttachment[] = [];
    for (const role of openRoles()) {
      if (tenus.includes(role.id)) continue;
      const attaches = await this.attachments(userId, role.id);
      if (attaches.count > 0) resultats.push(attaches);
    }
    return resultats;
  }
}
