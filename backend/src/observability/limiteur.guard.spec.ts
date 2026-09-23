import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerLimitDetail } from '@nestjs/throttler';
import { LimiteurQuiSExplique } from './limiteur.guard.js';

/**
 * Le refus le plus fréquent du produit était le seul à ne pas s'expliquer.
 * Ces tests tiennent la phrase, parce qu'elle est lue par quelqu'un qui
 * essaie d'entrer chez lui et croit le site cassé.
 */
function refuser(detail: Partial<ThrottlerLimitDetail>) {
  const garde = new LimiteurQuiSExplique(
    {} as never,
    {} as never,
    {} as never,
  ) as unknown as {
    throwThrottlingException: (c: ExecutionContext, d: ThrottlerLimitDetail) => Promise<void>;
  };

  return garde
    .throwThrottlingException({} as ExecutionContext, {
      totalHits: 21,
      timeToExpire: 0,
      isBlocked: true,
      timeToBlockExpire: 0,
      ttl: 60_000,
      limit: 20,
      key: 'k',
      tracker: '127.0.0.1',
      ...detail,
    } as ThrottlerLimitDetail)
    .then(
      () => {
        throw new Error('le garde aurait dû refuser');
      },
      (erreur: unknown) => erreur as HttpException,
    );
}

describe('le limiteur qui s’explique', () => {
  it('refuse en 429, et non en 500', async () => {
    const erreur = await refuser({ timeToExpire: 42 });

    expect(erreur).toBeInstanceOf(HttpException);
    expect(erreur.getStatus()).toBe(429);
  });

  it('dit combien de secondes attendre', async () => {
    const corps = (await refuser({ timeToBlockExpire: 37 })).getResponse() as {
      message: string;
      secondesAAttendre: number;
    };

    expect(corps.secondesAAttendre).toBe(37);
    expect(corps.message).toContain('37 secondes');
  });

  it('ne dit jamais « 0 seconde », qui se lirait « réessaie maintenant »', async () => {
    // Juste avant la bascule, les deux compteurs peuvent valoir 0. Promettre
    // zéro renverrait la personne droit dans le mur qu'elle vient de heurter.
    const corps = (await refuser({ timeToExpire: 0, timeToBlockExpire: 0 })).getResponse() as {
      message: string;
      secondesAAttendre: number;
    };

    expect(corps.secondesAAttendre).toBeGreaterThan(0);
    // `not.toContain('0 seconde')` serait faux : « 60 secondes » le contient.
    // On vise le nombre entier, pas la suite de caractères.
    expect(corps.message).not.toMatch(/\b0 seconde/);
    // À défaut de compteur exploitable, on retombe sur la fenêtre complète.
    expect(corps.secondesAAttendre).toBe(60);
  });

  it('accorde le singulier', async () => {
    const corps = (await refuser({ timeToBlockExpire: 1 })).getResponse() as { message: string };

    expect(corps.message).toContain('1 seconde ');
    expect(corps.message).not.toContain('1 secondes');
  });

  it('dit que ce n’est pas une panne, et pourquoi la limite existe', async () => {
    // Sans ces deux phrases, la personne conclut que le site est cassé — et
    // c'est exactement ce que faisait « Une erreur est survenue. »
    const corps = (await refuser({ timeToExpire: 12 })).getResponse() as { message: string };

    expect(corps.message).toMatch(/pas une panne/);
    expect(corps.message).toMatch(/mot de passe/);
  });

  it('rend un objet, pas une chaîne — sinon l’interface n’y trouve rien', async () => {
    // La cause du défaut d'origine : `@nestjs/throttler` rendait la chaîne
    // « ThrottlerException: Too Many Requests », où le frontend cherchait un
    // champ `message` qu'il ne trouvait pas. D'où son texte de repli.
    const corps = (await refuser({ timeToExpire: 5 })).getResponse();

    expect(typeof corps).toBe('object');
    expect(corps).toHaveProperty('message');
    expect(JSON.stringify(corps)).not.toContain('ThrottlerException');
  });
});
