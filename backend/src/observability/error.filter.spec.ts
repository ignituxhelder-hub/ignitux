import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { UnexpectedErrorFilter } from './error.filter.js';

/**
 * Le dernier filet n'avait aucun test. C'est le genre d'oubli qui ne se voit
 * pas : il ne s'exécute que quand quelque chose a déjà mal tourné, donc
 * jamais pendant qu'on développe — et sa régression se découvre devant
 * quelqu'un à qui il vient de mentir.
 */
function attraper(exception: unknown) {
  const reponse = { code: 0, corps: undefined as never };
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({
        status: (code: number) => {
          reponse.code = code;
          return {
            json: (corps: unknown) => {
              reponse.corps = corps as never;
            },
          };
        },
      }),
      getRequest: () => ({ method: 'POST', url: '/projects', user: { id: 'u1' } }),
    }),
  } as unknown as ArgumentsHost;

  new UnexpectedErrorFilter().catch(exception, host);
  return { reponse };
}

describe('le dernier filet', () => {
  describe('une erreur prévue traverse sans être touchée', () => {
    // Remplacer un refus expliqué par « erreur interne » supprimerait
    // précisément le travail fait pour qu'un refus s'explique.
    it('laisse passer une 403 avec son corps', () => {
      const refus = new ForbiddenException({
        message: 'Ton offre couvre 1 projet.',
        offreQuiOuvre: 'entrepreneur',
      });

      const { reponse } = attraper(refus);

      expect(reponse.code).toBe(403);
      expect((reponse.corps as { offreQuiOuvre?: string }).offreQuiOuvre).toBe('entrepreneur');
    });

    it('laisse passer une 402 de plafond', () => {
      const { reponse } = attraper(
        new HttpException('Plafond atteint.', HttpStatus.PAYMENT_REQUIRED),
      );

      expect(reponse.code).toBe(402);
    });
  });

  describe('un corps trop volumineux', () => {
    // Le parseur JSON refuse AVANT toute validation, et lève une erreur qui
    // n'est pas une HttpException. Elle ressortait en « erreur de notre
    // côté » — faux, et faux dans le sens le plus coûteux : la personne
    // attend une réparation alors qu'elle n'a qu'à raccourcir.
    it('rend 413 et non 500', () => {
      const { reponse } = attraper({ type: 'entity.too.large' });

      expect(reponse.code).toBe(413);
    });

    it('reconnaît aussi un statut 413 porté par l’erreur elle-même', () => {
      const { reponse } = attraper({ status: 413, message: 'request entity too large' });

      expect(reponse.code).toBe(413);
    });

    it('dit que ce n’est pas une panne et que rien n’a été enregistré', () => {
      const { reponse } = attraper({ type: 'entity.too.large' });
      const message = (reponse.corps as { message: string }).message;

      expect(message).toMatch(/pas une panne/);
      expect(message).toMatch(/rien n’a été enregistré|rien n'a été enregistré/);
    });

    it('ne porte aucune référence de trace : il n’y a rien à tracer', () => {
      const { reponse } = attraper({ type: 'entity.too.large' });

      expect(reponse.corps).not.toHaveProperty('reference');
    });
  });

  describe('une panne imprévue', () => {
    it('rend 500 avec une référence citable', () => {
      const { reponse } = attraper(new Error('relation "projects" does not exist'));
      const corps = reponse.corps as { statusCode: number; message: string; reference: string };

      expect(corps.statusCode).toBe(500);
      expect(corps.reference).toMatch(/^[0-9a-f]{8}$/);
      expect(corps.message).toContain(corps.reference);
    });

    // Un message Prisma nomme des tables et des colonnes ; une pile nomme
    // des chemins de fichiers. Ce sont des renseignements offerts à qui
    // cherche par où entrer.
    it('ne laisse rien filtrer de l’intérieur', () => {
      const { reponse } = attraper(new Error('relation "public.users" does not exist at /srv/app'));
      const texte = JSON.stringify(reponse.corps);

      expect(texte).not.toContain('public.users');
      expect(texte).not.toContain('/srv/app');
    });

    it('tient aussi quand ce qui est levé n’est pas une Error', () => {
      const { reponse } = attraper('quelque chose a mal tourné');

      expect(reponse.code).toBe(500);
    });
  });
});
