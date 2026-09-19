import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    users: {
      findUnique: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    prisma = {
      users: {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('signup', () => {
    it('crée le compte et ne renvoie ni le hash ni le mot de passe', async () => {
      prisma.users.findUnique.mockResolvedValue(null);
      prisma.users.create.mockResolvedValue({
        id: 'uuid-1',
        email: 'a@b.com',
        password_hash: 'hash',
        created_at: new Date(),
      });

      const result = await service.signup('a@b.com', 'motdepasse');

      expect(result).toEqual({ id: 'uuid-1', email: 'a@b.com' });
      expect(result).not.toHaveProperty('password_hash');
    });

    it('stocke le mot de passe hashé, jamais en clair', async () => {
      prisma.users.findUnique.mockResolvedValue(null);
      prisma.users.create.mockResolvedValue({ id: 'uuid-1', email: 'a@b.com' });

      await service.signup('a@b.com', 'motdepasse');

      const { data } = prisma.users.create.mock.calls[0][0];
      expect(data.password_hash).not.toBe('motdepasse');
      await expect(bcrypt.compare('motdepasse', data.password_hash)).resolves.toBe(true);
    });

    it('rejette un email déjà utilisé', async () => {
      prisma.users.findUnique.mockResolvedValue({ id: 'uuid-1', email: 'a@b.com' });

      await expect(service.signup('a@b.com', 'motdepasse')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.users.create).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('rejette si le mot de passe actuel est incorrect', async () => {
      const hash = await bcrypt.hash('bonmotdepasse', 10);
      prisma.users.findUniqueOrThrow.mockResolvedValue({ id: 'u1', password_hash: hash });

      await expect(service.changePassword('u1', 'mauvais', 'nouveaumotdepasse')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.users.update).not.toHaveBeenCalled();
    });

    it('met à jour le mot de passe si le mot de passe actuel est correct', async () => {
      const hash = await bcrypt.hash('bonmotdepasse', 10);
      prisma.users.findUniqueOrThrow.mockResolvedValue({ id: 'u1', password_hash: hash });
      prisma.users.update.mockResolvedValue({});

      await service.changePassword('u1', 'bonmotdepasse', 'nouveaumotdepasse');

      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { password_hash: expect.any(String) },
      });
      const newHash = prisma.users.update.mock.calls[0][0].data.password_hash;
      expect(newHash).not.toBe('nouveaumotdepasse');
      await expect(bcrypt.compare('nouveaumotdepasse', newHash)).resolves.toBe(true);
    });
  });
});
