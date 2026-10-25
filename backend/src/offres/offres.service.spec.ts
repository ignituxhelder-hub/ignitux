import { presenterBareme } from '../credits/bareme.js';
import { OffresService } from './offres.service.js';

describe('OffresService — la page des offres depuis les crédits', () => {
  it('ne présente plus aucune offre payante, et rien à souscrire', () => {
    const vu = new OffresService().catalogue();

    expect(vu.actuelle).toBe('decouverte');
    expect(vu.souscriptionPossible).toBe(false);
    expect(vu.offres).toHaveLength(1);
    expect(vu.offres[0]).toMatchObject({ id: 'decouverte', prixCentimes: 0, actuelle: true });
  });

  it('renvoie vers les crédits, avec le barème du serveur', () => {
    const { credits } = new OffresService().catalogue();

    expect(credits.route).toBe('/credits');
    expect(credits.bareme).toEqual(presenterBareme());
    expect(credits.explication).toContain('30 crédits');
  });
});
