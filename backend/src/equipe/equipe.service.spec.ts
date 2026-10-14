import { BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
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
    // Les choix d'accès à l'argent : seule la création « si aucune ligne »
    // est permise à l'équipe ; tout le reste doit rester intact.
    space_members: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  const mail = { send: vi.fn().mockResolvedValue('sent') };
  return { prisma, mail, service: new EquipeService(prisma as never, mail as never) };
}

/** Ce qui ne doit jamais toucher un choix existant : ni écraser, ni supprimer. */
function rienNEstEcraseNiSupprime(prisma: ReturnType<typeof monter>['prisma']) {
  for (const op of ['upsert', 'update', 'updateMany', 'delete', 'deleteMany'] as const) {
    expect(prisma.space_members[op]).not.toHaveBeenCalled();
  }
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

  it.each(['associe', 'comptable'])(
    '%s : l’email dit que l’accès à l’argent du propriétaire est automatique et qu’il peut le couper',
    async (role) => {
      const { service, mail } = monter();

      await service.inviter('proprio', 'p1', 'b@exemple.fr', role);

      const [{ text }] = mail.send.mock.calls[0];
      expect(text).toContain('la facturation, la comptabilité, la banque et la caisse du propriétaire');
      expect(text).toContain('accès automatique, que le propriétaire peut couper à tout moment');
    },
  );

  it.each(['salarie', 'observateur'])('%s : l’email ne parle pas de l’argent du propriétaire', async (role) => {
    const { service, mail } = monter();

    await service.inviter('proprio', 'p1', 'b@exemple.fr', role);

    const [{ text }] = mail.send.mock.calls[0];
    expect(text).not.toContain('facturation');
    expect(text).not.toContain('automatique');
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

describe('EquipeService — le consentement à l’accès à l’argent, pris au geste du propriétaire', () => {
  /** La ligne (propriétaire du projet, membre) « argent_auto », créée seulement si aucune n'existe. */
  const ACCORD = {
    data: [{ owner_id: 'proprio', member_id: 'u2', role: 'argent_auto' }],
    skipDuplicates: true,
  };

  it.each(['comptable', 'associe'])(
    'inviter comme %s crée la ligne « argent_auto » si aucune n’existe — sans jamais écraser',
    async (role) => {
      const { service, prisma } = monter();

      await service.inviter('proprio', 'p1', 'b@exemple.fr', role);

      expect(prisma.space_members.createMany).toHaveBeenCalledTimes(1);
      expect(prisma.space_members.createMany).toHaveBeenCalledWith(ACCORD);
      rienNEstEcraseNiSupprime(prisma);
    },
  );

  it('la ligne est écrite après l’ajout au projet et avant l’e-mail d’invitation', async () => {
    const { service, prisma, mail } = monter();

    await service.inviter('proprio', 'p1', 'b@exemple.fr', 'comptable');

    const [ajout] = prisma.project_collaborators.create.mock.invocationCallOrder;
    const [accord] = prisma.space_members.createMany.mock.invocationCallOrder;
    const [email] = mail.send.mock.invocationCallOrder;
    expect(ajout).toBeLessThan(accord);
    expect(accord).toBeLessThan(email);
  });

  it.each(['salarie', 'observateur'])('inviter comme %s n’écrit aucun choix d’accès', async (role) => {
    const { service, prisma } = monter();

    await service.inviter('proprio', 'p1', 'b@exemple.fr', role);

    expect(prisma.space_members.createMany).not.toHaveBeenCalled();
    rienNEstEcraseNiSupprime(prisma);
  });

  it.each(['comptable', 'associe'])(
    'passer un membre %s (promotion, ou de l’un à l’autre) crée la ligne si aucune n’existe',
    async (role) => {
      const { service, prisma } = monter();

      await service.changerRole('proprio', 'p1', 'u2', role);

      expect(prisma.space_members.createMany).toHaveBeenCalledWith(ACCORD);
      rienNEstEcraseNiSupprime(prisma);
    },
  );

  it.each(['salarie', 'observateur'])(
    'passer un membre %s n’écrit ni ne supprime aucun choix (l’accès suit le rôle actuel)',
    async (role) => {
      const { service, prisma } = monter();

      await service.changerRole('proprio', 'p1', 'u2', role);

      expect(prisma.space_members.createMany).not.toHaveBeenCalled();
      rienNEstEcraseNiSupprime(prisma);
    },
  );

  it('changer le rôle de quelqu’un hors de l’équipe (404) : aucun choix écrit', async () => {
    const { service, prisma } = monter();
    prisma.project_collaborators.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.changerRole('proprio', 'p1', 'inconnu', 'associe')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.space_members.createMany).not.toHaveBeenCalled();
  });

  it('retirer quelqu’un ne supprime pas son choix d’accès (l’accès dépend déjà du rôle actuel)', async () => {
    const { service, prisma } = monter();

    await service.retirer('proprio', 'p1', 'u2');

    expect(prisma.project_collaborators.deleteMany).toHaveBeenCalled();
    expect(prisma.space_members.createMany).not.toHaveBeenCalled();
    rienNEstEcraseNiSupprime(prisma);
  });

  it('un associé (sans gerer_equipe) ne déclenche jamais d’écriture du choix', async () => {
    const { service, prisma } = monter();
    prisma.projects.findFirst.mockResolvedValue({ ...PROJET, collaborators: [{ role: 'associe' }] });

    await expect(service.inviter('u3', 'p1', 'b@exemple.fr', 'comptable')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.changerRole('u3', 'p1', 'u2', 'comptable')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.space_members.createMany).not.toHaveBeenCalled();
  });

  it('un échec de cette écriture n’annule ni l’invitation ni le changement de rôle : journalisé seulement', async () => {
    const { service, prisma, mail } = monter();
    prisma.space_members.createMany.mockRejectedValue(new Error('base injoignable'));
    const journal = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    try {
      await expect(service.inviter('proprio', 'p1', 'b@exemple.fr', 'comptable')).resolves.toMatchObject({
        user_id: 'u2',
        role: 'comptable',
      });
      // L'invitation est allée au bout : l'e-mail est parti.
      expect(mail.send).toHaveBeenCalledTimes(1);
      await expect(service.changerRole('proprio', 'p1', 'u2', 'associe')).resolves.toBeUndefined();

      expect(journal).toHaveBeenCalledTimes(2);
      expect(String(journal.mock.calls[0][0])).toContain('consentement non enregistré');
    } finally {
      journal.mockRestore();
    }
  });
});
