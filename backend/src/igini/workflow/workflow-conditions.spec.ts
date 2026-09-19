import {
  CONDITION_TYPES,
  evaluateCondition,
  isActionType,
  isConditionType,
  isProjectStage,
  type ProjectSnapshot,
} from './workflow-conditions.js';

function snapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    existingStages: new Set(),
    tasks: [],
    manuallyConfirmedPositions: new Set(),
    ...overrides,
  };
}

describe('conditions de transition', () => {
  describe('always', () => {
    it('est toujours satisfaite', () => {
      const verdict = evaluateCondition({ position: 0, type: 'always', value: null }, snapshot());

      expect(verdict.satisfied).toBe(true);
    });
  });

  describe('stage_exists', () => {
    it("est satisfaite quand l'étape existe", () => {
      const verdict = evaluateCondition(
        { position: 0, type: 'stage_exists', value: 'analysis' },
        snapshot({ existingStages: new Set(['analysis']) }),
      );

      expect(verdict.satisfied).toBe(true);
      expect(verdict.reason).toContain('Analyse');
    });

    it("n'est pas satisfaite quand l'étape manque, et dit laquelle", () => {
      const verdict = evaluateCondition(
        { position: 0, type: 'stage_exists', value: 'build_plan' },
        snapshot({ existingStages: new Set(['analysis']) }),
      );

      expect(verdict.satisfied).toBe(false);
      expect(verdict.reason).toContain('Plan de construction');
    });

    it('bloque sur une étape inconnue au lieu de laisser passer', () => {
      // Une condition qu'on ne sait pas évaluer ne doit jamais être
      // considérée comme satisfaite : ce serait inventer un franchissement.
      const verdict = evaluateCondition(
        { position: 0, type: 'stage_exists', value: 'etape-fantome' },
        snapshot({ existingStages: new Set(['analysis']) }),
      );

      expect(verdict.satisfied).toBe(false);
      expect(verdict.reason).toContain('mal définie');
    });

    it('bloque si aucune valeur n\'est fournie', () => {
      const verdict = evaluateCondition(
        { position: 0, type: 'stage_exists', value: null },
        snapshot(),
      );

      expect(verdict.satisfied).toBe(false);
    });
  });

  describe('tasks_done', () => {
    it('est satisfaite quand toutes les tâches de cette origine sont terminées', () => {
      const verdict = evaluateCondition(
        { position: 0, type: 'tasks_done', value: 'analysis' },
        snapshot({
          tasks: [
            { source: 'analysis', status: 'done' },
            { source: 'analysis', status: 'done' },
            { source: 'manual', status: 'pending' },
          ],
        }),
      );

      expect(verdict.satisfied).toBe(true);
    });

    it("compte les tâches restantes dans l'explication", () => {
      const verdict = evaluateCondition(
        { position: 0, type: 'tasks_done', value: 'analysis' },
        snapshot({
          tasks: [
            { source: 'analysis', status: 'done' },
            { source: 'analysis', status: 'pending' },
            { source: 'analysis', status: 'blocked' },
          ],
        }),
      );

      expect(verdict.satisfied).toBe(false);
      expect(verdict.reason).toContain('2 tâche(s) sur 3');
    });

    it("ne considère pas « zéro tâche » comme « tout est terminé »", () => {
      // Sans tâche, il n'y a rien à avoir terminé. Franchir l'étape
      // laisserait croire qu'un travail a été fait.
      const verdict = evaluateCondition(
        { position: 0, type: 'tasks_done', value: 'analysis' },
        snapshot({ tasks: [{ source: 'manual', status: 'done' }] }),
      );

      expect(verdict.satisfied).toBe(false);
      expect(verdict.reason).toContain('aucune tâche');
    });

    it('bloque si aucune origine de tâche n\'est précisée', () => {
      const verdict = evaluateCondition(
        { position: 0, type: 'tasks_done', value: null },
        snapshot(),
      );

      expect(verdict.satisfied).toBe(false);
      expect(verdict.reason).toContain('mal définie');
    });
  });

  describe('manual', () => {
    it("n'est pas satisfaite tant que la personne n'a pas validé", () => {
      const verdict = evaluateCondition({ position: 2, type: 'manual', value: null }, snapshot());

      expect(verdict.satisfied).toBe(false);
      expect(verdict.reason).toContain('validation');
    });

    it('est satisfaite une fois la position validée', () => {
      const verdict = evaluateCondition(
        { position: 2, type: 'manual', value: null },
        snapshot({ manuallyConfirmedPositions: new Set([2]) }),
      );

      expect(verdict.satisfied).toBe(true);
    });

    it("ne confond pas la validation d'une autre position", () => {
      const verdict = evaluateCondition(
        { position: 2, type: 'manual', value: null },
        snapshot({ manuallyConfirmedPositions: new Set([1, 3]) }),
      );

      expect(verdict.satisfied).toBe(false);
    });
  });

  it('chaque type de condition renvoie toujours une explication non vide', () => {
    // La condition doit pouvoir s'expliquer à qui la subit : une raison
    // vide dans l'interface équivaut à un blocage sans motif.
    for (const type of CONDITION_TYPES) {
      const verdict = evaluateCondition({ position: 0, type, value: null }, snapshot());
      expect(verdict.reason.length).toBeGreaterThan(0);
    }
  });

  describe('gardes de type', () => {
    it('reconnaît les étapes, conditions et actions valides', () => {
      expect(isProjectStage('analysis')).toBe(true);
      expect(isProjectStage('inconnue')).toBe(false);
      expect(isConditionType('manual')).toBe(true);
      expect(isConditionType('magique')).toBe(false);
      expect(isActionType('create_task')).toBe(true);
      expect(isActionType('lancer_une_ia')).toBe(false);
    });
  });
});
