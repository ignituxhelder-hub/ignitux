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
 * Pour en ajouter une : le modèle doit porter `updated_at`, et sa route doit
 * recevoir l'identifiant de la ligne dans un paramètre d'URL. Les modèles qui
 * n'ont pas `updated_at` — 39 des 50 — ne peuvent pas entrer ici sans
 * migration, et il vaut mieux qu'ils en restent dehors que d'y entrer avec
 * une date approchée.
 */
/**
 * `updated_at` est nullable au schéma : une ligne peut donc ne pas savoir
 * quand elle a changé pour la dernière fois. Le type le dit, plutôt que de
 * le cacher derrière un `!` — c'est un cas que le garde doit traiter, et il
 * le traite en laissant passer.
 */
type Lecteur = (
  prisma: PrismaService,
  id: string,
) => Promise<{ updated_at: Date | null } | null>;

export const RESSOURCES_DATEES = {
  projects: (prisma, id) =>
    prisma.projects.findUnique({ where: { id }, select: { updated_at: true } }),
  tasks: (prisma, id) => prisma.tasks.findUnique({ where: { id }, select: { updated_at: true } }),
  billing_documents: (prisma, id) =>
    prisma.billing_documents.findUnique({ where: { id }, select: { updated_at: true } }),
  crm_contacts: (prisma, id) =>
    prisma.crm_contacts.findUnique({ where: { id }, select: { updated_at: true } }),
  crm_companies: (prisma, id) =>
    prisma.crm_companies.findUnique({ where: { id }, select: { updated_at: true } }),
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
