import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { accesProjet, exigerCapacite } from './acces-projet.js';

function prismaAvec(projet: unknown) {
  return { projects: { findFirst: vi.fn().mockResolvedValue(projet) } };
}

const PROJET = { id: 'p1', owner_id: 'proprio', collaborators: [] as { role: string }[] };

describe('accès à un projet', () => {
  it('reconnaît le propriétaire', async () => {
    const prisma = prismaAvec(PROJET);
    await expect(accesProjet(prisma as never, 'proprio', 'p1')).resolves.toEqual({
      role: 'proprietaire',
      ownerId: 'proprio',
    });
  });

  it('reconnaît un membre avec son rôle', async () => {
    const prisma = prismaAvec({ ...PROJET, collaborators: [{ role: 'salarie' }] });
    await expect(accesProjet(prisma as never, 'u2', 'p1')).resolves.toEqual({ role: 'salarie', ownerId: 'proprio' });
  });

  it('traite un rôle inconnu en base comme observateur (jamais plus de droits)', async () => {
    const prisma = prismaAvec({ ...PROJET, collaborators: [{ role: 'super-admin' }] });
    await expect(accesProjet(prisma as never, 'u2', 'p1')).resolves.toMatchObject({ role: 'observateur' });
  });

  it('renvoie 404 sans accès, sans révéler l’existence du projet', async () => {
    const prisma = prismaAvec(null);
    await expect(accesProjet(prisma as never, 'inconnu', 'p1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('relit le rôle à chaque appel : pas de droits mis en cache', async () => {
    const prisma = prismaAvec({ ...PROJET, collaborators: [{ role: 'associe' }] });
    await accesProjet(prisma as never, 'u2', 'p1');
    prisma.projects.findFirst.mockResolvedValue({ ...PROJET, collaborators: [{ role: 'observateur' }] });
    await expect(accesProjet(prisma as never, 'u2', 'p1')).resolves.toMatchObject({ role: 'observateur' });
    expect(prisma.projects.findFirst).toHaveBeenCalledTimes(2);
  });
});

describe('exiger une capacité', () => {
  it('laisse passer le propriétaire pour tout', async () => {
    const prisma = prismaAvec(PROJET);
    await expect(exigerCapacite(prisma as never, 'proprio', 'p1', 'supprimer_projet')).resolves.toMatchObject({
      ownerId: 'proprio',
    });
  });

  it('laisse un salarié cocher une tâche', async () => {
    const prisma = prismaAvec({ ...PROJET, collaborators: [{ role: 'salarie' }] });
    await expect(exigerCapacite(prisma as never, 'u2', 'p1', 'modifier_taches')).resolves.toMatchObject({
      role: 'salarie',
    });
  });

  it('refuse en 403, avec une phrase lisible, ce que le rôle ne permet pas', async () => {
    const prisma = prismaAvec({ ...PROJET, collaborators: [{ role: 'salarie' }] });
    const erreur = await exigerCapacite(prisma as never, 'u2', 'p1', 'modifier_projet').catch((e) => e);
    expect(erreur).toBeInstanceOf(ForbiddenException);
    expect(erreur.message).toMatch(/Salarié/);
  });

  it('un ancien collaborateur (observateur) garde la lecture et ne modifie rien', async () => {
    const prisma = prismaAvec({ ...PROJET, collaborators: [{ role: 'observateur' }] });
    await expect(exigerCapacite(prisma as never, 'u2', 'p1', 'voir_projet')).resolves.toBeTruthy();
    await expect(exigerCapacite(prisma as never, 'u2', 'p1', 'modifier_taches')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('renvoie 404, pas 403, à quelqu’un qui n’a aucun accès', async () => {
    const prisma = prismaAvec(null);
    await expect(exigerCapacite(prisma as never, 'x', 'p1', 'voir_projet')).rejects.toBeInstanceOf(NotFoundException);
  });
});
