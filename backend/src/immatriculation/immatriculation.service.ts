import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { userOwner, type LedgerOwner } from '../ledger/ledger-owner.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  COMPTE_BANQUE,
  COMPTE_CAPITAL,
  estFormeAvecPersonneMorale,
  propositionCapital,
  type PropositionCapital,
} from './capital.js';
import { normaliserFiche, type SaisieFiche } from './identifiants.js';

/** Contrainte unique violée (`P2002`) — même convention que statuts.service. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

export interface FicheImmatriculation {
  id: string;
  projectId: string;
  siren: string;
  siret: string | null;
  vatNumber: string | null;
  legalName: string;
  headOffice: string;
  /** `AAAA-MM-JJ`. */
  registeredOn: string;
  /** L'écriture de capital enregistrée à partir de cette fiche, s'il y en a une. */
  capitalEntryId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface EtatImmatriculation {
  registration: FicheImmatriculation | null;
  /** Dénomination et siège tirés des statuts retenus, à confirmer par la personne. */
  suggestion: { legalName: string; headOffice: string } | null;
}

export interface EtatCapital {
  proposition: PropositionCapital | null;
  dejaEnregistree: boolean;
  /** Pourquoi il n'y a pas de proposition (null quand il y en a une). */
  raison: string | null;
}

const SIREN_DEJA_UTILISE = 'Ce SIREN est déjà enregistré sur un autre de tes projets.';
const CAPITAL_DEJA_ENREGISTRE = 'L’écriture de capital a déjà été enregistrée pour cette fiche.';

interface LigneFiche {
  id: string;
  project_id: string;
  siren: string;
  siret: string | null;
  vat_number: string | null;
  legal_name: string;
  head_office: string;
  registered_on: Date;
  capital_entry_id: string | null;
  created_at: Date | null;
  updated_at: Date | null;
}

function versFiche(ligne: LigneFiche): FicheImmatriculation {
  return {
    id: ligne.id,
    projectId: ligne.project_id,
    siren: ligne.siren,
    siret: ligne.siret,
    vatNumber: ligne.vat_number,
    legalName: ligne.legal_name,
    headOffice: ligne.head_office,
    registeredOn: ligne.registered_on.toISOString().slice(0, 10),
    capitalEntryId: ligne.capital_entry_id,
    createdAt: ligne.created_at,
    updatedAt: ligne.updated_at,
  };
}

/**
 * IMMATRICULATION — rattacher le projet à l'entreprise créée.
 *
 * Tout vient de la personne (Kbis, avis de situation) : Ignitux ne vérifie
 * rien auprès de l'État, il contrôle seulement la forme des numéros. Tous
 * les accès passent par la vérification propriétaire du projet : un
 * non-propriétaire, collaborateur compris, reçoit un 404.
 *
 * L'écriture de capital n'est jamais faite en arrière-plan : seulement sur
 * un POST explicite, et toujours par `LedgerService.recordEntry`, dans les
 * livres de la personne — jamais en contournant le moteur constitutionnel.
 */
@Injectable()
export class ImmatriculationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async obtenir(ownerId: string, projectId: string): Promise<EtatImmatriculation> {
    const project = await this.projetDuProprietaire(ownerId, projectId);
    const [fiche, statuts] = await Promise.all([
      this.ficheDuProjet(ownerId, projectId),
      this.statutsDuProjet(ownerId, projectId),
    ]);

    // Seulement depuis des statuts RETENUS pour la forme confirmée : un
    // brouillon peut encore changer, et rien d'autre n'est proposé.
    const suggestion =
      statuts &&
      statuts.status === 'retenue' &&
      estFormeAvecPersonneMorale(project.confirmed_legal_form) &&
      statuts.legal_form === project.confirmed_legal_form
        ? { legalName: project.title, headOffice: statuts.head_office }
        : null;

