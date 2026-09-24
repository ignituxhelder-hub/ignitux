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

  /**
   * Tant que `MAIL_TRANSPORT` vaut `log`, aucun email ne part et la
   * première personne qui oublie son mot de passe est enfermée dehors.
   * `createResetLink` existe pour qu'un exploitant lui fabrique un lien et
   * le lui transmette autrement — voir `scripts/lien-mot-de-passe.mjs`.
   */
  describe('createResetLink', () => {
    it('rend le lien sans envoyer d’email', async () => {
      prisma.users.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
      authTokenService.issue.mockResolvedValue('le-token-en-clair');

      const lien = await service.createResetLink('a@b.com');

      expect(lien?.url).toContain('/reset-password?token=le-token-en-clair');
      expect(lien?.email).toBe('a@b.com');
      // Le facteur, c'est la console : rien ne doit partir d'ici.
      expect(mailService.send).not.toHaveBeenCalled();
    });

    it('émet un jeton de la même durée que celui de l’email', async () => {
      // Le lien de la console et celui de l'email doivent être le même
      // objet : une durée recopiée dans un script dériverait le jour où
      // l'une des deux change, et l'on enverrait un lien déjà mort.
      prisma.users.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
      authTokenService.issue.mockResolvedValue('t');

      await service.createResetLink('a@b.com');

      expect(authTokenService.issue).toHaveBeenCalledWith('u1', 'password_reset', 60 * 60 * 1000);
    });

    it('rend null sur un email inconnu, et laisse l’appelant décider', async () => {
      // La route publique se tait pour ne pas devenir un annuaire ; la
      // console, elle, doit le dire, sinon on cherche un lien qui n'arrivera
      // jamais. Le service ne tranche pas à leur place.
      prisma.users.findUnique.mockResolvedValue(null);

      expect(await service.createResetLink('inconnu@example.com')).toBeNull();
      expect(authTokenService.issue).not.toHaveBeenCalled();
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
