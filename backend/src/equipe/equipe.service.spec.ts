import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EquipeService } from './equipe.service.js';

vi.mock('../config/env.js', () => ({ getEnv: () => ({ FRONTEND_URL: 'https://ignitux.com' }) }));

const PROJET = { id: 'p1', owner_id: 'proprio', title: 'Ma boulangerie', collaborators: [] as { role: string }[] };

function monter() {
  const prisma = {
    projects: { findFirst: vi.fn().mockResolvedValue(PROJET), findUnique: vi.fn().mockResolvedValue(PROJET) },
    users: { findUnique: vi.fn().mockResolvedValue({ id: 'u2', email: 'b@exemple.fr' }) },
    project_collaborators: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'pc1', ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const mail = { send: vi.fn().mockResolvedValue('sent') };
  return { prisma, mail, service: new EquipeService(prisma as never, mail as never) };
}

describe('EquipeService', () => {
  it('dit à chacun son rôle et ses capacités sur le projet', async () => {
    const { service, prisma } = monter();
    prisma.projects.findFirst.mockResolvedValue({ ...PROJET, collaborators: [{ role: 'salarie' }] });

    const acces = await service.monAcces('u2', 'p1');

    expect(acces.role).toBe('salarie');
    expect(acces.capacites).toContain('modifier_taches');
    expect(acces.capacites).not.toContain('voir_financement');
  });

  it('invite avec le rôle choisi, observateur par défaut', async () => {
    const { service, prisma } = monter();

    await service.inviter('proprio', 'p1', 'b@exemple.fr', 'salarie');
    expect(prisma.project_collaborators.create.mock.calls[0][0].data).toEqual({
      project_id: 'p1',
      user_id: 'u2',
      role: 'salarie',
    });

    await service.inviter('proprio', 'p1', 'b@exemple.fr');
    expect(prisma.project_collaborators.create.mock.calls[1][0].data.role).toBe('observateur');
  });

  it('prévient la personne invitée par email, avec le projet, le rôle et le lien', async () => {
    const { service, mail } = monter();

    await service.inviter('proprio', 'p1', 'b@exemple.fr', 'associe');

    const [{ to, subject, text }] = mail.send.mock.calls[0];
    expect(to).toBe('b@exemple.fr');
    expect(subject).toContain('Ma boulangerie');
    expect(text).toContain('Associé');
    expect(text).toContain('https://ignitux.com');
  });

  it('un email qui ne part pas n’annule pas l’invitation', async () => {
    const { service, mail, prisma } = monter();
    mail.send.mockRejectedValue(new Error('SMTP injoignable'));

    await expect(service.inviter('proprio', 'p1', 'b@exemple.fr', 'associe')).resolves.toBeTruthy();
    expect(prisma.project_collaborators.create).toHaveBeenCalled();
  });

  it('refuse un rôle inconnu ou « proprietaire »', async () => {
    const { service } = monter();
    await expect(service.inviter('proprio', 'p1', 'b@exemple.fr', 'admin')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.inviter('proprio', 'p1', 'b@exemple.fr', 'proprietaire')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('garde les refus existants : compte inconnu, propriétaire, doublon', async () => {
    const { service, prisma } = monter();
    prisma.users.findUnique.mockResolvedValueOnce(null);
    await expect(service.inviter('proprio', 'p1', 'x@exemple.fr')).rejects.toBeInstanceOf(NotFoundException);

    prisma.users.findUnique.mockResolvedValueOnce({ id: 'proprio', email: 'p@exemple.fr' });
    await expect(service.inviter('proprio', 'p1', 'p@exemple.fr')).rejects.toBeInstanceOf(BadRequestException);

    prisma.project_collaborators.findFirst.mockResolvedValueOnce({ id: 'pc1' });
    await expect(service.inviter('proprio', 'p1', 'b@exemple.fr')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('réserve l’équipe au propriétaire : un associé ne peut ni inviter, ni changer un rôle, ni retirer', async () => {
    const { service, prisma } = monter();
    prisma.projects.findFirst.mockResolvedValue({ ...PROJET, collaborators: [{ role: 'associe' }] });

    await expect(service.inviter('u2', 'p1', 'c@exemple.fr')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.changerRole('u2', 'p1', 'u3', 'salarie')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.retirer('u2', 'p1', 'u3')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('change le rôle d’un membre, et renvoie 404 si ce n’est pas un membre', async () => {
    const { service, prisma } = monter();

    await service.changerRole('proprio', 'p1', 'u2', 'comptable');
    expect(prisma.project_collaborators.updateMany).toHaveBeenCalledWith({
      where: { project_id: 'p1', user_id: 'u2' },
      data: { role: 'comptable' },
    });

    prisma.project_collaborators.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.changerRole('proprio', 'p1', 'inconnu', 'comptable')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('liste l’équipe avec les rôles pour tout membre du projet', async () => {
    const { service, prisma } = monter();
    prisma.projects.findFirst.mockResolvedValue({ ...PROJET, collaborators: [{ role: 'comptable' }] });
    prisma.project_collaborators.findMany.mockResolvedValue([{ user_id: 'u2', role: 'comptable' }]);

    await expect(service.lister('u2', 'p1')).resolves.toEqual([{ user_id: 'u2', role: 'comptable' }]);
  });
});
