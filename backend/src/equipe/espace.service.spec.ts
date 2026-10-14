import { NotFoundException } from '@nestjs/common';
import { EspaceService, espaceEtranger } from './espace.service.js';

const MOI = '11111111-1111-4111-8111-111111111111';
const PROPRIO = '22222222-2222-4222-8222-222222222222';
const AUTRE = '33333333-3333-4333-8333-333333333333';

describe('espaceEtranger (lecture de l’en-tête X-Espace)', () => {
  it('rend null sans en-tête, avec un en-tête vide ou égal à mon id', () => {
    expect(espaceEtranger(MOI, undefined)).toBeNull();
    expect(espaceEtranger(MOI, '')).toBeNull();
    expect(espaceEtranger(MOI, '   ')).toBeNull();
    expect(espaceEtranger(MOI, MOI)).toBeNull();
    expect(espaceEtranger(MOI, MOI.toUpperCase())).toBeNull();
  });

  it('rend l’id demandé, normalisé, quand il diffère du mien', () => {
    expect(espaceEtranger(MOI, ` ${PROPRIO.toUpperCase()} `)).toBe(PROPRIO);
  });

  it('rend la valeur brute pour un en-tête qui n’est pas un uuid (refusé ensuite)', () => {
    expect(espaceEtranger(MOI, 'pas-un-uuid')).toBe('pas-un-uuid');
    expect(espaceEtranger(MOI, [PROPRIO, PROPRIO])).toBe(`${PROPRIO}, ${PROPRIO}`);
  });
});

/** Avant / après la date limite de l'accès automatique (15/10/2026, Paris). */
const ANCIEN = new Date('2026-10-01T09:00:00Z');
const RECENT = new Date('2026-10-20T09:00:00Z');

type FauxPrismaEspace = {
  project_collaborators: { findMany: ReturnType<typeof vi.fn> };
  space_members: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
};

