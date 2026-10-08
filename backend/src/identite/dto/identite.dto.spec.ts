import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SignMandateDto } from './identite.dto.js';

/**
 * La signature électronique simple n'a de valeur que si la personne a
 * explicitement coché la case de consentement : le serveur refuse donc toute
 * signature dont `accepte` n'est pas exactement `true` — ni absent, ni
 * `false`, ni une chaîne `"true"` (la ValidationPipe globale ne fait pas de
 * conversion implicite, voir main.ts).
 */
describe('SignMandateDto', () => {
  async function erreurs(corps: Record<string, unknown>) {
    return validate(plainToInstance(SignMandateDto, corps));
  }

  it('accepte un nom complet avec accepte: true', async () => {
    expect(await erreurs({ nomComplet: 'Jean Dupont', accepte: true })).toHaveLength(0);
  });

  it('refuse une signature sans consentement explicite', async () => {
    const resultat = await erreurs({ nomComplet: 'Jean Dupont' });
    expect(resultat.map((e) => e.property)).toContain('accepte');
  });

  it('refuse accepte: false', async () => {
    const resultat = await erreurs({ nomComplet: 'Jean Dupont', accepte: false });
    expect(resultat.map((e) => e.property)).toContain('accepte');
  });

  it('refuse la chaîne "true" à la place du booléen', async () => {
    const resultat = await erreurs({ nomComplet: 'Jean Dupont', accepte: 'true' });
    expect(resultat.map((e) => e.property)).toContain('accepte');
  });
});
