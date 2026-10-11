import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CGU_VERSION } from './cgu';

/**
 * Le serveur refuse toute inscription dont la version des CGU n'est pas la
 * sienne. Si ce miroir dérivait, plus personne ne pourrait s'inscrire : on le
 * compare donc à la constante du serveur, lue dans le dépôt.
 */
describe('CGU_VERSION', () => {
  it('est la version en vigueur côté serveur', () => {
    const source = readFileSync(
      join(process.cwd(), '..', 'backend', 'src', 'users', 'cgu.ts'),
      'utf8',
    );
    const serveur = /CGU_VERSION_EN_VIGUEUR\s*=\s*'([^']+)'/.exec(source)?.[1];
    expect(serveur).toBeDefined();
    expect(CGU_VERSION).toBe(serveur);
  });
});
