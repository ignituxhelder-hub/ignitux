import {
  completionFor,
  fieldsForRoles,
  PROFILE_FIELDS,
  toAskAt,
  type ProfileValues,
} from './profile-fields.js';

describe('catalogue du profil', () => {
  // La règle qui gouverne tout le module : un champ sans usage n'existe pas.
  it('donne à chaque champ une raison d’être lisible', () => {
    for (const champ of PROFILE_FIELDS) {
      expect(champ.purpose.length, champ.id).toBeGreaterThan(40);
      // La règle qui compte n'est pas le point d'interrogation mais
      // l'adresse : une question posée à quelqu'un, pas un intitulé de
      // colonne. « Raconte ce que tu as fait » vaut « Qu'as-tu fait ? ».
      expect(champ.question, champ.id).toMatch(/\btu\b|\bte\b|\bt’|\?/);
      expect(champ.purpose, champ.id).not.toMatch(/bientôt|prochainement/i);
    }
  });

  // Demandés et refusés faute d'emploi. Ce test fige la décision : les
  // rajouter demandera de les justifier, pas de les glisser en passant.
  it.each(['nationality', 'phone', 'address', 'education_level', 'language'])(
    'ne collecte pas « %s », faute d’usage',
    (interdit) => {
      expect(PROFILE_FIELDS.map((f) => f.id)).not.toContain(interdit);
    },
  );

  // Rien à l'inscription : c'est le principe de départ.
  it('ne demande aucun champ avant le choix du rôle', () => {
    expect(PROFILE_FIELDS.every((f) => f.moment !== undefined)).toBe(true);
    expect(PROFILE_FIELDS.filter((f) => f.moment === 'accueil').length).toBeLessThanOrEqual(2);
  });

  it('ne pose à un investisseur que les questions d’investisseur', () => {
    const ids = fieldsForRoles(['investisseur']).map((f) => f.id);
    expect(ids).toContain('investor_kind');
    expect(ids).not.toContain('activity_country');
  });

  it('pose les deux séries à qui tient les deux rôles', () => {
    const ids = fieldsForRoles(['entrepreneur', 'investisseur']).map((f) => f.id);
    expect(ids).toContain('activity_country');
    expect(ids).toContain('investor_kind');
  });
});

describe('complétion', () => {
  const vide: ProfileValues = {};

  it('part de zéro et dit combien de champs comptent', () => {
    const c = completionFor(['entrepreneur'], vide);
    expect(c.percent).toBe(0);
    expect(c.total).toBeGreaterThan(0);
    expect(c.filled).toBe(0);
  });

  // Un facultatif qui ferait baisser le pourcentage pousserait à tout
  // remplir — le travers que ce module existe pour éviter.
  it('ne compte pas les champs facultatifs', () => {
    const avant = completionFor(['entrepreneur'], vide).total;
    const apres = completionFor(['entrepreneur'], { motivation: 'Parce que.' }).total;
    expect(apres).toBe(avant);
    expect(completionFor(['entrepreneur'], { motivation: 'Parce que.' }).percent).toBe(0);
  });

  it('monte quand un champ qui compte est rempli', () => {
    const c = completionFor(['entrepreneur'], { display_name: 'Helder' });
    expect(c.percent).toBeGreaterThan(0);
    expect(c.filled).toBe(1);
  });

  it('ne compte pas une liste vide ni une chaîne d’espaces', () => {
    expect(completionFor(['entrepreneur'], { sectors: [], display_name: '   ' }).filled).toBe(0);
  });

  // Un pourcentage sans cela n'est qu'une barre à remplir pour la remplir.
  it('dit ce que chaque manque ouvrirait', () => {
    const c = completionFor(['entrepreneur'], vide);
    const pays = c.missing.find((m) => m.id === 'activity_country');
    expect(pays?.unlocks).toMatch(/Conformité/);
  });
});

describe('ce qu’il faut demander, et quand', () => {
  it('ne demande au premier projet que ce qui sert au premier projet', () => {
    const ids = toAskAt('premier-projet', ['entrepreneur'], {}).map((f) => f.id);
    expect(ids).toContain('activity_country');
    expect(ids).not.toContain('display_name');
  });

  it('ne repose pas une question déjà répondue', () => {
    const ids = toAskAt('premier-projet', ['entrepreneur'], {
      activity_country: 'France',
    }).map((f) => f.id);
    expect(ids).not.toContain('activity_country');
  });

  it('ne demande rien d’un rôle qu’on ne tient pas', () => {
    expect(toAskAt('accueil', ['entrepreneur'], {}).map((f) => f.id)).not.toContain(
      'investor_kind',
    );
  });
});
