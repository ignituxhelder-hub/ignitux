import {
  journeyView,
  nextStep,
  phaseOf,
  SECTION_RULES,
  SEUIL_ETINCELLE,
  type ProjectFacts,
} from './journey-model.js';

/** Un projet qui vient de naître : un titre, rien de plus. */
function vierge(overrides: Partial<ProjectFacts> = {}): ProjectFacts {
  return {
    hasDescription: false,
    analyses: 0,
    etincelle: null,
    buildPlans: 0,
    financingPlans: 0,
    developmentPlans: 0,
    transmissionPlans: 0,
    tasks: 0,
    openTasks: 0,
    memories: 0,
    concepts: 0,
    complianceChecks: 0,
    completedComplianceChecks: 0,
    automationRuns: 0,
    workflows: 0,
    financingRounds: 0,
    equityHolders: 0,
    collaborators: 0,
    financingOpened: false,
    ...overrides,
  };
}

const visibles = (f: ProjectFacts) => journeyView(f).visible.map((s) => s.section);

describe('parcours — ce qui se voit', () => {
  // Le cœur du refactor : on arrive, on voit une chose à faire.
  it("ne montre que l'analyse sur un projet vierge", () => {
    expect(visibles(vierge())).toEqual(['analyse']);
  });

  it('ouvre les sections au fur et à mesure, jamais toutes d’un coup', () => {
    const etapes = [
      vierge({ hasDescription: true }),
      vierge({ hasDescription: true, analyses: 1, concepts: 3, memories: 1 }),
      vierge({ hasDescription: true, analyses: 1, concepts: 3, memories: 1, buildPlans: 1, tasks: 5 }),
    ];
    const tailles = etapes.map((f) => visibles(f).length);

    // Strictement croissant : une section ouverte ne se referme pas.
    expect(tailles[1]).toBeGreaterThan(tailles[0]);
    expect(tailles[2]).toBeGreaterThan(tailles[1]);
  });

  // Une section ouverte a forcément quelque chose à montrer ; une section
  // vide qui s'affiche est exactement le bruit qu'on veut retirer.
  it("n'ouvre la mémoire qu'une fois un souvenir enregistré", () => {
    expect(visibles(vierge())).not.toContain('memoire');
    expect(visibles(vierge({ memories: 1 }))).toContain('memoire');
  });

  it("n'ouvre les connaissances qu'une fois un concept identifié", () => {
    expect(visibles(vierge())).not.toContain('connaissances');
    expect(visibles(vierge({ concepts: 1 }))).toContain('connaissances');
  });

  it("n'ouvre la conformité qu'à l'approche d'une création réelle", () => {
    expect(visibles(vierge({ analyses: 1 }))).not.toContain('conformite');
    expect(visibles(vierge({ analyses: 1, buildPlans: 1 }))).toContain('conformite');
  });

  it("n'ouvre le financement qu'avec un plan ou un apport réel", () => {
    expect(visibles(vierge({ analyses: 1, buildPlans: 1 }))).not.toContain('financement');
    expect(visibles(vierge({ financingOpened: true }))).toContain('financement');
    expect(visibles(vierge({ financingRounds: 1 }))).toContain('financement');
  });

  // Un score affiché trop tôt vaudrait zéro partout et découragerait sans
  // rien dire de vrai.
  it("n'ouvre le score qu'avec de la matière à mesurer", () => {
    expect(visibles(vierge({ analyses: 1 }))).not.toContain('score');
    expect(visibles(vierge({ analyses: 1, tasks: 3 }))).toContain('score');
  });

  // LA propriété qui rend tout le dispositif solide : sans IA, le parcours
  // avance quand même. Adossé à « une analyse a été lancée », tout serait
  // verrouillé à jamais générateurs éteints.
  it('avance sans IA, sur des données saisies à la main', () => {
    const aLaMain = vierge({
      hasDescription: true,
      memories: 2,
      concepts: 4,
      tasks: 6,
      openTasks: 2,
    });

    const ouvertes = visibles(aLaMain);
    expect(ouvertes).toContain('memoire');
    expect(ouvertes).toContain('connaissances');
    expect(ouvertes).toContain('taches');
  });

  // Cacher sans dire ferait croire que la fonction n'existe pas.
  it('dit ce qui ouvrira chaque section fermée', () => {
    for (const fermee of journeyView(vierge()).locked) {
      expect(fermee.condition.length, fermee.section).toBeGreaterThan(20);
      expect(fermee.condition, fermee.section).not.toMatch(/bientôt|prochainement/i);
    }
  });

  it('couvre toutes les sections déclarées, sans doublon', () => {
    const sections = SECTION_RULES.map((r) => r.section);
    expect(new Set(sections).size).toBe(sections.length);
  });
});

describe('parcours — la phase', () => {
  it('commence à Découvrir', () => {
    expect(phaseOf(vierge())).toBe('decouvrir');
  });

  it('passe à Construire dès la première analyse', () => {
    expect(phaseOf(vierge({ analyses: 1 }))).toBe('construire');
  });

  it('passe à Transmettre quand un plan de transmission existe', () => {
    expect(phaseOf(vierge({ analyses: 1, transmissionPlans: 1 }))).toBe('transmettre');
  });
});

