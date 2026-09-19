import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { AuthTokenService } from './auth-token.service.js';
import { EmailVerificationService } from './email-verification.service.js';

vi.mock('../config/env.js', () => ({
  getEnv: () => ({ FRONTEND_URL: 'http://localhost:3001' }),
}));

describe('EmailVerificationService', () => {
  let service: EmailVerificationService;
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
        EmailVerificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthTokenService, useValue: authTokenService },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get<EmailVerificationService>(EmailVerificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendVerification', () => {
    it('émet un token et envoie un email de confirmation', async () => {
      authTokenService.issue.mockResolvedValue('le-token-en-clair');

      await service.sendVerification('u1', 'a@b.com');

      expect(authTokenService.issue).toHaveBeenCalledWith(
        'u1',
        'email_verification',
        24 * 60 * 60 * 1000,
      );
      expect(mailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@b.com', text: expect.stringContaining('le-token-en-clair') }),
      );
    });
  });

  describe('verifyEmail', () => {
    it('renvoie false si le token est invalide', async () => {
      authTokenService.consume.mockResolvedValue(null);

      await expect(service.verifyEmail('mauvais-token')).resolves.toBe(false);
      expect(prisma.users.update).not.toHaveBeenCalled();
    });

    it("marque l'email comme vérifié et renvoie true si le token est valide", async () => {
      authTokenService.consume.mockResolvedValue('u1');
      prisma.users.update.mockResolvedValue({});

      const result = await service.verifyEmail('bon-token');

      expect(result).toBe(true);
      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { email_verified_at: expect.any(Date) },
      });
    });
  });

  describe('resendVerification', () => {
    it("ne fait rien si l'email n'existe pas", async () => {
      prisma.users.findUnique.mockResolvedValue(null);

      await service.resendVerification('inconnu@example.com');

      expect(authTokenService.issue).not.toHaveBeenCalled();
    });

    it('ne fait rien si l\'email est déjà vérifié', async () => {
      prisma.users.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        email_verified_at: new Date(),
      });

      await service.resendVerification('a@b.com');

      expect(authTokenService.issue).not.toHaveBeenCalled();
    });

    it("renvoie un email de verification si l'email existe et n'est pas encore vérifié", async () => {
      prisma.users.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', email_verified_at: null });
      authTokenService.issue.mockResolvedValue('token');

      await service.resendVerification('a@b.com');

      expect(authTokenService.issue).toHaveBeenCalledWith('u1', 'email_verification', 24 * 60 * 60 * 1000);
    });
  });
});
