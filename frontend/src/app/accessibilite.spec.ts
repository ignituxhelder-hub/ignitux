import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ACCESSIBILITÉ — ce qui se vérifie en lisant les sources.
 *
 * Comme le contraste, ces contrôles ne demandent pas de navigateur : ils
 * portent sur la structure du balisage, pas sur son rendu. Ils ne
 * remplacent pas un vrai test avec un lecteur d'écran — ils empêchent
 * seulement les fautes qu'on peut trouver sans en avoir un.
 *
 * Le contrôle des titres a servi dès sa première exécution : trois pages
 * — Communauté, Marketplace et la liste des projets — n'avaient aucun
 * `<h1>`. Quelqu'un qui navigue au lecteur d'écran saute de titre en
 * titre ; arriver sur une page dont le premier titre est un `<h2>`
 * perdu au milieu d'un formulaire, c'est arriver nulle part.
 */

const APP = join(process.cwd(), 'src', 'app');
const SRC = join(process.cwd(), 'src');

function filesUnder(dir: string, keep: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path, keep));
    else if (keep(path)) out.push(path);
  }
  return out;
}

const pages = filesUnder(APP, (path) => path.endsWith('page.tsx'));
const components = filesUnder(SRC, (path) => path.endsWith('.tsx') && !path.endsWith('.spec.tsx'));

/** Extrait une balise ouvrante entière, accolades JSX comprises. */
function openingTag(source: string, start: number): string {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (char === '>' && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start, start + 400);
}

describe('accessibilité du balisage', () => {
  it('trouve bien des pages et des composants à analyser', () => {
    // Sans ce garde-fou, une erreur de chemin rendrait tous les contrôles
    // suivants silencieusement verts.
    expect(pages.length).toBeGreaterThan(10);
    expect(components.length).toBeGreaterThan(15);
  });

  describe('titres', () => {
    it.each(pages.map((path) => [path.replace(APP, 'app'), path]))(
      '%s porte exactement un <h1>',
      (_label, path) => {
        // Exactement un : zéro laisse la page sans nom, plusieurs rendent
        // la navigation par titres ambiguë.
        const matches = readFileSync(path, 'utf8').match(/<h1[\s>]/g) ?? [];
        expect(matches).toHaveLength(1);
      },
    );
  });

  describe('champs de formulaire', () => {
    it('chaque champ porte une étiquette exploitable', () => {
      const orphans: string[] = [];

      for (const path of components) {
        const source = readFileSync(path, 'utf8');
        const labelled = new Set(
          [...source.matchAll(/htmlFor=["'{`]([^"'`}\s]+)/g)].map((match) => match[1]),
        );
        const dynamicPrefixes = [...source.matchAll(/htmlFor=\{`([^$`]+)\$\{/g)].map(
          (match) => match[1],
        );

        for (const match of source.matchAll(/<(input|select|textarea)\b/g)) {
          const tag = openingTag(source, match.index);
          if (/type=["']hidden["']/.test(tag)) continue;
          if (/aria-label(?:ledby)?=/.test(tag)) continue;

          const id = /\bid=["'{]?[`]?([^"'`}\s]+)/.exec(tag)?.[1];
          const dynamicId = /\bid=\{`([^$`]+)\$\{/.exec(tag)?.[1];
          const covered =
            (id !== undefined && labelled.has(id)) ||
            (dynamicId !== undefined && dynamicPrefixes.includes(dynamicId));

          if (!covered) {
            const line = source.slice(0, match.index).split('\n').length;
            orphans.push(`${path.replace(SRC, 'src')}:${line} <${match[1]}>`);
          }
        }
      }

      // Un champ sans étiquette est annoncé « zone de saisie » et rien de
      // plus : la personne doit deviner ce qu'on lui demande.
      expect(orphans).toEqual([]);
    });
  });

  describe('éléments interactifs', () => {
    it("aucun clic n'est posé sur un élément non interactif", () => {
      // Un `onClick` sur une `<div>` n'est ni atteignable au clavier ni
      // annoncé comme actionnable. Le produit n'en a aucun aujourd'hui :
      // ce test est là pour que ça reste vrai.
      const offenders: string[] = [];

      for (const path of components) {
        const source = readFileSync(path, 'utf8');
        for (const match of source.matchAll(/<(div|span|li|p|section|article)\b/g)) {
          if (/\bonClick=/.test(openingTag(source, match.index))) {
            const line = source.slice(0, match.index).split('\n').length;
            offenders.push(`${path.replace(SRC, 'src')}:${line} <${match[1]} onClick>`);
          }
        }
      }

      expect(offenders).toEqual([]);
    });

    it('toute image porte un texte de remplacement', () => {
      const offenders: string[] = [];

      for (const path of components) {
        const source = readFileSync(path, 'utf8');
        for (const match of source.matchAll(/<img\b/g)) {
          if (!/\balt=/.test(openingTag(source, match.index))) {
            offenders.push(path.replace(SRC, 'src'));
          }
        }
      }

      expect(offenders).toEqual([]);
    });
  });

  describe('document', () => {
    it('la langue est déclarée', () => {
      // Sans `lang`, un lecteur d'écran lit du français avec une voix
      // anglaise : quasi incompréhensible.
      const layout = readFileSync(join(APP, 'layout.tsx'), 'utf8');
      expect(layout).toMatch(/<html[^>]*lang="fr"/);
    });

    it('la marque décorative est masquée aux lecteurs d\'écran', () => {
      // La boussole ne porte aucune information que le mot « Ignitux »
      // juste à côté ne donne déjà.
      const mark = readFileSync(join(process.cwd(), 'src', 'components', 'ignitux-mark.tsx'), 'utf8');
      expect(mark).toContain('aria-hidden="true"');
    });
  });
});
