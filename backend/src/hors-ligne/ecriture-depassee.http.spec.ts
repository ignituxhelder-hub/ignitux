import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ESPACE_INTROUVABLE, ESPACE_PERSONNEL_SEULEMENT } from '../equipe/espace.service.js';
import type { PrismaService as PrismaServiceType } from '../prisma/prisma.service.js';
import { EN_TETE_CAPTURE } from './ecriture-depassee.decorator.js';

/**
 * LE GARDE DES ÉCRITURES REVENUES DU FROID SUR LES VRAIS CONTRÔLEURS —
 * l'application ENTIÈRE (AppModule), sans base : Prisma est un faux en
 * mémoire, jamais un client connecté (patron de `espaces-argent.http.spec.ts`).
 *
 * Ce que ce fichier prouve, route par route (projet, tâche, document de
 * facturation, contact, entreprise) :
 * - une écriture périmée de quelqu'un qui n'a PAS accès à la ligne reçoit
 *   exactement la réponse qu'elle recevrait sans l'en-tête d'âge — le 404
 *   (ou le 403) du contrôleur, sans `modifieA` : le garde ne lui apprend ni
 *   que la ligne existe, ni quand elle a changé ;
 * - le propriétaire, et qui a accès (membre de l'équipe du projet, comptable
 *   dans l'espace argent ouvert), reçoit toujours le 409 ;
 * - sans en-tête ou avec un en-tête illisible : rien ne change.
 */

const PROPRIO = '22222222-2222-4222-8222-222222222222';
/** Observateur sur le projet du propriétaire. */
const COLLEGUE = '66666666-6666-4666-8666-666666666666';
/** Comptable sur le projet du propriétaire, accès à son argent ouvert. */
const COMPTABLE = '11111111-1111-4111-8111-111111111111';
/** Comptable sur le projet du propriétaire, accès à son argent coupé. */
const COUPE = '55555555-5555-4555-8555-555555555555';
/** N'est pas (ou plus) dans l'équipe du propriétaire. */
const INCONNU = '33333333-3333-4333-8333-333333333333';

const PROJET = '44444444-4444-4444-8444-444444444444';
const TACHE = '77777777-7777-4777-8777-777777777777';
const DOCUMENT = '88888888-8888-4888-8888-888888888888';
const CONTACT = '99999999-9999-4999-8999-999999999999';
const ENTREPRISE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
/** Un id bien formé qu'aucune tâche ne porte. */
const TACHE_ABSENTE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const UTILISATEURS = [PROPRIO, COLLEGUE, COMPTABLE, COUPE, INCONNU];
const COLLABORATEURS = [
  { user_id: COLLEGUE, project_id: PROJET, role: 'observateur' },
  { user_id: COMPTABLE, project_id: PROJET, role: 'comptable' },
  { user_id: COUPE, project_id: PROJET, role: 'comptable' },
];
const CHOIX = [
  { owner_id: PROPRIO, member_id: COMPTABLE, role: 'argent_auto' },
  { owner_id: PROPRIO, member_id: COUPE, role: 'refuse' },
];

type Ligne = Record<string, unknown>;
type Fn = ReturnType<typeof vi.fn>;

/** Les lignes datées, modifiées il y a une minute. */
function lignes(modifiee: Date): Record<string, Ligne[]> {
  return {
    projects: [{ id: PROJET, owner_id: PROPRIO, title: 'Projet du proprio', updated_at: modifiee }],
    tasks: [{ id: TACHE, project_id: PROJET, title: 'Tâche', status: 'pending', updated_at: modifiee }],
    billing_documents: [
      { id: DOCUMENT, owner_id: PROPRIO, type: 'facture', status: 'brouillon', lines: [], payments: [], updated_at: modifiee },
    ],
    crm_contacts: [{ id: CONTACT, owner_id: PROPRIO, first_name: 'Ada', last_name: 'L', updated_at: modifiee }],
    crm_companies: [{ id: ENTREPRISE, owner_id: PROPRIO, name: 'ACME', updated_at: modifiee }],
  };
}

