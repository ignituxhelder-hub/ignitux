import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { MandatsService } from './mandats.service.js';

// L'interrupteur est un module : on le remplace par un état que chaque test
// règle, pour vérifier les deux positions sans toucher à la vraie valeur.
const interrupteur = vi.hoisted(() => ({ suspendus: false }));
vi.mock('./mandats-suspension.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./mandats-suspension.js')>();
  return {
    ...original,
    get MANDATS_SUSPENDUS() {
      return interrupteur.suspendus;
    },
  };
});

describe('MandatsService', () => {
  let service: MandatsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      identity_verifications: { findFirst: vi.fn() },
      projects: { findFirst: vi.fn() },
      mandates: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [MandatsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(MandatsService);
    interrupteur.suspendus = false;
  });

  it('refuse de créer un mandat sans vérification d’identité validée', async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'user-1' });
    prisma.identity_verifications.findFirst.mockResolvedValue(null);

    await expect(service.creerMandat('user-1', 'p1', 'depot_creation_entreprise')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('crée un mandat quand une vérification validée existe', async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'user-1' });
    prisma.identity_verifications.findFirst.mockResolvedValue({ id: 'v1', status: 'validee' });
    prisma.mandates.create.mockResolvedValue({ id: 'm1' });

    await service.creerMandat('user-1', 'p1', 'depot_creation_entreprise');

    expect(prisma.mandates.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        owner_id: 'user-1',
        project_id: 'p1',
        identity_verification_id: 'v1',
        purpose: 'depot_creation_entreprise',
        status: 'active',
      }),
    });
  });

  it('signe un mandat et fige le texte et l’horodatage', async () => {
    prisma.mandates.findFirst.mockResolvedValue({ id: 'm1', owner_id: 'user-1', signed_at: null });
    prisma.mandates.update.mockResolvedValue({ id: 'm1' });

    await service.signerMandat('user-1', 'm1', 'Jean Dupont', '203.0.113.4');

    expect(prisma.mandates.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: expect.objectContaining({
        signed_full_name: 'Jean Dupont',
        signer_ip: '203.0.113.4',
        mandate_text: expect.stringContaining('mandate Ignitux'),
      }),
    });
  });

  it('refuse de signer un mandat déjà signé', async () => {
    prisma.mandates.findFirst.mockResolvedValue({ id: 'm1', owner_id: 'user-1', signed_at: new Date() });

    await expect(service.signerMandat('user-1', 'm1', 'Jean Dupont', '203.0.113.4')).rejects.toThrow();
  });

  it('révoque un mandat actif', async () => {
    prisma.mandates.findFirst.mockResolvedValue({ id: 'm1', owner_id: 'user-1', status: 'active' });
    prisma.mandates.update.mockResolvedValue({ id: 'm1', status: 'revoquee' });

    await service.revoquerMandat('user-1', 'm1');

    expect(prisma.mandates.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: expect.objectContaining({ status: 'revoquee' }),
    });
  });

  it('refuse de révoquer le mandat d’un autre compte', async () => {
    prisma.mandates.findFirst.mockResolvedValue(null);
    await expect(service.revoquerMandat('user-1', 'm1')).rejects.toThrow(NotFoundException);
  });

  describe('signature suspendue en attendant un avis juridique', () => {
    const MESSAGE =
      'La signature de mandats est suspendue en attendant un avis juridique. Rien n’est déposé à ta place.';

    beforeEach(() => {
      interrupteur.suspendus = true;
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'user-1' });
      prisma.identity_verifications.findFirst.mockResolvedValue({ id: 'v1', status: 'validee' });
      prisma.mandates.findFirst.mockResolvedValue({
        id: 'm1',
        owner_id: 'user-1',
        signed_at: null,
        status: 'active',
      });
    });

    it('refuse de créer un mandat (409), sans rien écrire', async () => {
      const appel = service.creerMandat('user-1', 'p1', 'depot_creation_entreprise');
      await expect(appel).rejects.toThrow(ConflictException);
      await expect(appel).rejects.toThrow(MESSAGE);
      expect(prisma.mandates.create).not.toHaveBeenCalled();
    });

    it('refuse de signer un mandat déjà créé (409), sans rien écrire', async () => {
      const appel = service.signerMandat('user-1', 'm1', 'Jean Dupont', '203.0.113.4');
      await expect(appel).rejects.toThrow(ConflictException);
      await expect(appel).rejects.toThrow(MESSAGE);
      expect(prisma.mandates.update).not.toHaveBeenCalled();
    });

    it('laisse lire les mandats existants', async () => {
      prisma.mandates.findMany.mockResolvedValue([{ id: 'm1' }]);
      await expect(service.listerMesMandats('user-1')).resolves.toEqual([{ id: 'm1' }]);
    });

    it('laisse révoquer un mandat existant', async () => {
      prisma.mandates.update.mockResolvedValue({ id: 'm1', status: 'revoquee' });
      await service.revoquerMandat('user-1', 'm1');
      expect(prisma.mandates.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: expect.objectContaining({ status: 'revoquee' }),
      });
    });
  });
});
