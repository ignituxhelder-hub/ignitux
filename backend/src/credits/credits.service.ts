import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { projetVisiblePar } from '../equipe/acces-projet.js';
import type { Prisma } from '../generated/prisma/client.js';
import { estGenerateur, type GeneratorName } from '../igini/usage/generator-names.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BAREME, CREDITS_BIENVENUE, prixEnCredits, presenterBareme, type BaremeVu } from './bareme.js';
import { CreditsInsuffisantsException } from './credits-insuffisants.js';

export type KindCredit = 'bienvenue' | 'recharge' | 'ajustement_admin' | 'debit' | 'remboursement';

/** Bornes d'un ajustement d'administrateur — les mêmes que le DTO de la route. */
export const AJUSTEMENT_MAX = 10_000;
export const MOTIF_MIN = 3;
export const MOTIF_MAX = 200;

/** Combien de lignes l'historique rend : de quoi relire plusieurs mois, pas un écran noyé. */
export const HISTORIQUE_LIMITE = 100;

export const MOTIF_BIENVENUE = 'Cadeau de bienvenue';
const MOTIF_REMBOURSEMENT = 'Génération échouée : crédits rendus.';

/** Un débit réservé avant l'appel IA. `id` sert à le rembourser si l'appel échoue. */
export interface Reservation {
  id: string;
  credits: number;
  soldeApres: number;
}

export interface LigneHistorique {
  id: string;
  date: string;
  kind: string;
  credits: number;
  generateur: string | null;
  /** Le nom de l'action au barème, quand la ligne en porte une. */
  libelle: string | null;
  /** null : aucun projet (chat, bienvenue…), projet supprimé, ou projet que la personne ne voit pas. */
  projet: { id: string; titre: string } | null;
  /** Le membre qui a lancé l'action dans mon projet ; null quand c'est moi, ou Ignitux. */
  acteur: string | null;
  motif: string | null;
}

export interface VueCredits {
  solde: number;
  bareme: BaremeVu;
  historique: LigneHistorique[];
}

type Client = Pick<PrismaService, 'credit_entries' | 'users' | 'projects'>;
type Transaction = Prisma.TransactionClient;

/**
 * LES CRÉDITS IGINI — le solde, la réservation avant l'appel IA, le
 * remboursement d'un échec, les ajustements d'un administrateur.
 *
 * Spec : docs/superpowers/specs/2026-10-25-credits-design.md.
 *
 * ## Le solde n'est écrit nulle part
 *
 * Il est la somme du journal `credit_entries` (append-only). Aucune colonne
 * « solde » ne peut donc diverger de l'historique : ce que la personne voit
 * dans « Mes crédits » s'additionne toujours à son solde.
 *
 * ## Le verrou, et pourquoi celui-là
 *
 * Toute écriture qui dépend du solde (débit, ajustement négatif, bienvenue)
 * se fait dans une transaction qui verrouille d'abord la ligne `users` du
 * compte : `SELECT … FOR NO KEY UPDATE`. Deux générations simultanées se
 * mettent donc en file ; la seconde ne lit le solde qu'une fois la première
 * validée (en READ COMMITTED, chaque requête voit ce qui est validé avant
 * elle), et reçoit un 402 au lieu de faire passer le solde sous zéro.
 *
 * - **Ligne `users` plutôt qu'un verrou consultatif** : pas de hachage de
 *   l'UUID vers un entier (donc aucune collision entre deux comptes), aucune
 *   table ni colonne en plus, et le verrou n'existe que pour un compte réel
 *   (un compte supprimé répond 404 au lieu d'être recréé en creux).
 * - **`FOR NO KEY UPDATE` plutôt que `FOR UPDATE`** : il ne bloque pas les
 *   `FOR KEY SHARE` que Postgres pose pour vérifier une clé étrangère. Le
 *   reste du produit (créer un projet, écrire un message) continue donc
 *   d'écrire des lignes qui pointent vers ce compte pendant une réservation.
 *   Deux `FOR NO KEY UPDATE` sur la même ligne, eux, s'excluent.
 * - La transaction est courte (quelques requêtes, jamais l'appel IA) : la
 *   file ne dure que le temps d'écrire une ligne.
 *
 * ## La bienvenue, une seule fois
 *
 * 30 crédits à l'inscription (dans la création même du compte, voir
 * `UsersService.signup`). Les comptes d'avant les crédits les reçoivent à la
 * première lecture de leur solde ou à leur première réservation — pas par
 * une migration de données, que `prisma db push` n'exécuterait pas. Sous le
 * même verrou, après avoir relu le journal : deux lectures simultanées n'en
 * versent qu'une.
 */
