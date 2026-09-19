import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthTokensController } from './auth-tokens.controller.js';
import { EmailVerificationService } from './email-verification.service.js';
import { PasswordResetService } from './password-reset.service.js';

describe('AuthTokensController', () => {
  let controller: AuthTokensController;
  let passwordResetService: { requestReset: ReturnType<typeof vi.fn>; resetPassword: ReturnType<typeof vi.fn> };
  let emailVerificationService: {
    verifyEmail: ReturnType<typeof vi.fn>;
    resendVerification: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    passwordResetService = { requestReset: vi.fn(), resetPassword: vi.fn() };
    emailVerificationService = { verifyEmail: vi.fn(), resendVerification: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthTokensController],
      providers: [
        { provide: PasswordResetService, useValue: passwordResetService },
        { provide: EmailVerificationService, useValue: emailVerificationService },
      ],
    }).compile();

    controller = module.get<AuthTokensController>(AuthTokensController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('forgotPassword délègue au service', async () => {
    await controller.forgotPassword({ email: 'a@b.com' });

    expect(passwordResetService.requestReset).toHaveBeenCalledWith('a@b.com');
  });

  describe('resetPassword', () => {
    it('renvoie success si le service réussit', async () => {
      passwordResetService.resetPassword.mockResolvedValue(true);

      const result = await controller.resetPassword({ token: 'tok', newPassword: 'NouveauMdp123' });

      expect(result).toEqual({ success: true });
    });

    it('lève une BadRequestException si le token est invalide', async () => {
      passwordResetService.resetPassword.mockResolvedValue(false);

      await expect(
        controller.resetPassword({ token: 'tok', newPassword: 'NouveauMdp123' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('verifyEmail', () => {
    it('renvoie success si le service réussit', async () => {
      emailVerificationService.verifyEmail.mockResolvedValue(true);

      const result = await controller.verifyEmail({ token: 'tok' });

      expect(result).toEqual({ success: true });
    });

    it('lève une BadRequestException si le token est invalide', async () => {
      emailVerificationService.verifyEmail.mockResolvedValue(false);

      await expect(controller.verifyEmail({ token: 'tok' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('resendVerification délègue au service', async () => {
    await controller.resendVerification({ email: 'a@b.com' });

    expect(emailVerificationService.resendVerification).toHaveBeenCalledWith('a@b.com');
  });
});
