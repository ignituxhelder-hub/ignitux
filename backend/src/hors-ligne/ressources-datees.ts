import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { accesProjet } from '../equipe/acces-projet.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Les ressources dont on sait dire QUAND elles ont changé pour la dernière
 * fois — et, par conséquent, les seules qu'on puisse protéger d'une écriture
 * hors ligne devenue obsolète.
 *
 * La liste est écrite à la main, et c'est voulu. Un accès dynamique
 * (`prisma[nom]`) permettrait d'en protéger n'importe laquelle sans rien
 * déclarer ; on ne saurait plus, en lisant, ce qui est couvert. Ici, ce
 * fichier est la réponse à la question « qu'est-ce qui est protégé ? ».
 *
 * Pour en ajouter une : le modèle doit porter `updated_at`, sa route doit
 * recevoir l'identifiant (un uuid, validé par `ParseUUIDPipe` — le garde
 * laisse passer tout le reste) dans un paramètre d'URL, et son lecteur doit
 * vérifier l'accès avec la même règle que le contrôleur. Les modèles qui
 * n'ont pas `updated_at` — 39 des 50 — ne peuvent pas entrer ici sans
 * migration, et il vaut mieux qu'ils en restent dehors que d'y entrer avec
 * une date approchée.
 */

/**
 * Ce qu'un lecteur reçoit pour répondre — et ne répondre qu'à qui y a droit.
 *
 * Le 409 du garde porte la date exacte de la dernière modification. Le
 * rendre à n'importe quel compte connecté lui apprendrait, à partir d'un
 * identifiant (celui resté dans le cache hors ligne d'un membre retiré, par
 * exemple), que la ligne existe et quand elle a changé — et même sans cette
 * date, faire varier l'âge annoncé suffirait à la retrouver par dichotomie.
 * Chaque lecteur vérifie donc d'abord que la personne a accès à la ligne ;
 * sans accès, il répond `null` comme pour une ligne introuvable, et le garde
 * laisse le contrôleur répondre comme il l'aurait fait sans lui.
 */
export interface DemandeDatee {
  prisma: PrismaService;
  /** L'identifiant de la ligne, lu dans l'URL. */
  id: string;
  /** La personne authentifiée : le garde est monté après `JwtAuthGuard`. */
  userId: string;
  /**
   * Le propriétaire effectif de l'espace argent pour cette requête : moi
   * sans `X-Espace` étranger, sinon celui que `EspaceService.resoudre`
   * retient — qui rejette quand cet espace ne m'est pas ouvert.
   */
  proprietaireArgent: () => Promise<string>;
}

/**
 * `updated_at` est nullable au schéma : une ligne peut donc ne pas savoir
 * quand elle a changé pour la dernière fois. Le type le dit, plutôt que de
 * le cacher derrière un `!` — c'est un cas que le garde doit traiter, et il
 * le traite en laissant passer.
 *
 * `null` : ligne introuvable OU inaccessible à cette personne. Les deux cas
 * se confondent exprès — c'est au contrôleur de dire lequel, s'il le dit.
 */
type Lecteur = (demande: DemandeDatee) => Promise<{ updated_at: Date | null } | null>;

/**
 * La réponse d'une vérification d'accès, ou `null` quand elle refuse (404,
 * 403). Toute autre erreur — une panne de base — remonte telle quelle : la
 * prendre pour un refus la cacherait derrière un faux « rien à signaler ».
 */
async function siAccessible<T>(verifier: () => Promise<T>): Promise<T | null> {
  try {
    return await verifier();
  } catch (erreur) {
    if (erreur instanceof NotFoundException || erreur instanceof ForbiddenException) return null;
    throw erreur;
  }
}

/** Tout rôle sur le projet suffit : chacun le voit déjà, date comprise. */
async function voitLeProjet(prisma: PrismaService, userId: string, projectId: string): Promise<boolean> {
  return (await siAccessible(() => accesProjet(prisma, userId, projectId))) !== null;
}

export const RESSOURCES_DATEES = {
  projects: async ({ prisma, id, userId }) => {
    if (!(await voitLeProjet(prisma, userId, id))) return null;
    return prisma.projects.findUnique({ where: { id }, select: { updated_at: true } });
  },
  // Une tâche se voit par son projet : elle est jugée sur le sien, pas sur
  // celui que l'URL annonce.
  tasks: async ({ prisma, id, userId }) => {
    const tache = await prisma.tasks.findUnique({
      where: { id },
      select: { updated_at: true, project_id: true },
    });
    if (!tache || !(await voitLeProjet(prisma, userId, tache.project_id))) return null;
    return { updated_at: tache.updated_at };
  },
  // L'argent se range par propriétaire : le document doit être à celui de
  // l'espace où j'agis — le mien, ou celui qui me l'a ouvert.
  billing_documents: async ({ prisma, id, proprietaireArgent }) => {
    const proprietaire = await siAccessible(proprietaireArgent);
    if (proprietaire === null) return null;
    return prisma.billing_documents.findFirst({
      where: { id, owner_id: proprietaire },
      select: { updated_at: true },
    });
  },
  // Le CRM ne se délègue jamais : seul son propriétaire y a accès.
  crm_contacts: ({ prisma, id, userId }) =>
    prisma.crm_contacts.findFirst({ where: { id, owner_id: userId }, select: { updated_at: true } }),
  crm_companies: ({ prisma, id, userId }) =>
    prisma.crm_companies.findFirst({ where: { id, owner_id: userId }, select: { updated_at: true } }),
} satisfies Record<string, Lecteur>;

export type RessourceDatee = keyof typeof RESSOURCES_DATEES;

/** Ce que la ressource s'appelle pour quelqu'un qui lit un message d'erreur. */
export const NOM_LISIBLE: Record<RessourceDatee, string> = {
  projects: 'Ce projet',
  tasks: 'Cette tâche',
  billing_documents: 'Ce document de facturation',
  crm_contacts: 'Ce contact',
  crm_companies: 'Cette entreprise',
};
