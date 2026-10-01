import { describe, expect, it } from 'vitest';
import { extraireChampsStructures } from './champs-extraits.js';

describe('extraireChampsStructures', () => {
  it('détecte une ligne MRZ TD3 et rend mrzValide en conséquence', () => {
    const texte = `PASSEPORT\nP<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10\n`;
    const champs = extraireChampsStructures(texte);
    expect(champs.mrzValide).toBe(true);
  });

  it('extrait la date d’expiration et le numéro de document d’une ligne MRZ TD3', () => {
    // Même ligne officielle ICAO : naissance 740812 (12/08/1974),
    // expiration 120415 (15/04/2012), numéro 'L898902C3' (le '<' de
    // bourrage en position 9 du champ numéro est retiré).
    const texte = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';
    const champs = extraireChampsStructures(texte);
    expect(champs.numeroDocument).toBe('L898902C3');
    expect(champs.dateNaissance?.toISOString().slice(0, 10)).toBe('1974-08-12');
    expect(champs.dateExpiration?.toISOString().slice(0, 10)).toBe('2012-04-15');
  });

  it('calcule une expiration future comme le siècle courant, pas le précédent', () => {
    // Même ligne officielle ICAO, expiration modifiée en '360101'
    // (1er janvier 2036). Référence figée au 1er janvier 2026 : sans
    // buffer de pivot sur le siècle, yy=36 serait comparé directement à
    // l'année courante à deux chiffres (26) et, 36 > 26, lu comme 1936 —
    // un document valide jusqu'en 2036 serait vu comme expiré depuis 90
    // ans. L'heuristique doit tolérer un horizon futur raisonnable
    // (validité réelle des pièces : 5 à 15 ans en France).
    const texte = 'L898902C36UTO7408122F3601017ZE184226B<<<<<10';
    const champs = extraireChampsStructures(texte, new Date(Date.UTC(2026, 0, 1)));
    expect(champs.dateExpiration?.toISOString().slice(0, 10)).toBe('2036-01-01');
  });

  it('rend mrzValide null et les champs dérivés absents quand aucune ligne MRZ n’est présente', () => {
    const champs = extraireChampsStructures('CARTE NATIONALE D IDENTITE\nNé le 12/08/1974');
    expect(champs.mrzValide).toBeNull();
    expect(champs.dateExpiration).toBeUndefined();
  });

  it('ne lève jamais d’exception sur un texte vide', () => {
    expect(() => extraireChampsStructures('')).not.toThrow();
  });
});
