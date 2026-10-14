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

describe('EspaceService.resoudre — l’espace argent par les rôles de projet', () => {
  let prisma: { project_collaborators: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> } };
  let service: EspaceService;

  beforeEach(() => {
    prisma = {
      project_collaborators: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    };
    service = new EspaceService(prisma as never);
  });

  it('rend mon propre id sans en-tête, sans interroger la base', async () => {
    await expect(service.resoudre(MOI, undefined, 'argent')).resolves.toBe(MOI);
    await expect(service.resoudre(MOI, MOI, 'argent')).resolves.toBe(MOI);
    expect(prisma.project_collaborators.findFirst).not.toHaveBeenCalled();
  });

  it('cherche un projet DU PROPRIÉTAIRE où je suis comptable ou associé', async () => {
    prisma.project_collaborators.findFirst.mockResolvedValue({ role: 'comptable' });

    await expect(service.resoudre(MOI, PROPRIO, 'argent')).resolves.toBe(PROPRIO);
    expect(prisma.project_collaborators.findFirst).toHaveBeenCalledWith({
      where: { user_id: MOI, role: { in: ['comptable', 'associe'] }, project: { owner_id: PROPRIO } },
      select: { role: true },
    });
  });

  it.each(['comptable', 'associe'])('%s : accès à l’argent du propriétaire', async (role) => {
    prisma.project_collaborators.findFirst.mockResolvedValue({ role });
    await expect(service.resoudre(MOI, PROPRIO, 'argent')).resolves.toBe(PROPRIO);
  });

  it.each(['salarie', 'observateur', 'inconnu'])(
    '%s (même si la base le rendait) : 404, comme un espace qui n’existe pas',
    async (role) => {
      prisma.project_collaborators.findFirst.mockResolvedValue({ role });
      await expect(service.resoudre(MOI, PROPRIO, 'argent')).rejects.toThrow(
        new NotFoundException('Espace introuvable.'),
      );
    },
  );

  it('404 quand je ne suis pas (ou plus) collaborateur — la base est relue à chaque appel', async () => {
    prisma.project_collaborators.findFirst.mockResolvedValueOnce({ role: 'associe' }).mockResolvedValueOnce(null);

    await expect(service.resoudre(MOI, PROPRIO, 'argent')).resolves.toBe(PROPRIO);
    // Retiré entre deux requêtes : refus immédiat, aucun cache.
    await expect(service.resoudre(MOI, PROPRIO, 'argent')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.project_collaborators.findFirst).toHaveBeenCalledTimes(2);
  });

  it('404 sans toucher la base pour un en-tête qui n’est pas un uuid', async () => {
    await expect(service.resoudre(MOI, 'pas-un-uuid', 'argent')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.project_collaborators.findFirst).not.toHaveBeenCalled();
  });
});

describe('EspaceService.mesEspaces', () => {
  const lien = (
    role: string,
    owner_id: string,
    email: string,
    display_name: string | null = null,
    title = 'Boulangerie Dupont',
  ) => ({
    role,
    project: { owner_id, title, owner: { email, profile: display_name === null ? null : { display_name } } },
  });

  it('« Mon espace » d’abord, puis un espace par propriétaire avec mes rôles (sans doublon)', async () => {
    const findMany = vi.fn().mockResolvedValue([
      lien('comptable', PROPRIO, 'alice@exemple.fr', 'Alice'),
      lien('associe', AUTRE, 'bob@exemple.fr'),
      lien('associe', PROPRIO, 'alice@exemple.fr', 'Alice'),
      lien('comptable', PROPRIO, 'alice@exemple.fr', 'Alice'),
    ]);
    const service = new EspaceService({ project_collaborators: { findMany } } as never);

    await expect(service.mesEspaces(MOI)).resolves.toEqual([
      { ownerId: MOI, nom: 'Mon espace', roles: ['proprietaire'] },
      { ownerId: PROPRIO, nom: 'Espace de Alice', roles: ['comptable', 'associe'] },
      { ownerId: AUTRE, nom: 'Espace de l’entreprise Boulangerie Dupont', roles: ['associe'] },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: MOI, role: { in: ['comptable', 'associe'] } } }),
    );
  });

  it('sans nom affiché : jamais l’e-mail du propriétaire, mais le titre du PREMIER projet partagé', async () => {
    const findMany = vi.fn().mockResolvedValue([
      lien('comptable', PROPRIO, 'alice@exemple.fr', '   ', 'Atelier Alice'),
      lien('associe', PROPRIO, 'alice@exemple.fr', '   ', 'Second projet'),
      lien('associe', AUTRE, 'bob@exemple.fr', null, '  '),
    ]);
    const service = new EspaceService({ project_collaborators: { findMany } } as never);

    const espaces = await service.mesEspaces(MOI);
    expect(espaces.map((e) => e.nom)).toEqual([
      'Mon espace',
      'Espace de l’entreprise Atelier Alice',
      // Titre vide : le nom générique, toujours sans e-mail.
      'Espace de l’entreprise',
    ]);
    expect(JSON.stringify(espaces)).not.toContain('@');
    // L'e-mail n'est même plus lu en base.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { created_at: 'asc' },
        select: {
          role: true,
          project: {
            select: { owner_id: true, title: true, owner: { select: { profile: { select: { display_name: true } } } } },
          },
        },
      }),
    );
  });

  it('sans rôle argent nulle part : seulement « Mon espace »', async () => {
    const service = new EspaceService({ project_collaborators: { findMany: vi.fn().mockResolvedValue([]) } } as never);
    await expect(service.mesEspaces(MOI)).resolves.toEqual([{ ownerId: MOI, nom: 'Mon espace', roles: ['proprietaire'] }]);
  });

  it('ignore un rôle hors argent et un projet dont je serais moi-même propriétaire', async () => {
    const service = new EspaceService({
      project_collaborators: {
        findMany: vi.fn().mockResolvedValue([lien('salarie', PROPRIO, 'a@b.fr'), lien('comptable', MOI, 'moi@b.fr')]),
      },
    } as never);
    await expect(service.mesEspaces(MOI)).resolves.toHaveLength(1);
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
