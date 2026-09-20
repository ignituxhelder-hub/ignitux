import { Test, TestingModule } from '@nestjs/testing';
import { COMPLIANCE_REQUIREMENTS_FR } from '../compliance/compliance-requirements.js';
import { forgetEnv } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReadinessService } from './readiness.service.js';

type Mock = ReturnType<typeof vi.fn>;

/**
 * Les vraies colonnes des trois modèles du faux.
 *
 * Lues sur les mêmes énumérations que le service, volontairement : une
 * liste recopiée ici passerait le test tout en laissant la dérivation
 * cassée, ce qui est précisément le genre de sonde qui ment.
 */
const COLONNES: Record<string, string[]> = {
  users: Object.values(Prisma.UsersScalarFieldEnum),
  projects: Object.values(Prisma.ProjectsScalarFieldEnum),
  user_roles: Object.values(Prisma.User_rolesScalarFieldEnum),
  compliance_requirements: Object.values(Prisma.Compliance_requirementsScalarFieldEnum),
};

/**
 * Le service énumère les tables attendues depuis les délégués du client
 * Prisma. Le faux en expose trois, ce qui suffit à éprouver la comparaison
 * sans dépendre du nombre réel de modèles — qui change à chaque module
 * ajouté, et ferait échouer ce test pour une raison sans rapport.
 *
 * `colonnesRetirees` prend des « table.colonne » : c'est ainsi qu'on
 * simule une base à jour côté tables mais en retard d'une migration.
 */
function prismaAvec(
  tablesEnBase: string[],
  queryRawEchoue = false,
  colonnesRetirees: string[] = [],
  slugsSemes: string[] | null = null,
) {
  const queryRaw: Mock = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
    if (queryRawEchoue) return Promise.reject(new Error('connexion refusée'));
    const sql = String(strings?.[0] ?? '');
    if (sql.includes('information_schema.columns')) {
      const lignes: Array<{ table_name: string; column_name: string }> = [];
      for (const table of tablesEnBase) {
        for (const colonne of COLONNES[table] ?? []) {
          if (colonnesRetirees.includes(`${table}.${colonne}`)) continue;
          lignes.push({ table_name: table, column_name: colonne });
        }
      }
      return Promise.resolve(lignes);
    }
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
    // Par défaut le référentiel est entièrement semé : c'est l'état normal,
    // et les tests qui portent sur autre chose ne doivent pas avoir à le dire.
    compliance_requirements: {
      findMany: vi.fn().mockImplementation(() =>
        Promise.resolve(
          (slugsSemes ?? COMPLIANCE_REQUIREMENTS_FR.map((r) => r.slug)).map((slug) => ({ slug })),
        ),
      ),
    },
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
const TOUTES = ['users', 'projects', 'user_roles', 'compliance_requirements'];

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

  // Une table présente mais amputée d'une colonne est plus discrète qu'une
  // table manquante, et fait exactement le même dégât : l'application
  // démarre, les lectures passent, la première écriture échoue.
  describe('dérive de colonnes', () => {
    it('détecte une colonne manquante et la nomme', async () => {
      const s = await service(
        prismaAvec(TOUTES, false, ['projects.sector']),
        mailAvec(SMTP_OK),
      );

      const resultat = await s.check();
      expect(resultat.verifications.schema.etat).toBe('panne');
      expect(resultat.verifications.schema.detail).toContain('projects.sector');
    });

    it('en nomme plusieurs plutôt qu’une seule', async () => {
      const s = await service(
        prismaAvec(TOUTES, false, ['projects.sector', 'users.email']),
        mailAvec(SMTP_OK),
      );

      const detail = (await s.check()).verifications.schema.detail;
      expect(detail).toContain('projects.sector');
      expect(detail).toContain('users.email');
    });

    // Sinon une base vide produirait cinquante lignes de colonnes
    // manquantes par-dessus le message qui compte vraiment.
    it('ne répète pas les colonnes des tables déjà signalées absentes', async () => {
      const s = await service(prismaAvec(['users']), mailAvec(SMTP_OK));

      const detail = (await s.check()).verifications.schema.detail;
      expect(detail).toContain('projects');
      expect(detail).not.toContain('projects.sector');
    });

    it('dit que les colonnes sont là quand elles y sont', async () => {
      const s = await service(prismaAvec(TOUTES), mailAvec(SMTP_OK));

      const resultat = await s.check();
      expect(resultat.verifications.schema.etat).toBe('ok');
      expect(resultat.verifications.schema.detail).toMatch(/colonnes/);
    });
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
      expect(resultat.verifications.schema.detail).toContain(`${TOUTES.length} tables`);
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

  // Le semis du démarrage journalise son échec sans arrêter le serveur.
  // Bon arbitrage — mais la panne resterait invisible si personne ne
  // relisait les journaux, et une liste de conformité amputée ne se voit
  // pas en la lisant.
  describe('référentiel de conformité', () => {
    it('signale les démarches que le semis n a pas posées', async () => {
      const s = await service(
        prismaAvec(TOUTES, false, [], ['fr-statut-juridique']),
        mailAvec(SMTP_OK),
      );

      const resultat = await s.check();
      expect(resultat.verifications.referentiel.etat).toBe('degrade');
      expect(resultat.verifications.referentiel.detail).toContain('fr-rgpd');
    });

    // Dégradé, pas panne : tout le reste du produit fonctionne, et
    // retirer le serveur de la rotation pour cela serait disproportionné.
    it('ne fait pas basculer le serveur en panne', async () => {
      const s = await service(prismaAvec(TOUTES, false, [], []), mailAvec(SMTP_OK));

      expect((await s.check()).etat).toBe('degrade');
    });

    it('est ok quand tout est semé', async () => {
      const s = await service(prismaAvec(TOUTES), mailAvec(SMTP_OK));

      expect((await s.check()).verifications.referentiel.etat).toBe('ok');
    });
  });
});
