import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service.js';

/**
 * `nodemailer` est simulé : on vérifie les décisions du service — quel
 * transport, que faire d'un échec, que rendre à l'appelant — et non la
 * capacité de nodemailer à parler SMTP, qui n'est pas notre code.
 */
const sendMail = vi.fn();
const verify = vi.fn();
const createTransport = vi.fn(() => ({ sendMail, verify }));

vi.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => createTransport(...(args as [])),
}));

async function serviceAvec(env: Record<string, string | undefined>): Promise<MailService> {
  for (const [cle, valeur] of Object.entries(env)) {
    if (valeur === undefined) delete process.env[cle];
    else process.env[cle] = valeur;
  }
  // getEnv() met en cache : le module doit être rechargé pour relire
  // l'environnement, sinon tous les tests partageraient la première valeur.
  vi.resetModules();
  const { MailService: Frais } = await import('./mail.service.js');
  const module: TestingModule = await Test.createTestingModule({
    providers: [Frais],
  }).compile();
  const service = module.get(Frais);
  service.onModuleInit();
  return service as MailService;
}

// Le service lit la configuration complete du serveur : sans ces deux
// variables, getEnv() refuse de demarrer — ce qui est son role.
const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/ignitux_test',
  JWT_SECRET: 'secret-de-test-assez-long-pour-passer-32',
};

const SMTP = {
  ...BASE,
  NODE_ENV: 'test',
  MAIL_TRANSPORT: 'smtp',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_USER: 'apikey',
  SMTP_PASSWORD: 'secret',
  MAIL_FROM: 'Ignitux <bonjour@ignitux.test>',
};

describe('MailService', () => {
  const envInitial = { ...process.env };

  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue({ messageId: 'abc' });
    verify.mockReset().mockResolvedValue(true);
    createTransport.mockClear();
  });

  afterEach(() => {
    process.env = { ...envInitial };
    vi.resetModules();
  });

  describe('transport « log »', () => {
    it("ne construit aucun transport et rend 'logged'", async () => {
      const service = await serviceAvec({ ...SMTP, MAIL_TRANSPORT: 'log' });

      await expect(
        service.send({ to: 'a@b.com', subject: 'Test', text: 'Contenu.' }),
      ).resolves.toBe('logged');
      expect(createTransport).not.toHaveBeenCalled();
    });

    // Hors production, ne rien déclarer est toléré — le préflight n'exige un
    // choix explicite que face à de vraies personnes.
    it("retombe sur 'log' quand rien n'est déclaré", async () => {
      const service = await serviceAvec({ ...SMTP, MAIL_TRANSPORT: undefined });

      await expect(service.send({ to: 'a@b.com', subject: 'T', text: 'C' })).resolves.toBe(
        'logged',
      );
    });

    // Un envoi qui n'est pas parti ne doit pas se déclarer parti : c'est
    // exactement ce qui produit « je n'ai jamais reçu le mail ».
    it("ne se fait pas passer pour un envoi réussi", async () => {
      const service = await serviceAvec({ ...SMTP, MAIL_TRANSPORT: 'log' });
      const resultat = await service.send({ to: 'a@b.com', subject: 'T', text: 'C' });

      expect(resultat).not.toBe('sent');
    });
  });

  describe('transport « smtp »', () => {
    it('envoie avec les identifiants déclarés', async () => {
      const service = await serviceAvec(SMTP);
      await service.send({ to: 'a@b.com', subject: 'Objet', text: 'Corps' });

      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'smtp.example.com', port: 587 }),
      );
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Ignitux <bonjour@ignitux.test>',
          to: 'a@b.com',
          subject: 'Objet',
          text: 'Corps',
        }),
      );
    });

    // Se tromper de mode TLS donne une connexion qui pend jusqu'au délai
    // d'attente, pas une erreur claire. On le déduit du port.
    it.each([
      ['465', true],
      ['587', false],
      ['25', false],
    ])('déduit le mode TLS du port %s', async (port, secure) => {
      await serviceAvec({ ...SMTP, SMTP_PORT: port });

      expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure }));
    });

    // Un échec d'envoi ne doit pas faire échouer l'inscription qui l'a
    // déclenché — mais il ne doit pas non plus disparaître.
    it("ne lève pas quand l'envoi échoue, et le dit", async () => {
      sendMail.mockRejectedValue(new Error('550 mailbox unavailable'));
      const service = await serviceAvec(SMTP);

      await expect(service.send({ to: 'a@b.com', subject: 'T', text: 'C' })).resolves.toBe(
        'failed',
      );
    });
  });

  describe('verify', () => {
    // Des identifiants syntaxiquement valides mais révoqués passent tous les
    // contrôles de forme et échouent au premier envoi réel.
    it('signale un transport joignable', async () => {
      const service = await serviceAvec(SMTP);

      await expect(service.verify()).resolves.toEqual({
        transport: 'smtp',
        reachable: true,
        detail: null,
      });
    });

    it("rapporte la raison quand le transport ne répond pas", async () => {
      verify.mockRejectedValue(new Error('535 authentication failed'));
      const service = await serviceAvec(SMTP);

      const resultat = await service.verify();
      expect(resultat.reachable).toBe(false);
      expect(resultat.detail).toContain('535');
    });

    it("dit clairement qu'aucun email ne part en transport « log »", async () => {
      const service = await serviceAvec({ ...SMTP, MAIL_TRANSPORT: 'log' });

      const resultat = await service.verify();
      expect(resultat.transport).toBe('log');
      expect(resultat.reachable).toBe(false);
      expect(resultat.detail).toMatch(/aucun email ne part/i);
    });
  });
});
