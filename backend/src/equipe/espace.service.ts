import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  accesArgent,
  CHOIX_ACCES_ARGENT,
  type LienCollaborateur,
  type RaisonAccesArgent,
} from './acces-argent.js';
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

/** Une ligne du journal de mon équipe (`GET /espaces/activite`). */
export interface ActiviteEquipe {
  date: string | null;
  /** Le nom affiché de l'acteur, sinon « un membre » — jamais son e-mail. */
  acteur: string;
  methode: string;
  chemin: string;
  statut: number;
}

/** Combien de lignes du journal le propriétaire voit, les plus récentes. */
export const ACTIVITE_MAX = 200;

/**
 * Un de mes comptables ou associés et son accès à MON argent
 * (`GET /espaces/acces-argent`). Le propriétaire voit déjà l'e-mail de son
 * équipe dans la section Équipe : il est donné ici aussi.
 */
export interface MembreAccesArgent {
  memberId: string;
  /** Le nom affiché, sinon l'e-mail. */
  nom: string;
  email: string;
  /** Ses rôles argent sur mes projets (`comptable`, `associe`). */
  roles: RoleArgent[];
  acces: boolean;
  raison: RaisonAccesArgent;
}

/** 404 du choix d'accès pour quelqu'un qui n'est pas de mon équipe argent. */
export const MEMBRE_ARGENT_INTROUVABLE = 'Cette personne n’est ni comptable ni associée sur un de tes projets.';

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
 * ou `associe` pour l'argent) ET que X y a consenti : ligne `space_members`
 * (X, moi) `'argent'` (activé par X) ou `'argent_auto'` (accordé quand X
 * m'a invité ou m'a donné ce rôle) — la règle est dans `acces-argent.ts`.
 *
 * Sinon — pas collaborateur de X, collaborateur avec un autre rôle
 * (`salarie`, `observateur`), accès coupé ou à activer (aucune ligne),
 * en-tête mal formé — 404 « Espace introuvable. », la même réponse qu'un espace qui
 * n'existe pas : rien ne révèle l'espace à qui n'y a pas accès.
 *
 * Relu en base à chaque appel, sans cache : retiré de tous les projets de X
 * (ou passé à un autre rôle partout), ou coupé par X, on perd l'accès à la
 * requête suivante.
 */
@Injectable()
export class EspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async resoudre(userId: string, enTete: string | string[] | undefined, domaine: Domaine): Promise<string> {
    const proprietaire = espaceEtranger(userId, enTete);
    if (proprietaire === null) return userId;

    // Un en-tête mal formé ne doit pas finir en 500 sur la conversion uuid.
    if (!UUID.test(proprietaire)) throw new NotFoundException(ESPACE_INTROUVABLE);

    const liens = await this.prisma.project_collaborators.findMany({
      where: {
        user_id: userId,
        role: { in: [...ROLES_ARGENT] },
        project: { owner_id: proprietaire },
      },
      select: { role: true },
    });
    // Le rôle est revérifié ici, pas seulement dans le filtre : une fausse
    // route de la requête ne doit jamais ouvrir plus que la table.
    const couverts = liens.filter((lien) => roleCouvre(lien.role, domaine));
    // Plus comptable ni associé chez X : aucun choix de X n'y change rien.
    if (couverts.length === 0) throw new NotFoundException(ESPACE_INTROUVABLE);

