import {
  guideSteps,
  journeyView,
  nextStep,
  phaseOf,
  reperes,
  SECTION_RULES,
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

  // La transmission sert des années plus tard : un plan de développement ne
  // suffit pas à la sortir, seule la personne la demande.
  it("n'ouvre la transmission qu'une fois demandée", () => {
    expect(visibles(vierge({ analyses: 1, buildPlans: 1, developmentPlans: 1 }))).not.toContain(
      'transmission',
    );
    expect(visibles(vierge({ transmissionPlans: 1 }))).toContain('transmission');
  });

  it('dit où la demander tant qu’elle est fermée', () => {
    const fermee = journeyView(vierge()).locked.find((s) => s.section === 'transmission');
    expect(fermee?.condition).toContain('Préparer la transmission');
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

  // Plus de seuil à 75/100 (retiré le 2026-10-31) : une note faible ne
  // détourne plus vers « reprendre ton idée », tout projet passe au plan.
  it('passe au plan même avec une note faible', () => {
    const vue = journeyView(vierge({ hasDescription: true, analyses: 1, etincelle: 30 }));

    expect(vue.nextStep?.id).toBe('construire');
    expect(vue.nextStep?.pourquoi).not.toContain('/100');
    expect(vue.visible.map((s) => s.section)).toContain('construction');
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

  // Proposer la transmission juste après le développement pousserait vers
  // une étape qui ne sert que des années plus tard.
  it('s’arrête après le développement, sans proposer la transmission', () => {
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
      ),
    ).toBeNull();
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

describe('tableau de bord — les chiffres du haut de page', () => {
  const par = (f: ProjectFacts) => Object.fromEntries(reperes(f).map((r) => [r.cle, r]));

  // La règle qui gouverne tout le reste : une absence de source n'est pas
  // un zéro. Un projet sans analyse n'a pas une étincelle nulle, il n'en a
  // pas — et afficher 0/100 serait un verdict qu'aucune analyse n'a rendu.
  it("laisse l'étincelle vide plutôt que d'afficher zéro", () => {
    const r = par(vierge()).etincelle;

    expect(r.valeur).toBeNull();
    expect(r.precision).toContain('Aucune analyse');
  });

  it("affiche l'étincelle de la dernière analyse", () => {
    expect(par(vierge({ analyses: 1, etincelle: 80 })).etincelle.valeur).toBe('80/100');
  });

  it('compte les tâches terminées sur le total', () => {
    const r = par(vierge({ tasks: 5, openTasks: 2 })).taches;

    expect(r.valeur).toBe('3/5');
    expect(r.precision).toContain('2 en cours');
  });

  it('ne montre pas 0/0 quand aucune tâche n’existe', () => {
    expect(par(vierge()).taches.valeur).toBeNull();
  });

  it('compte les étapes franchies sur quatre, sans la transmission', () => {
    expect(par(vierge()).etapes.valeur).toBe('0/4');
    expect(par(vierge({ analyses: 1, buildPlans: 1 })).etapes.valeur).toBe('2/4');
    expect(par(vierge()).etapes.precision).not.toContain('transmission');
  });

  it('compte la transmission en plus une fois un plan rédigé', () => {
    expect(par(vierge({ analyses: 1, transmissionPlans: 1 })).etapes.valeur).toBe('2/5');
    expect(par(vierge({ transmissionPlans: 1 })).etapes.precision).toContain('transmission');
  });

  // Le financement est une branche facultative : une tuile « Financement :
  // 0 » sur un projet qui n'en cherche pas est une case vide à remplir,
  // c'est-à-dire exactement la pression qu'on a décidé de ne pas mettre.
  it("n'affiche le financement que si le projet l'a ouvert", () => {
    expect(par(vierge()).financement).toBeUndefined();
    expect(par(vierge({ financingOpened: true })).financement.valeur).toBe('0');
  });

  // Quatre tuiles au maximum : au-delà, le tableau de bord redevient le mur
  // de menus qu'on a retiré.
  it('ne dépasse jamais quatre repères', () => {
    const plein = vierge({
      hasDescription: true,
      analyses: 1,
      etincelle: 80,
      buildPlans: 1,
      financingPlans: 1,
      developmentPlans: 1,
      transmissionPlans: 1,
      tasks: 9,
      openTasks: 1,
      financingOpened: true,
      financingRounds: 2,
      equityHolders: 3,
    });

    expect(reperes(plein).length).toBeLessThanOrEqual(4);
  });

  it('est rendu par journeyView, pour que la page n’ait pas un appel de plus', () => {
    expect(journeyView(vierge()).reperes.map((r) => r.cle)).toEqual([
      'etincelle',
      'taches',
      'etapes',
    ]);
  });
});

describe('le guide pas à pas', () => {
  const ids = (f: ProjectFacts) => guideSteps(f).map((e) => e.id);
  const etat = (f: ProjectFacts, id: string) => guideSteps(f).find((e) => e.id === id)?.etat;
  const analyse = (overrides: Partial<ProjectFacts> = {}) =>
    vierge({ hasDescription: true, analyses: 1, etincelle: 80, ...overrides });

  it('montre tout le chemin dès le premier jour, décrire en cours', () => {
    const f = vierge();
    expect(ids(f)).toEqual([
      'decrire',
      'analyser',
      'construire',
      'premieres-taches',
      'avancer-taches',
      'developper',
    ]);
    expect(guideSteps(f).map((e) => e.etat)).toEqual([
      'en-cours',
      'a-venir',
      'a-venir',
      'a-venir',
      'a-venir',
      'a-venir',
    ]);
  });

  it('ne parle de la transmission qu’une fois un plan rédigé, et la coche', () => {
    expect(ids(analyse({ developmentPlans: 1 }))).not.toContain('transmettre');
    expect(etat(analyse({ transmissionPlans: 1 }), 'transmettre')).toBe('fait');
  });

  it('passe à l’analyse une fois l’idée décrite', () => {
    const f = vierge({ hasDescription: true });
    expect(etat(f, 'decrire')).toBe('fait');
    expect(etat(f, 'analyser')).toBe('en-cours');
  });

  it('ne parle jamais de reprendre l’idée, même quand la note est faible', () => {
    const f = analyse({ etincelle: 30 });
    expect(ids(f).slice(0, 3)).toEqual(['decrire', 'analyser', 'construire']);
    expect(etat(f, 'analyser')).toBe('fait');
    expect(etat(f, 'construire')).toBe('en-cours');
  });

  it('ajoute les démarches seulement quand il y en a', () => {
    expect(ids(vierge({ complianceChecks: 2 }))).toEqual([
      'decrire',
      'analyser',
      'construire',
      'premieres-taches',
      'conformite',
      'avancer-taches',
      'developper',
    ]);
    expect(ids(vierge())).not.toContain('conformite');
  });

  it('met les tâches en cours en avant une fois les premières posées', () => {
    const f = analyse({ buildPlans: 1, tasks: 3, openTasks: 2 });
    expect(etat(f, 'premieres-taches')).toBe('fait');
    expect(etat(f, 'avancer-taches')).toBe('en-cours');
  });

  it('coche tout quand le parcours est fini', () => {
    const f = analyse({
      buildPlans: 1,
      tasks: 2,
      openTasks: 0,
      complianceChecks: 1,
      completedComplianceChecks: 1,
      developmentPlans: 1,
      transmissionPlans: 1,
    });
    expect(nextStep(f)).toBeNull();
    expect(guideSteps(f).every((e) => e.etat === 'fait')).toBe(true);
  });

  it('dit chaque étape avec ses mots', () => {
    const f = analyse({
      complianceChecks: 1,
      transmissionPlans: 1,
    });
    expect(guideSteps(f).map((e) => e.label)).toEqual([
      'Décrire ton idée',
      'Analyser ton idée',
      'Établir ton plan',
      'Poser tes premières tâches',
      'Regarder tes démarches',
      'Avancer tes tâches',
      'Préparer le développement',
      'Penser la transmission',
    ]);
  });

  it('fait partie de la vue du parcours', () => {
    expect(journeyView(vierge()).guide).toEqual(guideSteps(vierge()));
  });
});
