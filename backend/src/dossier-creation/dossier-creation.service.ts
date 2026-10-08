import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { genererPdfDossier } from './dossier-pdf.js';
import { etapesPourForme, fraisPourForme, type Etape, type Frais } from './guide.js';
import { calculerPieces, familleDeForme, piecesCochablesPourForme, type Piece } from './pieces.js';

/** Contrainte unique violée (`P2002`) — même convention que statuts.service. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

export interface EtatDepot {
  status: 'preparation' | 'depose';
  checkedItems: string[];
  depositedAt: Date | null;
  filingReference: string | null;
}

export interface DossierCreation {
  forme: string | null;
  pieces: Piece[];
  etapes: readonly Etape[];
  frais: Frais;
  filing: EtatDepot;
}

const DEPOT_VIDE: EtatDepot = { status: 'preparation', checkedItems: [], depositedAt: null, filingReference: null };

/**
 * DOSSIER DE CRÉATION — préparer le dépôt, sans déposer.
 *
 * Ignitux ne dépose rien et ne paie rien, et le mandat n'est pas utilisé ici.
 * Aucun appel Claude. Tous les accès passent par la vérification
 * propriétaire du projet : un non-propriétaire, collaborateur compris,
 * reçoit un 404 (jamais de fuite d'existence).
 */
@Injectable()
export class DossierCreationService {
  constructor(private readonly prisma: PrismaService) {}

  async obtenir(ownerId: string, projectId: string): Promise<DossierCreation> {
    const { dossier } = await this.charger(ownerId, projectId);
    return dossier;
  }

  async cocher(ownerId: string, projectId: string, checkedItems: string[]): Promise<DossierCreation> {
    const project = await this.projetDuProprietaire(ownerId, projectId);

    // Le DTO a déjà refusé les ids inconnus et les doublons ; ici on refuse
    // les pièces qui ne concernent pas la forme confirmée (ex. capital pour
    // une micro-entreprise) : une case qui ne s'affiche pas ne se coche pas.
    const permises = piecesCochablesPourForme(project.confirmed_legal_form);
    const refusees = checkedItems.filter((id) => !(permises as string[]).includes(id));
    if (refusees.length > 0) {
      throw new BadRequestException(
        `Ces pièces ne concernent pas ce projet : ${refusees.join(', ')}.`,
      );
    }
    if (new Set(checkedItems).size !== checkedItems.length) {
      throw new BadRequestException('checkedItems ne doit pas contenir de doublons.');
    }

    const ecrire = () =>
      this.prisma.creation_filings.upsert({
        where: { project_id: projectId },
        create: { owner_id: ownerId, project_id: projectId, checked_items: checkedItems },
        update: { checked_items: checkedItems },
      });
    try {
      await ecrire();
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Deux premiers PATCH simultanés : l'autre vient de créer la ligne.
      // Comme assurerLigne, ce n'est pas une erreur — on réessaie une fois,
      // et ce second upsert passe par la branche update.
      try {
        await ecrire();
      } catch (retry) {
        if (isUniqueViolation(retry)) {
          throw new ConflictException('Le dossier vient d’être modifié par une autre demande. Recharge la page.');
        }
        throw retry;
      }
    }
    return this.obtenir(ownerId, projectId);
  }

  async marquerDepose(ownerId: string, projectId: string, filingReference?: string): Promise<DossierCreation> {
    await this.projetDuProprietaire(ownerId, projectId);
    await this.assurerLigne(ownerId, projectId);

    // Écriture gardée sur le statut : deux « Marquer comme déposé »
    // simultanés ne réécrivent pas la date ni la référence du premier.
    const { count } = await this.prisma.creation_filings.updateMany({
      where: { project_id: projectId, owner_id: ownerId, status: 'preparation' },
      data: {
        status: 'depose',
        deposited_at: new Date(),
        filing_reference: filingReference?.trim() || null,
      },
    });
    if (count === 0) {
      throw new ConflictException('Ce dossier est déjà marqué comme déposé.');
    }
    return this.obtenir(ownerId, projectId);
  }

