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

  it('le calque de braises est posé une fois pour tout le site', () => {
    expect(layout.match(/<Braises \/>/g)).toHaveLength(1);
  });

  it('les braises ne captent aucun toucher et passent sous le contenu', () => {
    // Sur l'appli installée, la barre des tâches est fixe en bas de l'écran :
    // un calque décoratif devant elle volerait les touchers.
    const calque = /\.braises\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(calque).toMatch(/pointer-events:\s*none/);
    expect(calque).toMatch(/z-index:\s*-1/);
    expect(calque).toMatch(/position:\s*fixed/);
  });

  it("« moins d'animations » retire les braises au lieu de les faire clignoter", () => {
    // Le fichier a plusieurs blocs prefers-reduced-motion : l'un d'eux doit
    // retirer le calque. Sans ça, `animation-iteration-count: 1` les ferait
    // passer une fois puis disparaître.
    const blocs = [
      ...css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g),
    ].map((m) => m[1]);
    expect(blocs.some((bloc) => /\.braises\s*\{\s*display:\s*none/.test(bloc))).toBe(true);
  });

  it('IGNITUX reste en or plein sans background-clip: text', () => {
    // Le grand titre de l'accueil : de l'or plein d'abord, le dégradé
    // découpé seulement là où le navigateur sait le faire.
    expect(/\.scene__nom\s*\{[^}]*color:\s*var\(--or\)/.test(css)).toBe(true);
    expect(/@supports[^{]*background-clip: text[^{]*\{\s*\.scene__nom/.test(css)).toBe(true);
  });

  it.each(['login', 'signup', 'forgot-password', 'reset-password', 'verify-email'])(
    '%s pose la boussole derrière le formulaire',
    (page) => {
      expect(readFileSync(join(APP, page, 'page.tsx'), 'utf8')).toContain(
        'className="page page--scene"',
      );
    },
  );

  it("la colonne de la boussole a une largeur définie, pas celle de l'image", () => {
    // Avec une colonne `auto`, la grille prenait la largeur naturelle de la
    // photo (810 px) et écrasait les deux colonnes de mots (« La vérité
    // avant tout » sur six lignes).
    const scene = /\n\.scene\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(scene).toMatch(/grid-template-columns:\s*1fr minmax\(0, 460px\) 1fr/);
  });

  it("les cartes sous la méthode passent sur une colonne au lieu de déborder", () => {
    // Sur un téléphone de 390 px, une colonne minimale plus large que l'écran
    // ferait glisser la page sur le côté : `min(100%, …)` l'en empêche.
    const grille = /\n\.accueil-grille\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(grille).toMatch(
      /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*\d+px\),\s*1fr\)\)/,
    );
  });

  it("un prix de l'accueil est gravé en or, pas en feu", () => {
    // Le feu est réservé à ce que la personne déclenche ; un prix se constate.
    const prix = /\.accueil-prix\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(prix).toMatch(/color:\s*var\(--or\)/);
    expect(prix).not.toMatch(/fire|flame|ember|spark|accent/);
  });

  it('un titre imprimé reprend la couleur du document', () => {
    // La facture s'imprime en noir sur blanc (`.document { color: #000 }`) ;
    // un h1 en or clair y tombait à 1,12:1 — invisible sur le papier.
    expect(/@media print\s*\{[^@]*?\bh1\s*\{\s*color:\s*inherit/.test(css)).toBe(true);
  });

  it('un titre saisi très long revient à la ligne au lieu de déborder', () => {
    // Un nom de projet sans espace, en capitales gravées, sortait de l'écran
    // d'un téléphone.
    const titres = /\nh1,\s*h2,\s*h3\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(titres).toMatch(/overflow-wrap:\s*break-word/);
  });

  it('les titres de page sont en or clair', () => {
    expect(/\nh1\s*\{[^}]*color:\s*var\(--or-clair\)/.test(css)).toBe(true);
  });

  it('le bureau porte la boussole en filigrane', () => {
    const bureau = readFileSync(join(APP, 'accueil', 'page.tsx'), 'utf8');
    expect(bureau).toMatch(/<IgnituxMark[^>]*className="hero-rose"/);
  });

  it('la boussole des pages de compte ne capte aucun toucher', () => {
    const decor = /\.page--scene::before\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(decor).toMatch(/pointer-events:\s*none/);
    expect(decor).toMatch(/z-index:\s*-1/);
  });
});
