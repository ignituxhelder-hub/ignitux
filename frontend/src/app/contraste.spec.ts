import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CONTRASTE — le seul contrôle d'accessibilité qui se calcule sans
 * navigateur.
 *
 * Rien de ce qui a été construit dans les dernières sessions n'a été
 * regardé sur un écran réel. La lisibilité, elle, ne dépend pas d'un
 * navigateur : elle se déduit des couleurs. Ce test la vérifie donc à
 * chaque exécution de la suite.
 *
 * Il a d'ailleurs servi tout de suite. Trois paires introduites lors de
 * la refonte graphique échouaient, dont la pire de toutes : du texte
 * blanc sur l'étincelle du dégradé, à **1.78:1** — c'est-à-dire
 * illisible, en haut de chaque bouton principal du produit. Personne ne
 * l'aurait vu en relisant le CSS.
 *
 * Seuils WCAG 2.1 niveau AA : 4.5:1 pour du texte courant, 3:1 pour le
 * contour d'un élément d'interface (critère 1.4.11).
 */

const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');

/** Les jetons déclarés en dur dans `:root`. */
function readTokens(): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const match of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}

function toRgb(hex: string): [number, number, number] {
  let value = hex.replace('#', '');
  if (value.length === 3) {
    value = [...value].map((char) => char + char).join('');
  }
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const ratio = channel / 255;
    return ratio <= 0.03928 ? ratio / 12.92 : Math.pow((ratio + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('contraste des couleurs', () => {
  const tokens = readTokens();
  const color = (name: string) => {
    const value = tokens[name];
    if (!value) throw new Error(`Jeton --${name} introuvable dans globals.css`);
    return value;
  };

  it('lit bien les jetons du fichier', () => {
    // Garde-fou du garde-fou : si le format de `globals.css` changeait, les
    // tests suivants passeraient sur des valeurs vides sans rien vérifier.
    expect(Object.keys(tokens).length).toBeGreaterThan(15);
    expect(tokens.bg).toMatch(/^#[0-9a-f]{6}$/i);
  });

  describe('texte courant — 4.5:1 exigé', () => {
    it.each([
      ['texte sur le fond', 'text', 'bg'],
      ['texte sur une carte', 'text', 'surface'],
      ['texte atténué sur le fond', 'text-muted', 'bg'],
      ['texte atténué sur une carte', 'text-muted', 'surface'],
      ['texte atténué sur surface-2', 'text-muted', 'surface-2'],
      ['texte atténué dans une pastille', 'text-muted', 'surface-3'],
      ['surtitre du héros sur le fond', 'text-faint', 'bg'],
      ['erreur sur le fond', 'danger', 'bg'],
      ['erreur sur une carte', 'danger', 'surface'],
      ['succès sur une carte', 'ok', 'surface'],
      ['numéro d\'étape sur fond profond', 'spark', 'bg-deep'],
      ['pastille de feu', 'spark', 'accent-soft'],
    ])('%s', (_label, foreground, background) => {
      expect(contrast(color(foreground), color(background))).toBeGreaterThanOrEqual(4.5);
    });

    it('un lien reste lisible sur le fond et sur une carte', () => {
      // --accent vaut var(--flame) : on vise la valeur réelle.
      expect(contrast(color('flame'), color('bg'))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(color('flame'), color('surface'))).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('bouton principal — du texte blanc sur du feu', () => {
    /**
     * Les arrêts de `--grad-fire-solid`, lus dans le fichier. Le dégradé
     * décoratif `--grad-fire` monte plus haut en clarté, mais il ne porte
     * jamais de texte : marque découpée, point de chargement, liseré.
     */
    function buttonStops(): string[] {
      const line = /--grad-fire-solid:([^;]+);/.exec(css)?.[1] ?? '';
      const stops = [...line.matchAll(/#[0-9a-fA-F]{6}/g)].map((match) => match[0]);
      // `var(--ember)` n'est pas une valeur littérale : on l'ajoute.
      if (line.includes('var(--ember)')) stops.push(color('ember'));
      return stops;
    }

    it('déclare bien un dégradé dédié aux boutons', () => {
      expect(buttonStops().length).toBeGreaterThanOrEqual(2);
    });

    it('chaque arrêt du dégradé porte du blanc lisible', () => {
      // LE test de ce fichier. Avant correction, l'arrêt le plus clair
      // était #ffb347 et le blanc n'y valait que 1.78:1.
      for (const stop of buttonStops()) {
        expect(contrast('#ffffff', stop)).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("le dégradé décoratif reste libre d'être vif", () => {
      // Il ne porte aucun texte : le contraindre aurait terni la marque
      // sans rien gagner pour personne.
      expect(css).toContain('--grad-fire:');
      expect(contrast(color('spark'), color('bg'))).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe("contour d'élément d'interface — 3:1 exigé (WCAG 1.4.11)", () => {
    it('la bordure forte se distingue du fond', () => {
      // Elle dessine les champs de saisie et les boutons secondaires. Ni
      // leur fond ni celui de la carte ne rattrape l'écart : c'est la
      // bordure qui doit porter le contraste.
      expect(contrast(color('border-strong'), color('bg'))).toBeGreaterThanOrEqual(3);
    });

    it("l'acier de la boussole se distingue du fond", () => {
      expect(contrast(color('steel'), color('bg'))).toBeGreaterThanOrEqual(3);
    });
  });
});