  async rouvrir(ownerId: string, projectId: string): Promise<DossierCreation> {
    await this.projetDuProprietaire(ownerId, projectId);
    const { count } = await this.prisma.creation_filings.updateMany({
      where: { project_id: projectId, owner_id: ownerId, status: 'depose' },
      data: { status: 'preparation', deposited_at: null, filing_reference: null },
    });
    if (count === 0) {
      throw new ConflictException('Ce dossier n’est pas marqué comme déposé.');
    }
    return this.obtenir(ownerId, projectId);
  }

  async recapitulatifPdf(ownerId: string, projectId: string): Promise<Buffer> {
    const { project, bylaws, dossier } = await this.charger(ownerId, projectId);
    // Une micro-entreprise ou une EI n'a pas de statuts : des statuts restés
    // d'une forme précédente ne doivent jamais apparaître dans son récapitulatif.
    const societe = familleDeForme(dossier.forme) === 'societe';
    return genererPdfDossier({
      projetTitre: project.title,
      forme: dossier.forme,
      statuts: societe && bylaws
        ? {
            headOffice: bylaws.head_office,
            capitalCents: bylaws.capital_cents,
            associes: bylaws.associates.map((a) => ({ fullName: a.full_name, shareBasisPoints: a.share_basis_points })),
          }
        : null,
      pieces: dossier.pieces,
      frais: dossier.frais,
      depot: dossier.filing,
    });
  }

  private async charger(ownerId: string, projectId: string) {
    const project = await this.projetDuProprietaire(ownerId, projectId);
    const [bylaws, identites, mandat, filing] = await Promise.all([
      this.prisma.company_bylaws.findFirst({
        where: { project_id: projectId, owner_id: ownerId },
        include: { associates: true },
      }),
      // Le statut seulement : jamais les images de la pièce d'identité.
      this.prisma.identity_verifications.findMany({
        where: { owner_id: ownerId },
        select: { status: true },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.mandates.findFirst({
        where: { project_id: projectId, owner_id: ownerId, status: 'active', signed_at: { not: null } },
        select: { id: true },
      }),
      this.prisma.creation_filings.findFirst({
        where: { project_id: projectId, owner_id: ownerId },
      }),
    ]);

    const forme = project.confirmed_legal_form ?? null;
    // Après un changement de forme (SAS → micro-entreprise), des cases
    // devenues sans objet (capital_depose…) peuvent rester en base. On ne les
    // renvoie pas : le client repart de cette liste pour son PATCH, qui serait
    // sinon refusé (400) et verrouillerait toutes les cases.
    const cochables: readonly string[] = piecesCochablesPourForme(forme);
    const depot: EtatDepot = filing
      ? {
          status: filing.status === 'depose' ? 'depose' : 'preparation',
          checkedItems: filing.checked_items.filter((id) => cochables.includes(id)),
          depositedAt: filing.deposited_at,
          filingReference: filing.filing_reference,
        }
      : { ...DEPOT_VIDE, checkedItems: [] };

    const dossier: DossierCreation = {
      forme,
      pieces: calculerPieces({
        forme,
        statuts: bylaws ? { status: bylaws.status, legalForm: bylaws.legal_form } : null,
        identites,
        mandatActifSigne: mandat !== null,
        piecesCochees: depot.checkedItems,
      }),
      etapes: etapesPourForme(forme),
      frais: fraisPourForme(forme),
      filing: depot,
    };
    return { project, bylaws, dossier };
  }

  /** Crée la ligne si elle n'existe pas encore ; une création concurrente n'est pas une erreur. */
  private async assurerLigne(ownerId: string, projectId: string) {
    try {
      await this.prisma.creation_filings.upsert({
        where: { project_id: projectId },
        create: { owner_id: ownerId, project_id: projectId },
        update: {},
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
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
