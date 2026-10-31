import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import robots from './robots';
import sitemap from './sitemap';

const ICI = dirname(fileURLToPath(import.meta.url));

/**
 * CE QUE GOOGLE ET LES APERÇUS DE PARTAGE VOIENT D'IGNITUX.
 *
 * `layout.tsx` charge les polices de Google : il ne s'importe pas dans un
 * test, on lit donc son texte.
 */
describe('référencement', () => {
  const layout = readFileSync(join(ICI, 'layout.tsx'), 'utf8');

  it('le titre et la description portent la promesse et ce que l’on cherche', () => {
    const titre = /const TITRE = "([^"]+)"/.exec(layout)?.[1] ?? '';
    const description = /const DESCRIPTION =\s*'([^']+)'/.exec(layout)?.[1] ?? '';

    expect(titre).toContain("De l'idée à l'entreprise");
    expect(titre).toContain('IGINI');
    // Au-delà, Google coupe.
    expect(titre.length).toBeLessThanOrEqual(60);
    expect(description.length).toBeGreaterThan(100);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).toMatch(/idée/);
    expect(description).toMatch(/entreprise en France/);
    expect(description).toMatch(/gratuits/);
    expect(description).not.toMatch(/Igini/);
  });

  it('déclare l’aperçu de partage (Open Graph) et l’adresse du site', () => {
    expect(layout).toContain("metadataBase: new URL('https://ignitux.com')");
    expect(layout).toMatch(/openGraph:\s*\{/);
    expect(layout).toMatch(/card: 'summary_large_image'/);
    expect(existsSync(join(ICI, 'opengraph-image.jpg'))).toBe(true);
    expect(readFileSync(join(ICI, 'opengraph-image.alt.txt'), 'utf8').trim().length).toBeGreaterThan(10);
  });

  it('une page qui a son titre ne répète pas « Ignitux » (le modèle l’ajoute)', () => {
    expect(layout).toContain("template: '%s · Ignitux'");
    for (const page of ['cgu/page.tsx', 'confidentialite/page.tsx', 'mentions-legales/page.tsx', 'not-found.tsx']) {
      const titre = /title: '([^']+)'/.exec(readFileSync(join(ICI, page), 'utf8'))?.[1] ?? '';
      expect(titre).not.toBe('');
      expect(titre).not.toContain('Ignitux');
    }
  });

  it('robots.txt ouvre le site public, écarte les écrans de compte et annonce le plan du site', () => {
    const regles = robots();
    const regle = Array.isArray(regles.rules) ? regles.rules[0] : regles.rules;

    expect(regle.allow).toBe('/');
    expect(regle.disallow).toEqual(expect.arrayContaining(['/accueil', '/projects', '/administration']));
    expect(regles.sitemap).toBe('https://ignitux.com/sitemap.xml');
  });

  it('le plan du site ne liste que des pages publiques qui existent', () => {
    const pages = sitemap();

    expect(pages[0].url).toBe('https://ignitux.com');
    for (const page of pages) {
      expect(page.url.startsWith('https://ignitux.com')).toBe(true);
      const chemin = page.url.replace('https://ignitux.com', '');
      if (chemin) expect(existsSync(join(ICI, chemin.slice(1), 'page.tsx'))).toBe(true);
      expect(robots().rules).not.toEqual(expect.objectContaining({ disallow: expect.arrayContaining([chemin]) }));
    }
  });
});
