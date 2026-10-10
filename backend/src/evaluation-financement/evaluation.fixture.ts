/** Un rapport d'évaluation complet et valide, pour les tests. */
import type { EvaluationReport } from './evaluation-model.js';

export function rapport(partiel: Partial<EvaluationReport> = {}): EvaluationReport {
  return {
    verdict: 'financable_apres_corrections',
    resume: 'Une boulangerie de quartier qui cherche 40 000 € pour son four.',
    montantRecherche: { montantEuros: 40000, source: 'plan de financement' },
    usageDesFonds: 'Four, travaux, premier stock.',
    audit: { connu: ['analyse du marché'], manques: ['prévisionnel sur 3 ans'] },
    faisabilite: {
      marche: 'Quartier sans boulangerie.',
      modeleEconomique: 'Vente au comptoir.',
      capacite: 'À établir.',
    },
    dossier: [{ piece: 'Plan de financement', etat: 'prete' }],
    risques: [{ risque: 'Loyer élevé', gravite: 'moyenne', reduction: 'Négocier un pas-de-porte.' }],
    pistes: [{ type: 'Prêt bancaire', pourquoi: 'Matériel finançable.' }],
    prochainesEtapes: ['Établir un prévisionnel'],
    ...partiel,
  };
}
