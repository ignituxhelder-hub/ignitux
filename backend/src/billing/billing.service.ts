import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConstitutionService } from '../constitution/constitution.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BILLING_DISCLAIMER, BILLING_ENFORCED_RULES } from './billing-legal.js';
import {
  canTransition,
  computeTotals,
  formatDocumentNumber,
  isDocumentStatus,
  isFrozen,
  remainingCents,
  toCsv,
  type DocumentStatus,
  type DocumentType,
  type PaymentMethod,
} from './billing-rules.js';

export interface DocumentLineInput {
  label: string;
  quantityMilli: number;
  unitPriceCents: number;
  vatRateBasisPoints?: number;
}

export interface CreateDocumentInput {
  type: DocumentType;
  clientName: string;
  clientDetails?: string;
  contactId?: string;
  projectId?: string;
  notes?: string;
  dueAt?: Date;
  correctsId?: string;
  lines: DocumentLineInput[];
}

/**
 * FACTURATION — devis, factures, avoirs, règlements.
 *
 * Le service applique trois règles et refuse de les contourner, y compris
 * à la demande de l'utilisateur : numérotation sans trou, immuabilité après
 * émission, correction par avoir uniquement. Voir billing-legal.ts pour ce
 * que cela ne garantit pas.
 */
/**
 * Nombre d'essais de numérotation avant d'abandonner.
 *
 * Quatre, c'était le chiffre d'origine, et le raisonnement tenait pour deux
 * requêtes — un double-clic. Mesuré contre la vraie base : à deux, trois et
 * quatre créations simultanées, tout passe. **À huit, la moitié échouait en
 * 500.**
 *
 * La cause n'était pas le nombre d'essais, c'était qu'ils repartaient tous
 * en même temps. Huit requêtes qui lisent le même maximum, échouent
 * ensemble, puis relisent ensemble se retrouvent au même endroit au coup
 * suivant : le réessai reproduisait la course au lieu de la défaire. Monter
 * ce plafond seul n'aurait fait que retarder l'échec.
 */
const MAX_NUMBERING_ATTEMPTS = 8;

/**
 * Le recul entre deux essais, tiré au hasard.
 *
 * C'est le hasard qui fait le travail, pas la durée : il désynchronise des
 * requêtes parties ensemble, pour qu'au coup suivant elles ne lisent plus le
 * même maximum. Quelques millisecondes suffisent — on borne bas pour qu'un
 * double-clic reste instantané aux yeux de la personne.
 */
function reculAleatoireMs(essai: number): number {
  return Math.floor(Math.random() * 12 * (essai + 1)) + 3;
}

