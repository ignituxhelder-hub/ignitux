import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { login: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authService = { login: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

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
});
