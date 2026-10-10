import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { EvaluationRevueService } from './evaluation-revue.service.js';
import { rapport } from './evaluation.fixture.js';

const T = (h: number) => new Date(`2026-10-11T${String(h).padStart(2, '0')}:00:00Z`);

function enRevue(partiel: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    project_id: 'p1',
    requested_by: 'u1',
    status: 'en_revue',
    verdict: 'financable_apres_corrections',
    report: rapport(),
    ai_draft: rapport(),
    admin_note: null,
    created_at: T(8),
    updated_at: T(8),
    project: { title: 'Ma boulangerie', owner: { email: 'porteur@exemple.fr' } },
    edits: [],
    ...partiel,
  };
}

function monter() {
  const prisma = {
    financing_evaluations: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(enRevue()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    financing_evaluation_edits: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
  const evaluations = { generer: vi.fn().mockResolvedValue(undefined) };
  const service = new EvaluationRevueService(prisma as never, evaluations as never);
  return { service, prisma, evaluations };
}

describe('EvaluationRevueService', () => {
  it('liste seulement les évaluations en revue, la plus ancienne d’abord', async () => {
    const { service, prisma } = monter();
    prisma.financing_evaluations.findMany.mockResolvedValue([enRevue()]);

    const file = await service.file();

    expect(prisma.financing_evaluations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'en_revue' }, orderBy: { created_at: 'asc' } }),
    );
    expect(file).toEqual([
      {
        id: 'e1',
        projetTitre: 'Ma boulangerie',
        entrepreneurEmail: 'porteur@exemple.fr',
        verdict: 'financable_apres_corrections',
        createdAt: T(8),
      },
    ]);
  });

  it('renvoie 404 pour une évaluation inconnue', async () => {
    const { service, prisma } = monter();
    prisma.financing_evaluations.findUnique.mockResolvedValue(null);
    await expect(service.detail('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enregistre une trace avant/après pour chaque section modifiée, sans toucher ai_draft', async () => {
    const { service, prisma } = monter();

    await service.modifier('admin', 'e1', [
      { section: 'verdict', valeur: 'financable' },
      { section: 'resume', valeur: 'Nouveau résumé' },
    ]);

    const update = prisma.financing_evaluations.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'e1', status: 'en_revue' });
    expect(update.data.verdict).toBe('financable');
    expect(update.data.report.resume).toBe('Nouveau résumé');
    expect(update.data.report.verdict).toBe('financable');
    expect(update.data).not.toHaveProperty('ai_draft');
    expect(prisma.financing_evaluation_edits.createMany).toHaveBeenCalledWith({
      data: [
        { evaluation_id: 'e1', editor_id: 'admin', section: 'verdict', before: 'financable_apres_corrections', after: 'financable' },
        { evaluation_id: 'e1', editor_id: 'admin', section: 'resume', before: rapport().resume, after: 'Nouveau résumé' },
      ],
    });
  });

  it('enregistre la note d’Ignitux et sa trace', async () => {
    const { service, prisma } = monter();

    await service.modifier('admin', 'e1', [], 'Dossier sérieux.');

    expect(prisma.financing_evaluations.updateMany.mock.calls[0][0].data.admin_note).toBe('Dossier sérieux.');
    expect(prisma.financing_evaluation_edits.createMany.mock.calls[0][0].data[0]).toMatchObject({
      section: 'note',
      before: Prisma.DbNull,
      after: 'Dossier sérieux.',
    });
  });

  it('refuse une valeur de section invalide', async () => {
    const { service, prisma } = monter();

    await expect(
      service.modifier('admin', 'e1', [{ section: 'verdict', valeur: 'peut-etre' }]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.financing_evaluations.updateMany).not.toHaveBeenCalled();
  });

  it('valide : statut validee, reviewed_by et reviewed_at posés', async () => {
    const { service, prisma } = monter();

    await service.valider('admin', 'e1');

    const appel = prisma.financing_evaluations.updateMany.mock.calls[0][0];
    expect(appel.where).toEqual({ id: 'e1', status: 'en_revue' });
    expect(appel.data).toMatchObject({ status: 'validee', reviewed_by: 'admin' });
    expect(appel.data.reviewed_at).toBeInstanceOf(Date);
  });

  it('refuse en 409 une seconde validation (déjà validée, deux onglets)', async () => {
    const { service, prisma } = monter();
    prisma.financing_evaluations.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.valider('admin', 'e1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('faire refaire : exige une consigne, repasse en préparation et relance la génération avec elle', async () => {
    const { service, prisma, evaluations } = monter();

    await expect(service.faireRefaire('admin', 'e1', '   ')).rejects.toBeInstanceOf(BadRequestException);

    await service.faireRefaire('admin', 'e1', 'Reprends le marché avec les chiffres du secteur.');

    expect(prisma.financing_evaluations.updateMany).toHaveBeenCalledWith({
      where: { id: 'e1', status: 'en_revue' },
      data: { status: 'en_preparation', redo_instruction: 'Reprends le marché avec les chiffres du secteur.' },
    });
    expect(evaluations.generer).toHaveBeenCalledWith('e1', 'Reprends le marché avec les chiffres du secteur.');
    expect(prisma.financing_evaluation_edits.createMany).toHaveBeenCalledWith({
      data: [
        {
          evaluation_id: 'e1',
          editor_id: 'admin',
          section: 'consigne',
          before: Prisma.DbNull,
          after: 'Reprends le marché avec les chiffres du secteur.',
        },
      ],
    });
  });

  it('refuser : exige un motif non vide', async () => {
    const { service, prisma } = monter();

    await expect(service.refuser('admin', 'e1', '')).rejects.toBeInstanceOf(BadRequestException);
    await service.refuser('admin', 'e1', 'Projet trop flou pour être évalué.');

    expect(prisma.financing_evaluations.updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'refusee',
      refusal_reason: 'Projet trop flou pour être évalué.',
      reviewed_by: 'admin',
    });
  });
});
