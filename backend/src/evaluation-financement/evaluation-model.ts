/**
 * L'ÉVALUATION DE FINANCEMENT — ce que le rapport contient, et comment on le lit.
 *
 * Module pur : aucune base, aucun Nest. Spec :
 * docs/superpowers/specs/2026-10-11-evaluation-financement-design.md
 *
 * Le jugement (« est-ce finançable ? ») est séparé du plan (« comment
 * financer ? ») que rédige le générateur Financer : ce sont deux documents.
 */
import { z } from 'zod';

export const VERDICTS = ['financable', 'financable_apres_corrections', 'pas_financable_en_l_etat'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABEL: Record<Verdict, string> = {
  financable: 'Finançable en l’état',
  financable_apres_corrections: 'Finançable après corrections',
  pas_financable_en_l_etat: 'Pas finançable en l’état',
};

export const STATUTS = ['en_preparation', 'echec', 'en_revue', 'a_refaire', 'validee', 'refusee'] as const;
export type StatutEvaluation = (typeof STATUTS)[number];

/** Une seule évaluation active par projet : ces états-là bloquent une nouvelle demande. */
export const STATUTS_ACTIFS: readonly StatutEvaluation[] = ['en_preparation', 'en_revue', 'a_refaire'];

/** Au-delà, une préparation est considérée perdue (serveur redémarré pendant l'appel). */
export const DELAI_PREPARATION_MS = 10 * 60_000;

const RISQUES_MAX = 6;
const ETAPES_MAX = 5;

/*
 * Les bornes vont dans `.describe()`, pas dans `.min()/.max()` : c'est la
 * convention des autres schémas IGINI envoyés en sortie structurée. Elles
 * sont ensuite tenues par `normaliserRapport`.
 */
export const EvaluationReportSchema = z.object({
  verdict: z
    .enum(VERDICTS)
    .describe(
      "financable : un financeur peut dire oui sur le dossier tel qu'il est ; " +
        'financable_apres_corrections : oui possible une fois les manques comblés ; ' +
        "pas_financable_en_l_etat : en l'état, un financeur dirait non",
    ),
  resume: z
    .string()
    .describe('Cinq lignes au plus : le projet, le besoin, le verdict et sa raison principale'),
  montantRecherche: z.object({
    montantEuros: z
      .number()
      .nullable()
      .describe("Le montant recherché en euros, ou null s'il n'apparaît nulle part"),
    source: z
      .string()
      .describe("D'où vient ce montant (ex. « plan de financement »), ou « non renseigné »"),
  }),
  usageDesFonds: z.string().describe("À quoi servira l'argent, selon les données du projet"),
  audit: z.object({
    connu: z
      .array(z.string())
      .describe("Ce qu'Ignitux sait du projet, une ligne par élément, avec sa source"),
    manques: z
      .array(z.string())
      .describe("Ce qui manque pour qu'un financeur décide : chaque information absente, nommée comme un manque"),
  }),
  faisabilite: z.object({
    marche: z.string(),
    modeleEconomique: z.string(),
    capacite: z.string().describe('Le besoin face à la capacité de remboursement ou de rentabilité'),
  }),
  dossier: z
    .array(z.object({ piece: z.string(), etat: z.enum(['prete', 'manquante']) }))
    .describe("Les pièces qu'un financeur demandera ; « prete » seulement si elle existe dans les données"),
  risques: z
    .array(
      z.object({
        risque: z.string(),
        gravite: z.enum(['faible', 'moyenne', 'forte']),
        reduction: z.string().describe('Comment réduire ce risque'),
      }),
    )
    .describe("De 3 à 6 risques, les plus importants d'abord"),
  pistes: z
    .array(z.object({ type: z.string(), pourquoi: z.string() }))
    .describe(
      "Types de financement adaptés (prêt bancaire, prêt d'honneur, Bpifrance, subventions, apport, " +
        "investisseurs), à titre d'information",
    ),
  prochainesEtapes: z.array(z.string()).describe("De 3 à 5 actions concrètes, dans l'ordre"),
});

export type EvaluationReport = z.infer<typeof EvaluationReportSchema>;

export const SECTIONS_MODIFIABLES = [
  'verdict',
  'resume',
  'montantRecherche',
  'usageDesFonds',
  'audit',
  'faisabilite',
  'dossier',
  'risques',
  'pistes',
  'prochainesEtapes',
] as const;
export type SectionModifiable = (typeof SECTIONS_MODIFIABLES)[number];

/**
 * Tient les bornes que le modèle n'a pas respectées.
 *
 * Au-delà, on tronque. En deçà, on garde : un projet presque vide peut
 * honnêtement n'avoir que deux risques identifiables, et compléter la liste
 * serait inventer.
 */
export function normaliserRapport(r: EvaluationReport): EvaluationReport {
  return {
    ...r,
    risques: r.risques.slice(0, RISQUES_MAX),
    prochainesEtapes: r.prochainesEtapes.slice(0, ETAPES_MAX),
  };
}

/** Le statut tel qu'on doit le montrer : une préparation trop vieille est un échec. */
export function statutLu(statut: string, createdAt: Date, maintenant: Date): StatutEvaluation {
  if (
    statut === 'en_preparation' &&
    maintenant.getTime() - createdAt.getTime() > DELAI_PREPARATION_MS
  ) {
    return 'echec';
  }
  return statut as StatutEvaluation;
}
