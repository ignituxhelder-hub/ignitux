import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../users/users.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { login: ReturnType<typeof vi.fn> };
  let usersService: { changePassword: ReturnType<typeof vi.fn> };
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    authService = { login: vi.fn() };
    usersService = { changePassword: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UsersService, useValue: usersService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('délègue au service et renvoie son résultat', async () => {
    authService.login.mockResolvedValue({ accessToken: 'token', user: { id: '1', email: 'a@b.com' } });

    const result = await controller.login({ email: 'a@b.com', password: 'motdepasse' });

    expect(authService.login).toHaveBeenCalledWith('a@b.com', 'motdepasse');
    expect(result).toEqual({ accessToken: 'token', user: { id: '1', email: 'a@b.com' } });
  });

  it('changePassword délègue au service avec l\'utilisateur courant', async () => {
    await controller.changePassword(currentUser, {
      currentPassword: 'ancien',
      newPassword: 'nouveau123',
    });

    expect(usersService.changePassword).toHaveBeenCalledWith('u1', 'ancien', 'nouveau123');
  });
});
