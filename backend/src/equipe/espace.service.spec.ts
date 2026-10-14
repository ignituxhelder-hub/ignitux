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
  const lien = (role: string, owner_id: string, email: string, display_name: string | null = null) => ({
    role,
    project: { owner_id, owner: { email, profile: display_name === null ? null : { display_name } } },
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
      { ownerId: AUTRE, nom: 'Espace de bob@exemple.fr', roles: ['associe'] },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: MOI, role: { in: ['comptable', 'associe'] } } }),
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
