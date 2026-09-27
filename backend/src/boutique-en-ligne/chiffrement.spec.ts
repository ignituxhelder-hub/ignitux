import { chiffrer, dechiffrer } from './chiffrement.js';

const CLE_VALIDE = 'a'.repeat(64); // 64 hex = 32 octets

describe('chiffrement des secrets au repos', () => {
  const original = process.env.SECRETS_ENCRYPTION_KEY;
  afterEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = original;
  });

  it('déchiffre exactement ce qui a été chiffré', () => {
    process.env.SECRETS_ENCRYPTION_KEY = CLE_VALIDE;
    const valeur = chiffrer('shpat_secret_de_test');
    expect(dechiffrer(valeur)).toBe('shpat_secret_de_test');
  });

  it('produit une valeur différente à chaque appel (IV aléatoire)', () => {
    process.env.SECRETS_ENCRYPTION_KEY = CLE_VALIDE;
    expect(chiffrer('meme-texte')).not.toBe(chiffrer('meme-texte'));
  });

  it('refuse de déchiffrer si la valeur a été altérée', () => {
    process.env.SECRETS_ENCRYPTION_KEY = CLE_VALIDE;
    const valeur = chiffrer('secret');
    const [iv, balise, chiffre] = valeur.split(':');
    const altere = [iv, balise, chiffre.slice(0, -2) + '00'].join(':');
    expect(() => dechiffrer(altere)).toThrow();
  });

  it('refuse une SECRETS_ENCRYPTION_KEY absente ou mal formée', () => {
    process.env.SECRETS_ENCRYPTION_KEY = '';
    expect(() => chiffrer('x')).toThrow(/SECRETS_ENCRYPTION_KEY/);
    process.env.SECRETS_ENCRYPTION_KEY = 'trop-court';
    expect(() => chiffrer('x')).toThrow(/SECRETS_ENCRYPTION_KEY/);
  });
});
