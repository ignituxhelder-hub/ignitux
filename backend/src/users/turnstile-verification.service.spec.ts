import { Test, TestingModule } from '@nestjs/testing';

/**
 * `fetch` est simulé : on vérifie les décisions du service — quoi envoyer à
 * Cloudflare, que faire d'un refus ou d'une panne réseau — et non la
 * capacité du réseau à joindre Cloudflare, qui n'est pas notre code.
 */
const fetchMock = vi.fn();

async function serviceAvec(env: Record<string, string | undefined>) {
  for (const [cle, valeur] of Object.entries(env)) {
    if (valeur === undefined) delete process.env[cle];
    else process.env[cle] = valeur;
  }
  // getEnv() met en cache : le module doit être rechargé pour relire
  // l'environnement, sinon tous les tests partageraient la première valeur.
  vi.resetModules();
  const { TurnstileVerificationService: Fraiche } = await import(
    './turnstile-verification.service.js'
  );
  const module: TestingModule = await Test.createTestingModule({
    providers: [Fraiche],
  }).compile();
  return module.get(Fraiche) as InstanceType<typeof Fraiche>;
}

const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/ignitux_test',
  JWT_SECRET: 'secret-de-test-assez-long-pour-passer-32',
  NODE_ENV: 'test',
};

describe('TurnstileVerificationService', () => {
  const envInitial = { ...process.env };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    process.env = { ...envInitial };
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('renvoie true quand Cloudflare confirme le jeton', async () => {
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ success: true }) });
    const service = await serviceAvec({ ...BASE, TURNSTILE_SECRET_KEY: 'ma-cle-secrete' });

    await expect(service.verify('jeton-recu-du-widget')).resolves.toBe(true);
  });

  it('envoie la clé secrète et le jeton à Cloudflare', async () => {
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ success: true }) });
    const service = await serviceAvec({ ...BASE, TURNSTILE_SECRET_KEY: 'ma-cle-secrete' });

    await service.verify('jeton-recu-du-widget');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: 'ma-cle-secrete', response: 'jeton-recu-du-widget' }),
      }),
    );
  });

  it('renvoie false quand Cloudflare refuse le jeton', async () => {
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ success: false }) });
    const service = await serviceAvec({ ...BASE, TURNSTILE_SECRET_KEY: 'ma-cle-secrete' });

    await expect(service.verify('jeton-invalide')).resolves.toBe(false);
  });

  // Une panne de Cloudflare ne doit jamais ouvrir l'inscription : mieux vaut
  // refuser une inscription légitime un instant que perdre la protection.
  it("renvoie false si l'appel réseau échoue (fail-closed)", async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));
    const service = await serviceAvec({ ...BASE, TURNSTILE_SECRET_KEY: 'ma-cle-secrete' });

    await expect(service.verify('jeton')).resolves.toBe(false);
  });

  it("renvoie false si la clé secrète n'est pas configurée, sans appeler Cloudflare", async () => {
    const service = await serviceAvec({ ...BASE, TURNSTILE_SECRET_KEY: undefined });

    await expect(service.verify('jeton')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
