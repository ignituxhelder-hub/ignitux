/** Les droits de l'équipe sur le financement et l'évaluation de financement. */
import { ForbiddenException } from '@nestjs/common';
import { EvaluationService } from '../evaluation-financement/evaluation.service.js';
import { FinancingService } from '../financing/financing.service.js';

vi.mock('../config/env.js', () => ({ getEnv: () => ({ FRONTEND_URL: 'https://ignitux.com' }) }));

const projetAvec = (role: string) => ({ id: 'p1', owner_id: 'proprio', title: 'Idée', collaborators: [{ role }] });

function prismaPour(role: string) {
  return {
    projects: { findFirst: vi.fn().mockResolvedValue(projetAvec(role)) },
    financing_rounds: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    financing_evaluations: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

const financement = (role: string) =>
  new FinancingService(prismaPour(role) as never, { guard: vi.fn() } as never);

describe('droits de l’équipe — financement', () => {
  it('un comptable et un associé lisent les tours de financement', async () => {
    await expect(financement('comptable').listRounds('u2', 'p1')).resolves.toMatchObject({ rounds: [] });
    await expect(financement('associe').listRounds('u2', 'p1')).resolves.toMatchObject({ rounds: [] });
  });

  it('un salarié ne voit pas le financement', async () => {
    await expect(financement('salarie').listRounds('u2', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('seul le propriétaire enregistre un tour : un associé reçoit 403', async () => {
    await expect(
      financement('associe').recordRound('u2', 'p1', 'equity' as never, 100, new Date('2026-10-01')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('droits de l’équipe — évaluation de financement', () => {
  function evaluation(role: string) {
    return new EvaluationService(
      prismaPour(role) as never,
      {} as never,
      { exiger: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('un associé et un comptable lisent les évaluations (contenu masqué tant que non validé)', async () => {
    await expect(evaluation('associe').lister('u2', 'p1')).resolves.toEqual([]);
    await expect(evaluation('comptable').lister('u2', 'p1')).resolves.toEqual([]);
  });

  it('seul le propriétaire demande une évaluation', async () => {
    await expect(evaluation('associe').demander('u2', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un salarié ne voit pas les évaluations', async () => {
    await expect(evaluation('salarie').lister('u2', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