describe('parcours — la prochaine étape', () => {
  // Ignitux ne demande jamais « que veux-tu faire ? ».
  it('demande d’abord de décrire l’idée', () => {
    expect(nextStep(vierge())?.id).toBe('decrire');
  });

  it('puis d’analyser', () => {
    expect(nextStep(vierge({ hasDescription: true }))?.id).toBe('analyser');
  });

  it('puis de construire, quand l’idée est jugée solide', () => {
    expect(nextStep(vierge({ hasDescription: true, analyses: 1, etincelle: 80 }))?.id).toBe(
      'construire',
    );
  });

  // Le seuil conseille, il n'interdit pas : dire à quelqu'un que son idée
  // n'a pas le droit d'exister n'est pas le rôle d'un accompagnateur.
  it('propose de reprendre l’idée sous le seuil, sans fermer la construction', () => {
    const faits = vierge({ hasDescription: true, analyses: 1, etincelle: 60 });
    const vue = journeyView(faits);

    expect(vue.nextStep?.id).toBe('ameliorer');
    expect(vue.nextStep?.pourquoi).toContain('60/100');
    expect(vue.nextStep?.pourquoi).toMatch(/passer outre/);
    expect(vue.visible.map((s) => s.section)).toContain('construction');
  });

  it('laisse passer exactement au seuil', () => {
    expect(
      nextStep(vierge({ hasDescription: true, analyses: 1, etincelle: SEUIL_ETINCELLE }))?.id,
    ).toBe('construire');
  });

  // Une idée retravaillée doit pouvoir remonter : le premier verdict ne
  // peut pas être définitif.
  it('ne conseille plus d’améliorer une fois le plan posé', () => {
    expect(
      nextStep(vierge({ hasDescription: true, analyses: 2, etincelle: 60, buildPlans: 1 }))?.id,
    ).not.toBe('ameliorer');
  });

  it('puis de descendre le plan en tâches', () => {
    expect(
      nextStep(vierge({ hasDescription: true, analyses: 1, etincelle: 80, buildPlans: 1 }))?.id,
    ).toBe('premieres-taches');
  });

  // Ouvrir un nouveau chantier quand le précédent traîne est le meilleur
  // moyen de n'en finir aucun.
  it('fait terminer ce qui est commencé avant d’ouvrir autre chose', () => {
    const etape = nextStep(
      vierge({
        hasDescription: true,
        analyses: 1,
        buildPlans: 1,
        tasks: 5,
        openTasks: 3,
        complianceChecks: 2,
        completedComplianceChecks: 2,
      }),
    );
    expect(etape?.id).toBe('avancer-taches');
    expect(etape?.titre).toContain('3');
  });

  it('mène jusqu’à la transmission', () => {
    expect(
      nextStep(
        vierge({
          hasDescription: true,
          analyses: 1,
          buildPlans: 1,
          tasks: 5,
          openTasks: 0,
          developmentPlans: 1,
        }),
      )?.id,
    ).toBe('transmettre');
  });

  // Inventer une direction pour éviter un écran vide serait un conseil sans
  // fondement.
  it('rend null plutôt que d’inventer une étape', () => {
    expect(
      nextStep(
        vierge({
          hasDescription: true,
          analyses: 1,
          buildPlans: 1,
          tasks: 5,
          openTasks: 0,
          developmentPlans: 1,
          transmissionPlans: 1,
        }),
      ),
    ).toBeNull();
  });

  it('dit toujours pourquoi, pas seulement quoi', () => {
    const cas = [
      vierge(),
      vierge({ hasDescription: true }),
      vierge({ hasDescription: true, analyses: 1 }),
      vierge({ hasDescription: true, analyses: 1, buildPlans: 1 }),
    ];
    for (const f of cas) {
      const etape = nextStep(f);
      expect(etape?.pourquoi.length ?? 0).toBeGreaterThan(40);
    }
  });

  // La section nommée doit être atteignable, sinon le conseil envoie dans
  // un mur.
  it('ne renvoie jamais vers une section verrouillée', () => {
    const cas = [
      vierge(),
      vierge({ hasDescription: true }),
      vierge({ hasDescription: true, analyses: 1 }),
      vierge({ hasDescription: true, analyses: 1, buildPlans: 1 }),
      vierge({ hasDescription: true, analyses: 1, buildPlans: 1, tasks: 5, openTasks: 2 }),
      vierge({
        hasDescription: true,
        analyses: 1,
        buildPlans: 1,
        tasks: 5,
        openTasks: 0,
        developmentPlans: 1,
      }),
    ];
    for (const f of cas) {
      const vue = journeyView(f);
      if (!vue.nextStep) continue;
      expect(
        vue.visible.map((s) => s.section),
        `étape « ${vue.nextStep.id} » vers une section fermée`,
      ).toContain(vue.nextStep.section);
    }
  });
});
