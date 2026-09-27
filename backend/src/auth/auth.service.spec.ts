import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthTokenService } from '../auth-tokens/auth-token.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: { validateCredentials: ReturnType<typeof vi.fn> };
  let jwtService: { signAsync: ReturnType<typeof vi.fn> };
  let authTokenService: { issue: ReturnType<typeof vi.fn>; consume: ReturnType<typeof vi.fn> };
  let prisma: { users: { findUnique: ReturnType<typeof vi.fn> } };

  beforeEach(async () => {
    usersService = { validateCredentials: vi.fn() };
    jwtService = { signAsync: vi.fn() };
    authTokenService = { issue: vi.fn(), consume: vi.fn() };
    prisma = { users: { findUnique: vi.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: AuthTokenService, useValue: authTokenService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('renvoie un jeton d’accès et un jeton de rafraîchissement pour des identifiants valides', async () => {
      usersService.validateCredentials.mockResolvedValue({ id: 'uuid-1', email: 'a@b.com' });
      jwtService.signAsync.mockResolvedValue('signed-token');
      authTokenService.issue.mockResolvedValue('refresh-token');

      const result = await service.login('a@b.com', 'motdepasse');

      expect(jwtService.signAsync).toHaveBeenCalledWith({ sub: 'uuid-1', email: 'a@b.com' });
      expect(authTokenService.issue).toHaveBeenCalledWith('uuid-1', 'refresh', expect.any(Number));
      expect(result).toEqual({
        accessToken: 'signed-token',
        refreshToken: 'refresh-token',
        user: { id: 'uuid-1', email: 'a@b.com' },
      });
    });

    it('rejette des identifiants invalides', async () => {
      usersService.validateCredentials.mockResolvedValue(null);

      await expect(service.login('a@b.com', 'mauvais')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(jwtService.signAsync).not.toHaveBeenCalled();
      expect(authTokenService.issue).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('échange un jeton de rafraîchissement valide contre une nouvelle paire', async () => {
      authTokenService.consume.mockResolvedValue('uuid-1');
      prisma.users.findUnique.mockResolvedValue({ id: 'uuid-1', email: 'a@b.com' });
      jwtService.signAsync.mockResolvedValue('nouveau-jeton-acces');
      authTokenService.issue.mockResolvedValue('nouveau-jeton-rafraichissement');

      const result = await service.refresh('ancien-jeton');

      expect(authTokenService.consume).toHaveBeenCalledWith('ancien-jeton', 'refresh');
      expect(result).toEqual({
        accessToken: 'nouveau-jeton-acces',
        refreshToken: 'nouveau-jeton-rafraichissement',
        user: { id: 'uuid-1', email: 'a@b.com' },
      });
    });

    it('rejette un jeton invalide, expiré ou déjà utilisé', async () => {
      authTokenService.consume.mockResolvedValue(null);

      await expect(service.refresh('jeton-invalide')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.users.findUnique).not.toHaveBeenCalled();
    });

    it('rejette si le compte a été supprimé entre l’émission et l’usage du jeton', async () => {
      authTokenService.consume.mockResolvedValue('uuid-1');
      prisma.users.findUnique.mockResolvedValue(null);

      await expect(service.refresh('jeton-orphelin')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('consomme le jeton de rafraîchissement présenté', async () => {
      await service.logout('un-jeton');

      expect(authTokenService.consume).toHaveBeenCalledWith('un-jeton', 'refresh');
    });
  });
});
