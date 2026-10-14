import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { estRoleArgent, roleCouvre, ROLES_ARGENT, type Domaine, type RoleArgent } from './domaines.js';

/** L'en-tête envoyé par le frontend quand on agit dans l'espace d'un autre. */
export const EN_TETE_ESPACE = 'x-espace';

export const ESPACE_INTROUVABLE = 'Espace introuvable.';
/**
 * Réponse (403) d'une route qui ne se délègue pas, appelée avec l'espace
 * d'un autre. Distinct de « Espace introuvable. » : l'espace existe bien,
 * c'est l'action qui ne s'y fait pas.
 */
export const ESPACE_PERSONNEL_SEULEMENT =
  "Cette action ne se fait que dans ton propre espace. Reviens sur « Mon espace » pour la faire.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Un espace où la personne peut travailler (`GET /espaces`). */
export interface EspaceListe {
  ownerId: string;
  nom: string;
  /** `['proprietaire']` pour « Mon espace » ; sinon mes rôles argent chez ce propriétaire. */
  roles: string[];
}

/**
 * L'espace d'un AUTRE demandé par l'en-tête, ou `null` quand la requête vise
 * mon propre espace (en-tête absent, vide, ou égal à mon id).
 *
 * La valeur est seulement normalisée (espaces, casse) : sa validité est
 * jugée par `EspaceService.resoudre`, jamais ici.
 */
export function espaceEtranger(userId: string, enTete: string | string[] | undefined): string | null {
  const brut = Array.isArray(enTete) ? enTete.join(', ') : enTete;
  const valeur = (brut ?? '').trim().toLowerCase();
  if (valeur === '' || valeur === userId.toLowerCase()) return null;
  return valeur;
}

/**
 * Le nom d'un espace : le nom affiché du propriétaire, sinon le titre du
 * premier projet partagé avec moi. JAMAIS son e-mail — un comptable n'a pas
 * à recevoir l'adresse personnelle du propriétaire par la liste des espaces.
 */
function nomEspace(projet: { title: string | null; owner: { profile?: { display_name: string | null } | null } }): string {
  const nom = projet.owner.profile?.display_name?.trim();
  if (nom) return `Espace de ${nom}`;
  const titre = projet.title?.trim();
  return titre ? `Espace de l’entreprise ${titre}` : 'Espace de l’entreprise';
}

/**
 * RÉSOLUTION DE L'ESPACE ARGENT.
 *
 * Rend l'`ownerId` effectif d'une requête : le mien, ou celui du
 * propriétaire X quand je suis, sur AU MOINS UN projet dont X est
 * propriétaire, collaborateur avec un rôle qui ouvre le domaine (`comptable`
 * ou `associe` pour l'argent).
 *
 * Sinon — pas collaborateur de X, collaborateur avec un autre rôle
 * (`salarie`, `observateur`), en-tête mal formé — 404 « Espace introuvable. »,
 * la même réponse qu'un espace qui n'existe pas : rien ne révèle l'espace à
 * qui n'y a pas accès.
 *
 * Relu en base à chaque appel, sans cache : retiré de tous les projets de X
 * (ou passé à un autre rôle partout), on perd l'accès à la requête suivante.
 */
@Injectable()
export class EspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async resoudre(userId: string, enTete: string | string[] | undefined, domaine: Domaine): Promise<string> {
    const proprietaire = espaceEtranger(userId, enTete);
    if (proprietaire === null) return userId;

    // Un en-tête mal formé ne doit pas finir en 500 sur la conversion uuid.
    if (!UUID.test(proprietaire)) throw new NotFoundException(ESPACE_INTROUVABLE);

    const lien = await this.prisma.project_collaborators.findFirst({
      where: {
        user_id: userId,
        role: { in: [...ROLES_ARGENT] },
        project: { owner_id: proprietaire },
      },
      select: { role: true },
    });
    // Le rôle est revérifié ici, pas seulement dans le filtre : une fausse
    // route de la requête ne doit jamais ouvrir plus que la table.
    if (!lien || !roleCouvre(lien.role, domaine)) throw new NotFoundException(ESPACE_INTROUVABLE);
    return proprietaire;
  }

  /**
   * « Mon espace » d'abord, puis l'espace argent de chaque propriétaire
   * dont je suis comptable ou associé sur au moins un projet, avec mes rôles
   * chez lui (un rôle par valeur, même s'il revient sur plusieurs projets).
   */
  async mesEspaces(userId: string): Promise<EspaceListe[]> {
    const liens = await this.prisma.project_collaborators.findMany({
      where: { user_id: userId, role: { in: [...ROLES_ARGENT] } },
      orderBy: { created_at: 'asc' },
      select: {
        role: true,
        project: {
          select: {
            owner_id: true,
            title: true,
            owner: { select: { profile: { select: { display_name: true } } } },
          },
        },
      },
    });

    const parProprietaire = new Map<string, { nom: string; roles: Set<RoleArgent> }>();
    for (const lien of liens) {
      const ownerId = lien.project.owner_id;
      // Jamais « l'espace d'un autre » qui serait le mien.
      if (ownerId === userId || !estRoleArgent(lien.role)) continue;
      const espace = parProprietaire.get(ownerId) ?? {
        // Le premier lien (le plus ancien) donne le nom : il ne change pas
        // d'une lecture à l'autre.
        nom: nomEspace(lien.project),
        roles: new Set<RoleArgent>(),
      };
      espace.roles.add(lien.role);
      parProprietaire.set(ownerId, espace);
    }

    return [
      { ownerId: userId, nom: 'Mon espace', roles: ['proprietaire'] },
      ...[...parProprietaire].map(([ownerId, { nom, roles }]) => ({
        ownerId,
        nom,
        roles: ROLES_ARGENT.filter((r) => roles.has(r)),
      })),
    ];
  }
}
