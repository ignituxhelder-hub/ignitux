import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * LA DIRECTION ARTISTIQUE « GRAVURE » — ce qu'on peut vérifier sans écran.
 *
 * Le rendu se juge à l'œil, et il l'a été : sur maquettes, avec Helder, le
 * 17/10/2026 (voir docs/superpowers/specs/2026-10-17-direction-artistique-
 * gravure-design.md). Ce fichier garde ce qui, une fois décidé, ne doit pas
 * se défaire en silence : la police chargée, les jetons d'or, et les replis
 * sans lesquels un navigateur un peu ancien afficherait une marque
 * transparente.
 *
 * Il lit les sources comme du texte, à la manière d'`accessibilite.spec.ts` :
 * la feuille de style n'est pas appliquée dans jsdom.
 */

const APP = join(process.cwd(), 'src', 'app');
const css = readFileSync(join(APP, 'globals.css'), 'utf8');
const layout = readFileSync(join(APP, 'layout.tsx'), 'utf8');

describe('direction artistique « Gravure »', () => {
  it('charge Cinzel pour les titres, avec le latin étendu', () => {
    expect(layout).toMatch(/Cinzel\(\{[^}]*subsets:\s*\['latin',\s*'latin-ext'\]/);
    expect(layout).toMatch(/Cinzel\(\{[^}]*variable:\s*'--font-display'/);
  });

  it("n'emporte plus Sora", () => {
    expect(layout).not.toContain('Sora');
  });

  it("déclare le dégradé d'or", () => {
    expect(css).toContain(
      '--grad-or: linear-gradient(180deg, #fff6df 0%, #f6d58e 38%, #d39a45 62%, #8a5420 100%)',
    );
  });

  it('la marque garde une couleur pleine hors de @supports', () => {
    // Sans repli, un navigateur sans background-clip: text afficherait une
    // marque transparente, c'est-à-dire invisible.
    expect(/\.brand-word\s*\{\s*color:\s*var\(--or\)/.test(css)).toBe(true);
  });

  it('les cartes portent le liseré doré', () => {
    const carte = /\n\.card\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(carte).toContain('var(--or-liseré)');
  });

  it('le bouton principal garde le feu porteur de texte', () => {
    // Le reflet doré s'ajoute ; le fond reste le dégradé testé pour le blanc.
    const bouton = /button\.primary\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(bouton).toContain('var(--grad-fire-solid)');
  });

  it('la jauge du questionnaire est en or (une mesure, pas une action)', () => {
    const questionnaire = readFileSync(
      join(APP, 'projects', '[id]', 'questionnaire', 'page.tsx'),
      'utf8',
    );
    expect(questionnaire).toContain("background: 'linear-gradient(90deg, var(--or-sombre), var(--or))'");
  });
});