/** Égalité stricte clé par clé : une forme de filtre inconnue fait échouer le test. */
function correspond(ligne: Ligne, where: Ligne = {}): boolean {
  return Object.entries(where).every(([cle, valeur]) => {
    if (valeur !== null && typeof valeur === 'object') {
      throw new Error(`Filtre non géré par la fausse base : ${cle}=${JSON.stringify(valeur)}`);
    }
    return ligne[cle] === valeur;
  });
}

function projeter(ligne: Ligne | undefined, select?: Record<string, unknown>): Ligne | null {
  if (!ligne) return null;
  return select ? Object.fromEntries(Object.keys(select).map((c) => [c, ligne[c]])) : ligne;
}

function fauxPrisma(donnees: { lignes: Record<string, Ligne[]> }) {
  const modeles = new Map<string, Record<string, Fn>>();
  const neutre = (op: string) =>
    vi.fn(async (args?: { data?: unknown; create?: unknown }) => {
      if (op === 'findMany' || op === 'groupBy') return [];
      if (op === 'count') return 0;
      if (op === 'aggregate') return { _sum: {}, _count: 0 };
      if (op === 'create' || op === 'upsert' || op === 'update') return { id: 'x', ...(args?.data ?? args?.create ?? {}) };
      if (op === 'createMany' || op === 'updateMany' || op === 'deleteMany') return { count: 0 };
      return null;
    });
  const modele = (nom: string) => {
    if (!modeles.has(nom)) {
      const ops: Record<string, Fn> = {};
      modeles.set(
        nom,
        new Proxy(ops, {
          get: (cible, op) => {
            if (typeof op !== 'string' || op === 'then') return undefined;
            cible[op] ??= neutre(op);
            return cible[op];
          },
        }),
      );
    }
    return modeles.get(nom)!;
  };
  /** Quelques opérations données ; toute autre opération du modèle reste neutre. */
  const avecRepli = (nom: string, ops: Record<string, Fn>) =>
    new Proxy(ops, { get: (cible, op) => (typeof op === 'string' && op in cible ? cible[op] : modele(nom)[op as string]) });
  const lecture = (nom: string) =>
    vi.fn(async ({ where, select }: { where?: Ligne; select?: Record<string, unknown> } = {}) =>
      projeter(
        donnees.lignes[nom].find((l) => correspond(l, where)),
        select,
      ),
    );
  /** `findFirst` / `findUnique` évalués sur les lignes du test ; le reste neutre. */
  const evaluee = (nom: string) => avecRepli(nom, { findFirst: lecture(nom), findUnique: lecture(nom) });

  /** La personne d'un filtre « propriétaire OU membre de l'équipe », et de lui seul. */
  const equipeDe = (filtre: unknown): string => {
    const userId = (filtre as { OR?: [{ owner_id?: string }] } | undefined)?.OR?.[0]?.owner_id;
    const attendu = { OR: [{ owner_id: userId }, { collaborators: { some: { user_id: userId } } }] };
    if (!userId || JSON.stringify(filtre) !== JSON.stringify(attendu)) {
      throw new Error(`Filtre de projet non géré : ${JSON.stringify(filtre)}`);
    }
    return userId;
  };
  /** Mes lignes d'équipe sur ce projet, ou `null` si je n'en suis ni propriétaire ni membre. */
  const equipeSur = (projectId: unknown, userId: string) => {
    const projet = donnees.lignes.projects.find((p) => p.id === projectId);
    if (!projet) return null;
    const sesLignes = COLLABORATEURS.filter((c) => c.project_id === projet.id && c.user_id === userId);
    return projet.owner_id === userId || sesLignes.length > 0 ? { projet, sesLignes } : null;
  };

  const base: Record<string, unknown> = {
    users: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        UTILISATEURS.includes(where.id) ? { id: where.id, email: `${where.id.slice(0, 4)}@exemple.fr` } : null,
      ),
    },
    projects: avecRepli('projects', {
      // `accesProjet` (et la lecture d'un projet par son équipe) : propriétaire OU membre.
      findFirst: vi.fn(async ({ where }: { where: { id: string; OR?: Ligne[] } }) => {
        const { id, ...filtre } = where;
        const equipe = equipeSur(id, equipeDe(filtre));
        return equipe ? { ...equipe.projet, collaborators: equipe.sesLignes.map((c) => ({ role: c.role })) } : null;
      }),
      findUnique: lecture('projects'),
    }),
    // `EspaceService.resoudre` : mes rôles argent chez ce propriétaire.
    project_collaborators: {
      findMany: vi.fn(
        async ({ where }: { where: { user_id: string; role: { in: string[] }; project: { owner_id: string } } }) =>
          COLLABORATEURS.filter((c) => {
            const projet = donnees.lignes.projects.find((p) => p.id === c.project_id);
            return (
              c.user_id === where.user_id &&
              where.role.in.includes(c.role) &&
              projet?.owner_id === where.project.owner_id
            );
          }).map((c) => ({ role: c.role })),
      ),
    },
    space_members: {
      findUnique: vi.fn(
        async ({ where }: { where: { owner_id_member_id: { owner_id: string; member_id: string } } }) => {
          const { owner_id, member_id } = where.owner_id_member_id;
          const choix = CHOIX.find((c) => c.owner_id === owner_id && c.member_id === member_id);
          return choix ? { role: choix.role } : null;
        },
      ),
    },
    tasks: avecRepli('tasks', {
      findUnique: lecture('tasks'),
      // Avec un filtre `project` : la tâche seulement si je vois son projet.
      findFirst: vi.fn(async ({ where }: { where: Ligne & { project?: unknown } }) => {
        const { project, ...simple } = where;
        const tache = donnees.lignes.tasks.find((t) => correspond(t, simple));
        if (!tache) return null;
        return project === undefined || equipeSur(tache.project_id, equipeDe(project)) ? tache : null;
      }),
    }),
    billing_documents: evaluee('billing_documents'),
    crm_contacts: evaluee('crm_contacts'),
    crm_companies: evaluee('crm_companies'),
    $connect: async () => undefined,
    $disconnect: async () => undefined,
    $queryRaw: async () => [{ ok: 1 }],
  };
  const prisma: Record<string, unknown> = new Proxy(base, {
    get: (cible, cle) => {
      if (typeof cle !== 'string' || cle === 'then') return undefined;
      if (cle in cible) return cible[cle];
      if (cle === '$transaction') {
        return async (x: unknown) =>
          typeof x === 'function' ? (x as (tx: unknown) => unknown)(prisma) : Promise.all(x as unknown[]);
      }
      if (cle.startsWith('$')) return async () => undefined;
      return modele(cle);
    },
  });
  return prisma as unknown as PrismaServiceType;
}

