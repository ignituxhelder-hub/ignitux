import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APPS_SYSTEME,
  applicationDe,
  CLE_TACHES,
  ecrireTaches,
  enPages,
  fermer,
  lireTaches,
  MAX_TACHES,
  ouvrir,
} from './systeme';

function stockage(initial: Record<string, string> = {}) {
  const donnees = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => donnees.get(k) ?? null,
    setItem: (k: string, v: string) => void donnees.set(k, v),
    removeItem: (k: string) => void donnees.delete(k),
    donnees,
  };
}

describe('les pages du bureau', () => {
  it('remplit chaque page avant de passer à la suivante', () => {
    expect(enPages([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('garde une page, même vide : le bureau ne disparaît jamais', () => {
    expect(enPages([], 16)).toEqual([[]]);
  });
});

describe('à quelle application appartient une adresse', () => {
  it("reconnaît l'application et ses sous-pages", () => {
    expect(applicationDe('/projects')?.id).toBe('parcours');
    expect(applicationDe('/projects/p1/finances')?.id).toBe('parcours');
    expect(applicationDe('/facturation/d1')?.id).toBe('facturation');
    expect(applicationDe('/roles')?.id).toBe('compte');
  });

  it("ne confond pas une adresse qui commence pareil", () => {
    expect(applicationDe('/projectsx')).toBeNull();
  });

  it("laisse le bureau et la connexion hors des applications", () => {
    expect(applicationDe('/accueil')).toBeNull();
    expect(applicationDe('/login')).toBeNull();
    expect(applicationDe('/')).toBeNull();
  });
});

describe('la barre des tâches', () => {
  it("ajoute une application à la fin, et retient l'endroit où on l'a laissée", () => {
    let taches = ouvrir([], 'parcours', '/projects');
    taches = ouvrir(taches, 'facturation', '/facturation');
    taches = ouvrir(taches, 'parcours', '/projects/p1');
    // Elle garde sa place : on la retrouve toujours au même endroit.
    expect(taches).toEqual([
      { id: 'parcours', url: '/projects/p1' },
      { id: 'facturation', url: '/facturation' },
    ]);
  });

  it(`ferme la plus ancienne au-delà de ${MAX_TACHES}`, () => {
    let taches = ouvrir([], 'parcours', '/projects');
    for (const app of APPS_SYSTEME.slice(1, MAX_TACHES + 1)) {
      taches = ouvrir(taches, app.id, app.route);
    }
    expect(taches).toHaveLength(MAX_TACHES);
    expect(taches.some((t) => t.id === 'parcours')).toBe(false);
  });

  it('ferme une application', () => {
    expect(fermer([{ id: 'banque', url: '/banque' }], 'banque')).toEqual([]);
  });

  it('se relit telle qu’elle a été écrite', () => {
    const s = stockage();
    ecrireTaches(s, [{ id: 'banque', url: '/banque?compte=2' }]);
    expect(lireTaches(s)).toEqual([{ id: 'banque', url: '/banque?compte=2' }]);
    ecrireTaches(s, []);
    expect(s.donnees.has(CLE_TACHES)).toBe(false);
  });

  // La mémoire du navigateur se modifie à la main : on n'y rouvre que ce
  // qui ressemble à une application d'Ignitux, à sa propre adresse.
  it('écarte ce qui ne mène pas à la bonne application, ou hors du site', () => {
    const s = stockage({
      [CLE_TACHES]: JSON.stringify([
        { id: 'banque', url: 'https://ailleurs.example/banque' },
        { id: 'banque', url: '//ailleurs.example/banque' },
        { id: 'banque', url: '/crm' },
        { id: 'inconnue', url: '/inconnue' },
        { id: 'crm', url: 42 },
        { id: 'relations', url: '/crm' },
        { id: 'relations', url: '/crm?doublon' },
      ]),
    });
    expect(lireTaches(s)).toEqual([{ id: 'relations', url: '/crm' }]);
  });

  it('repart de zéro si la mémoire est illisible ou refusée', () => {
    expect(lireTaches(stockage({ [CLE_TACHES]: '{pas du json' }))).toEqual([]);
    const refuse = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => undefined,
    };
    expect(lireTaches(refuse)).toEqual([]);
    expect(() => ecrireTaches(refuse, [{ id: 'banque', url: '/banque' }])).not.toThrow();
  });
});

// Le système double le catalogue du serveur pour savoir, sans requête, dans
// quelle application on se trouve. Ce test lit le catalogue lui-même : une
// application ajoutée d'un côté sans l'autre s'ouvrirait sans sa barre, ou
// sous un autre nom que sur le bureau.
describe('le système suit le catalogue du serveur', () => {
  const source = readFileSync(
    resolve(__dirname, '../../../backend/src/applications/applications-catalogue.ts'),
    'utf8',
  );
  const catalogue = [
    ...source.matchAll(/id: '([^']+)',\s*nom: '([^']+)',[\s\S]*?route: (?:'([^']+)'|null)/g),
  ]
    .filter(([, , , route]) => route)
    .map(([, id, nom, route]) => ({ id, nom, route }));

  it('lit bien le catalogue', () => {
    expect(catalogue.length).toBeGreaterThan(5);
  });

  it('déclare chaque application disponible, sous le même nom et à la même adresse', () => {
    expect(APPS_SYSTEME.map(({ id, nom, route }) => ({ id, nom, route }))).toEqual(catalogue);
  });
});
