/**
 * Vocabulaire du CRM.
 *
 * Les étapes sont une convention commerciale courante, pas une invention
 * d'Ignitux, et elles restent volontairement peu nombreuses : un pipeline
 * à douze colonnes se remplit mal et se lit encore moins bien.
 *
 * Ce qui n'est PAS ici mérite d'être dit : aucune probabilité de
 * conversion n'est associée à une étape, et aucun « chiffre d'affaires
 * prévisionnel pondéré » n'est calculé. Ces chiffres-là supposent un
 * historique de conversion qu'Ignitux n'a pas ; les produire reviendrait
 * à afficher une prévision inventée avec l'autorité d'une mesure
 * (Constitution, article 10).
 */

export const CRM_STAGES = [
  'nouveau',
  'contacte',
  'qualifie',
  'proposition',
  'gagne',
  'perdu',
] as const;
export type CrmStage = (typeof CRM_STAGES)[number];

export const CRM_STAGE_LABELS: Record<CrmStage, string> = {
  nouveau: 'Nouveau',
  contacte: 'Contacté',
  qualifie: 'Qualifié',
  proposition: 'Proposition envoyée',
  gagne: 'Gagné',
  perdu: 'Perdu',
};

/** Étapes qui closent la relation commerciale, dans un sens ou dans l'autre. */
export const CRM_CLOSED_STAGES: readonly CrmStage[] = ['gagne', 'perdu'];

export const CRM_KINDS = ['prospect', 'client', 'partenaire', 'autre'] as const;
export type CrmKind = (typeof CRM_KINDS)[number];

export const CRM_CHANNELS = ['appel', 'email', 'rendez_vous', 'note'] as const;
export type CrmChannel = (typeof CRM_CHANNELS)[number];

export interface PipelineSummaryEntry {
  stage: CrmStage;
  label: string;
  count: number;
}

/**
 * Répartition réelle des contacts par étape — un comptage, rien de plus.
 * Toutes les étapes sont présentes même à zéro : une colonne manquante se
 * lirait « cette étape n'existe pas » plutôt que « personne n'y est ».
 */
export function summarizePipeline(
  contacts: ReadonlyArray<{ stage: string }>,
): PipelineSummaryEntry[] {
  return CRM_STAGES.map((stage) => ({
    stage,
    label: CRM_STAGE_LABELS[stage],
    count: contacts.filter((contact) => contact.stage === stage).length,
  }));
}

export function isCrmStage(value: string): value is CrmStage {
  return CRM_STAGES.includes(value as CrmStage);
}

export function isCrmKind(value: string): value is CrmKind {
  return CRM_KINDS.includes(value as CrmKind);
}

export function isCrmChannel(value: string): value is CrmChannel {
  return CRM_CHANNELS.includes(value as CrmChannel);
}
