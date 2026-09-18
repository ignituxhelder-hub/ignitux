import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: { validateCredentials: ReturnType<typeof vi.fn> };
  let jwtService: { signAsync: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    usersService = { validateCredentials: vi.fn() };
    jwtService = { signAsync: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('renvoie un token pour des identifiants valides', async () => {
      usersService.validateCredentials.mockResolvedValue({ id: 'uuid-1', email: 'a@b.com' });
      jwtService.signAsync.mockResolvedValue('signed-token');

      const result = await service.login('a@b.com', 'motdepasse');

      expect(jwtService.signAsync).toHaveBeenCalledWith({ sub: 'uuid-1', email: 'a@b.com' });
      expect(result).toEqual({
        accessToken: 'signed-token',
        user: { id: 'uuid-1', email: 'a@b.com' },
      });
    });

    it('rejette des identifiants invalides', async () => {
      usersService.validateCredentials.mockResolvedValue(null);

      await expect(service.login('a@b.com', 'mauvais')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });
  });
});
