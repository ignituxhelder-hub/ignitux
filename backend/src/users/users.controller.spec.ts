import { Test, TestingModule } from '@nestjs/testing';
import { EmailVerificationService } from '../auth-tokens/email-verification.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: { signup: ReturnType<typeof vi.fn> };
  let emailVerificationService: { sendVerification: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    usersService = { signup: vi.fn() };
    emailVerificationService = { sendVerification: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: EmailVerificationService, useValue: emailVerificationService },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('délègue au service et renvoie son résultat', async () => {
    usersService.signup.mockResolvedValue({ id: 'uuid-1', email: 'a@b.com' });

    const result = await controller.signup({ email: 'a@b.com', password: 'motdepasse' });

    expect(usersService.signup).toHaveBeenCalledWith('a@b.com', 'motdepasse');
    expect(result).toEqual({ id: 'uuid-1', email: 'a@b.com' });
  });

  it("envoie un email de verification apres l'inscription", async () => {
    usersService.signup.mockResolvedValue({ id: 'uuid-1', email: 'a@b.com' });

    await controller.signup({ email: 'a@b.com', password: 'motdepasse' });

    expect(emailVerificationService.sendVerification).toHaveBeenCalledWith('uuid-1', 'a@b.com');
  });
});
