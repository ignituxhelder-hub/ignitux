import { SECTEURS } from '../../profile/profile-fields.js';
import {
  ETAPES,
  estVisible,
  fusionnerReponses,
  JE_NE_SAIS_PAS,
  lireReponses,
  QUESTIONS_PROJET,
  ReponseInvalide,
} from './questionnaire-catalogue.js';

const question = (id: string) => {
  const q = QUESTIONS_PROJET.find((x) => x.id === id);
  if (!q) throw new Error(`question ${id} absente`);
  return q;
};

describe('le catalogue du questionnaire de projet', () => {
  it('a des identifiants uniques', () => {
    const ids = QUESTIONS_PROJET.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('range chaque question dans une étape qui existe', () => {
    const etapes = new Set(ETAPES.map((e) => e.id));
    for (const q of QUESTIONS_PROJET) expect(etapes.has(q.etape)).toBe(true);
  });

  it('dit pour chaque question à quoi elle sert', () => {
    for (const q of QUESTIONS_PROJET) expect(q.purpose.trim().length).toBeGreaterThan(10);
  });

  it('donne des options à chaque choix et chaque liste', () => {
    for (const q of QUESTIONS_PROJET.filter((x) => x.kind === 'choix' || x.kind === 'liste')) {
      expect(q.options?.length ?? 0).toBeGreaterThan(1);
    }
  });

  it('donne une limite à chaque texte libre', () => {
    for (const q of QUESTIONS_PROJET.filter((x) => x.kind === 'texte' || x.kind === 'texte-long')) {
      expect(q.longueurMax ?? 0).toBeGreaterThan(0);
    }
  });

  it('ouvre sur l’idée elle-même, avant les démarches', () => {
    expect(ETAPES[0].id).toBe('idee');
  });

  it('demande le problème, la cible, la concurrence, la différence et les revenus', () => {
    // Ce qu'Analyser devinait à partir de la description : sans eux, il juge
    // un marché et une concurrence qu'il a imaginés.
    for (const id of ['probleme', 'cible', 'alternatives', 'difference', 'revenus']) {
      expect(question(id).etape).toBe('idee');
    }
  });

  it('laisse dire qu’on ne sait pas encore comment on gagnera de l’argent', () => {
    expect(question('revenus').options).toContain(JE_NE_SAIS_PAS);
  });

  it('ne conditionne une question qu’à une question et une option qui existent', () => {
    for (const q of QUESTIONS_PROJET.filter((x) => x.visibleSi)) {
      const parent = question(q.visibleSi!.question);
      for (const v of q.visibleSi!.parmi) expect(parent.options).toContain(v);
    }
  });

  it('propose les secteurs du référentiel, plus « je ne sais pas encore »', () => {
    expect(question('secteur').options).toEqual([...SECTEURS, JE_NE_SAIS_PAS]);
  });

  it('couvre ce que la consigne de Former demande de savoir', () => {
    // « seul ou à plusieurs, ambition de chiffre d'affaires, patrimoine à
    // protéger, nature de l'activité » — voir former.service.ts.
    for (const id of ['associes', 'ca_vise', 'patrimoine', 'offre']) {
      expect(QUESTIONS_PROJET.some((q) => q.id === id)).toBe(true);
    }
  });
});

describe('les questions conditionnelles', () => {
  it('cache la forme actuelle pour une entreprise à créer', () => {
    expect(estVisible(question('forme_existante'), { nature: 'Nouvelle entreprise à créer' })).toBe(
      false,
    );
  });

  it('la montre pour une structure qui existe ou une reprise', () => {
    expect(estVisible(question('forme_existante'), { nature: 'Une structure existe déjà' })).toBe(
      true,
    );
    expect(
      estVisible(question('anciennete'), { nature: 'Reprise d’une entreprise existante' }),
    ).toBe(true);
  });

  it('demande si l’idée a été confrontée à des clients tant qu’elle ne vend pas', () => {
    expect(estVisible(question('validation'), { stade: 'Juste une idée' })).toBe(true);
    expect(estVisible(question('validation'), { stade: 'Je prépare le lancement' })).toBe(true);
  });

  it('ne le demande plus à qui vend déjà', () => {
    expect(estVisible(question('validation'), { stade: 'J’ai mes premiers clients' })).toBe(false);
    expect(estVisible(question('validation'), {})).toBe(false);
  });
});

describe('fusionner les réponses', () => {
  it('garde l’existant et ajoute le nouveau', () => {
    expect(fusionnerReponses({ stade: 'Juste une idée' }, { associes: 'Seul' })).toEqual({
      stade: 'Juste une idée',
      associes: 'Seul',
    });
  });

  it('refuse une valeur qu’aucun bouton ne propose', () => {
    expect(() => fusionnerReponses({}, { associes: 'Avec 40 associés' })).toThrow(ReponseInvalide);
    expect(() => fusionnerReponses({}, { vente: ['Par pigeon voyageur'] })).toThrow(
      ReponseInvalide,
    );
  });

  it('ignore une clé inconnue plutôt que de la refuser', () => {
    expect(fusionnerReponses({}, { couleur_preferee: 'bleu' })).toEqual({});
  });

  it('retire une réponse effacée', () => {
    expect(fusionnerReponses({ associes: 'Seul' }, { associes: null })).toEqual({});
    expect(fusionnerReponses({ vente: ['En ligne'] }, { vente: [] })).toEqual({});
  });

  it('dédoublonne une liste', () => {
    expect(fusionnerReponses({}, { vente: ['En ligne', 'En ligne'] })).toEqual({
      vente: ['En ligne'],
    });
  });

  it('tronque et nettoie un texte libre', () => {
    const r = fusionnerReponses({}, { lieu: `  Lyon ${'x'.repeat(300)}` });
    expect((r.lieu as string).startsWith('Lyon')).toBe(true);
    expect((r.lieu as string).length).toBe(100);
  });

  it('garde quelques phrases pour un texte long, et le tronque à sa limite', () => {
    const limite = question('probleme').longueurMax!;
    expect(limite).toBeGreaterThan(200);
    const r = fusionnerReponses({}, { probleme: 'Les livreurs perdent du temps. '.repeat(40) });
    expect((r.probleme as string).length).toBe(limite);
  });

  it('refuse un texte long qui n’est pas du texte', () => {
    expect(() => fusionnerReponses({}, { probleme: ['un', 'deux'] })).toThrow(ReponseInvalide);
  });

  it('ne range jamais le secteur dans les réponses', () => {
    expect(fusionnerReponses({}, { secteur: 'Commerce' })).toEqual({});
  });
});

describe('relire ce qui est en base', () => {
  it('tolère une valeur absente ou mal formée', () => {
    expect(lireReponses(null)).toEqual({});
    expect(lireReponses([1, 2])).toEqual({});
    expect(lireReponses({ a: 'x', b: ['y', 3], c: 4 })).toEqual({ a: 'x', b: ['y'] });
  });
});
