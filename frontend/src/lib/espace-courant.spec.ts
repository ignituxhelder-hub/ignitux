import { describe, expect, it } from 'vitest';
import {
  CLE_ESPACE,
  ecrireEspaceChoisi,
  lireEspaceChoisi,
  nomDansPhrase,
  oublierEspaceChoisi,
  type EspaceChoisi,
} from './espace-courant';

function stockage(initial: Record<string, string> = {}) {
  const donnees = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => donnees.get(k) ?? null,
    setItem: (k: string, v: string) => void donnees.set(k, v),
    removeItem: (k: string) => void donnees.delete(k),
    donnees,
  };
}

const ALICE: EspaceChoisi = { ownerId: 'o-alice', nom: 'Espace de Alice', roles: ['comptable'] };

describe('l’espace courant', () => {
  it('se relit tel qu’il a été choisi, pour la même personne', () => {
    const s = stockage();
    ecrireEspaceChoisi(s, 'u1', ALICE);
    expect(lireEspaceChoisi(s, 'u1')).toEqual(ALICE);
  });

  it('ne suit pas une autre personne sur le même appareil', () => {
    const s = stockage();
    ecrireEspaceChoisi(s, 'u1', ALICE);
    expect(lireEspaceChoisi(s, 'u2')).toBeNull();
  });

  it('revenir à « Mon espace » efface le choix', () => {
    const s = stockage();
    ecrireEspaceChoisi(s, 'u1', ALICE);
    ecrireEspaceChoisi(s, 'u1', null);
    expect(s.donnees.has(CLE_ESPACE)).toBe(false);
    expect(lireEspaceChoisi(s, 'u1')).toBeNull();
  });

  it('son propre espace n’est jamais « l’espace d’un autre »', () => {
    const s = stockage({
      [CLE_ESPACE]: JSON.stringify({ userId: 'u1', espace: { ...ALICE, ownerId: 'u1' } }),
    });
    expect(lireEspaceChoisi(s, 'u1')).toBeNull();
  });

  it('s’oublie à la déconnexion', () => {
    const s = stockage();
    ecrireEspaceChoisi(s, 'u1', ALICE);
    oublierEspaceChoisi(s);
    expect(lireEspaceChoisi(s, 'u1')).toBeNull();
  });

  it('écarte une mémoire illisible, bricolée ou refusée', () => {
    expect(lireEspaceChoisi(stockage({ [CLE_ESPACE]: '{pas du json' }), 'u1')).toBeNull();
    expect(
      lireEspaceChoisi(
        stockage({ [CLE_ESPACE]: JSON.stringify({ userId: 'u1', espace: { ...ALICE, roles: [42] } }) }),
        'u1',
      ),
    ).toBeNull();
    const refuse = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(lireEspaceChoisi(refuse, 'u1')).toBeNull();
    expect(() => ecrireEspaceChoisi(refuse, 'u1', ALICE)).not.toThrow();
    expect(() => oublierEspaceChoisi(refuse)).not.toThrow();
    expect(lireEspaceChoisi(null, 'u1')).toBeNull();
  });

  it('dit le nom dans une phrase', () => {
    expect(nomDansPhrase('Espace de Alice')).toBe('l’espace de Alice');
    expect(nomDansPhrase('Mon espace')).toBe('Mon espace');
  });
});
