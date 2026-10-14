import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { QuestionnerService } from '../../igini/questionner/questionner.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { QuestionnaireService } from './questionnaire.service.js';

const PROJET = { id: 'p1', owner_id: 'u1', title: 'Food-truck', description: 'Des tacos', sector: null };

function fauxPrisma(ligne: Record<string, unknown> | null = null) {
  const prisma = {
    projects: {
      findFirst: vi.fn(async ({ where }: { where: { owner_id: string } }) =>
        where.owner_id === 'u1' ? PROJET : null,
      ),
      findUnique: vi.fn(async () => PROJET),
      update: vi.fn(async () => PROJET),
      count: vi.fn(async () => 1),
    },
    project_questionnaires: {
      findUnique: vi.fn(async () => ligne),
      upsert: vi.fn(async (_args: unknown) => ({})),
    },
    project_igini_questions: {
      findMany: vi.fn(async () => []),
      createMany: vi.fn(async () => ({ count: 0 })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    user_profiles: { findUnique: vi.fn(async () => null) },
    user_experiences: { findMany: vi.fn(async () => []) },
    user_formations: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
  return prisma;
}

function service(prisma: ReturnType<typeof fauxPrisma>, questions = vi.fn()) {
  return new QuestionnaireService(
    prisma as unknown as PrismaService,
    { questionsPour: questions } as unknown as QuestionnerService,
  );
}

describe('QuestionnaireService', () => {
  it('refuse le projet de quelqu’un d’autre', async () => {
    await expect(service(fauxPrisma()).vue('u2', 'p1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enregistre le secteur dans le projet, pas dans les réponses', async () => {
    const prisma = fauxPrisma();
    await service(prisma).enregistrer('u1', 'p1', { secteur: 'Restauration', associes: 'Seul' });
    expect(prisma.projects.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { sector: 'Restauration' },
    });
    const ecrit = prisma.project_questionnaires.upsert.mock.calls[0][0] as unknown as {
      create: { reponses: Record<string, unknown> };
    };
    expect(ecrit.create.reponses).toEqual({ associes: 'Seul' });
  });

  it('vide le secteur sur « je ne sais pas encore »', async () => {
    const prisma = fauxPrisma();
    await service(prisma).enregistrer('u1', 'p1', { secteur: 'Je ne sais pas encore' });
    expect(prisma.projects.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { sector: null },
    });
  });

  it('traduit une réponse invalide en 400', async () => {
    await expect(
      service(fauxPrisma()).enregistrer('u1', 'p1', { associes: 'Avec 40 associés' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ne prépare les questions d’IGINI qu’une fois', async () => {
    const questions = vi.fn();
    const prisma = fauxPrisma({ project_id: 'p1', reponses: {}, questions_igini_le: new Date() });
    await service(prisma, questions).preparerQuestionsIgini('u1', 'p1');
    expect(questions).not.toHaveBeenCalled();
  });

  it('enregistre les questions et marque la préparation, même à zéro question', async () => {
    const questions = vi.fn(async () => ({ questions: [] }));
    const prisma = fauxPrisma();
    await service(prisma, questions).preparerQuestionsIgini('u1', 'p1');
    expect(questions).toHaveBeenCalledOnce();
    const marque = prisma.project_questionnaires.upsert.mock.calls[0][0] as unknown as {
      create: { questions_igini_le?: Date };
    };
    expect(marque.create.questions_igini_le).toBeInstanceOf(Date);
  });

  it('ne marque rien quand IGINI échoue, pour pouvoir réessayer', async () => {
    const questions = vi.fn(async () => {
      throw new Error('panne');
    });
    const prisma = fauxPrisma();
    await expect(service(prisma, questions).preparerQuestionsIgini('u1', 'p1')).rejects.toThrow(
      'panne',
    );
    expect(prisma.project_questionnaires.upsert).not.toHaveBeenCalled();
  });

  it('n’écrit une réponse que sur une question de ce projet', async () => {
    const prisma = fauxPrisma();
    await service(prisma).repondreQuestionsIgini('u1', 'p1', [
      { id: 'q1', reponse: '  Sur le marché  ' },
    ]);
    expect(prisma.project_igini_questions.updateMany).toHaveBeenCalledWith({
      where: { id: 'q1', project_id: 'p1' },
      data: { reponse: 'Sur le marché' },
    });
  });
});
