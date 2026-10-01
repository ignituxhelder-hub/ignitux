import { describe, expect, it } from 'vitest';
import { validerChecksumMrz } from './mrz-checksum.js';

// Vecteurs construits à la main avec l'algorithme ICAO 9303 : chaque
// caractère vaut sa valeur (0-9), 10+position alphabet pour A-Z, 0 pour
// '<', pondéré 7/3/1 en boucle, somme mod 10 = chiffre de contrôle.
// Ligne TD3 (passeport, 44 caractères) construite pour ce test :
// numéro de document 'L898902C3' (check digit 6, valeur connue du manuel
// ICAO 9303 Part 4, exemple officiel), reprise telle quelle.
describe('validerChecksumMrz', () => {
  it('valide une ligne MRZ TD3 dont les chiffres de contrôle sont corrects', () => {
    // Exemple officiel ICAO 9303 Part 4 §4.2.2 (passeport de démonstration).
    const ligne2 = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';
    expect(validerChecksumMrz([ligne2])).toBe(true);
  });

  it('rejette une ligne MRZ TD3 dont un chiffre de contrôle est altéré', () => {
    const ligne2Alteree = 'L898902C36UTO7408122F1204159ZE184226B<<<<<19';
    expect(validerChecksumMrz([ligne2Alteree])).toBe(false);
  });

  it('rend null quand aucune ligne ne fait 30 ou 44 caractères', () => {
    expect(validerChecksumMrz(['trop court'])).toBeNull();
  });

  it('rend null pour une liste vide', () => {
    expect(validerChecksumMrz([])).toBeNull();
  });
});
