import { describe, expect, it } from 'vitest';
import { ETAPES_INDIVIDUELLES, ETAPES_SOCIETE, etapesPourForme, fraisPourForme } from './guide.js';

describe('guide du dépôt', () => {
  it('société : statuts → capital → annonce → dépôt → Kbis', () => {
    expect(etapesPourForme('SARL').map((e) => e.id)).toEqual(['statuts', 'capital', 'annonce', 'depot', 'kbis']);
  });

  it('micro-entreprise / EI : déclaration → SIREN', () => {
    expect(etapesPourForme('micro-entreprise').map((e) => e.id)).toEqual(['declaration', 'siren']);
    expect(etapesPourForme('EI')).toBe(ETAPES_INDIVIDUELLES);
  });

  it('sans forme confirmée : aucune étape', () => {
    expect(etapesPourForme(null)).toEqual([]);
  });

  it('chaque étape a un titre, un texte et un lien https', () => {
    for (const e of [...ETAPES_SOCIETE, ...ETAPES_INDIVIDUELLES]) {
      expect(e.titre).not.toBe('');
      expect(e.texte).not.toBe('');
      expect(e.lienLibelle).not.toBe('');
      expect(e.lien).toMatch(/^https:\/\//);
    }
  });

  it('le dépôt pointe vers le guichet unique', () => {
    expect(ETAPES_SOCIETE.find((e) => e.id === 'depot')?.lien).toBe('https://formalites.entreprises.gouv.fr');
    expect(ETAPES_INDIVIDUELLES[0].lien).toBe('https://formalites.entreprises.gouv.fr');
  });
});

describe('frais à prévoir', () => {
  it.each(['SAS', 'micro-entreprise', null])('%s : indicatifs, datés, renvoyant aux sites officiels', (forme) => {
    const frais = fraisPourForme(forme);
    expect(frais.miseAJour).toBe('octobre 2026');
    expect(frais.avertissement).toContain('octobre 2026');
    expect(frais.avertissement.toLowerCase()).toContain('vérifie les montants sur les sites officiels');
    expect(frais.sources.length).toBeGreaterThan(0);
    expect(frais.lignes.length).toBeGreaterThan(0);
  });

  // Formulations prudentes : on ne prétend pas savoir de quoi dépend chaque
  // tarif (département, type d'activité) — seulement que ça dépend de la
  // forme et de la situation, et qu'il faut vérifier sur les sites officiels.
  it.each(['SAS', 'EI', 'micro-entreprise'])('%s : ni département ni type d’activité présentés comme facteurs de prix', (forme) => {
    const frais = fraisPourForme(forme);
    const texte = [...frais.lignes, frais.avertissement].join(' ').toLowerCase();
    expect(texte).not.toContain('département');
    expect(texte).not.toMatch(/artisanale|commerciale|libérale/);
    expect(frais.lignes.join(' ')).toMatch(/dépend(ent)? de la forme et de (la|ta) situation/);
    expect(frais.lignes.join(' ').toLowerCase()).toContain('sites officiels');
  });

  it('n’annonce aucun montant chiffré', () => {
    for (const forme of ['SAS', 'EI', null]) {
      const frais = fraisPourForme(forme);
      expect([...frais.lignes, frais.avertissement].join(' ')).not.toMatch(/\d+\s*(€|euros?)/i);
    }
  });
});