/**
 * Prisma signale une contrainte unique violée par le code `P2002`. On le
 * teste sur la forme plutôt qu'en important la classe d'erreur : le
 * client est généré, et se lier à sa hiérarchie de classes rendrait ce
 * fichier sensible à une régénération.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly constitutionService: ConstitutionService,
  ) {}

  async getLegalNotice() {
    // Article 7 : on ne rend pas une indication sans dire ce qu'Ignitux
    // ne décide pas. Retirer l'avertissement fait échouer l'appel.
    await this.constitutionService.guard({
      kind: 'publish_guidance',
      module: 'facturation',
      notice: BILLING_DISCLAIMER,
    });

    return { disclaimer: BILLING_DISCLAIMER, enforcedRules: BILLING_ENFORCED_RULES };
  }

  async createDocument(ownerId: string, input: CreateDocumentInput) {
    if (input.lines.length === 0) {
      throw new BadRequestException('Un document doit comporter au moins une ligne.');
    }
    if (input.type === 'avoir' && !input.correctsId) {
      throw new BadRequestException(
        "Un avoir doit référencer le document qu'il corrige : un avoir orphelin ne corrige rien.",
      );
    }
    if (input.correctsId) {
      await this.assertCorrectableDocument(ownerId, input.correctsId);
    }
    if (input.contactId) {
      await this.assertOwnsContact(ownerId, input.contactId);
    }

    const year = new Date().getFullYear();

    // Le numéro se calcule depuis le maximum existant : deux créations
    // simultanées visent donc le même, et la contrainte unique en base en
    // refuse une. Ce refus est voulu — mieux vaut échouer que produire
    // deux documents portant le même numéro.
    //
    // Mais échouer par une 500 ne l'est pas. On réessaie, en s'écartant
    // d'un délai tiré au hasard : sans lui, les requêtes qui ont perdu la
    // course la recommencent toutes ensemble et se heurtent au même
    // endroit. C'est ce qui se passait — huit créations simultanées, quatre
    // réussites, quatre erreurs 500, mesurées contre la vraie base.
    //
    // Et si le numéro reste imprenable au bout de huit essais, le bon mot
    // n'est toujours pas « erreur » : c'est un conflit, il est passager, et
    // la personne n'a rien à réparer. On le dit, en 409.
    for (let attempt = 0; ; attempt += 1) {
      const sequence = await this.nextSequence(ownerId, input.type, year);

      try {
        return await this.prisma.billing_documents.create({
          data: {
            owner_id: ownerId,
            contact_id: input.contactId ?? null,
            project_id: input.projectId ?? null,
            type: input.type,
            year,
            sequence,
            number: formatDocumentNumber(input.type, year, sequence),
            client_name: input.clientName,
            client_details: input.clientDetails,
            notes: input.notes,
            due_at: input.dueAt,
            corrects_id: input.correctsId ?? null,
            lines: {
              create: input.lines.map((line, index) => ({
                position: index,
                label: line.label,
                quantity_milli: line.quantityMilli,
                unit_price_cents: line.unitPriceCents,
                vat_rate_basis_points: line.vatRateBasisPoints ?? 0,
              })),
            },
          },
          include: { lines: { orderBy: { position: 'asc' } } },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        if (attempt >= MAX_NUMBERING_ATTEMPTS - 1) {
          throw new ConflictException(
            'Plusieurs documents ont été créés exactement en même temps, et le numéro ' +
              "suivant n'a pas pu être attribué. Rien n'a été enregistré : réessaie, ce " +
              'sera immédiat. La numérotation ne saute aucun numéro — c’est pour cela ' +
              'qu’elle refuse plutôt que d’en inventer un.',
          );
        }
        await new Promise((resoudre) => setTimeout(resoudre, reculAleatoireMs(attempt)));
      }
    }
  }

  async listDocuments(ownerId: string, filters: { type?: DocumentType; status?: DocumentStatus } = {}) {
    const documents = await this.prisma.billing_documents.findMany({
      where: {
        owner_id: ownerId,
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: [{ year: 'desc' }, { sequence: 'desc' }],
      include: { lines: true, payments: true },
    });

    // Article 7 : on ne rend pas une indication sans dire ce qu'Ignitux
    // ne décide pas. Retirer l'avertissement fait échouer l'appel.
    await this.constitutionService.guard({
      kind: 'publish_guidance',
      module: 'facturation',
      notice: BILLING_DISCLAIMER,
    });

    return {
      disclaimer: BILLING_DISCLAIMER,
      documents: documents.map((document) => this.withTotals(document)),
    };
  }

  async getDocument(ownerId: string, documentId: string) {
    const document = await this.prisma.billing_documents.findFirst({
      where: { id: documentId, owner_id: ownerId },
      include: {
        lines: { orderBy: { position: 'asc' } },
        payments: { orderBy: { received_at: 'desc' } },
        corrects: true,
        corrected_by: true,
      },
    });
    if (!document) {
      throw new NotFoundException('Document introuvable.');
    }
    return this.withTotals(document);
  }

  /**
   * Modification réservée au brouillon. Le refus est explicite plutôt que
   * silencieux : l'utilisateur doit comprendre qu'il lui faut un avoir, pas
   * croire que sa modification n'a pas été prise en compte.
   */
  async updateDraft(ownerId: string, documentId: string, input: Partial<CreateDocumentInput>) {
    const document = await this.findForOwner(ownerId, documentId);
    this.assertEditable(document.status);

    return this.prisma.billing_documents.update({
      where: { id: documentId },
      data: {
        client_name: input.clientName,
        client_details: input.clientDetails,
        notes: input.notes,
        due_at: input.dueAt,
        ...(input.lines
          ? {
              lines: {
                deleteMany: {},
                create: input.lines.map((line, index) => ({
                  position: index,
                  label: line.label,
                  quantity_milli: line.quantityMilli,
                  unit_price_cents: line.unitPriceCents,
                  vat_rate_basis_points: line.vatRateBasisPoints ?? 0,
                })),
              },
            }
          : {}),
      },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
  }

  async deleteDraft(ownerId: string, documentId: string) {
    const document = await this.findForOwner(ownerId, documentId);
    this.assertEditable(document.status);

    // Supprimer un brouillon libère son numéro de séquence, et c'est
    // volontaire : un brouillon n'a jamais été émis, donc son numéro n'a
    // jamais existé pour personne. La séquence se recalcule à partir du
    // maximum réellement présent.
    await this.prisma.billing_documents.delete({ where: { id: documentId } });
  }

  async changeStatus(ownerId: string, documentId: string, status: DocumentStatus) {
    const document = await this.findForOwner(ownerId, documentId);
    const current = isDocumentStatus(document.status) ? document.status : 'brouillon';

    if (!canTransition(current, status)) {
      throw new BadRequestException(
        `Passage de « ${current} » à « ${status} » impossible : un document émis ne redevient jamais brouillon, sinon la numérotation sans trou perdrait tout son sens.`,
      );
    }

    return this.prisma.billing_documents.update({
      where: { id: documentId },
      data: {
        status,
        // La date d'émission est posée une seule fois, au passage à « emis ».
        ...(status === 'emis' && !document.issued_at ? { issued_at: new Date() } : {}),
      },
    });
  }

  async addPayment(
    ownerId: string,
    documentId: string,
    amountCents: number,
    method: PaymentMethod,
    receivedAt?: Date,
    note?: string,
  ) {
    const document = await this.findForOwner(ownerId, documentId);
    if (document.status === 'brouillon') {
      throw new BadRequestException(
        "Un brouillon ne peut pas recevoir de règlement : il n'a pas encore été émis.",
      );
    }
    if (amountCents <= 0) {
      throw new BadRequestException('Le montant du règlement doit être strictement positif.');
    }

    const payment = await this.prisma.billing_payments.create({
      data: {
        document_id: documentId,
        amount_cents: amountCents,
        method,
        received_at: receivedAt ?? new Date(),
        note,
      },
    });

    // Passage automatique à « payé » quand le solde est couvert. C'est la
    // seule action que ce module fait sans qu'on la lui demande, et elle
    // est déductible d'un calcul exact, pas d'une estimation.
    await this.markPaidIfSettled(documentId);

    return payment;
  }

  async exportCsv(ownerId: string): Promise<string> {
    const documents = await this.prisma.billing_documents.findMany({
      where: { owner_id: ownerId },
      orderBy: [{ year: 'asc' }, { type: 'asc' }, { sequence: 'asc' }],
      include: { lines: true },
    });

    return toCsv(
      documents.map((document) => ({
        number: document.number,
        type: document.type,
        status: document.status,
        client_name: document.client_name,
        issued_at: document.issued_at,
        totalCents: computeTotals(document.lines).totalCents,
      })),
    );
  }

  private async markPaidIfSettled(documentId: string): Promise<void> {
    const document = await this.prisma.billing_documents.findFirst({
      where: { id: documentId },
      include: { lines: true, payments: true },
    });
    if (!document || document.status !== 'emis') return;

    const { totalCents } = computeTotals(document.lines);
    if (remainingCents(totalCents, document.payments) <= 0) {
      await this.prisma.billing_documents.update({
        where: { id: documentId },
        data: { status: 'paye' },
      });
    }
  }

  /**
   * Prochain numéro de séquence. Calculé à partir du maximum existant
   * plutôt que depuis un compteur séparé : un compteur peut diverger de la
   * réalité des lignes, la contrainte unique en base ne le peut pas. En cas
   * de course, l'insertion échoue plutôt que de produire un doublon.
   */
  private async nextSequence(ownerId: string, type: DocumentType, year: number): Promise<number> {
    const last = await this.prisma.billing_documents.findFirst({
      where: { owner_id: ownerId, type, year },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    return (last?.sequence ?? 0) + 1;
  }

  private withTotals<
    T extends {
      lines: Array<{ quantity_milli: number; unit_price_cents: number; vat_rate_basis_points: number }>;
      payments?: Array<{ amount_cents: number }>;
    },
  >(document: T) {
    const totals = computeTotals(document.lines);
    return {
      ...document,
      totals,
      remainingCents: remainingCents(totals.totalCents, document.payments ?? []),
    };
  }

  private assertEditable(status: string): void {
    if (isFrozen(isDocumentStatus(status) ? status : 'emis')) {
      throw new BadRequestException(
        "Ce document a été émis : il ne peut plus être modifié ni supprimé. Pour le corriger, crée un avoir qui le référence.",
      );
    }
  }

  private async assertCorrectableDocument(ownerId: string, documentId: string) {
    const document = await this.findForOwner(ownerId, documentId);
    if (document.status === 'brouillon') {
      throw new BadRequestException(
        "On ne corrige pas un brouillon par un avoir : il suffit de le modifier.",
      );
    }
    return document;
  }

  private async assertOwnsContact(ownerId: string, contactId: string) {
    const contact = await this.prisma.crm_contacts.findFirst({
      where: { id: contactId, owner_id: ownerId },
    });
    if (!contact) {
      throw new NotFoundException('Contact introuvable.');
    }
  }

  private async findForOwner(ownerId: string, documentId: string) {
    const document = await this.prisma.billing_documents.findFirst({
      where: { id: documentId, owner_id: ownerId },
    });
    if (!document) {
      throw new NotFoundException('Document introuvable.');
    }
    return document;
  }
}
