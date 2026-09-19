/**
 * Calculs et règles de la facturation — module pur, testable au centime.
 *
 * Tous les montants circulent en centimes entiers. La raison est simple :
 * en virgule flottante, 0.1 + 0.2 vaut 0.30000000000000004, et sur une
 * facture cet écart n'est pas une curiosité de langage, c'est un litige
 * avec un client ou un contrôle.
 *
 * Les quantités sont en millièmes (1000 = 1 unité) pour permettre « 1,5 h »,
 * et les taux de TVA en points de base (10000 = 100 %) pour permettre
 * « 5,5 % » — le tout sans jamais réintroduire de flottant.
 */

export const DOCUMENT_TYPES = ['devis', 'facture', 'avoir'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = ['brouillon', 'emis', 'paye', 'annule', 'refuse'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['virement', 'especes', 'carte', 'cheque', 'autre'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Préfixes de numérotation, distincts par type comme l'exige la règle. */
const NUMBER_PREFIXES: Record<DocumentType, string> = {
  devis: 'DEV',
  facture: 'FAC',
  avoir: 'AV',
};

export interface DocumentLine {
  quantity_milli: number;
  unit_price_cents: number;
  vat_rate_basis_points: number;
}

export interface DocumentTotals {
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
}

/**
 * Total d'une ligne hors taxes. L'arrondi se fait ici, une seule fois par
 * ligne : arrondir au total plutôt qu'à la ligne produit des écarts d'un
 * centime que le client remarque en recalculant.
 */
export function lineSubtotalCents(line: DocumentLine): number {
  return Math.round((line.quantity_milli * line.unit_price_cents) / 1000);
}

/**
 * TVA d'une ligne. Le taux est en points de base (1/10000) : 2000 = 20 %,
 * 550 = 5,5 %. Cette unité permet de représenter un taux à une décimale
 * sans jamais manipuler de flottant.
 */
export function lineVatCents(line: DocumentLine): number {
  return Math.round((lineSubtotalCents(line) * line.vat_rate_basis_points) / 10000);
}

export function computeTotals(lines: readonly DocumentLine[]): DocumentTotals {
  const subtotalCents = lines.reduce((total, line) => total + lineSubtotalCents(line), 0);
  const vatCents = lines.reduce((total, line) => total + lineVatCents(line), 0);
  return { subtotalCents, vatCents, totalCents: subtotalCents + vatCents };
}

/**
 * Reste dû sur un document. Peut être négatif si le client a trop versé —
 * on le laisse apparaître tel quel plutôt que de le ramener à zéro : un
 * trop-perçu masqué est un trop-perçu jamais remboursé.
 */
export function remainingCents(totalCents: number, payments: readonly { amount_cents: number }[]) {
  const paid = payments.reduce((total, payment) => total + payment.amount_cents, 0);
  return totalCents - paid;
}

export function formatDocumentNumber(type: DocumentType, year: number, sequence: number): string {
  return `${NUMBER_PREFIXES[type]}-${year}-${String(sequence).padStart(4, '0')}`;
}

/**
 * Transitions de statut autorisées.
 *
 * `emis` est le point de non-retour : au-delà, un document ne redevient
 * jamais brouillon. Permettre le retour en arrière viderait de son sens la
 * numérotation sans trou, puisqu'on pourrait « libérer » un numéro déjà
 * attribué.
 */
const ALLOWED_TRANSITIONS: Record<DocumentStatus, readonly DocumentStatus[]> = {
  brouillon: ['emis', 'annule'],
  emis: ['paye', 'annule', 'refuse'],
  paye: [],
  annule: [],
  refuse: [],
};

export function canTransition(from: DocumentStatus, to: DocumentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Un document émis (ou au-delà) est figé : plus aucune modification. */
export function isFrozen(status: DocumentStatus): boolean {
  return status !== 'brouillon';
}

export function isDocumentType(value: string): value is DocumentType {
  return DOCUMENT_TYPES.includes(value as DocumentType);
}

export function isDocumentStatus(value: string): value is DocumentStatus {
  return DOCUMENT_STATUSES.includes(value as DocumentStatus);
}

export function isPaymentMethod(value: string): value is PaymentMethod {
  return PAYMENT_METHODS.includes(value as PaymentMethod);
}

/**
 * Export CSV des documents. Les montants y sont écrits en euros avec deux
 * décimales et un point décimal — format attendu par les tableurs et les
 * logiciels comptables, indépendamment de la langue d'affichage.
 */
export function toCsv(
  rows: ReadonlyArray<{
    number: string;
    type: string;
    status: string;
    client_name: string;
    issued_at: Date | null;
    totalCents: number;
  }>,
): string {
  const header = 'numero;type;statut;client;date_emission;total_ttc';
  const lines = rows.map((row) =>
    [
      row.number,
      row.type,
      row.status,
      escapeCsv(row.client_name),
      row.issued_at ? row.issued_at.toISOString().slice(0, 10) : '',
      (row.totalCents / 100).toFixed(2),
    ].join(';'),
  );
  return [header, ...lines].join('\n');
}

/**
 * Un point-virgule ou un retour à la ligne dans un nom de client casserait
 * le fichier ; les guillemets internes se doublent, comme le veut le RFC.
 */
function escapeCsv(value: string): string {
  if (!/[;"\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
