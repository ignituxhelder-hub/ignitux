import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CGU_VERSION_EN_VIGUEUR } from '../cgu.js';
import { SignupDto } from './signup.dto.js';

/**
 * L'inscription n'enregistre une acceptation des CGU que si la personne l'a
 * réellement donnée, sur la version en vigueur.
 */
describe('SignupDto — acceptation des CGU', () => {
  const valide = {
    email: 'a@b.com',
    password: 'motdepasse',
    captchaToken: 'jeton',
    acceptCgu: true,
    cguVersion: CGU_VERSION_EN_VIGUEUR,
  };

  async function erreurs(corps: Record<string, unknown>) {
    return validate(plainToInstance(SignupDto, corps));
  }

  it('accepte une inscription qui accepte la version en vigueur', async () => {
    expect(await erreurs(valide)).toHaveLength(0);
  });

  it.each([
    ['absente', undefined],
    ['false', false],
    ['la chaîne "true"', 'true'],
  ])('refuse une acceptation %s', async (_cas, acceptCgu) => {
    const resultat = await erreurs({ ...valide, acceptCgu });
    const erreur = resultat.find((e) => e.property === 'acceptCgu');
    expect(erreur).toBeDefined();
    expect(Object.values(erreur!.constraints ?? {})[0]).toMatch(/conditions d'utilisation/);
  });

  it('refuse une autre version que celle en vigueur, avec un message qui dit de recharger', async () => {
    const resultat = await erreurs({ ...valide, cguVersion: '2026-09-30' });
    const erreur = resultat.find((e) => e.property === 'cguVersion');
    expect(erreur).toBeDefined();
    expect(Object.values(erreur!.constraints ?? {})[0]).toMatch(/recharge/);
  });

  it('refuse une version absente', async () => {
    const resultat = await erreurs({ ...valide, cguVersion: undefined });
    expect(resultat.map((e) => e.property)).toContain('cguVersion');
  });
});