function fauxPrisma(): FauxPrismaEspace {
  return {
    project_collaborators: { findMany: vi.fn().mockResolvedValue([]) },
    space_members: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
}

describe('EspaceService.resoudre — l’espace argent par les rôles de projet', () => {
  let prisma: FauxPrismaEspace;
  let service: EspaceService;

  beforeEach(() => {
    prisma = fauxPrisma();
    service = new EspaceService(prisma as never);
  });

  it('rend mon propre id sans en-tête, sans interroger la base', async () => {
    await expect(service.resoudre(MOI, undefined, 'argent')).resolves.toBe(MOI);
    await expect(service.resoudre(MOI, MOI, 'argent')).resolves.toBe(MOI);
    expect(prisma.project_collaborators.findMany).not.toHaveBeenCalled();
    expect(prisma.space_members.findUnique).not.toHaveBeenCalled();
  });

  it('cherche mes lignes comptable / associé sur les projets DU PROPRIÉTAIRE, puis son choix pour moi', async () => {
    prisma.project_collaborators.findMany.mockResolvedValue([{ role: 'comptable', created_at: RECENT }]);

    await expect(service.resoudre(MOI, PROPRIO, 'argent')).resolves.toBe(PROPRIO);
    expect(prisma.project_collaborators.findMany).toHaveBeenCalledWith({
      where: { user_id: MOI, role: { in: ['comptable', 'associe'] }, project: { owner_id: PROPRIO } },
      select: { role: true, created_at: true },
    });
    expect(prisma.space_members.findUnique).toHaveBeenCalledWith({
      where: { owner_id_member_id: { owner_id: PROPRIO, member_id: MOI } },
      select: { role: true },
    });
  });

  it.each(['comptable', 'associe'])('%s ajouté après la date limite : accès automatique', async (role) => {
    prisma.project_collaborators.findMany.mockResolvedValue([{ role, created_at: RECENT }]);
    await expect(service.resoudre(MOI, PROPRIO, 'argent')).resolves.toBe(PROPRIO);
  });

  it('(a) activé par le propriétaire (ligne « argent ») : accès, même ajouté avant la date limite', async () => {
    prisma.project_collaborators.findMany.mockResolvedValue([{ role: 'comptable', created_at: ANCIEN }]);
    prisma.space_members.findUnique.mockResolvedValue({ role: 'argent' });
    await expect(service.resoudre(MOI, PROPRIO, 'argent')).resolves.toBe(PROPRIO);
  });

  it('ajouté avant la date limite et jamais activé : 404, comme un espace qui n’existe pas', async () => {
    prisma.project_collaborators.findMany.mockResolvedValue([{ role: 'associe', created_at: ANCIEN }]);
    await expect(service.resoudre(MOI, PROPRIO, 'argent')).rejects.toThrow(
      new NotFoundException('Espace introuvable.'),
    );
  });

  it('coupé par le propriétaire (ligne « refuse ») : 404, même ajouté après la date limite', async () => {
    prisma.project_collaborators.findMany.mockResolvedValue([{ role: 'comptable', created_at: RECENT }]);
    prisma.space_members.findUnique.mockResolvedValue({ role: 'refuse' });
    await expect(service.resoudre(MOI, PROPRIO, 'argent')).rejects.toThrow(
      new NotFoundException('Espace introuvable.'),
    );
  });

  it('retiré des projets : 404 même avec une ligne « argent », sans lire le choix', async () => {
    prisma.space_members.findUnique.mockResolvedValue({ role: 'argent' });
    await expect(service.resoudre(MOI, PROPRIO, 'argent')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.space_members.findUnique).not.toHaveBeenCalled();
  });

  it.each(['salarie', 'observateur', 'inconnu'])(
    '%s (même si la base le rendait, même activé) : 404',
    async (role) => {
      prisma.project_collaborators.findMany.mockResolvedValue([{ role, created_at: RECENT }]);
      prisma.space_members.findUnique.mockResolvedValue({ role: 'argent' });
      await expect(service.resoudre(MOI, PROPRIO, 'argent')).rejects.toThrow(
        new NotFoundException('Espace introuvable.'),
      );
    },
  );

  it('relu à chaque appel, sans cache : retiré ou coupé entre deux requêtes, refus immédiat', async () => {
    prisma.project_collaborators.findMany
      .mockResolvedValueOnce([{ role: 'associe', created_at: RECENT }])
      .mockResolvedValueOnce([{ role: 'associe', created_at: RECENT }])
      .mockResolvedValueOnce([]);
    prisma.space_members.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ role: 'refuse' });

    await expect(service.resoudre(MOI, PROPRIO, 'argent')).resolves.toBe(PROPRIO);
    await expect(service.resoudre(MOI, PROPRIO, 'argent')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.resoudre(MOI, PROPRIO, 'argent')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.project_collaborators.findMany).toHaveBeenCalledTimes(3);
  });

  it('404 sans toucher la base pour un en-tête qui n’est pas un uuid', async () => {
    await expect(service.resoudre(MOI, 'pas-un-uuid', 'argent')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.project_collaborators.findMany).not.toHaveBeenCalled();
  });
});

