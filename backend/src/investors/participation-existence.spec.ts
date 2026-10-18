import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { InvestorsService } from './investors.service.js';

/**
 * La participation d'un autre investisseur doit répondre exactement comme un
 * identifiant qui n'existe pas : sinon l'identifiant suffit à savoir qu'elle
 * existe.
 */
function service(participation: unknown) {
  const prisma = {
    participations: { findUnique: vi.fn().mockResolvedValue(participation) },
    investor_movements: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return new InvestorsService(prisma as never, { guard: vi.fn() } as never);
}

async function reponse(promesse: Promise<unknown>) {
  const erreur = await promesse.then(
    () => null,
    (e: unknown) => e,
  );
  expect(erreur).toBeInstanceOf(HttpException);
  return { statut: (erreur as HttpException).getStatus(), message: (erreur as HttpException).message };
}

describe('Investisseurs : la participation d’un autre ne se distingue pas d’un identifiant inconnu', () => {
  it('même 404, même message, que la participation soit à un autre ou inexistante', async () => {
    const dUnAutre = { id: 'pa1', investor_id: 'autre', financed_project: { project: { title: 'X' } } };
    const chezUnAutre = await reponse(service(dUnAutre).participationDetail('moi', 'pa1'));
    const inexistante = await reponse(service(null).participationDetail('moi', 'pa1'));

    expect(chezUnAutre).toEqual(inexistante);
    expect(chezUnAutre.statut).toBe(404);
  });

  it('ma propre participation reste lisible', async () => {
    const mienne = { id: 'pa1', investor_id: 'moi', financed_project: { project: { title: 'X' } } };
    await expect(service(mienne).participationDetail('moi', 'pa1')).resolves.toBeDefined();
  });
});
