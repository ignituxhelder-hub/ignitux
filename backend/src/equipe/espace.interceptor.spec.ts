import { Reflector } from '@nestjs/core';
import { EspaceInterceptor, PURGE_TOUTES_LES, RETENTION_ACTIVITE_JOURS } from './espace.interceptor.js';

const MOI = '11111111-1111-4111-8111-111111111111';
const PROPRIO = '22222222-2222-4222-8222-222222222222';
const JOUR = 24 * 60 * 60 * 1000;

/**
 * Rétention du journal d'activité (`space_activity`) : 12 mois. La purge se
 * fait au fil des écritures — à la première après le démarrage, puis une
 * fois toutes les PURGE_TOUTES_LES — sans jamais bloquer ni casser la requête.
 */
describe('EspaceInterceptor — rétention du journal d’activité', () => {
  let prisma: { space_activity: { create: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> } };
  let intercepteur: EspaceInterceptor;
  const noter = () =>
    (intercepteur as unknown as { noter: (r: unknown, a: string, s: number) => void }).noter(
      { method: 'POST', originalUrl: '/caisse/journees', headers: {}, espace: { ownerId: PROPRIO, domaine: 'argent' } },
      MOI,
      201,
    );

  beforeEach(() => {
    prisma = {
      space_activity: {
        create: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
    };
    intercepteur = new EspaceInterceptor(new Reflector(), prisma as never);
  });

  it('la rétention est de 12 mois', () => {
    expect(RETENTION_ACTIVITE_JOURS).toBe(365);
  });

  it('purge les lignes de plus de 365 jours à la première écriture, puis une fois toutes les 200', () => {
    noter();
    expect(prisma.space_activity.deleteMany).toHaveBeenCalledTimes(1);
    const { where } = prisma.space_activity.deleteMany.mock.calls[0][0];
    const limite = where.created_at.lt.getTime();
    expect(Math.abs(Date.now() - 365 * JOUR - limite)).toBeLessThan(5_000);

    for (let i = 1; i < PURGE_TOUTES_LES; i += 1) noter();
    expect(prisma.space_activity.deleteMany).toHaveBeenCalledTimes(1);

    noter();
    expect(prisma.space_activity.deleteMany).toHaveBeenCalledTimes(2);
    expect(prisma.space_activity.create).toHaveBeenCalledTimes(PURGE_TOUTES_LES + 1);
  });

  it('une purge qui échoue ne casse rien (ni exception, ni rejet non géré)', async () => {
    prisma.space_activity.deleteMany.mockRejectedValue(new Error('base indisponible'));
    expect(() => noter()).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    prisma.space_activity.deleteMany.mockImplementation(() => {
      throw new Error('synchrone');
    });
    intercepteur = new EspaceInterceptor(new Reflector(), prisma as never);
    expect(() => noter()).not.toThrow();
  });

  describe('au démarrage : la purge ne dépend pas de l’activité des membres', () => {
    it('purge les lignes de plus de 365 jours sans attendre aucune écriture', () => {
      intercepteur.onModuleInit();
      expect(prisma.space_activity.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.space_activity.create).not.toHaveBeenCalled();
      const limite = prisma.space_activity.deleteMany.mock.calls[0][0].where.created_at.lt.getTime();
      expect(Math.abs(Date.now() - 365 * JOUR - limite)).toBeLessThan(5_000);
    });

    it('ne bloque pas le démarrage : rien n’est attendu (aucune promesse rendue)', () => {
      prisma.space_activity.deleteMany.mockReturnValue(new Promise(() => undefined));
      expect(intercepteur.onModuleInit()).toBeUndefined();
    });

    it('une base indisponible au démarrage est seulement journalisée', async () => {
      const avertir = vi.spyOn(
        (intercepteur as unknown as { logger: { warn: (m: string) => void } }).logger,
        'warn',
      ).mockImplementation(() => undefined);
      prisma.space_activity.deleteMany.mockRejectedValue(new Error('base indisponible'));
      expect(() => intercepteur.onModuleInit()).not.toThrow();
      await new Promise((resolve) => setImmediate(resolve));
      expect(avertir).toHaveBeenCalledWith(expect.stringContaining('base indisponible'));

      prisma.space_activity.deleteMany.mockImplementation(() => {
        throw new Error('synchrone');
      });
      expect(() => intercepteur.onModuleInit()).not.toThrow();
    });

    it('la purge au fil des écritures reste en place après celle du démarrage', () => {
      intercepteur.onModuleInit();
      noter();
      expect(prisma.space_activity.deleteMany).toHaveBeenCalledTimes(2);
    });
  });
});
