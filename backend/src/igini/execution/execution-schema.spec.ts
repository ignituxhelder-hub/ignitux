import { ExecutionResultSchema } from './execution-schema.js';

describe('schéma du résultat d’exécution', () => {
  it('accepte des instructions avec leurs étapes', () => {
    const r = ExecutionResultSchema.safeParse({
      kind: 'instructions',
      titre: 't',
      contenu: 'c',
      etapes: ['a'],
    });
    expect(r.success).toBe(true);
  });

  it('accepte un livrable sans étapes', () => {
    expect(
      ExecutionResultSchema.safeParse({ kind: 'livrable', titre: 't', contenu: 'c' }).success,
    ).toBe(true);
  });

  it('refuse un genre inconnu', () => {
    expect(ExecutionResultSchema.safeParse({ kind: 'autre' }).success).toBe(false);
  });
});
