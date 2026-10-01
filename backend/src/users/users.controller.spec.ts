import { Test, TestingModule } from '@nestjs/testing';
import { EmailVerificationService } from '../auth-tokens/email-verification.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { TurnstileVerificationService } from './turnstile-verification.service.js';
import { UserDataService } from './user-data.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

const ME = { id: 'u1', email: 'a@b.com' };

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: { signup: ReturnType<typeof vi.fn> };
  let emailVerificationService: { sendVerification: ReturnType<typeof vi.fn> };
  let turnstileVerificationService: { verify: ReturnType<typeof vi.fn> };
  let userDataService: {
    exportUserData: ReturnType<typeof vi.fn>;
    previewDeletion: ReturnType<typeof vi.fn>;
    deleteAccount: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    usersService = { signup: vi.fn() };
    emailVerificationService = { sendVerification: vi.fn() };
    // Vraie par défaut : la plupart des tests portent sur autre chose que le
    // CAPTCHA lui-même, voir le describe dédié plus bas.
    turnstileVerificationService = { verify: vi.fn().mockResolvedValue(true) };
    userDataService = {
      exportUserData: vi.fn(),
      previewDeletion: vi.fn(),
      deleteAccount: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: EmailVerificationService, useValue: emailVerificationService },
        { provide: TurnstileVerificationService, useValue: turnstileVerificationService },
        { provide: UserDataService, useValue: userDataService },
      ],
    })
      // Les routes /users/me/* sont protégées par JwtAuthGuard ; on teste
      // ici la délégation du contrôleur, pas l'authentification elle-même
      // (même approche que les autres specs de contrôleur protégé).
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('délègue au service et renvoie son résultat', async () => {
    usersService.signup.mockResolvedValue({ id: 'uuid-1', email: 'a@b.com' });

    const result = await controller.signup({
      email: 'a@b.com',
      password: 'motdepasse',
      captchaToken: 'jeton-valide',
    });

    expect(usersService.signup).toHaveBeenCalledWith('a@b.com', 'motdepasse');
    expect(result).toEqual({ id: 'uuid-1', email: 'a@b.com' });
  });

  it("envoie un email de verification apres l'inscription", async () => {
    usersService.signup.mockResolvedValue({ id: 'uuid-1', email: 'a@b.com' });

    await controller.signup({
      email: 'a@b.com',
      password: 'motdepasse',
      captchaToken: 'jeton-valide',
    });

    expect(emailVerificationService.sendVerification).toHaveBeenCalledWith('uuid-1', 'a@b.com');
  });

  describe('vérification anti-robot', () => {
    it('vérifie le jeton Turnstile avant de créer le compte', async () => {
      usersService.signup.mockResolvedValue({ id: 'uuid-1', email: 'a@b.com' });

      await controller.signup({
        email: 'a@b.com',
        password: 'motdepasse',
        captchaToken: 'jeton-du-widget',
      });

      expect(turnstileVerificationService.verify).toHaveBeenCalledWith('jeton-du-widget');
    });

    it('refuse la création du compte si le jeton est invalide', async () => {
      turnstileVerificationService.verify.mockResolvedValue(false);

      await expect(
        controller.signup({
          email: 'a@b.com',
          password: 'motdepasse',
          captchaToken: 'jeton-invalide',
        }),
      ).rejects.toThrow('Vérification anti-robot invalide');
      expect(usersService.signup).not.toHaveBeenCalled();
    });
  });

  describe('données personnelles', () => {
    it("renvoie l'export de la personne connectée, et d'elle seule", async () => {
      userDataService.exportUserData.mockResolvedValue({ donnees: {} });

      await controller.exportMyData(ME);

      // L'identifiant vient du jeton, jamais d'un paramètre de requête :
      // sinon n'importe qui exporterait les données de n'importe qui.
      expect(userDataService.exportUserData).toHaveBeenCalledWith('u1');
    });

    it('renvoie un aperçu de suppression avant toute suppression', async () => {
      userDataService.previewDeletion.mockResolvedValue({ avertissements: [] });

      await controller.previewDeletion(ME);

      expect(userDataService.previewDeletion).toHaveBeenCalledWith('u1');
    });

    it('exige le mot de passe pour supprimer le compte', async () => {
      await controller.deleteMyAccount(ME, { password: 'secret' });

      expect(userDataService.deleteAccount).toHaveBeenCalledWith('u1', 'secret');
    });
  });
});
