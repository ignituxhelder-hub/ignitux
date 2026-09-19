import { CONSTITUTION_ARTICLES } from './constitution-articles.js';
import {
  CONSTITUTION_RULES,
  hasBlockingViolation,
  reviewAction,
  type ConstitutionAction,
} from './constitution-rules.js';

describe('moteur de règles constitutionnel', () => {
  describe('cohérence du corpus', () => {
    it('chaque règle se rattache à un article qui existe', () => {
      const slugs = new Set(CONSTITUTION_ARTICLES.map((article) => article.slug));

      for (const rule of CONSTITUTION_RULES) {
        expect(slugs.has(rule.articleSlug)).toBe(true);
      }
    });

    it("chaque article marqué 'enforced' est couvert par au moins une règle", () => {
      // Le cœur de l'article 9 : si le moteur déclare appliquer un article,
      // il doit exister du code qui le vérifie. Ce test est la seule chose
      // qui empêche cette promesse de se périmer silencieusement.
      const covered = new Set(CONSTITUTION_RULES.map((rule) => rule.articleSlug));
      const enforced = CONSTITUTION_ARTICLES.filter(
        (article) => article.enforcement === 'enforced',
      );

      for (const article of enforced) {
        // L'article 9 est vérifié par ce test lui-même, pas par une règle
        // d'exécution : il porte sur le corpus, pas sur une action.
        if (article.slug === 'respect-de-la-constitution') continue;
        expect(covered.has(article.slug)).toBe(true);
      }
    });

    it('les numéros d\'articles sont uniques et continus', () => {
      const numbers = CONSTITUTION_ARTICLES.map((article) => article.number);
      expect(new Set(numbers).size).toBe(numbers.length);
      expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
      expect(numbers[0]).toBe(1);
      expect(numbers[numbers.length - 1]).toBe(numbers.length);
    });

    it('les slugs sont uniques', () => {
      const slugs = CONSTITUTION_ARTICLES.map((article) => article.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    });
  });

  describe('score-sans-source (article 10)', () => {
    it('refuse un score chiffré sans donnée source', () => {
      const violations = reviewAction({
        kind: 'publish_score',
        field: 'confiance',
        value: 0,
        hasSource: false,
      });

      expect(violations).toHaveLength(1);
      expect(violations[0].ruleId).toBe('score-sans-source');
      expect(violations[0].severity).toBe('blocking');
      expect(hasBlockingViolation(violations)).toBe(true);
    });

    it('accepte null en l\'absence de donnée source', () => {
      expect(
        reviewAction({ kind: 'publish_score', field: 'etincelle', value: null, hasSource: false }),
      ).toEqual([]);
    });

    it('accepte un score chiffré adossé à une donnée réelle', () => {
      expect(
        reviewAction({ kind: 'publish_score', field: 'etincelle', value: 7, hasSource: true }),
      ).toEqual([]);
    });
  });

  describe('provenance (article 12)', () => {
    it('signale sans bloquer un contenu IGINI dont le modèle est inconnu', () => {
      const violations = reviewAction({
        kind: 'persist_generated',
        entity: 'analyses',
        generatedBy: 'igini',
        generatedModel: null,
      });

      expect(violations).toHaveLength(1);
      expect(violations[0].ruleId).toBe('provenance-inconnue');
      expect(hasBlockingViolation(violations)).toBe(false);
    });

    it('bloque un contenu de modèle attribué à un humain', () => {
      const violations = reviewAction({
        kind: 'persist_generated',
        entity: 'analyses',
        generatedBy: 'human',
        generatedModel: 'claude-opus-5',
      });

      expect(violations.map((violation) => violation.ruleId)).toContain('provenance-usurpee');
      expect(hasBlockingViolation(violations)).toBe(true);
    });

    it('bloque une provenance qui n\'est ni igini ni human', () => {
      const violations = reviewAction({
        kind: 'persist_generated',
        entity: 'analyses',
        generatedBy: 'anonyme',
        generatedModel: 'claude-opus-5',
      });

      expect(violations.map((violation) => violation.ruleId)).toContain('provenance-usurpee');
    });

    it('accepte un contenu IGINI qui nomme son modèle', () => {
      expect(
        reviewAction({
          kind: 'persist_generated',
          entity: 'analyses',
          generatedBy: 'igini',
          generatedModel: 'claude-opus-5',
        }),
      ).toEqual([]);
    });
  });

  describe('autonomie supervisée (article 5)', () => {
    it('bloque une action autonome non journalisée', () => {
      const violations = reviewAction({
        kind: 'autonomous_act',
        engine: 'automation',
        journalled: false,
      });

      expect(violations[0].ruleId).toBe('automatisation-non-journalisee');
      expect(hasBlockingViolation(violations)).toBe(true);
    });

    it('accepte une action autonome journalisée', () => {
      expect(
        reviewAction({ kind: 'autonomous_act', engine: 'automation', journalled: true }),
      ).toEqual([]);
    });
  });

  describe("protection de l'Étincelle (article 8)", () => {
    it('bloque le remplacement d\'une trace existante', () => {
      const violations = reviewAction({
        kind: 'overwrite_spark',
        entity: 'analyses',
        mode: 'replace',
      });

      expect(violations[0].ruleId).toBe('etincelle-remplacee');
    });

    it('accepte un ajout de version', () => {
      expect(
        reviewAction({ kind: 'overwrite_spark', entity: 'analyses', mode: 'append' }),
      ).toEqual([]);
    });
  });

  it('une règle ne se prononce que sur le type d\'action qui la concerne', () => {
    // Garde-fou contre une régression classique : oublier le early-return
    // sur action.kind fait qu'une règle se déclenche sur n'importe quoi.
    const actions: ConstitutionAction[] = [
      { kind: 'publish_score', field: 'etincelle', value: 7, hasSource: true },
      {
        kind: 'persist_generated',
        entity: 'analyses',
        generatedBy: 'igini',
        generatedModel: 'claude-opus-5',
      },
      { kind: 'autonomous_act', engine: 'automation', journalled: true },
      { kind: 'overwrite_spark', entity: 'analyses', mode: 'append' },
    ];

    for (const action of actions) {
      expect(reviewAction(action)).toEqual([]);
    }
  });
});
