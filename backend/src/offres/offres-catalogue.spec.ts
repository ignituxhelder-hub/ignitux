import { CATALOGUE, GENERATEURS, normaliserOffre, offre, OFFRE_PAR_DEFAUT, OFFRES, type OffreId } from './offres-catalogue.js';

describe('catalogue des offres — une seule, gratuite, qui contient tout', () => {
  it('n’a plus qu’une offre, et elle ne coûte rien', () => {
    expect(OFFRES).toEqual(['decouverte']);
    expect(CATALOGUE).toHaveLength(1);
    expect(CATALOGUE.every((o) => o.prixCentimes === 0)).toBe(true);
    expect(OFFRE_PAR_DEFAUT).toBe('decouverte');
  });

  it('ouvre tout : projets sans limite, les six générateurs, gestion, financement, équipe, évaluation', () => {
    expect(offre('decouverte').capacites).toEqual({
      projets: null,
      generateurs: [...GENERATEURS],
      appelsIaParMois: null,
      outilsDeGestion: true,
      investisseurs: true,
      collaborateurs: null,
      evaluationFinancement: true,
    });
  });

  it('dit que seules les actions d’IGINI se paient, en crédits', () => {
    expect(offre('decouverte').label).toBe('Gratuit');
    expect(offre('decouverte').resume).toContain('crédits');
    expect(offre('decouverte').resume).not.toMatch(/€/);
  });

  it('reconnaît les anciennes offres payantes comme l’offre d’aujourd’hui', () => {
    // Des abonnements et des accords de participation portent encore ces noms.
    expect(normaliserOffre('entrepreneur')).toBe('decouverte');
    expect(normaliserOffre('construction')).toBe('decouverte');
    expect(normaliserOffre('decouverte')).toBe('decouverte');
    expect(normaliserOffre('gratuit-a-vie')).toBeNull();
  });

  it('retombe sur l’offre gratuite pour un identifiant inconnu', () => {
    expect(offre('inconnue' as OffreId).id).toBe('decouverte');
  });

  it('ignore une ancienne surcharge de prix par variable d’environnement', () => {
    process.env.OFFRE_DECOUVERTE_PRIX_CENTIMES = '2000';
    try {
      expect(offre('decouverte').prixCentimes).toBe(0);
    } finally {
      delete process.env.OFFRE_DECOUVERTE_PRIX_CENTIMES;
    }
  });
});