describe('EspaceService.mesEspaces', () => {
  const lien = (
    role: string,
    owner_id: string,
    email: string,
    display_name: string | null = null,
    title = 'Boulangerie Dupont',
    created_at: Date | null = RECENT,
  ) => ({
    role,
    created_at,
    project: { owner_id, title, owner: { email, profile: display_name === null ? null : { display_name } } },
  });

  function monter(liens: unknown[], choix: { owner_id: string; role: string }[] = []) {
    const prisma = fauxPrisma();
    prisma.project_collaborators.findMany.mockResolvedValue(liens);
    prisma.space_members.findMany.mockResolvedValue(choix);
    return { prisma, service: new EspaceService(prisma as never) };
  }

  it('« Mon espace » d’abord, puis un espace par propriétaire avec mes rôles (sans doublon)', async () => {
    const { service, prisma } = monter([
      lien('comptable', PROPRIO, 'alice@exemple.fr', 'Alice'),
      lien('associe', AUTRE, 'bob@exemple.fr'),
      lien('associe', PROPRIO, 'alice@exemple.fr', 'Alice'),
      lien('comptable', PROPRIO, 'alice@exemple.fr', 'Alice'),
    ]);

    await expect(service.mesEspaces(MOI)).resolves.toEqual([
      { ownerId: MOI, nom: 'Mon espace', roles: ['proprietaire'] },
      { ownerId: PROPRIO, nom: 'Espace de Alice', roles: ['comptable', 'associe'] },
      { ownerId: AUTRE, nom: 'Espace de l’entreprise Boulangerie Dupont', roles: ['associe'] },
    ]);
    expect(prisma.project_collaborators.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: MOI, role: { in: ['comptable', 'associe'] } } }),
    );
    // Les choix des propriétaires me concernant, en une lecture.
    expect(prisma.space_members.findMany).toHaveBeenCalledWith({
      where: { member_id: MOI, owner_id: { in: [PROPRIO, AUTRE] } },
      select: { owner_id: true, role: true },
    });
  });

  it('ne liste que les espaces où l’accès est EN VIGUEUR (activé, automatique)', async () => {
    const TROISIEME = '44444444-4444-4444-8444-444444444444';
    const QUATRIEME = '55555555-5555-4555-8555-555555555555';
    const { service } = monter(
      [
        // Ancien, activé par le propriétaire : oui.
        lien('comptable', PROPRIO, 'a@exemple.fr', 'Alice', 'A', ANCIEN),
        // Ancien, jamais activé : non.
        lien('associe', AUTRE, 'b@exemple.fr', 'Bob', 'B', ANCIEN),
        // Récent mais coupé : non.
        lien('comptable', TROISIEME, 'c@exemple.fr', 'Chloé', 'C', RECENT),
        // Récent, aucun choix : oui (automatique).
        lien('associe', QUATRIEME, 'd@exemple.fr', 'Dan', 'D', RECENT),
      ],
      [
        { owner_id: PROPRIO, role: 'argent' },
        { owner_id: TROISIEME, role: 'refuse' },
      ],
    );

    const espaces = await service.mesEspaces(MOI);
    expect(espaces.map((e) => e.ownerId)).toEqual([MOI, PROPRIO, QUATRIEME]);
  });

  it('sans nom affiché : jamais l’e-mail du propriétaire, mais le titre du PREMIER projet partagé', async () => {
    const { service, prisma } = monter([
      lien('comptable', PROPRIO, 'alice@exemple.fr', '   ', 'Atelier Alice'),
      lien('associe', PROPRIO, 'alice@exemple.fr', '   ', 'Second projet'),
      lien('associe', AUTRE, 'bob@exemple.fr', null, '  '),
    ]);

    const espaces = await service.mesEspaces(MOI);
    expect(espaces.map((e) => e.nom)).toEqual([
      'Mon espace',
      'Espace de l’entreprise Atelier Alice',
      // Titre vide : le nom générique, toujours sans e-mail.
      'Espace de l’entreprise',
    ]);
    expect(JSON.stringify(espaces)).not.toContain('@');
    // L'e-mail n'est même plus lu en base.
    expect(prisma.project_collaborators.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { created_at: 'asc' },
        select: {
          role: true,
          created_at: true,
          project: {
            select: { owner_id: true, title: true, owner: { select: { profile: { select: { display_name: true } } } } },
          },
        },
      }),
    );
  });

  it('sans rôle argent nulle part : seulement « Mon espace », sans lire les choix', async () => {
    const { service, prisma } = monter([]);
    await expect(service.mesEspaces(MOI)).resolves.toEqual([{ ownerId: MOI, nom: 'Mon espace', roles: ['proprietaire'] }]);
    expect(prisma.space_members.findMany).not.toHaveBeenCalled();
  });

  it('ignore un rôle hors argent et un projet dont je serais moi-même propriétaire', async () => {
    const { service } = monter([lien('salarie', PROPRIO, 'a@b.fr'), lien('comptable', MOI, 'moi@b.fr')]);
    await expect(service.mesEspaces(MOI)).resolves.toHaveLength(1);
  });
});

