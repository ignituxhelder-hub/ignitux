import { Test, TestingModule } from '@nestjs/testing';
import { forgetEnv } from '../config/env.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReadinessService } from './readiness.service.js';

type Mock = ReturnType<typeof vi.fn>;

/**
 * Le service énumère les tables attendues depuis les délégués du client
 * Prisma. Le faux en expose trois, ce qui suffit à éprouver la comparaison
 * sans dépendre du nombre réel de modèles — qui change à chaque module
 * ajouté, et ferait échouer ce test pour une raison sans rapport.
 */
function prismaAvec(tablesEnBase: string[], queryRawEchoue = false) {
  const queryRaw: Mock = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
    if (queryRawEchoue) return Promise.reject(new Error('connexion refusée'));
    const sql = String(strings?.[0] ?? '');
    if (sql.includes('information_schema')) {
      return Promise.resolve(tablesEnBase.map((table_name) => ({ table_name })));
    }
    return Promise.resolve([{ '?column?': 1 }]);
  });

  return {
    $queryRaw: queryRaw,
    users: { findMany: vi.fn() },
    projects: { findMany: vi.fn() },
    user_roles: { findMany: vi.fn() },
    // Ne doit PAS être compté comme une table : pas de findMany.
    $connect: vi.fn(),
    _internal: {},
  };
}

function mailAvec(resultat: {
  transport: string;
  reachable: boolean;
  detail: string | null;
}) {
  return { verify: vi.fn().mockResolvedValue(resultat) };
}

async function service(prisma: unknown, mail: unknown): Promise<ReadinessService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ReadinessService,
      { provide: PrismaService, useValue: prisma },
      { provide: MailService, useValue: mail },
    ],
  }).compile();
  return module.get(ReadinessService);
}

const SMTP_OK = { transport: 'smtp', reachable: true, detail: null };
const TOUTES = ['users', 'projects', 'user_roles'];

describe('ReadinessService', () => {
  const envInitial = { ...process.env };

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/ignitux_test';
    process.env.JWT_SECRET = 'secret-de-test-assez-long-pour-passer-32';
    process.env.IGINI_AI_ENABLED = 'true';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    // Le cache de getEnv() survit d'un test à l'autre : sans cet oubli, les
    // cas qui changent l'état de l'IA mesureraient la configuration du
    // premier test exécuté.
    forgetEnv();
  });

  afterEach(() => {
    process.env = { ...envInitial };
    forgetEnv();
  });

  it('rend « ok » quand tout répond', async () => {
    const s = await service(prismaAvec(TOUTES), mailAvec(SMTP_OK));

    const resultat = await s.check();
    expect(resultat.etat).toBe('ok');
    expect(resultat.verifications.schema.etat).toBe('ok');
  });

  describe('dérive de schéma', () => {
    // La vérification qui justifie tout ce service : une base en retard
    // laisse l'application démarrer et casser plus tard, chez quelqu'un.
    it('détecte une table manquante et la nomme', async () => {
      const s = await service(prismaAvec(['users', 'projects']), mailAvec(SMTP_OK));

      const resultat = await s.check();
      expect(resultat.verifications.schema.etat).toBe('panne');
      expect(resultat.verifications.schema.detail).toContain('user_roles');
    });

    // Panne et non dégradé : le serveur répond mais perdra la première
    // écriture. Mieux vaut le retirer de la rotation.
    it('fait basculer tout le diagnostic en panne', async () => {
      const s = await service(prismaAvec([]), mailAvec(SMTP_OK));

      expect((await s.check()).etat).toBe('panne');
    });

    // Une liste écrite à la main finirait par diverger du schéma, et c'est
    // alors la sonde qui mentirait.
    it("n'attend que les délégués réels, pas les propriétés internes", async () => {
      const s = await service(prismaAvec(TOUTES), mailAvec(SMTP_OK));

      const resultat = await s.check();
      expect(resultat.verifications.schema.detail).toContain('3 tables');
      expect(resultat.verifications.schema.detail).not.toContain('_internal');
    });

    it('rapporte une base injoignable sans prétendre connaître le schéma', async () => {
      const s = await service(prismaAvec(TOUTES, true), mailAvec(SMTP_OK));

      const resultat = await s.check();
      expect(resultat.verifications.base.etat).toBe('panne');
      expect(resultat.verifications.schema.etat).toBe('panne');
    });
  });

  describe('email', () => {
    // Le produit tourne, une partie ne répond pas : confondre cela avec une
    // panne ferait redémarrer un serveur qui va bien.
    it('classe le transport « log » en dégradé, pas en panne', async () => {
      const s = await service(
        prismaAvec(TOUTES),
        mailAvec({ transport: 'log', reachable: false, detail: 'aucun email ne part' }),
      );

      const resultat = await s.check();
      expect(resultat.verifications.email.etat).toBe('degrade');
      expect(resultat.etat).toBe('degrade');
      expect(resultat.verifications.email.detail).toMatch(/reste dehors/);
    });

    // Configuré mais injoignable est une vraie panne : quelqu'un a cru
    // l'email fonctionnel.
    it('classe un SMTP injoignable en panne', async () => {
      const s = await service(
        prismaAvec(TOUTES),
        mailAvec({ transport: 'smtp', reachable: false, detail: '535 auth failed' }),
      );

      const resultat = await s.check();
      expect(resultat.verifications.email.etat).toBe('panne');
      expect(resultat.verifications.email.detail).toContain('535');
    });
  });

  describe('IA', () => {
    it('classe des générateurs volontairement éteints en dégradé', async () => {
      process.env.IGINI_AI_ENABLED = 'false';
      const s = await service(prismaAvec(TOUTES), mailAvec(SMTP_OK));

      const resultat = await s.check();
      expect(resultat.verifications.ia.etat).toBe('degrade');
      expect(resultat.verifications.ia.detail).toMatch(/Rien n'est cassé/);
    });

    // Allumés sans clé : chaque appel refusera, et personne ne saura pourquoi.
    it('signale des générateurs allumés sans clé', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const s = await service(prismaAvec(TOUTES), mailAvec(SMTP_OK));

      expect((await s.check()).verifications.ia.detail).toMatch(/aucune clé/);
    });
  });

  it('retient le pire état, pas une moyenne', async () => {
    const s = await service(
      prismaAvec(['users']),
      mailAvec({ transport: 'log', reachable: false, detail: 'x' }),
    );

    // Dégradé + panne = panne. Une moyenne laisserait passer la panne.
    expect((await s.check()).etat).toBe('panne');
  });
});
