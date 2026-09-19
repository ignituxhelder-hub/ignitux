import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { AuthTokenService } from './auth-token.service.js';
import { PasswordResetService } from './password-reset.service.js';

// getEnv() valide process.env avec Zod et appelle process.exit(1) si
// DATABASE_URL/JWT_SECRET manquent — ce qui est le cas dans ce process de
// test, qui ne charge jamais le vrai .env. On la remplace ici, comme
// AuthModule le fait déjà en production via registerAsync pour la même raison.
vi.mock('../config/env.js', () => ({
  getEnv: () => ({ FRONTEND_URL: 'http://localhost:3001' }),
}));

describe('PasswordResetService', () => {
  let service: PasswordResetService;
  let prisma: {
    users: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  };
  let authTokenService: { issue: ReturnType<typeof vi.fn>; consume: ReturnType<typeof vi.fn> };
  let mailService: { send: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = { users: { findUnique: vi.fn(), update: vi.fn() } };
    authTokenService = { issue: vi.fn(), consume: vi.fn() };
    mailService = { send: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthTokenService, useValue: authTokenService },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get<PasswordResetService>(PasswordResetService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requestReset', () => {
    it("ne fait rien (silencieusement) si l'email n'existe pas — pas d'énumération", async () => {
      prisma.users.findUnique.mockResolvedValue(null);

      await service.requestReset('inconnu@example.com');

      expect(authTokenService.issue).not.toHaveBeenCalled();
      expect(mailService.send).not.toHaveBeenCalled();
    });

    it('émet un token et envoie un email si l\'utilisateur existe', async () => {
      prisma.users.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
      authTokenService.issue.mockResolvedValue('le-token-en-clair');

      await service.requestReset('a@b.com');

      expect(authTokenService.issue).toHaveBeenCalledWith('u1', 'password_reset', 60 * 60 * 1000);
      expect(mailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'a@b.com',
          text: expect.stringContaining('le-token-en-clair'),
        }),
      );
    });
  });

  describe('resetPassword', () => {
    it('renvoie false si le token est invalide', async () => {
      authTokenService.consume.mockResolvedValue(null);

      await expect(service.resetPassword('mauvais-token', 'NouveauMdp123')).resolves.toBe(false);
      expect(prisma.users.update).not.toHaveBeenCalled();
    });

    it('met à jour le mot de passe et renvoie true si le token est valide', async () => {
      authTokenService.consume.mockResolvedValue('u1');
      prisma.users.update.mockResolvedValue({});

      const result = await service.resetPassword('bon-token', 'NouveauMdp123');

      expect(result).toBe(true);
      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { password_hash: expect.any(String) },
      });
      // Le nouveau mot de passe ne doit jamais être stocké en clair.
      const storedHash = prisma.users.update.mock.calls[0][0].data.password_hash;
      expect(storedHash).not.toBe('NouveauMdp123');
    });
  });
});
