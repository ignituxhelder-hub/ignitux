import {
  CRM_CLOSED_STAGES,
  CRM_STAGES,
  CRM_STAGE_LABELS,
  isCrmChannel,
  isCrmKind,
  isCrmStage,
  summarizePipeline,
} from './crm-pipeline.js';

describe('pipeline CRM', () => {
  it('renvoie toutes les étapes, y compris celles à zéro', () => {
    // Une colonne absente se lirait « cette étape n'existe pas » plutôt
    // que « personne n'y est » — deux choses très différentes.
    const summary = summarizePipeline([{ stage: 'nouveau' }]);

    expect(summary).toHaveLength(CRM_STAGES.length);
    expect(summary.every((entry) => typeof entry.count === 'number')).toBe(true);
    expect(summary.find((entry) => entry.stage === 'perdu')?.count).toBe(0);
  });

  it('compte les contacts par étape', () => {
    const summary = summarizePipeline([
      { stage: 'nouveau' },
      { stage: 'nouveau' },
      { stage: 'gagne' },
    ]);

    expect(summary.find((entry) => entry.stage === 'nouveau')?.count).toBe(2);
    expect(summary.find((entry) => entry.stage === 'gagne')?.count).toBe(1);
  });

  it('ignore une étape inconnue plutôt que de créer une colonne fantôme', () => {
    const summary = summarizePipeline([{ stage: 'etape-disparue' }]);

    expect(summary.reduce((total, entry) => total + entry.count, 0)).toBe(0);
    expect(summary).toHaveLength(CRM_STAGES.length);
  });

  it('conserve les étapes dans leur ordre commercial', () => {
    expect(summarizePipeline([]).map((entry) => entry.stage)).toEqual([...CRM_STAGES]);
  });

  it('associe un libellé français à chaque étape', () => {
    for (const stage of CRM_STAGES) {
      expect(CRM_STAGE_LABELS[stage]).toBeTruthy();
    }
  });

  it("nomme les deux étapes de clôture", () => {
    expect([...CRM_CLOSED_STAGES]).toEqual(['gagne', 'perdu']);
  });

  it("n'expose aucune probabilité de conversion", () => {
    // Garde volontaire : une probabilité par étape supposerait un
    // historique de conversion qu'Ignitux n'a pas. L'ajouter produirait
    // une prévision inventée avec l'autorité d'une mesure (article 10).
    const summary = summarizePipeline([{ stage: 'proposition' }]);

    for (const entry of summary) {
      expect(Object.keys(entry).sort()).toEqual(['count', 'label', 'stage']);
    }
  });

  describe('gardes de type', () => {
    it('reconnaît les valeurs valides et rejette les autres', () => {
      expect(isCrmStage('qualifie')).toBe(true);
      expect(isCrmStage('presque-signe')).toBe(false);
      expect(isCrmKind('client')).toBe(true);
      expect(isCrmKind('ami')).toBe(false);
      expect(isCrmChannel('rendez_vous')).toBe(true);
      expect(isCrmChannel('pigeon')).toBe(false);
    });
  });
});
