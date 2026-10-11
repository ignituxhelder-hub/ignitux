import { LIMITE_GLOBALE_PAR_DEFAUT, lireLimiteGlobale } from './limite-globale.js';

describe('limite globale de requêtes par minute', () => {
  // 20 par minute coupait un usage normal : ouvrir un projet charge déjà une
  // douzaine de ressources, et une évaluation en préparation se relit toutes
  // les 5 secondes. Les routes de connexion gardent leurs limites strictes.
  it('vaut 120 par minute par défaut', () => {
    expect(LIMITE_GLOBALE_PAR_DEFAUT).toBe(120);
    expect(lireLimiteGlobale(undefined)).toBe(120);
  });

  it('se règle par variable d’environnement', () => {
    expect(lireLimiteGlobale('300')).toBe(300);
  });

  it('ignore une valeur illisible, vide, nulle ou négative au lieu de tout ouvrir ou tout fermer', () => {
    for (const mauvaise of ['', '  ', 'beaucoup', '0', '-5', '12.5']) {
      expect(lireLimiteGlobale(mauvaise), mauvaise).toBe(120);
    }
  });
});