    const choix = await this.prisma.space_members.findUnique({
      where: { owner_id_member_id: { owner_id: proprietaire, member_id: userId } },
      select: { role: true },
    });
    if (!accesArgent(couverts, choix?.role)?.acces) throw new NotFoundException(ESPACE_INTROUVABLE);
    return proprietaire;
  }

  /**
   * « Mon espace » d'abord, puis l'espace argent de chaque propriétaire
   * dont je suis comptable ou associé sur au moins un projet ET où mon accès
   * est en vigueur (activé par lui, ou accordé à l'invitation, jamais
   * coupé), avec mes rôles chez lui (un rôle par valeur, même s'il revient
   * sur plusieurs projets).
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

    const parProprietaire = new Map<string, { nom: string; roles: Set<RoleArgent>; liens: LienCollaborateur[] }>();
    for (const lien of liens) {
      const ownerId = lien.project.owner_id;
      // Jamais « l'espace d'un autre » qui serait le mien.
      if (ownerId === userId || !estRoleArgent(lien.role)) continue;
      const espace = parProprietaire.get(ownerId) ?? {
        // Le premier lien (le plus ancien) donne le nom : il ne change pas
        // d'une lecture à l'autre.
        nom: nomEspace(lien.project),
        roles: new Set<RoleArgent>(),
        liens: [],
      };
      espace.roles.add(lien.role);
      espace.liens.push({ role: lien.role });
      parProprietaire.set(ownerId, espace);
    }

    const monEspace: EspaceListe = { ownerId: userId, nom: 'Mon espace', roles: ['proprietaire'] };
    if (parProprietaire.size === 0) return [monEspace];

    // Le choix de chaque propriétaire me concernant, en une lecture.
    const choix = await this.prisma.space_members.findMany({
      where: { member_id: userId, owner_id: { in: [...parProprietaire.keys()] } },
      select: { owner_id: true, role: true },
    });
    const choixPar = new Map(choix.map((c) => [c.owner_id, c.role]));

    return [
      monEspace,
      ...[...parProprietaire]
        .filter(([ownerId, espace]) => accesArgent(espace.liens, choixPar.get(ownerId))?.acces === true)
        .map(([ownerId, { nom, roles }]) => ({
          ownerId,
          nom,
          roles: ROLES_ARGENT.filter((r) => roles.has(r)),
        })),
    ];
  }

  /**
   * L'accès à MON argent de chacun de mes comptables et associés (une
   * entrée par personne, quel que soit le nombre de projets partagés), dans
   * l'ordre où ils ont rejoint mes projets. Le nom est le nom affiché, sinon
   * l'e-mail : je vois déjà l'e-mail de mon équipe dans la section Équipe.
   */
  async accesArgentDeMonEquipe(ownerId: string): Promise<MembreAccesArgent[]> {
    const liens = await this.prisma.project_collaborators.findMany({
      where: { role: { in: [...ROLES_ARGENT] }, project: { owner_id: ownerId }, user_id: { not: ownerId } },
      orderBy: { created_at: 'asc' },
      select: {
        user_id: true,
        role: true,
        user: { select: { email: true, profile: { select: { display_name: true } } } },
      },
    });

    const parMembre = new Map<
      string,
      { nom: string; email: string; roles: Set<RoleArgent>; liens: LienCollaborateur[] }
    >();
    for (const lien of liens) {
      // Jamais membre de mon propre argent, même si la base le disait.
      if (lien.user_id === ownerId || !estRoleArgent(lien.role)) continue;
      const membre = parMembre.get(lien.user_id) ?? {
        nom: lien.user.profile?.display_name?.trim() || lien.user.email,
        email: lien.user.email,
        roles: new Set<RoleArgent>(),
        liens: [],
      };
      membre.roles.add(lien.role);
      membre.liens.push({ role: lien.role });
      parMembre.set(lien.user_id, membre);
    }
    if (parMembre.size === 0) return [];

    const choix = await this.prisma.space_members.findMany({
      where: { owner_id: ownerId, member_id: { in: [...parMembre.keys()] } },
      select: { member_id: true, role: true },
    });
    const choixPar = new Map(choix.map((c) => [c.member_id, c.role]));

    return [...parMembre].flatMap(([memberId, { nom, email, roles, liens: sesLiens }]) => {
      const acces = accesArgent(sesLiens, choixPar.get(memberId));
      if (!acces) return [];
      return [{ memberId, nom, email, roles: ROLES_ARGENT.filter((r) => roles.has(r)), ...acces }];
    });
  }

  /**
   * J'active (`acces: true`) ou je coupe (`false`) l'accès d'un de mes
   * comptables ou associés à MON argent. Enregistré dans `space_members`
   * (une ligne par couple propriétaire / membre : `'argent'` ou `'refuse'`,
   * qui remplace aussi un `'argent_auto'` accordé à l'invitation),
   * `created_at` portant la date du choix en vigueur. Rend la liste relue :
   * l'interface affiche ce que le serveur a retenu, rien d'autre.
   *
   * 404 si la personne n'est pas (ou plus) comptable ni associée sur un de
   * mes projets : on ne choisit que pour sa propre équipe.
   */
  async choisirAccesArgent(ownerId: string, memberId: string, acces: boolean): Promise<MembreAccesArgent[]> {
    const membre = memberId.toLowerCase();
    const equipe = await this.accesArgentDeMonEquipe(ownerId);
    if (!equipe.some((m) => m.memberId === membre)) throw new NotFoundException(MEMBRE_ARGENT_INTROUVABLE);

    const role = acces ? CHOIX_ACCES_ARGENT.active : CHOIX_ACCES_ARGENT.coupe;
    await this.prisma.space_members.upsert({
      where: { owner_id_member_id: { owner_id: ownerId, member_id: membre } },
      create: { owner_id: ownerId, member_id: membre, role },
      update: { role, created_at: new Date() },
    });
    return this.accesArgentDeMonEquipe(ownerId);
  }

  /**
   * Ce que mes comptables et associés ont écrit dans MON argent : les
   * ACTIVITE_MAX dernières lignes de `space_activity` dont je suis le
   * propriétaire, les plus récentes d'abord. Lecture seule. L'acteur est
   * désigné par son nom affiché, sinon « un membre » (compte supprimé
   * compris) : le journal ne transmet pas d'e-mail.
   */
  async activiteDeMonEquipe(ownerId: string): Promise<ActiviteEquipe[]> {
    const lignes = await this.prisma.space_activity.findMany({
      where: { owner_id: ownerId },
      orderBy: { created_at: 'desc' },
      take: ACTIVITE_MAX,
      select: {
        created_at: true,
        methode: true,
        chemin: true,
        statut: true,
        actor: { select: { profile: { select: { display_name: true } } } },
      },
    });
    return lignes.map((ligne) => ({
      date: ligne.created_at ? ligne.created_at.toISOString() : null,
      acteur: ligne.actor?.profile?.display_name?.trim() || 'un membre',
      methode: ligne.methode,
      chemin: ligne.chemin,
      statut: ligne.statut,
    }));
  }
}
