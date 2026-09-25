import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { MarketplaceService } from './marketplace.service.js';

describe('MarketplaceService', () => {
  let service: MarketplaceService;
  let prisma: {
    marketplace_profiles: {
      upsert: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    marketplace_contacts: { create: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      marketplace_profiles: { upsert: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
      marketplace_contacts: { create: vi.fn(), findMany: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MarketplaceService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<MarketplaceService>(MarketplaceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upsertProfile', () => {
    it('crée ou met à jour le profil du user courant', async () => {
      prisma.marketplace_profiles.upsert.mockResolvedValue({ id: 'm1' });

      await service.upsertProfile('u1', 'mentor', 'Mentor en growth', 'Bio', ['growth', 'saas']);

      expect(prisma.marketplace_profiles.upsert).toHaveBeenCalledWith({
        where: { user_id: 'u1' },
        update: { role: 'mentor', headline: 'Mentor en growth', bio: 'Bio', expertise: ['growth', 'saas'] },
        create: { user_id: 'u1', role: 'mentor', headline: 'Mentor en growth', bio: 'Bio', expertise: ['growth', 'saas'] },
      });
    });
  });

  describe('listProfiles', () => {
    it('filtre par rôle quand fourni', async () => {
      prisma.marketplace_profiles.findMany.mockResolvedValue([]);

      await service.listProfiles('investisseur');

      expect(prisma.marketplace_profiles.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { role: 'investisseur' } }),
      );
    });

    it('ne filtre pas quand aucun rôle fourni', async () => {
      prisma.marketplace_profiles.findMany.mockResolvedValue([]);

      await service.listProfiles();

      expect(prisma.marketplace_profiles.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
    });

    it('ne demande jamais l’adresse email des inscrits', async () => {
      // L'annuaire renvoyait l'adresse de chaque mentor et de chaque
      // investisseur à n'importe quelle personne connectée — une requête,
      // tout l'annuaire — et l'interface ne l'affichait nulle part. Une
      // exposition sans usage, contraire à l'article 13.
      //
      // Elle n'est pas nécessaire : le produit a une mise en relation interne
      // pour écrire à quelqu'un sans connaître son adresse. Ce test existe
      // pour le jour où quelqu'un la remettra « juste pour déboguer ».
      prisma.marketplace_profiles.findMany.mockResolvedValue([]);

      await service.listProfiles();

      const appel = prisma.marketplace_profiles.findMany.mock.calls[0][0];
      expect(JSON.stringify(appel.include)).not.toContain('email');
      // Le nom d'affichage, lui, doit passer : sans lui l'annuaire ne dit
      // plus qui est qui.
      expect(JSON.stringify(appel.include)).toContain('display_name');
    });
  });

  describe('contactProfile', () => {
    it('lève une NotFoundException si le profil ciblé est introuvable', async () => {
      prisma.marketplace_profiles.findUnique.mockResolvedValue(null);

      await expect(service.contactProfile('u1', 'm1', 'Bonjour')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lève une BadRequestException si on essaie de se contacter soi-même', async () => {
      prisma.marketplace_profiles.findUnique.mockResolvedValue({ id: 'm1', user_id: 'u1' });

      await expect(service.contactProfile('u1', 'm1', 'Bonjour')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.marketplace_contacts.create).not.toHaveBeenCalled();
    });

    it('crée le message de contact', async () => {
      prisma.marketplace_profiles.findUnique.mockResolvedValue({ id: 'm1', user_id: 'u2' });
      prisma.marketplace_contacts.create.mockResolvedValue({ id: 'c1' });

      await service.contactProfile('u1', 'm1', 'Bonjour, intéressé par votre profil.');

      expect(prisma.marketplace_contacts.create).toHaveBeenCalledWith({
        data: { from_user_id: 'u1', to_profile_id: 'm1', message: 'Bonjour, intéressé par votre profil.' },
      });
    });
  });

  describe('listReceivedContacts', () => {
    it("renvoie un tableau vide si l'utilisateur n'a pas de profil", async () => {
      prisma.marketplace_profiles.findUnique.mockResolvedValue(null);

      const result = await service.listReceivedContacts('u1');

      expect(result).toEqual([]);
      expect(prisma.marketplace_contacts.findMany).not.toHaveBeenCalled();
    });

    it('renvoie les messages reçus pour le profil du user', async () => {
      prisma.marketplace_profiles.findUnique.mockResolvedValue({ id: 'm1', user_id: 'u1' });
      prisma.marketplace_contacts.findMany.mockResolvedValue([{ id: 'c1' }]);

      const result = await service.listReceivedContacts('u1');

      expect(prisma.marketplace_contacts.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { to_profile_id: 'm1' } }),
      );
      expect(result).toEqual([{ id: 'c1' }]);
    });
  });
});
