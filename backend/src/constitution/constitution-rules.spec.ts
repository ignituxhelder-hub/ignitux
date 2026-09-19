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
        // L'article 24 (Constitution Suprême) est vérifié par ce test
        // lui-même, pas par une règle d'exécution : il porte sur le
        // corpus, pas sur une action.
        if (article.slug === 'v1-24-constitution-supreme') continue;
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

  describe('transparence (article 11)', () => {
    it('bloque une décision que le moteur ne sait pas expliquer', () => {
      const violations = reviewAction({
        kind: 'explain_decision',
        engine: 'workflow',
        reason: '   ',
      });

      expect(violations[0].ruleId).toBe('transition-inexplicable');
      expect(hasBlockingViolation(violations)).toBe(true);
    });

    it('accepte une décision motivée', () => {
      expect(
        reviewAction({
          kind: 'explain_decision',
          engine: 'workflow',
          reason: "L'étape « Analyse » existe pour ce projet.",
        }),
      ).toEqual([]);
    });
  });

  describe('mémoire responsable (article 12)', () => {
    it('bloque un souvenir sans auteur', () => {
      const violations = reviewAction({ kind: 'persist_memory', hasAuthor: false });

      expect(violations[0].ruleId).toBe('memoire-sans-auteur');
    });

    it('accepte un souvenir rattaché à son auteur', () => {
      expect(reviewAction({ kind: 'persist_memory', hasAuthor: true })).toEqual([]);
    });
  });

  describe('vie privée (article 13)', () => {
    it('bloque la création directe d\'un projet public', () => {
      // Attrape une régression où `is_public` prendrait `true` par défaut :
      // un basculement silencieux que personne ne remarquerait.
      const violations = reviewAction({ kind: 'create_project', isPublic: true });

      expect(violations[0].ruleId).toBe('partage-par-defaut');
    });

    it('accepte un projet créé privé', () => {
      expect(reviewAction({ kind: 'create_project', isPublic: false })).toEqual([]);
    });
  });

  describe('règles locales (article 15)', () => {
    it('bloque une règle de pays sans source officielle', () => {
      const violations = reviewAction({
        kind: 'publish_local_rule',
        country: 'FR',
        slug: 'statut-juridique',
        sourceUrl: null,
      });

      expect(violations[0].ruleId).toBe('regle-locale-sans-source');
    });

    it('bloque aussi une source vide', () => {
      expect(
        reviewAction({
          kind: 'publish_local_rule',
          country: 'FR',
          slug: 'x',
          sourceUrl: '   ',
        }),
      ).toHaveLength(1);
    });

    it('accepte une règle qui cite sa source', () => {
      expect(
        reviewAction({
          kind: 'publish_local_rule',
          country: 'FR',
          slug: 'statut-juridique',
          sourceUrl: 'https://entreprendre.service-public.fr/vosdroits/N31676',
        }),
      ).toEqual([]);
    });
  });

  describe('financement éthique (article 22)', () => {
    it('refuse une répartition qui ferait perdre la majorité au porteur', () => {
      // Modèle IGNITUX : l'entrepreneur reste propriétaire principal.
      const violations = reviewAction({
        kind: 'set_equity',
        holderName: 'Ignitux',
        isFounder: false,
        founderBasisPointsAfter: 4900,
        totalBasisPointsAfter: 10000,
      });

      expect(violations[0].ruleId).toBe('majorite-du-porteur');
      expect(violations[0].detail).toContain('49.00 %');
    });

    it('refuse aussi une répartition exactement à 50 %', () => {
      // 50/50 n'est pas la majorité : le porteur ne serait plus principal.
      expect(
        reviewAction({
          kind: 'set_equity',
          holderName: 'Ignitux',
          isFounder: false,
          founderBasisPointsAfter: 5000,
          totalBasisPointsAfter: 10000,
        }),
      ).toHaveLength(1);
    });

    it('accepte la répartition 51/49 du modèle IGNITUX', () => {
      expect(
        reviewAction({
          kind: 'set_equity',
          holderName: 'Porteur',
          isFounder: true,
          founderBasisPointsAfter: 5100,
          totalBasisPointsAfter: 10000,
        }),
      ).toEqual([]);
    });

    it('accepte le porteur remonté à 100 % (objectif du modèle)', () => {
      expect(
        reviewAction({
          kind: 'set_equity',
          holderName: 'Porteur',
          isFounder: true,
          founderBasisPointsAfter: 10000,
          totalBasisPointsAfter: 10000,
        }),
      ).toEqual([]);
    });

    it("ne se prononce pas tant que la répartition ne boucle pas à 100 %", () => {
      // Bloquer sur une donnée partielle empêcherait de saisir la
      // répartition détenteur par détenteur, ce qui est le cas normal.
      expect(
        reviewAction({
          kind: 'set_equity',
          holderName: 'Porteur',
          isFounder: true,
          founderBasisPointsAfter: 3000,
          totalBasisPointsAfter: 3000,
        }),
      ).toEqual([]);
    });
  });

  describe('responsabilité (article 7)', () => {
    it("refuse de rendre une indication sans son avertissement", () => {
      // L'article dit que la personne reste responsable de ses décisions.
      // Encore faut-il qu'elle sache sur quoi elle décide seule : c'est
      // exactement ce que porte l'avertissement de chaque module.
      const violations = reviewAction({
        kind: 'publish_guidance',
        module: 'facturation',
        notice: null,
      });

      expect(violations[0].ruleId).toBe('conseil-sans-avertissement');
      expect(violations[0].articleSlug).toBe('v1-07-responsabilite');
      expect(hasBlockingViolation(violations)).toBe(true);
    });

    it('refuse aussi un avertissement vide', () => {
      // Une chaîne blanche passerait un simple test de présence tout en
      // n'avertissant de rien.
      expect(
        reviewAction({ kind: 'publish_guidance', module: 'conformité', notice: '   ' }),
      ).toHaveLength(1);
    });

    it('nomme le module fautif dans le motif', () => {
      const violations = reviewAction({
        kind: 'publish_guidance',
        module: 'rachat progressif',
        notice: null,
      });

      expect(violations[0].detail).toContain('rachat progressif');
    });

    it('accepte une indication accompagnée de son avertissement', () => {
      expect(
        reviewAction({
          kind: 'publish_guidance',
          module: 'conformité',
          notice: "Ignitux ne vérifie pas ta situation : confirme auprès d'une source officielle.",
        }),
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
      { kind: 'explain_decision', engine: 'workflow', reason: 'Motif clair.' },
      { kind: 'persist_memory', hasAuthor: true },
      { kind: 'create_project', isPublic: false },
      { kind: 'publish_local_rule', country: 'FR', slug: 'x', sourceUrl: 'https://exemple.gouv.fr' },
      {
        kind: 'set_equity',
        holderName: 'Porteur',
        isFounder: true,
        founderBasisPointsAfter: 5100,
        totalBasisPointsAfter: 10000,
      },
      { kind: 'publish_guidance', module: 'facturation', notice: 'Avertissement réel.' },
    ];

    for (const action of actions) {
      expect(reviewAction(action)).toEqual([]);
    }
  });
});
