import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BAREME_PUBLIC, prixEnEuros } from './bareme-public';

/**
 * La page d'accueil annonce des prix à quelqu'un qui n'a pas encore de
 * compte. Ce qu'elle annonce doit être ce que le serveur applique : on lit
 * donc la table du barème elle-même, dans le dépôt, comme `cgu.spec.ts` lit
 * la version des CGU.
 */
const source = readFileSync(
  join(process.cwd(), '..', 'backend', 'src', 'credits', 'bareme.ts'),
  'utf8',
);

function constante(nom: string): string {
  const valeur = new RegExp(`export const ${nom}\\s*=\\s*([^;]+);`).exec(source)?.[1];
  if (valeur === undefined) throw new Error(`${nom} introuvable dans bareme.ts`);
  return valeur.trim();
}

/** Le prix en crédits d'une ligne de la table BAREME. */
function credits(generateur: string): number {
  const debut = source.indexOf(`  ${generateur}: {`, source.indexOf('export const BAREME'));
  if (debut === -1) throw new Error(`${generateur} introuvable dans le barème`);
  const valeur = /credits:\s*(\d+),/.exec(source.slice(debut))?.[1];
  return Number(valeur);
}

describe('le barème annoncé sur la page d’accueil', () => {
  it('a la valeur du crédit et le cadeau de bienvenue du serveur', () => {
    expect(Number(constante('VALEUR_CREDIT_CENTIMES'))).toBe(BAREME_PUBLIC.valeurCreditCentimes);
    expect(Number(constante('CREDITS_BIENVENUE'))).toBe(BAREME_PUBLIC.bienvenue);
  });

  it('a les recharges du serveur, ni plus ni moins', () => {
    const bloc = /export const RECHARGES[^=]*=\s*\[([\s\S]*?)\];/.exec(source)?.[1] ?? '';
    const serveur = [...bloc.matchAll(/prixCentimes:\s*(\d+),\s*credits:\s*(\d+)/g)].map((m) => ({
      prixCentimes: Number(m[1]),
      credits: Number(m[2]),
    }));
    expect(serveur.length).toBeGreaterThan(0);
    expect(serveur).toEqual(BAREME_PUBLIC.recharges);
  });

  it.each(Object.entries(BAREME_PUBLIC.exemples))('%s coûte le prix du serveur', (generateur, prix) => {
    expect(credits(generateur)).toBe(prix);
  });

  it('annonce « paiement bientôt disponible » tant que le serveur ne recharge pas', () => {
    // La page d'accueil dit que la carte arrive : si le serveur ouvre les
    // recharges, ce texte doit changer avec lui.
    expect(constante('RECHARGE_DISPONIBLE')).toBe('false');
  });
});

describe('prixEnEuros', () => {
  it('écrit un prix rond sans centimes, dans chaque langue', () => {
    expect(prixEnEuros(2000, 'fr')).toBe('20');
    expect(prixEnEuros(2000, 'en')).toBe('20');
    expect(prixEnEuros(2000, 'pt')).toBe('20');
  });

  it('garde les centimes quand il y en a, avec le séparateur de la langue', () => {
    expect(prixEnEuros(10, 'fr')).toBe('0,10');
    expect(prixEnEuros(10, 'en')).toBe('0.10');
    expect(prixEnEuros(10, 'pt')).toBe('0,10');
  });
});