describe('EspaceService — l’accès à mon argent, vu et choisi par le propriétaire', () => {
  const BOB = '66666666-6666-4666-8666-666666666666';
  const CHLOE = '77777777-7777-4777-8777-777777777777';

  const collaborateur = (
    user_id: string,
    role: string,
    created_at: Date | null,
    email: string,
    display_name: string | null = null,
  ) => ({ user_id, role, created_at, user: { email, profile: display_name === null ? null : { display_name } } });

  function monter(liens: unknown[], choix: { member_id: string; role: string }[] = []) {
    const prisma = fauxPrisma();
    prisma.project_collaborators.findMany.mockResolvedValue(liens);
    prisma.space_members.findMany.mockResolvedValue(choix);
    return { prisma, service: new EspaceService(prisma as never) };
  }

  it('une entrée par personne (dédoublonnée sur mes projets), avec ses rôles, son accès et sa raison', async () => {
    const DAN = '88888888-8888-4888-8888-888888888888';
    const { service, prisma } = monter(
      [
        collaborateur(PROPRIO, 'comptable', ANCIEN, 'proprio@exemple.fr', 'Proprio'),
        collaborateur(BOB, 'comptable', ANCIEN, 'bob@exemple.fr', ' Bob '),
        collaborateur(CHLOE, 'associe', RECENT, 'chloe@exemple.fr'),
        collaborateur(BOB, 'associe', ANCIEN, 'bob@exemple.fr', ' Bob '),
        collaborateur(AUTRE, 'comptable', RECENT, 'autre@exemple.fr', 'Autre'),
        collaborateur(DAN, 'associe', null, 'dan@exemple.fr', 'Dan'),
      ],
      [
        { member_id: BOB, role: 'argent' },
        { member_id: AUTRE, role: 'refuse' },
      ],
    );

    await expect(service.accesArgentDeMonEquipe(PROPRIO)).resolves.toEqual([
      // Je ne suis jamais « membre » de mon propre argent, même si la base le disait.
      { memberId: BOB, nom: 'Bob', email: 'bob@exemple.fr', roles: ['comptable', 'associe'], acces: true, raison: 'active_par_toi' },
      // Sans nom affiché : l'e-mail (le propriétaire voit déjà celui de son équipe).
      { memberId: CHLOE, nom: 'chloe@exemple.fr', email: 'chloe@exemple.fr', roles: ['associe'], acces: true, raison: 'automatique' },
      { memberId: AUTRE, nom: 'Autre', email: 'autre@exemple.fr', roles: ['comptable'], acces: false, raison: 'coupe_par_toi' },
      { memberId: DAN, nom: 'Dan', email: 'dan@exemple.fr', roles: ['associe'], acces: false, raison: 'a_activer' },
    ]);
    expect(prisma.project_collaborators.findMany).toHaveBeenCalledWith({
      where: { role: { in: ['comptable', 'associe'] }, project: { owner_id: PROPRIO }, user_id: { not: PROPRIO } },
      orderBy: { created_at: 'asc' },
      select: {
        user_id: true,
        role: true,
        created_at: true,
        user: { select: { email: true, profile: { select: { display_name: true } } } },
      },
    });
    expect(prisma.space_members.findMany).toHaveBeenCalledWith({
      where: { owner_id: PROPRIO, member_id: { in: [BOB, CHLOE, AUTRE, DAN] } },
      select: { member_id: true, role: true },
    });
  });

  it('aucun comptable ni associé : liste vide, sans lire les choix', async () => {
    const { service, prisma } = monter([]);
    await expect(service.accesArgentDeMonEquipe(PROPRIO)).resolves.toEqual([]);
    expect(prisma.space_members.findMany).not.toHaveBeenCalled();
  });

  it('activer enregistre « argent » pour (propriétaire, membre) et rend la liste relue', async () => {
    const { service, prisma } = monter([collaborateur(BOB, 'comptable', ANCIEN, 'bob@exemple.fr', 'Bob')]);
    prisma.space_members.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ member_id: BOB, role: 'argent' }]);

    const liste = await service.choisirAccesArgent(PROPRIO, BOB.toUpperCase(), true);

    expect(prisma.space_members.upsert).toHaveBeenCalledWith({
      where: { owner_id_member_id: { owner_id: PROPRIO, member_id: BOB } },
      create: { owner_id: PROPRIO, member_id: BOB, role: 'argent' },
      update: { role: 'argent', created_at: expect.any(Date) },
    });
    expect(liste).toEqual([
      { memberId: BOB, nom: 'Bob', email: 'bob@exemple.fr', roles: ['comptable'], acces: true, raison: 'active_par_toi' },
    ]);
  });

  it('couper enregistre « refuse »', async () => {
    const { service, prisma } = monter([collaborateur(CHLOE, 'associe', RECENT, 'chloe@exemple.fr')]);
    await service.choisirAccesArgent(PROPRIO, CHLOE, false);
    expect(prisma.space_members.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { owner_id: PROPRIO, member_id: CHLOE, role: 'refuse' } }),
    );
  });

  it('404 pour quelqu’un qui n’est ni comptable ni associé chez moi — rien n’est écrit', async () => {
    const { service, prisma } = monter([collaborateur(BOB, 'comptable', ANCIEN, 'bob@exemple.fr')]);
    await expect(service.choisirAccesArgent(PROPRIO, CHLOE, true)).rejects.toThrow(
      new NotFoundException('Cette personne n’est ni comptable ni associée sur un de tes projets.'),
    );
    // Ni pour moi-même.
    await expect(service.choisirAccesArgent(PROPRIO, PROPRIO, true)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.space_members.upsert).not.toHaveBeenCalled();
  });
});


