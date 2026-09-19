import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthTokenService } from './auth-token.service.js';

describe('AuthTokenService', () => {
  let service: AuthTokenService;
  let prisma: {
    auth_tokens: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    prisma = {
      auth_tokens: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthTokenService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AuthTokenService>(AuthTokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('issue', () => {
    it('crée un token avec le bon purpose et une date d\'expiration future, et renvoie le token en clair', async () => {
      prisma.auth_tokens.create.mockResolvedValue({ id: 't1' });

      const token = await service.issue('u1', 'password_reset', 60_000);

      expect(token).toMatch(/^[a-f0-9]{64}$/);
      expect(prisma.auth_tokens.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: 'u1',
          purpose: 'password_reset',
          token_hash: expect.any(String),
          expires_at: expect.any(Date),
        }),
      });
      // Le token en clair ne doit jamais être ce qui est stocké.
      const storedHash = prisma.auth_tokens.create.mock.calls[0][0].data.token_hash;
      expect(storedHash).not.toBe(token);
    });
  });

  describe('consume', () => {
    it("renvoie null si le token n'existe pas", async () => {
      prisma.auth_tokens.findUnique.mockResolvedValue(null);

      await expect(service.consume('inconnu', 'password_reset')).resolves.toBeNull();
      expect(prisma.auth_tokens.update).not.toHaveBeenCalled();
    });

    it('renvoie null si le purpose ne correspond pas', async () => {
      prisma.auth_tokens.findUnique.mockResolvedValue({
        id: 't1',
        user_id: 'u1',
        purpose: 'email_verification',
        used_at: null,
        expires_at: new Date(Date.now() + 60_000),
      });

      await expect(service.consume('tok', 'password_reset')).resolves.toBeNull();
    });

    it('renvoie null si le token est déjà utilisé', async () => {
      prisma.auth_tokens.findUnique.mockResolvedValue({
        id: 't1',
        user_id: 'u1',
        purpose: 'password_reset',
        used_at: new Date(),
        expires_at: new Date(Date.now() + 60_000),
      });

      await expect(service.consume('tok', 'password_reset')).resolves.toBeNull();
    });

    it('renvoie null si le token est expiré', async () => {
      prisma.auth_tokens.findUnique.mockResolvedValue({
        id: 't1',
        user_id: 'u1',
        purpose: 'password_reset',
        used_at: null,
        expires_at: new Date(Date.now() - 1_000),
      });

      await expect(service.consume('tok', 'password_reset')).resolves.toBeNull();
    });

    it("renvoie l'user_id et marque le token comme utilisé s'il est valide", async () => {
      prisma.auth_tokens.findUnique.mockResolvedValue({
        id: 't1',
        user_id: 'u1',
        purpose: 'password_reset',
        used_at: null,
        expires_at: new Date(Date.now() + 60_000),
      });
      prisma.auth_tokens.update.mockResolvedValue({});

      const result = await service.consume('tok', 'password_reset');

      expect(result).toBe('u1');
      expect(prisma.auth_tokens.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { used_at: expect.any(Date) },
      });
    });
  });
});
