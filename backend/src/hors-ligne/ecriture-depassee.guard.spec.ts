import { ConflictException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { PrismaService } from '../prisma/prisma.service.js';
import { EN_TETE_CAPTURE } from './ecriture-depassee.decorator.js';
import { EcritureDepasseeGuard } from './ecriture-depassee.guard.js';
import type { CibleDatee } from './ecriture-depassee.decorator.js';

/**
 * Le garde décide si une écriture faite hors ligne peut encore s'appliquer.
 *
 * Deux erreurs sont possibles, et elles ne coûtent pas la même chose :
 *
 *   — laisser passer une écriture périmée efface silencieusement le travail
 *     plus récent de quelqu'un ;
 *   — refuser une écriture valable bloque le travail que la personne vient
 *     de faire, et lui demande de le refaire sans qu'elle comprenne pourquoi.
 *
 * La seconde est plus fréquente et plus visible, donc le garde se trompe
 * toujours dans le premier sens. Les tests ci-dessous existent surtout pour
 * tenir cette asymétrie : la moitié d'entre eux vérifient qu'il LAISSE
 * PASSER.
 */

const MAINTENANT = new Date('2026-09-24T12:00:00.000Z').getTime();

function contexte(entetes: Record<string, string>, parametres: Record<string, string>) {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ headers: entetes, params: parametres }) }),
  } as unknown as ExecutionContext;
}

function garde(cible: CibleDatee | undefined, updatedAt: Date | null | 'introuvable') {
  const reflector = {
    getAllAndOverride: () => cible,
  } as unknown as Reflector;

  const prisma = {
    projects: {
      findUnique: () =>
        Promise.resolve(updatedAt === 'introuvable' ? null : { updated_at: updatedAt }),
    },
  } as unknown as PrismaService;

  return new EcritureDepasseeGuard(reflector, prisma);
}

const CIBLE: CibleDatee = { ressource: 'projects', parametre: 'id' };

describe('le garde des écritures revenues du froid', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MAINTENANT);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ce qu’il refuse', () => {
    it('refuse une écriture capturée avant la dernière modification', async () => {
      // Capturée il y a 10 minutes ; la ligne a bougé il y a 5.
      const modifiee = new Date(MAINTENANT - 5 * 60_000);

      await expect(
        garde(CIBLE, modifiee).canActivate(
          contexte({ [EN_TETE_CAPTURE]: String(10 * 60_000) }, { id: 'p1' }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('dit ce qui s’est passé et quoi faire, sans accuser la personne', async () => {
      const erreur = await garde(CIBLE, new Date(MAINTENANT - 5 * 60_000))
        .canActivate(contexte({ [EN_TETE_CAPTURE]: String(10 * 60_000) }, { id: 'p1' }))
        .then(
          () => {
            throw new Error('le garde aurait dû refuser');
          },
          (e: unknown) => e as ConflictException,
        );

      const corps = erreur.getResponse() as { message: string; modifieA: string };
      expect(erreur.getStatus()).toBe(409);
      expect(corps.message).toContain('hors ligne');
      expect(corps.message).toContain('refais');
      // La date de la modification concurrente, pour que l'interface puisse
      // un jour la montrer sans que le serveur ait à changer.
      expect(corps.modifieA).toBe(new Date(MAINTENANT - 5 * 60_000).toISOString());
    });
  });

  describe('ce qu’il laisse passer — la moitié qui compte', () => {
    it('laisse passer une requête sans en-tête : c’est une écriture en ligne', async () => {
      await expect(
        garde(CIBLE, new Date(MAINTENANT)).canActivate(contexte({}, { id: 'p1' })),
      ).resolves.toBe(true);
    });

    it('laisse passer quand la route n’est pas décorée', async () => {
      await expect(
        garde(undefined, new Date(MAINTENANT)).canActivate(
          contexte({ [EN_TETE_CAPTURE]: '999999' }, { id: 'p1' }),
        ),
      ).resolves.toBe(true);
    });

    it('laisse passer quand la ligne n’a pas bougé depuis la capture', async () => {
      // Capturée il y a 10 minutes ; la ligne n'a pas bougé depuis une heure.
      await expect(
        garde(CIBLE, new Date(MAINTENANT - 60 * 60_000)).canActivate(
          contexte({ [EN_TETE_CAPTURE]: String(10 * 60_000) }, { id: 'p1' }),
        ),
      ).resolves.toBe(true);
    });

    it('laisse passer quand la modification est exactement contemporaine', async () => {
      // Égalité : rien ne prouve qu'une autre écriture est passée entre les
      // deux. Refuser sur une égalité serait refuser sur un doute.
      await expect(
        garde(CIBLE, new Date(MAINTENANT - 10 * 60_000)).canActivate(
          contexte({ [EN_TETE_CAPTURE]: String(10 * 60_000) }, { id: 'p1' }),
        ),
      ).resolves.toBe(true);
    });

    it('laisse passer quand la ligne ne sait pas quand elle a changé', async () => {
      // `updated_at` est nullable au schéma. Sans date, il n'y a rien à
      // comparer — et un soupçon n'est pas un motif de refus.
      await expect(
        garde(CIBLE, null).canActivate(
          contexte({ [EN_TETE_CAPTURE]: String(10 * 60_000) }, { id: 'p1' }),
        ),
      ).resolves.toBe(true);
    });

    it('laisse passer quand la ligne est introuvable : le 404 du contrôleur dit mieux', async () => {
      await expect(
        garde(CIBLE, 'introuvable').canActivate(
          contexte({ [EN_TETE_CAPTURE]: String(10 * 60_000) }, { id: 'p1' }),
        ),
      ).resolves.toBe(true);
    });

    it('laisse passer un en-tête illisible plutôt que de bloquer sur notre propre bogue', async () => {
      for (const valeur of ['bientot', '', '-1', 'NaN']) {
        await expect(
          garde(CIBLE, new Date(MAINTENANT)).canActivate(
            contexte({ [EN_TETE_CAPTURE]: valeur }, { id: 'p1' }),
          ),
        ).resolves.toBe(true);
      }
    });

    it('laisse passer quand le paramètre attendu n’est pas dans l’URL', async () => {
      await expect(
        garde(CIBLE, new Date(MAINTENANT)).canActivate(
          contexte({ [EN_TETE_CAPTURE]: String(10 * 60_000) }, { autre: 'p1' }),
        ),
      ).resolves.toBe(true);
    });
  });

  describe('l’horloge de l’appareil ne peut pas fausser la décision', () => {
    it('une montre en retard d’une heure ne fait rien refuser', async () => {
      // C'est tout l'intérêt de transmettre un ÂGE et non une DATE. Si la
      // file envoyait `queuedAt`, ce cas refuserait tout ce que la personne
      // a fait hors ligne — la panne que ce dispositif doit éviter, pas
      // provoquer. L'âge, lui, ne dépend d'aucune horloge partagée.
      const ageReel = 10 * 60_000;
      const modifieeAvant = new Date(MAINTENANT - 30 * 60_000);

      await expect(
        garde(CIBLE, modifieeAvant).canActivate(
          contexte({ [EN_TETE_CAPTURE]: String(ageReel) }, { id: 'p1' }),
        ),
      ).resolves.toBe(true);
    });
  });
});