describe('EspaceService.activiteDeMonEquipe — le journal vu par le propriétaire', () => {
  it('ses 200 dernières lignes, les plus récentes d’abord, avec le nom de l’acteur (jamais son e-mail)', async () => {
    const quand = new Date('2026-10-14T10:00:00Z');
    const findMany = vi.fn().mockResolvedValue([
      { created_at: quand, methode: 'POST', chemin: '/caisse/journees', statut: 201, actor: { profile: { display_name: ' Bob ' } } },
      { created_at: quand, methode: 'PATCH', chemin: '/billing/documents/d1', statut: 422, actor: { profile: { display_name: '  ' } } },
      { created_at: quand, methode: 'DELETE', chemin: '/billing/documents/d2', statut: 204, actor: { profile: null } },
      // Compte de l'acteur supprimé depuis : l'acteur est détaché.
      { created_at: quand, methode: 'POST', chemin: '/banque/comptes', statut: 201, actor: null },
    ]);
    const service = new EspaceService({ space_activity: { findMany } } as never);

    await expect(service.activiteDeMonEquipe(PROPRIO)).resolves.toEqual([
      { date: quand.toISOString(), acteur: 'Bob', methode: 'POST', chemin: '/caisse/journees', statut: 201 },
      { date: quand.toISOString(), acteur: 'un membre', methode: 'PATCH', chemin: '/billing/documents/d1', statut: 422 },
      { date: quand.toISOString(), acteur: 'un membre', methode: 'DELETE', chemin: '/billing/documents/d2', statut: 204 },
      { date: quand.toISOString(), acteur: 'un membre', methode: 'POST', chemin: '/banque/comptes', statut: 201 },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { owner_id: PROPRIO },
      orderBy: { created_at: 'desc' },
      take: 200,
      select: {
        created_at: true,
        methode: true,
        chemin: true,
        statut: true,
        actor: { select: { profile: { select: { display_name: true } } } },
      },
    });
  });
});