describe('Écritures revenues du froid sur les vrais contrôleurs — application entière, sans base', () => {
  let app: INestApplication;
  const donnees = { lignes: lignes(new Date()) };
  let modifiee: Date;
  let jeton: (userId: string) => string;

  beforeAll(async () => {
    // Avant le premier import de l'application : certains modules lisent la
    // configuration à l'import. Aucune de ces valeurs ne mène nulle part —
    // l'adresse de base n'est jamais ouverte (Prisma est remplacé).
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://aucune:aucune@127.0.0.1:1/aucune';
    process.env.JWT_SECRET = 'secret-de-test-ecriture-depassee-0123456789abcdef';
    process.env.MAIL_TRANSPORT = 'log';
    process.env.IGINI_AI_ENABLED = 'false';
    process.env.LIMITE_REQUETES_PAR_MINUTE = '100000';
    delete process.env.ANTHROPIC_API_KEY;

    const [{ AppModule }, { PrismaService }] = await Promise.all([
      import('../app.module.js'),
      import('../prisma/prisma.service.js'),
    ]);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(fauxPrisma(donnees))
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const jwt = app.get(JwtService);
    jeton = (userId) => jwt.sign({ sub: userId, email: `${userId.slice(0, 4)}@exemple.fr` });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    // Modifiée il y a une minute ; l'écriture a été capturée il y a dix.
    modifiee = new Date(Date.now() - 60_000);
    donnees.lignes = lignes(modifiee);
  });

  /** Capturée il y a dix minutes, avant la dernière modification. */
  const PERIMEE = { [EN_TETE_CAPTURE]: String(10 * 60_000) };

  type Methode = 'patch' | 'post';
  interface Ecriture {
    methode: Methode;
    chemin: string;
    corps: object;
  }
  const envoyer = (qui: string, { methode, chemin, corps }: Ecriture, entetes: Record<string, string> = {}) =>
    request(app.getHttpServer())
      [methode](chemin)
      .set('Authorization', `Bearer ${jeton(qui)}`)
      .set(entetes)
      .send(corps);

  const PROJET_MODIFIE: Ecriture = { methode: 'patch', chemin: `/projects/${PROJET}`, corps: { title: 'Nouveau titre' } };
  const TACHE_COCHEE: Ecriture = { methode: 'patch', chemin: `/tasks/${TACHE}/status`, corps: { status: 'done' } };
  const TACHE_VALIDEE: Ecriture = {
    methode: 'post',
    chemin: `/projects/${PROJET}/tasks/${TACHE}/validate`,
    corps: {},
  };
  const DOCUMENT_MODIFIE: Ecriture = {
    methode: 'patch',
    chemin: `/billing/documents/${DOCUMENT}`,
    corps: { notes: 'Payée en deux fois' },
  };
  const CONTACT_MODIFIE: Ecriture = { methode: 'patch', chemin: `/crm/contacts/${CONTACT}`, corps: { firstName: 'Ada' } };
  const ENTREPRISE_MODIFIEE: Ecriture = {
    methode: 'patch',
    chemin: `/crm/companies/${ENTREPRISE}`,
    corps: { name: 'ACME' },
  };

  /**
   * Sans accès, l'écriture périmée reçoit EXACTEMENT ce qu'elle recevrait
   * sans l'en-tête d'âge : le garde n'ajoute rien, pas même une date.
   */
  async function rienAppris(qui: string, ecriture: Ecriture, entetes: Record<string, string>, attendu: [number, string]) {
    const avecAge = await envoyer(qui, ecriture, { ...PERIMEE, ...entetes });
    const sansAge = await envoyer(qui, ecriture, entetes);

    expect([avecAge.status, avecAge.body.message]).toEqual(attendu);
    expect(avecAge.body).not.toHaveProperty('modifieA');
    expect(avecAge.body).not.toHaveProperty('captureA');
    expect(avecAge.body).toEqual(sansAge.body);
    expect(avecAge.status).toBe(sansAge.status);
  }

  async function conflit(qui: string, ecriture: Ecriture, entetes: Record<string, string> = {}) {
    const res = await envoyer(qui, ecriture, { ...PERIMEE, ...entetes });

    expect(res.status).toBe(409);
    expect(res.body.modifieA).toBe(modifiee.toISOString());
    expect(res.body.message).toContain('hors ligne');
  }

  describe('un projet', () => {
    it('quelqu’un hors de l’équipe reçoit le 404 du contrôleur, sans date', async () => {
      await rienAppris(INCONNU, PROJET_MODIFIE, {}, [404, 'Projet introuvable.']);
    });

    it('le propriétaire reçoit le 409', async () => {
      await conflit(PROPRIO, PROJET_MODIFIE);
    });

    it('un membre de l’équipe, même observateur, reçoit le 409 : il voit déjà le projet', async () => {
      await conflit(COLLEGUE, PROJET_MODIFIE);
    });
  });

  describe('une tâche', () => {
    it('quelqu’un hors de l’équipe du projet reçoit le 404 du contrôleur, sans date', async () => {
      await rienAppris(INCONNU, TACHE_COCHEE, {}, [404, 'Tâche introuvable.']);
      await rienAppris(INCONNU, TACHE_VALIDEE, {}, [404, 'Projet introuvable.']);
    });

    it('quelqu’un hors de l’équipe reçoit la même réponse, que la tâche existe ou non', async () => {
      for (const route of ['status', 'note']) {
        const corps = route === 'status' ? { status: 'done' } : { note: 'rappeler' };
        const existante = await envoyer(INCONNU, { methode: 'patch', chemin: `/tasks/${TACHE}/${route}`, corps });
        const absente = await envoyer(INCONNU, { methode: 'patch', chemin: `/tasks/${TACHE_ABSENTE}/${route}`, corps });

        expect([existante.status, existante.body.message]).toEqual([404, 'Tâche introuvable.']);
        expect(existante.body).toEqual(absente.body);
      }
    });

    it('le propriétaire du projet reçoit le 409', async () => {
      await conflit(PROPRIO, TACHE_COCHEE);
      await conflit(PROPRIO, TACHE_VALIDEE);
    });

    it('un membre de l’équipe du projet reçoit le 409', async () => {
      await conflit(COLLEGUE, TACHE_COCHEE);
    });
  });

  describe('un document de facturation', () => {
    it('un inconnu, chez lui, reçoit le 404 du contrôleur, sans date', async () => {
      await rienAppris(INCONNU, DOCUMENT_MODIFIE, {}, [404, 'Document introuvable.']);
    });

    it('un inconnu qui nomme l’espace du propriétaire reçoit « Espace introuvable. », sans date', async () => {
      await rienAppris(INCONNU, DOCUMENT_MODIFIE, { 'X-Espace': PROPRIO }, [404, ESPACE_INTROUVABLE]);
    });

    it('un comptable dont l’accès est coupé reçoit « Espace introuvable. », sans date', async () => {
      await rienAppris(COUPE, DOCUMENT_MODIFIE, { 'X-Espace': PROPRIO }, [404, ESPACE_INTROUVABLE]);
    });

    it('le comptable dans son propre espace, où le document n’est pas, reçoit le 404', async () => {
      await rienAppris(COMPTABLE, DOCUMENT_MODIFIE, {}, [404, 'Document introuvable.']);
    });

    it('le propriétaire reçoit le 409', async () => {
      await conflit(PROPRIO, DOCUMENT_MODIFIE);
    });

    it('son comptable à l’accès ouvert, dans l’espace du propriétaire, reçoit le 409', async () => {
      await conflit(COMPTABLE, DOCUMENT_MODIFIE, { 'X-Espace': PROPRIO });
    });
  });

  describe('un contact et une entreprise du CRM', () => {
    it('un inconnu reçoit le 404 du contrôleur, sans date', async () => {
      await rienAppris(INCONNU, CONTACT_MODIFIE, {}, [404, 'Contact introuvable.']);
      await rienAppris(INCONNU, ENTREPRISE_MODIFIEE, {}, [404, 'Entreprise introuvable.']);
    });

    it('le comptable du propriétaire reçoit le 403 de l’espace : le CRM ne se délègue pas', async () => {
      await rienAppris(COMPTABLE, CONTACT_MODIFIE, { 'X-Espace': PROPRIO }, [403, ESPACE_PERSONNEL_SEULEMENT]);
      await rienAppris(COMPTABLE, ENTREPRISE_MODIFIEE, { 'X-Espace': PROPRIO }, [403, ESPACE_PERSONNEL_SEULEMENT]);
    });

    it('le propriétaire reçoit le 409', async () => {
      await conflit(PROPRIO, CONTACT_MODIFIE);
      await conflit(PROPRIO, ENTREPRISE_MODIFIEE);
    });
  });

  describe('sans en-tête d’âge, ou avec un en-tête illisible : rien ne change', () => {
    it('le propriétaire écrit en direct', async () => {
      const res = await envoyer(PROPRIO, PROJET_MODIFIE);

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Nouveau titre');
    });

    it('un en-tête illisible laisse passer l’écriture du propriétaire', async () => {
      const res = await envoyer(PROPRIO, PROJET_MODIFIE, { [EN_TETE_CAPTURE]: 'bientot' });

      expect(res.status).toBe(200);
    });

    it('un inconnu reçoit le même 404 qu’avec l’en-tête', async () => {
      const res = await envoyer(INCONNU, PROJET_MODIFIE, { [EN_TETE_CAPTURE]: 'bientot' });

      expect([res.status, res.body.message]).toEqual([404, 'Projet introuvable.']);
    });
  });
});