    return { registration: fiche ? versFiche(fiche) : null, suggestion };
  }

  /** Crée ou remplace la fiche. Ne touche à aucun document déjà émis. */
  async enregistrer(ownerId: string, projectId: string, saisie: SaisieFiche): Promise<EtatImmatriculation> {
    await this.projetDuProprietaire(ownerId, projectId);

    const resultat = normaliserFiche(saisie);
    if (!resultat.ok) {
      throw new BadRequestException(resultat.erreurs);
    }
    const { fiche } = resultat;

    if (await this.sirenUtiliseAilleurs(ownerId, projectId, fiche.siren)) {
      throw new ConflictException(SIREN_DEJA_UTILISE);
    }

    const champs = {
      siren: fiche.siren,
      siret: fiche.siret,
      vat_number: fiche.vatNumber,
      legal_name: fiche.legalName,
      head_office: fiche.headOffice,
      registered_on: fiche.registeredOn,
    };
    // `capital_entry_id` n'est jamais dans `champs` : remplacer la fiche ne
    // fait pas oublier une écriture déjà enregistrée.
    const ecrire = () =>
      this.prisma.company_registrations.upsert({
        where: { project_id: projectId },
        create: { owner_id: ownerId, project_id: projectId, ...champs },
        update: champs,
      });

    try {
      await ecrire();
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Deux violations possibles : le SIREN pris par un autre projet entre
      // le contrôle et l'écriture, ou deux premiers PUT simultanés sur ce
      // projet. La première est un vrai conflit ; la seconde se rejoue une
      // fois et passe par la branche update.
      if (await this.sirenUtiliseAilleurs(ownerId, projectId, fiche.siren)) {
        throw new ConflictException(SIREN_DEJA_UTILISE);
      }
      try {
        await ecrire();
      } catch (retry) {
        if (isUniqueViolation(retry)) {
          throw new ConflictException('La fiche vient d’être modifiée par une autre demande. Recharge la page.');
        }
        throw retry;
      }
    }
    return this.obtenir(ownerId, projectId);
  }

  async supprimer(ownerId: string, projectId: string): Promise<EtatImmatriculation> {
    await this.projetDuProprietaire(ownerId, projectId);
    const fiche = await this.ficheDuProjet(ownerId, projectId);
    if (!fiche) {
      throw new NotFoundException('Aucune fiche d’immatriculation pour ce projet.');
    }
    if (fiche.capital_entry_id) {
      throw new ConflictException(
        'Une écriture de capital a été enregistrée à partir de cette fiche : elle ne peut plus être supprimée. ' +
          'Tu peux toujours la corriger.',
      );
    }
    // Gardée : une écriture de capital posée entre la lecture et la
    // suppression ne doit pas perdre sa fiche.
    const { count } = await this.prisma.company_registrations.deleteMany({
      where: { id: fiche.id, owner_id: ownerId, capital_entry_id: null },
    });
    if (count === 0) {
      throw new ConflictException('La fiche vient de changer (écriture de capital enregistrée ?). Recharge la page.');
    }
    return this.obtenir(ownerId, projectId);
  }

  async obtenirCapital(ownerId: string, projectId: string): Promise<EtatCapital> {
    const project = await this.projetDuProprietaire(ownerId, projectId);
    const [fiche, statuts] = await Promise.all([
      this.ficheDuProjet(ownerId, projectId),
      this.statutsDuProjet(ownerId, projectId),
    ]);
    return this.etatCapital(project.confirmed_legal_form, fiche, statuts);
  }

  /**
   * Enregistre l'écriture Débit 512 / Crédit 101 — sur demande explicite
   * seulement, et une seule fois par fiche.
   *
   * Ordre voulu : (1) réserver la fiche par une écriture gardée sur
   * `capital_entry_id: null` — deux POST simultanés ne peuvent pas passer
   * tous les deux ; (2) vérifier/ouvrir les comptes ; (3) `recordEntry` ;
   * (4) remplacer la réservation par l'identifiant de l'écriture. Un échec
   * avant (3) libère la réservation ; un échec en (4) est signalé tel quel.
   */
  async enregistrerCapital(ownerId: string, projectId: string): Promise<EtatCapital & { entryId: string }> {
    const project = await this.projetDuProprietaire(ownerId, projectId);
    const [fiche, statuts] = await Promise.all([
      this.ficheDuProjet(ownerId, projectId),
      this.statutsDuProjet(ownerId, projectId),
    ]);
    if (!fiche) {
      throw new NotFoundException('Saisis d’abord la fiche d’immatriculation.');
    }
    if (fiche.capital_entry_id) {
      throw new ConflictException(CAPITAL_DEJA_ENREGISTRE);
    }
    const etat = this.etatCapital(project.confirmed_legal_form, fiche, statuts);
    if (!etat.proposition) {
      throw new BadRequestException(etat.raison ?? 'Aucune écriture de capital à proposer.');
    }
    const proposition = etat.proposition;

    const reservation = randomUUID();
    const { count } = await this.prisma.company_registrations.updateMany({
      where: { id: fiche.id, owner_id: ownerId, capital_entry_id: null },
      data: { capital_entry_id: reservation },
    });
    if (count === 0) {
      throw new ConflictException(CAPITAL_DEJA_ENREGISTRE);
    }

    const owner = userOwner(ownerId);
    let entryId: string;
    try {
      const comptes = await this.assurerComptes(owner);
      const entry = await this.ledger.recordEntry(owner, {
        occurredOn: fiche.registered_on,
        label: proposition.libelle,
        reference: `SIREN ${fiche.siren}`,
        currency: 'EUR',
        lines: proposition.lignes.map((ligne) => ({
          accountId: comptes.get(ligne.compte)!,
          debitCents: ligne.debitCents,
          creditCents: ligne.creditCents,
        })),
      });
      entryId = entry.id;
    } catch (error) {
      await this.libererReservation(fiche.id, reservation, error);
      throw error;
    }

    try {
      const pose = await this.prisma.company_registrations.updateMany({
        where: { id: fiche.id, capital_entry_id: reservation },
        data: { capital_entry_id: entryId },
      });
      if (pose.count !== 1) throw new Error('réservation introuvable');
    } catch {
      throw new InternalServerErrorException(
        `L’écriture de capital a bien été enregistrée dans ta comptabilité (écriture ${entryId}), ` +
          'mais son lien avec la fiche d’immatriculation n’a pas pu être posé. État incohérent : ' +
          'ne l’enregistre pas une seconde fois et signale-le au support.',
      );
    }

    return { entryId, ...(await this.obtenirCapital(ownerId, projectId)) };
  }

  // ── Interne ─────────────────────────────────────────────────────────────

  private etatCapital(
    forme: string | null,
    fiche: LigneFiche | null,
    statuts: { status: string; legal_form: string; capital_cents: number } | null,
  ): EtatCapital {
    const dejaEnregistree = !!fiche?.capital_entry_id;
    if (!fiche) {
      return { proposition: null, dejaEnregistree, raison: 'Saisis d’abord la fiche d’immatriculation.' };
    }
    if (!estFormeAvecPersonneMorale(forme)) {
      return {
        proposition: null,
        dejaEnregistree,
        raison: 'Cette forme juridique n’a pas de capital social : aucune écriture de capital à proposer.',
      };
    }
    const proposition = propositionCapital({
      formeConfirmee: forme,
      statuts,
      legalName: fiche.legal_name,
      registeredOn: fiche.registered_on,
    });
    if (!proposition) {
      return {
        proposition: null,
        dejaEnregistree,
        raison: 'Le capital n’est connu qu’à partir de statuts retenus pour la forme juridique confirmée.',
      };
    }
    return { proposition, dejaEnregistree, raison: null };
  }

  /**
   * Les comptes 512 et 101 de la personne, ouverts par le service s'ils
   * manquent, avec les libellés du plan comptable du dépôt. Un compte
   * existant dans une autre devise est refusé ici, avec un message clair,
   * plutôt que par une erreur générique du moteur.
   */
  private async assurerComptes(owner: LedgerOwner): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    let existants = await this.ledger.listAccounts(owner);
    for (const voulu of [COMPTE_BANQUE, COMPTE_CAPITAL]) {
      let compte = existants.find((c) => c.code === voulu.code);
      if (!compte) {
        try {
          compte = await this.ledger.openAccount(owner, { code: voulu.code, label: voulu.label, kind: voulu.kind });
        } catch (error) {
          // Ouvert entre-temps par une autre demande : on le relit.
          existants = await this.ledger.listAccounts(owner);
          compte = existants.find((c) => c.code === voulu.code);
          if (!compte) throw error;
        }
      }
      if (compte.currency !== 'EUR') {
        throw new BadRequestException(
          `Ton compte ${voulu.code} est tenu en ${compte.currency} : l’écriture de capital, en euros, ne peut pas y être enregistrée.`,
        );
      }
      ids.set(voulu.code, compte.id);
    }
    return ids;
  }

  private async libererReservation(ficheId: string, reservation: string, cause: unknown): Promise<void> {
    try {
      await this.prisma.company_registrations.updateMany({
        where: { id: ficheId, capital_entry_id: reservation },
        data: { capital_entry_id: null },
      });
    } catch {
      const motif = cause instanceof Error ? cause.message : String(cause);
      throw new InternalServerErrorException(
        `L’écriture de capital n’a pas été enregistrée (${motif}), mais la fiche est restée marquée comme ` +
          'si elle l’était. État incohérent : signale-le au support.',
      );
    }
  }

  private ficheDuProjet(ownerId: string, projectId: string): Promise<LigneFiche | null> {
    return this.prisma.company_registrations.findFirst({
      where: { project_id: projectId, owner_id: ownerId },
    });
  }

  private statutsDuProjet(ownerId: string, projectId: string) {
    return this.prisma.company_bylaws.findFirst({
      where: { project_id: projectId, owner_id: ownerId },
      select: { status: true, legal_form: true, capital_cents: true, head_office: true },
    });
  }

  private async sirenUtiliseAilleurs(ownerId: string, projectId: string, siren: string): Promise<boolean> {
    const autre = await this.prisma.company_registrations.findFirst({
      where: { owner_id: ownerId, siren, project_id: { not: projectId } },
      select: { id: true },
    });
    return autre !== null;
  }

  private async projetDuProprietaire(ownerId: string, projectId: string) {
    const project = await this.prisma.projects.findFirst({
      where: { id: projectId, owner_id: ownerId },
      select: { id: true, title: true, confirmed_legal_form: true },
    });
    if (!project) {
      throw new NotFoundException('Projet introuvable.');
    }
    return project;
  }
}