@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Le solde d'un compte (bienvenue versée au passage si elle manque). */
  async solde(ownerId: string): Promise<number> {
    await this.bienvenueUneFois(ownerId);
    return this.somme(this.prisma, ownerId);
  }

  /**
   * Refuse d'avance (402) une action que le solde ne couvre pas, sans rien
   * réserver. Pour une génération qui tourne en arrière-plan (l'évaluation
   * de financement) : la personne l'apprend tout de suite plutôt qu'en
   * découvrant un échec. La vraie réservation reste faite au moment de
   * l'appel, sous verrou.
   */
  async exigerSolde(ownerId: string, generator: GeneratorName): Promise<void> {
    const requis = prixEnCredits(generator);
    const disponible = await this.solde(ownerId);
    if (disponible < requis) throw new CreditsInsuffisantsException(requis, disponible);
  }

  /**
   * Réserve le prix d'un appel IA AVANT l'appel : un débit négatif, écrit
   * seulement si le solde le couvre. Sinon 402, et rien n'est écrit.
   *
   * `ownerId` est le compte qui paie — le propriétaire du projet quand un
   * membre de son équipe lance l'action — et `actorId` qui l'a lancée.
   * `appelId` est l'identifiant de l'appel IA, choisi d'avance : la ligne de
   * coût (`ai_usage_events`) portera le même.
   */
  async reserver(r: {
    ownerId: string;
    actorId: string | null;
    generator: GeneratorName;
    projectId: string | null;
    appelId: string;
  }): Promise<Reservation> {
    const prix = prixEnCredits(r.generator);
    return this.prisma.$transaction(async (tx) => {
      await this.verrouiller(tx, r.ownerId);
      await this.bienvenueSousVerrou(tx, r.ownerId);
      const disponible = await this.somme(tx, r.ownerId);
      if (disponible < prix) throw new CreditsInsuffisantsException(prix, disponible);
      const debit = await tx.credit_entries.create({
        data: {
          owner_id: r.ownerId,
          actor_id: r.actorId,
          kind: 'debit',
          credits: -prix,
          generator: r.generator,
          project_id: r.projectId,
          ai_usage_event_id: r.appelId,
        },
        select: { id: true },
      });
      return { id: debit.id, credits: prix, soldeApres: disponible - prix };
    });
  }

  /**
   * Rend un débit dont l'appel IA a échoué : une génération ratée ne coûte
   * rien. **Une seule fois** : sous le verrou du compte, on vérifie qu'aucun
   * remboursement ne porte déjà le même appel. Rend `true` si un
   * remboursement a été écrit.
   */
  async rembourser(debitId: string): Promise<boolean> {
    const debit = await this.prisma.credit_entries.findUnique({ where: { id: debitId } });
    if (!debit || debit.kind !== 'debit' || debit.credits >= 0) return false;
    if (!debit.ai_usage_event_id) {
      // Tout débit écrit par `reserver` porte son appel ; sans lui, on ne
      // saurait pas garantir l'unicité du remboursement.
      this.logger.error(`Débit ${debitId} sans identifiant d'appel : remboursement refusé, à régler à la main.`);
      return false;
    }
    return this.prisma.$transaction(async (tx) => {
      await this.verrouiller(tx, debit.owner_id);
      const deja = await tx.credit_entries.findFirst({
        where: { owner_id: debit.owner_id, kind: 'remboursement', ai_usage_event_id: debit.ai_usage_event_id },
        select: { id: true },
      });
      if (deja) return false;
      await tx.credit_entries.create({
        data: {
          owner_id: debit.owner_id,
          actor_id: debit.actor_id,
          kind: 'remboursement',
          credits: -debit.credits,
          generator: debit.generator,
          project_id: debit.project_id,
          ai_usage_event_id: debit.ai_usage_event_id,
          motif: MOTIF_REMBOURSEMENT,
        },
      });
      return true;
    });
  }

  /**
   * Crédite (ou, pour un administrateur, retire) des crédits.
   *
   * - `ajustement_admin` : ± jusqu'à 10 000, motif obligatoire, jamais sous
   *   zéro (409) ;
   * - `recharge` : positif seulement — le lot 2 (paiement par carte) l'écrira
   *   après un encaissement confirmé. Aucune route ne l'expose aujourd'hui.
   */
  async crediter(r: {
    ownerId: string;
    actorId: string | null;
    kind: 'ajustement_admin' | 'recharge';
    credits: number;
    motif?: string | null;
  }): Promise<{ id: string; solde: number }> {
    const motif = r.motif?.trim() ?? '';
    if (!Number.isInteger(r.credits) || r.credits === 0 || Math.abs(r.credits) > AJUSTEMENT_MAX) {
      throw new BadRequestException(
        `Le nombre de crédits doit être un entier non nul, entre -${AJUSTEMENT_MAX} et ${AJUSTEMENT_MAX}.`,
      );
    }
    if (r.kind === 'recharge' && r.credits < 0) {
      throw new BadRequestException('Une recharge ajoute des crédits, elle n’en retire jamais.');
    }
    if (r.kind === 'ajustement_admin' && (motif.length < MOTIF_MIN || motif.length > MOTIF_MAX)) {
      throw new BadRequestException(`Le motif est obligatoire (${MOTIF_MIN} à ${MOTIF_MAX} caractères).`);
    }

    return this.prisma.$transaction(async (tx) => {
      await this.verrouiller(tx, r.ownerId);
      await this.bienvenueSousVerrou(tx, r.ownerId);
      const avant = await this.somme(tx, r.ownerId);
      if (avant + r.credits < 0) {
        throw new ConflictException(
          `Ce retrait rendrait le solde négatif : ce compte a ${avant} crédit${Math.abs(avant) > 1 ? 's' : ''}.`,
        );
      }
      const entree = await tx.credit_entries.create({
        data: {
          owner_id: r.ownerId,
          actor_id: r.actorId,
          kind: r.kind,
          credits: r.credits,
          motif: motif || null,
        },
        select: { id: true },
      });
      return { id: entree.id, solde: avant + r.credits };
    });
  }

  /** « Mes crédits » : le solde, le barème, et les 100 derniers mouvements. */
  async vue(ownerId: string): Promise<VueCredits> {
    const solde = await this.solde(ownerId);
    return { solde, bareme: presenterBareme(), historique: await this.historique(ownerId) };
  }

  async historique(ownerId: string, limite = HISTORIQUE_LIMITE): Promise<LigneHistorique[]> {
    const lignes = await this.prisma.credit_entries.findMany({
      where: { owner_id: ownerId },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limite,
      select: {
        id: true,
        kind: true,
        credits: true,
        generator: true,
        project_id: true,
        actor_id: true,
        motif: true,
        created_at: true,
        actor: { select: { email: true, profile: { select: { display_name: true } } } },
      },
    });

    // Le titre d'un projet ne sort que si la personne le voit encore : le
    // filtre de visibilité est celui de tout le reste de l'application.
    const idsProjets = [...new Set(lignes.map((l) => l.project_id).filter((id): id is string => id !== null))];
    const projets =
      idsProjets.length === 0
        ? []
        : await this.prisma.projects.findMany({
            where: { id: { in: idsProjets }, ...projetVisiblePar(ownerId) },
            select: { id: true, title: true },
          });
    const titres = new Map(projets.map((p) => [p.id, p.title]));

    return lignes.map((l) => {
      const titre = l.project_id ? titres.get(l.project_id) : undefined;
      // Un membre de l'équipe est nommé ; moi-même, non ; un administrateur
      // non plus — c'est Ignitux qui ajuste, pas une personne.
      const parUnMembre =
        l.actor_id !== null && l.actor_id !== ownerId && (l.kind === 'debit' || l.kind === 'remboursement');
      return {
        id: l.id,
        date: l.created_at.toISOString(),
        kind: l.kind,
        credits: l.credits,
        generateur: l.generator,
        libelle: l.generator && estGenerateur(l.generator) ? BAREME[l.generator].libelle : null,
        projet: l.project_id && titre !== undefined ? { id: l.project_id, titre } : null,
        acteur: parUnMembre ? l.actor?.profile?.display_name?.trim() || l.actor?.email || null : null,
        motif: l.motif,
      };
    });
  }

  /**
   * Les comptes et leur solde, pour l'administration. Paginé (100 au plus
   * par page) ; `recherche` filtre sur l'adresse.
   *
   * Un compte d'avant les crédits qui ne s'est pas encore reconnecté n'a pas
   * reçu sa bienvenue : son solde affiché est celui du journal (0), et
   * `bienvenueVersee: false` le dit — une liste ne verse rien en la lisant.
   */
  async comptes(options: { page?: number; parPage?: number; recherche?: string } = {}) {
    const parPage = Math.min(100, Math.max(1, Math.trunc(options.parPage ?? 50) || 50));
    const page = Math.max(1, Math.trunc(options.page ?? 1) || 1);
    const recherche = options.recherche?.trim();
    const where: Prisma.usersWhereInput = recherche ? { email: { contains: recherche, mode: 'insensitive' } } : {};

    const [total, comptes] = await Promise.all([
      this.prisma.users.count({ where }),
      this.prisma.users.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * parPage,
        take: parPage,
        select: { id: true, email: true, created_at: true },
      }),
    ]);
    const ids = comptes.map((c) => c.id);
    const [sommes, bienvenues] =
      ids.length === 0
        ? [[], []]
        : await Promise.all([
            this.prisma.credit_entries.groupBy({
              by: ['owner_id'],
              where: { owner_id: { in: ids } },
              _sum: { credits: true },
            }),
            this.prisma.credit_entries.findMany({
              where: { owner_id: { in: ids }, kind: 'bienvenue' },
              select: { owner_id: true },
            }),
          ]);
    const soldes = new Map(sommes.map((s) => [s.owner_id, s._sum.credits ?? 0]));
    const servis = new Set(bienvenues.map((b) => b.owner_id));

    return {
      page,
      parPage,
      total,
      comptes: comptes.map((c) => ({
        id: c.id,
        email: c.email,
        creeLe: c.created_at?.toISOString() ?? null,
        solde: soldes.get(c.id) ?? 0,
        bienvenueVersee: servis.has(c.id),
      })),
    };
  }

  // ── Interne ─────────────────────────────────────────────────────────────

  private async somme(client: Client | Transaction, ownerId: string): Promise<number> {
    const { _sum } = await client.credit_entries.aggregate({ where: { owner_id: ownerId }, _sum: { credits: true } });
    return _sum.credits ?? 0;
  }

  /** Le verrou du compte, tenu jusqu'à la fin de la transaction. 404 si le compte n'existe pas. */
  private async verrouiller(tx: Transaction, ownerId: string): Promise<void> {
    const lignes = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM users WHERE id = ${ownerId}::uuid FOR NO KEY UPDATE`;
    if (lignes.length === 0) throw new NotFoundException('Compte introuvable.');
  }

  /** Lecture rapide sans verrou ; le verrou seulement quand la bienvenue manque. */
  private async bienvenueUneFois(ownerId: string): Promise<void> {
    const deja = await this.prisma.credit_entries.findFirst({
      where: { owner_id: ownerId, kind: 'bienvenue' },
      select: { id: true },
    });
    if (deja) return;
    await this.prisma.$transaction(async (tx) => {
      await this.verrouiller(tx, ownerId);
      await this.bienvenueSousVerrou(tx, ownerId);
    });
  }

  /** À appeler verrou tenu : relit le journal, puis verse si rien n'a été versé. */
  private async bienvenueSousVerrou(tx: Transaction, ownerId: string): Promise<void> {
    const deja = await tx.credit_entries.findFirst({
      where: { owner_id: ownerId, kind: 'bienvenue' },
      select: { id: true },
    });
    if (deja) return;
    await tx.credit_entries.create({
      data: { owner_id: ownerId, kind: 'bienvenue', credits: CREDITS_BIENVENUE, motif: MOTIF_BIENVENUE },
    });
  }
}
