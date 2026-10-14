import { ValidationPipe, type INestApplication, type Type } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { PrismaService as PrismaServiceType } from '../prisma/prisma.service.js';

/**
 * L'ESPACE ARGENT SUR LES VRAIS CONTRÔLEURS — l'application ENTIÈRE
 * (AppModule), sans base : Prisma est un faux en mémoire, jamais un client
 * connecté. Patron repris de `feat/equipe` (espaces-metier.http.spec.ts).
 *
 * Ce que ce fichier prouve :
 * - le vrai `JwtAuthGuard`, puis la résolution de l'espace par les rôles de
 *   projet (`project_collaborators`), puis les VRAIS services d'argent qui
 *   lisent les lignes du PROPRIÉTAIRE ;
 * - comptable / associé d'un projet du propriétaire : ses 4 modules d'argent ;
 *   salarié, observateur, retiré, inconnu : 404 « Espace introuvable. » ;
 * - l'accès consenti au geste du propriétaire (décision du 2026-10-14, après
 *   revue, `acces-argent.ts`) : inviter ou passer quelqu'un comptable /
 *   associé par les VRAIES routes de l'équipe crée la ligne `'argent_auto'`
 *   (jamais par-dessus un choix explicite) → accès ; collaborateur d'avant,
 *   sans ligne → 404 jusqu'à l'activation ; coupé → 404 ; retiré → 404, la
 *   ligne restant en place ; `GET /espaces` suit la même règle ; le
 *   propriétaire choisit par `GET` / `PUT /espaces/acces-argent`, chez lui
 *   seulement ;
 * - toute autre route avec l'espace d'un autre : 403 (fermé par défaut) ;
 * - le propriétaire chez lui : inchangé ; le journal `space_activity` reçoit
 *   les écritures d'un membre.
 */

const MOI = '11111111-1111-4111-8111-111111111111';
const PROPRIO = '22222222-2222-4222-8222-222222222222';
const ETRANGER = '33333333-3333-4333-8333-333333333333';
const PROJET = '44444444-4444-4444-8444-444444444444';
const PROJET_ETRANGER = '55555555-5555-4555-8555-555555555555';

const PROJETS = [
  { id: PROJET, owner_id: PROPRIO },
  { id: PROJET_ETRANGER, owner_id: ETRANGER },
];

type Ligne = Record<string, unknown>;
type Fn = ReturnType<typeof vi.fn>;

/** Les lignes d'argent de la fausse base : une à moi, une au propriétaire. */
function lignesArgent(): Record<string, Ligne[]> {
  const doc = (owner_id: string, client_name: string): Ligne => ({
    id: `doc-${owner_id.slice(0, 4)}`,
    owner_id,
    type: 'facture',
    status: 'brouillon',
    client_name,
    year: 2026,
    sequence: 1,
    lines: [],
    payments: [],
  });
  const compte = (owner_id: string, label: string): Ligne => ({
    id: `cpt-${owner_id.slice(0, 4)}`,
    owner_type: 'user',
    owner_id,
    code: '512',
    label,
    currency: 'EUR',
  });
  const caisse = (owner_id: string, cash_cents: number): Ligne => ({
    id: `cai-${owner_id.slice(0, 4)}`,
    owner_id,
    cash_cents,
  });
  return {
    billing_documents: [doc(MOI, 'Client de moi'), doc(PROPRIO, 'Client du proprio')],
    ledger_accounts: [compte(MOI, 'Livre de moi'), compte(PROPRIO, 'Livre du proprio')],
    bank_accounts: [compte(MOI, 'Banque de moi'), compte(PROPRIO, 'Banque du proprio')],
    cash_register_entries: [caisse(MOI, 100), caisse(PROPRIO, 999)],
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

function tableEvaluee(lignes: () => Ligne[]) {
  return {
    findMany: vi.fn(async ({ where }: { where?: Ligne } = {}) => lignes().filter((l) => correspond(l, where))),
    findFirst: vi.fn(async ({ where }: { where?: Ligne } = {}) => lignes().find((l) => correspond(l, where)) ?? null),
  };
}

/**
 * Un collaborateur de projet : la source des droits sur l'espace argent.
 * Aucune date : seul son rôle actuel compte.
 */
interface Collaborateur {
  user_id: string;
  project_id: string;
  role: string;
}

/**
 * Une ligne `space_members` du propriétaire : `'argent'` activé par lui,
 * `'argent_auto'` accordé à l'invitation, `'refuse'` coupé.
 */
interface Choix {
  owner_id: string;
  member_id: string;
  role: string;
  created_at?: Date;
}

/** Les comptes de la fausse base, et leur adresse (celle des jetons de test). */
const UTILISATEURS = [MOI, PROPRIO, ETRANGER];
const courriel = (id: string) => `${id.slice(0, 4)}@exemple.fr`;

function collaborateurCorrespond(c: Collaborateur, where: Ligne): boolean {
  return Object.entries(where).every(([cle, valeur]) => {
    if (cle === 'project_id' && typeof valeur === 'string') return c.project_id === valeur;
    if (cle === 'user_id') {
      if (valeur !== null && typeof valeur === 'object') {
        const { not, ...reste } = valeur as { not?: string };
        if (Object.keys(reste).length > 0 || not === undefined) {
          throw new Error(`Filtre de collaborateur non géré : user_id=${JSON.stringify(valeur)}`);
        }
        return c.user_id !== not;
      }
      return c.user_id === valeur;
    }
    if (cle === 'role') return ((valeur as { in: string[] }).in ?? []).includes(c.role);
    if (cle === 'project') {
      const projet = PROJETS.find((p) => p.id === c.project_id);
      return projet?.owner_id === (valeur as { owner_id: string }).owner_id;
    }
    throw new Error(`Filtre de collaborateur non géré : ${cle}=${JSON.stringify(valeur)}`);
  });
}

function fauxPrisma(collaborateurs: Collaborateur[], choix: Choix[], donnees: { lignes: Record<string, Ligne[]> }) {
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
  /** Lectures évaluées sur les lignes du test ; toute autre opération reste neutre. */
  const evaluee = (nom: string, lignes: () => Ligne[]) => avecRepli(nom, tableEvaluee(lignes));
  const base: Record<string, unknown> = {
    users: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) return { id: where.id, email: courriel(where.id) };
        // L'invitation cherche le compte par son adresse.
        const id = UTILISATEURS.find((u) => courriel(u) === where.email);
        return id ? { id, email: courriel(id) } : null;
      }),
    },
    // Les vraies routes de l'équipe : `accesProjet` (qui gère l'équipe ?) et
    // le titre du projet pour l'e-mail d'invitation.
    projects: avecRepli('projects', {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; OR?: Ligne[] } }) => {
        const userId = (where.OR?.[0] as { owner_id?: string } | undefined)?.owner_id;
        const attendu = { id: where.id, OR: [{ owner_id: userId }, { collaborators: { some: { user_id: userId } } }] };
        if (!userId || JSON.stringify(where) !== JSON.stringify(attendu)) {
          throw new Error(`Filtre de projet non géré : ${JSON.stringify(where)}`);
        }
        const projet = PROJETS.find((p) => p.id === where.id);
        if (!projet) return null;
        const sesLignes = collaborateurs.filter((c) => c.project_id === projet.id && c.user_id === userId);
        if (projet.owner_id !== userId && sesLignes.length === 0) return null;
        return { owner_id: projet.owner_id, collaborators: sesLignes.map((c) => ({ role: c.role })) };
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const projet = PROJETS.find((p) => p.id === where.id);
        return projet ? { id: projet.id, owner_id: projet.owner_id, title: 'Projet du proprio' } : null;
      }),
    }),
    project_collaborators: {
      findMany: vi.fn(async ({ where }: { where: Ligne }) =>
        collaborateurs
          .filter((c) => collaborateurCorrespond(c, where))
          .map((c) => {
            const owner_id = PROJETS.find((p) => p.id === c.project_id)!.owner_id;
            return {
              user_id: c.user_id,
              role: c.role,
              user: { email: courriel(c.user_id), profile: null },
              project: { owner_id, title: 'Projet du proprio', owner: { profile: null } },
            };
          }),
      ),
      findFirst: vi.fn(
        async ({ where }: { where: Ligne }) => collaborateurs.find((c) => collaborateurCorrespond(c, where)) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Collaborateur }) => {
        collaborateurs.push({ user_id: data.user_id, project_id: data.project_id, role: data.role });
        return { id: `pc-${collaborateurs.length}`, ...data, user: { id: data.user_id, email: courriel(data.user_id) } };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Ligne; data: { role: string } }) => {
        const cibles = collaborateurs.filter((c) => collaborateurCorrespond(c, where));
        for (const c of cibles) c.role = data.role;
        return { count: cibles.length };
      }),
      deleteMany: vi.fn(async ({ where }: { where: Ligne }) => {
        const restants = collaborateurs.filter((c) => !collaborateurCorrespond(c, where));
        const count = collaborateurs.length - restants.length;
        collaborateurs.splice(0, collaborateurs.length, ...restants);
        return { count };
      }),
    },
    space_members: {
      // Comme `INSERT … ON CONFLICT DO NOTHING` avec `skipDuplicates` : une
      // ligne existante (owner_id, member_id) n'est jamais touchée ; sans
      // `skipDuplicates`, la contrainte unique ferait échouer l'écriture.
      createMany: vi.fn(async ({ data, skipDuplicates }: { data: Choix[]; skipDuplicates?: boolean }) => {
        let count = 0;
        for (const ligne of data) {
          if (choix.some((c) => c.owner_id === ligne.owner_id && c.member_id === ligne.member_id)) {
            if (!skipDuplicates) throw new Error('Unique constraint failed on the fields: (`owner_id`,`member_id`)');
            continue;
          }
          choix.push({ ...ligne });
          count += 1;
        }
        return { count };
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { owner_id_member_id: { owner_id: string; member_id: string } } }) => {
          const { owner_id, member_id } = where.owner_id_member_id;
          return choix.find((c) => c.owner_id === owner_id && c.member_id === member_id) ?? null;
        },
      ),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        choix.filter((c) =>
          Object.entries(where).every(([cle, valeur]) => {
            const champ = c[cle as keyof Choix];
            if (valeur !== null && typeof valeur === 'object') {
              const { in: liste, ...reste } = valeur as { in?: string[] };
              if (Object.keys(reste).length > 0 || !liste) {
                throw new Error(`Filtre de choix non géré : ${cle}=${JSON.stringify(valeur)}`);
              }
              return liste.includes(champ as string);
            }
            return champ === valeur;
          }),
        ),
      ),
      upsert: vi.fn(
        async (args: {
          where: { owner_id_member_id: { owner_id: string; member_id: string } };
          create: Choix;
          update: { role: string; created_at?: Date };
        }) => {
          const { owner_id, member_id } = args.where.owner_id_member_id;
          const existant = choix.find((c) => c.owner_id === owner_id && c.member_id === member_id);
          if (existant) Object.assign(existant, args.update);
          else choix.push({ ...args.create });
          return existant ?? args.create;
        },
      ),
    },
    space_activity: {
      create: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      findMany: vi.fn(async ({ where }: { where: { owner_id: string } }) =>
        where.owner_id === PROPRIO
          ? [
              {
                created_at: new Date('2026-10-14T10:00:00Z'),
                methode: 'POST',
                chemin: '/caisse/journees',
                statut: 201,
                actor: { profile: { display_name: 'Bob' } },
              },
            ]
          : [],
      ),
    },
    billing_documents: evaluee('billing_documents', () => donnees.lignes.billing_documents),
    ledger_accounts: evaluee('ledger_accounts', () => donnees.lignes.ledger_accounts),
    bank_accounts: evaluee('bank_accounts', () => donnees.lignes.bank_accounts),
    cash_register_entries: evaluee('cash_register_entries', () => donnees.lignes.cash_register_entries),
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
  return prisma as unknown as PrismaServiceType & {
    space_activity: { create: Fn; deleteMany: Fn; findMany: Fn };
    project_collaborators: { findMany: Fn; findFirst: Fn; create: Fn; updateMany: Fn; deleteMany: Fn };
    space_members: { findUnique: Fn; findMany: Fn; upsert: Fn; createMany: Fn };
  };
}

describe('Espace argent sur les vrais contrôleurs — application entière, sans base', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof fauxPrisma>;
  const collaborateurs: Collaborateur[] = [];
  const choix: Choix[] = [];
  const donnees = { lignes: lignesArgent() };
  let jeton: (userId: string) => string;
  let service: <T>(classe: Type<T>) => T;
  let purgesAuDemarrage = 0;

  it('au démarrage de l’application, le journal de plus de 12 mois est purgé (sans aucune requête)', () => {
    expect(purgesAuDemarrage).toBe(1);
  });

  beforeAll(async () => {
    // Avant le premier import de l'application : certains modules lisent la
    // configuration à l'import. Aucune de ces valeurs ne mène nulle part —
    // l'adresse de base n'est jamais ouverte (Prisma est remplacé).
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://aucune:aucune@127.0.0.1:1/aucune';
    process.env.JWT_SECRET = 'secret-de-test-espace-argent-0123456789abcdef';
    process.env.MAIL_TRANSPORT = 'log';
    process.env.IGINI_AI_ENABLED = 'false';
    process.env.LIMITE_REQUETES_PAR_MINUTE = '100000';
    delete process.env.ANTHROPIC_API_KEY;

    const [{ AppModule }, { PrismaService }] = await Promise.all([
      import('../app.module.js'),
      import('../prisma/prisma.service.js'),
    ]);
    prisma = fauxPrisma(collaborateurs, choix, donnees);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    purgesAuDemarrage = prisma.space_activity.deleteMany.mock.calls.length;

    const jwt = app.get(JwtService);
    jeton = (userId) => jwt.sign({ sub: userId, email: `${userId.slice(0, 4)}@exemple.fr` });
    service = (classe) => app.get(classe, { strict: false });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    collaborateurs.length = 0;
    choix.length = 0;
    donnees.lignes = lignesArgent();
    vi.restoreAllMocks();
    prisma.space_activity.create.mockClear();
    prisma.space_activity.findMany.mockClear();
    prisma.project_collaborators.findMany.mockClear();
    prisma.space_members.upsert.mockClear();
    prisma.space_members.createMany.mockClear();
  });

  type Methode = 'get' | 'post' | 'put' | 'patch' | 'delete';
  const par = (qui: string, methode: Methode, chemin: string, espace?: string) => {
    const req = request(app.getHttpServer())[methode](chemin).set('Authorization', `Bearer ${jeton(qui)}`);
    return espace ? req.set('X-Espace', espace) : req;
  };
  const en = (methode: Methode, chemin: string, espace?: string) => par(MOI, methode, chemin, espace);
  /** Le rôle seul, sans ligne d'accès : un collaborateur ajouté avant ce lot. */
  const roleSurProjetDuProprio = (role: string) => collaborateurs.push({ user_id: MOI, project_id: PROJET, role });
  /** Comme une invitation faite par le nouveau code : le rôle ET la ligne « argent_auto ». */
  const membreDuProprio = (role: string) => {
    roleSurProjetDuProprio(role);
    choix.push({ owner_id: PROPRIO, member_id: MOI, role: 'argent_auto' });
  };
  const attendreLesEcritures = () => new Promise((resolve) => setImmediate(resolve));

  /** Ce que chaque module rend, réduit à ce qui dit À QUI sont les données. */
  const MODULES: [string, string, (body: unknown) => unknown][] = [
    ['facturation', '/billing/documents', (b) => (b as { documents: Ligne[] }).documents.map((d) => d.client_name)],
    ['comptabilité', '/comptabilite/comptes', (b) => (b as Ligne[]).map((c) => c.label)],
    ['banque', '/banque/comptes', (b) => (b as Ligne[]).map((c) => c.label)],
    ['caisse', '/caisse/journees', (b) => (b as Ligne[]).map((c) => c.cash_cents)],
  ];
  const DU_PROPRIO: Record<string, unknown> = {
    facturation: ['Client du proprio'],
    comptabilité: ['Livre du proprio'],
    banque: ['Banque du proprio'],
    caisse: [999],
  };
  const DE_MOI: Record<string, unknown> = {
    facturation: ['Client de moi'],
    comptabilité: ['Livre de moi'],
    banque: ['Banque de moi'],
    caisse: [100],
  };

  describe.each(['comptable', 'associe'])('%s sur un projet du propriétaire', (role) => {
    it.each(MODULES)('%s : 200 avec les données du propriétaire', async (nom, chemin, extraire) => {
      membreDuProprio(role);
      const res = await en('get', chemin, PROPRIO);
      expect(res.status).toBe(200);
      expect(extraire(res.body)).toEqual(DU_PROPRIO[nom]);
    });
  });

  describe.each(['salarie', 'observateur'])('%s sur un projet du propriétaire', (role) => {
    it.each(MODULES)('%s : 404 « Espace introuvable. », même avec une ligne d’accès', async (_nom, chemin) => {
      membreDuProprio(role);
      const res = await en('get', chemin, PROPRIO);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Espace introuvable.');
    });
  });

  it('retiré du projet : 404 dès la requête suivante (relu à chaque fois)', async () => {
    membreDuProprio('comptable');
    expect((await en('get', '/caisse/journees', PROPRIO)).status).toBe(200);
    collaborateurs.length = 0;
    const res = await en('get', '/caisse/journees', PROPRIO);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Espace introuvable.');
  });

  it('comptable chez un AUTRE propriétaire : rien ici (404), même avec un en-tête bien formé', async () => {
    collaborateurs.push({ user_id: MOI, project_id: PROJET_ETRANGER, role: 'comptable' });
    choix.push({ owner_id: ETRANGER, member_id: MOI, role: 'argent_auto' });
    expect((await en('get', '/billing/documents', PROPRIO)).status).toBe(404);
    expect((await en('get', '/billing/documents', 'pas-un-uuid')).status).toBe(404);
  });

  describe('le propriétaire chez lui : inchangé', () => {
    it.each(MODULES)('%s : sans en-tête, ses propres données, sans consulter les collaborateurs', async (nom, chemin, extraire) => {
      const res = await par(PROPRIO, 'get', chemin);
      expect(res.status).toBe(200);
      expect(extraire(res.body)).toEqual(DU_PROPRIO[nom]);
      expect(prisma.project_collaborators.findMany).not.toHaveBeenCalled();
    });

    it.each(MODULES)('%s : en-tête égal à son propre id = chez lui', async (nom, chemin, extraire) => {
      const res = await en('get', chemin, MOI);
      expect(res.status).toBe(200);
      expect(extraire(res.body)).toEqual(DE_MOI[nom]);
    });

    it('une écriture chez soi n’est pas journalisée', async () => {
      const { CaisseService } = await import('../caisse/caisse.service.js');
      vi.spyOn(service(CaisseService), 'recordDay').mockResolvedValue({ id: 'c1' } as never);
      const res = await par(PROPRIO, 'post', '/caisse/journees').send({
        occurredOn: '2026-10-14',
        cashCents: 1000,
        cardCents: 0,
        vatCents: 0,
      });
      await attendreLesEcritures();
      expect(res.status).toBe(201);
      expect(prisma.space_activity.create).not.toHaveBeenCalled();
    });
  });

  it('une écriture d’un comptable est faite chez le propriétaire et journalisée (chemin sans requête)', async () => {
    membreDuProprio('comptable');
    const { CaisseService } = await import('../caisse/caisse.service.js');
    const enregistrer = vi.spyOn(service(CaisseService), 'recordDay').mockResolvedValue({ id: 'c1' } as never);

    const res = await en('post', '/caisse/journees?x=1', PROPRIO).send({
      occurredOn: '2026-10-14',
      cashCents: 1000,
      cardCents: 0,
      vatCents: 0,
    });
    await attendreLesEcritures();

    expect(res.status).toBe(201);
    expect(enregistrer).toHaveBeenCalledWith(PROPRIO, expect.objectContaining({ cashCents: 1000 }));
    expect(prisma.space_activity.create).toHaveBeenCalledWith({
      data: { owner_id: PROPRIO, actor_id: MOI, methode: 'POST', chemin: '/caisse/journees', statut: 201 },
    });
  });

  it('une lecture d’un membre n’est pas journalisée', async () => {
    membreDuProprio('associe');
    expect((await en('get', '/banque/comptes', PROPRIO)).status).toBe(200);
    await attendreLesEcritures();
    expect(prisma.space_activity.create).not.toHaveBeenCalled();
  });

  describe('toute autre route avec l’espace d’un autre : 403, fermé par défaut', () => {
    it.each([
      ['get', '/agenda'],
      ['post', '/agenda'],
      ['get', '/crm/contacts'],
      ['get', '/stocks'],
      ['get', '/projects'],
      ['get', `/projects/${PROJET}`],
      ['get', `/projects/${PROJET}/audit-financier`],
      ['get', `/projects/${PROJET}/mon-acces`],
      ['get', '/profil'],
      ['get', '/users/me/export'],
    ] as [Methode, string][])('%s %s → 403, même pour un associé', async (methode, chemin) => {
      membreDuProprio('associe');
      const res = await en(methode, chemin, PROPRIO);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe(
        'Cette action ne se fait que dans ton propre espace. Reviens sur « Mon espace » pour la faire.',
      );
      expect(prisma.project_collaborators.findMany).not.toHaveBeenCalled();
    });

    it('le service n’est jamais appelé', async () => {
      membreDuProprio('associe');
      const { AgendaService } = await import('../agenda/agenda.service.js');
      const lister = vi.spyOn(service(AgendaService), 'list').mockResolvedValue([] as never);
      expect((await en('get', '/agenda', PROPRIO)).status).toBe(403);
      expect(lister).not.toHaveBeenCalled();
    });

    it('sans en-tête, la même route fonctionne comme avant', async () => {
      const { AgendaService } = await import('../agenda/agenda.service.js');
      const lister = vi.spyOn(service(AgendaService), 'list').mockResolvedValue([] as never);
      expect((await en('get', '/agenda')).status).toBe(200);
      expect(lister).toHaveBeenCalledWith(MOI, expect.anything());
    });
  });

  describe('GET /espaces', () => {
    it('« Mon espace » d’abord, puis l’espace du propriétaire avec mes rôles', async () => {
      membreDuProprio('comptable');
      const res = await en('get', '/espaces');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { ownerId: MOI, nom: 'Mon espace', roles: ['proprietaire'] },
        { ownerId: PROPRIO, nom: 'Espace de l’entreprise Projet du proprio', roles: ['comptable'] },
      ]);
    });

    it('l’en-tête y est ignoré (même étranger ou illisible)', async () => {
      expect((await en('get', '/espaces', PROPRIO)).status).toBe(200);
      expect((await en('get', '/espaces', 'pas-un-uuid')).status).toBe(200);
    });

    it('un salarié ou un observateur n’y voit que son propre espace', async () => {
      roleSurProjetDuProprio('salarie');
      collaborateurs.push({ user_id: MOI, project_id: PROJET_ETRANGER, role: 'observateur' });
      const res = await en('get', '/espaces');
      expect(res.body).toEqual([{ ownerId: MOI, nom: 'Mon espace', roles: ['proprietaire'] }]);
    });
  });

  describe('GET /espaces/activite — le journal de mon équipe, pour moi seul', () => {
    it('le propriétaire lit l’activité de ses membres dans SON argent', async () => {
      const res = await par(PROPRIO, 'get', '/espaces/activite');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { date: '2026-10-14T10:00:00.000Z', acteur: 'Bob', methode: 'POST', chemin: '/caisse/journees', statut: 201 },
      ]);
      expect(prisma.space_activity.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { owner_id: PROPRIO } }));
    });

    it('un membre ne lit que le sien (vide), jamais celui du propriétaire', async () => {
      membreDuProprio('associe');
      const res = await en('get', '/espaces/activite');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('avec l’espace d’un autre : 403, sans lire le journal (même pour un associé)', async () => {
      membreDuProprio('associe');
      const res = await en('get', '/espaces/activite', PROPRIO);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe(
        'Cette action ne se fait que dans ton propre espace. Reviens sur « Mon espace » pour la faire.',
      );
      expect(prisma.space_activity.findMany).not.toHaveBeenCalled();
    });
  });

  describe('accès consenti au geste du propriétaire (décision du 2026-10-14, après revue)', () => {
    // Par les VRAIES routes de l'équipe. L'invitation est limitée à 5 par
    // minute (`@Throttle` de la route) : ce fichier en fait 4, pas plus.
    const lireCaisse = () => en('get', '/caisse/journees', PROPRIO);
    const inviter = (role: string) =>
      par(PROPRIO, 'post', `/projects/${PROJET}/collaborators`).send({ email: courriel(MOI), role });
    const passer = (role: string) => par(PROPRIO, 'patch', `/projects/${PROJET}/collaborators/${MOI}`).send({ role });
    const retirer = () => par(PROPRIO, 'delete', `/projects/${PROJET}/collaborators/${MOI}`);
    const raisonsVuesParLeProprietaire = async () =>
      ((await par(PROPRIO, 'get', '/espaces/acces-argent')).body as { raison: string }[]).map((m) => m.raison);

    it.each(['comptable', 'associe'])(
      'invité comme %s : ligne « argent_auto » créée, accès aux 4 modules, « automatique » pour le propriétaire',
      async (role) => {
        expect((await lireCaisse()).status).toBe(404);

        const invitation = await inviter(role);
        expect(invitation.status).toBe(201);
        expect(choix).toEqual([{ owner_id: PROPRIO, member_id: MOI, role: 'argent_auto' }]);

        for (const [nom, chemin, extraire] of MODULES) {
          const res = await en('get', chemin, PROPRIO);
          expect(res.status).toBe(200);
          expect(extraire(res.body)).toEqual(DU_PROPRIO[nom]);
        }
        expect((await en('get', '/espaces')).body).toEqual([
          { ownerId: MOI, nom: 'Mon espace', roles: ['proprietaire'] },
          { ownerId: PROPRIO, nom: 'Espace de l’entreprise Projet du proprio', roles: [role] },
        ]);
        expect(await raisonsVuesParLeProprietaire()).toEqual(['automatique']);
      },
    );

    it('invité observateur : aucune ligne, 404 ; promu associé : ligne créée, accès', async () => {
      expect((await inviter('observateur')).status).toBe(201);
      expect(choix).toEqual([]);
      expect((await lireCaisse()).status).toBe(404);

      expect((await passer('associe')).status).toBe(204);
      expect(choix).toEqual([{ owner_id: PROPRIO, member_id: MOI, role: 'argent_auto' }]);
      expect((await lireCaisse()).status).toBe(200);
    });

    it('un « refuse » explicite est gardé à la re-promotion et à la réinvitation : jamais écrasé', async () => {
      roleSurProjetDuProprio('comptable');
      choix.push({ owner_id: PROPRIO, member_id: MOI, role: 'refuse' });

      // Repassé observateur, puis comptable : toujours coupé.
      expect((await passer('observateur')).status).toBe(204);
      expect((await passer('comptable')).status).toBe(204);
      expect(choix).toEqual([{ owner_id: PROPRIO, member_id: MOI, role: 'refuse' }]);
      expect((await lireCaisse()).status).toBe(404);

      // Retiré, puis réinvité comme associé : toujours coupé.
      expect((await retirer()).status).toBe(204);
      expect((await inviter('associe')).status).toBe(201);
      expect(choix).toEqual([{ owner_id: PROPRIO, member_id: MOI, role: 'refuse' }]);
      expect((await lireCaisse()).status).toBe(404);
      expect(await raisonsVuesParLeProprietaire()).toEqual(['coupe_par_toi']);
    });

    it('un « argent » explicite est gardé lui aussi (jamais remplacé par « argent_auto »)', async () => {
      roleSurProjetDuProprio('comptable');
      choix.push({ owner_id: PROPRIO, member_id: MOI, role: 'argent' });

      expect((await passer('associe')).status).toBe(204);

      expect(choix).toEqual([{ owner_id: PROPRIO, member_id: MOI, role: 'argent' }]);
      expect(await raisonsVuesParLeProprietaire()).toEqual(['active_par_toi']);
    });

    it('collaborateur d’avant (aucune ligne) : 404 tant que le propriétaire ne l’a pas activé, puis 200', async () => {
      roleSurProjetDuProprio('comptable');
      const avant = await lireCaisse();
      expect(avant.status).toBe(404);
      expect(avant.body.message).toBe('Espace introuvable.');
      expect((await en('get', '/espaces')).body).toEqual([{ ownerId: MOI, nom: 'Mon espace', roles: ['proprietaire'] }]);
      expect(await raisonsVuesParLeProprietaire()).toEqual(['a_activer']);

      const active = await par(PROPRIO, 'put', `/espaces/acces-argent/${MOI}`).send({ acces: true });
      expect(active.status).toBe(200);

      const res = await lireCaisse();
      expect(res.status).toBe(200);
      expect(res.body.map((l: Ligne) => l.cash_cents)).toEqual([999]);
      expect((await en('get', '/espaces')).body).toEqual([
        { ownerId: MOI, nom: 'Mon espace', roles: ['proprietaire'] },
        { ownerId: PROPRIO, nom: 'Espace de l’entreprise Projet du proprio', roles: ['comptable'] },
      ]);
    });

    it('ligne « refuse » : 404, et l’espace disparaît de GET /espaces', async () => {
      membreDuProprio('comptable');
      expect((await lireCaisse()).status).toBe(200);

      const coupe = await par(PROPRIO, 'put', `/espaces/acces-argent/${MOI}`).send({ acces: false });
      expect(coupe.status).toBe(200);
      expect(choix).toEqual([expect.objectContaining({ owner_id: PROPRIO, member_id: MOI, role: 'refuse' })]);

      const res = await lireCaisse();
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Espace introuvable.');
      expect((await en('get', '/espaces')).body).toEqual([{ ownerId: MOI, nom: 'Mon espace', roles: ['proprietaire'] }]);
    });

    it.each(['argent', 'argent_auto'])(
      'retiré des projets par la vraie route : 404 même avec une ligne « %s », qui reste en place',
      async (ligne) => {
        roleSurProjetDuProprio('comptable');
        choix.push({ owner_id: PROPRIO, member_id: MOI, role: ligne });
        expect((await lireCaisse()).status).toBe(200);

        expect((await retirer()).status).toBe(204);

        expect((await lireCaisse()).status).toBe(404);
        expect((await en('get', '/espaces')).body).toHaveLength(1);
        // La ligne n'est pas supprimée : l'accès dépend déjà du rôle actuel.
        expect(choix).toEqual([{ owner_id: PROPRIO, member_id: MOI, role: ligne }]);
      },
    );

    it('passé observateur : 404 même avec une ligne « argent »', async () => {
      roleSurProjetDuProprio('comptable');
      choix.push({ owner_id: PROPRIO, member_id: MOI, role: 'argent' });

      expect((await passer('observateur')).status).toBe(204);

      expect((await lireCaisse()).status).toBe(404);
      expect(choix).toEqual([{ owner_id: PROPRIO, member_id: MOI, role: 'argent' }]);
    });
  });

  describe('GET / PUT /espaces/acces-argent — le propriétaire choisit, chez lui seulement', () => {
    const lireCaisseDe = (qui: string) => par(qui, 'get', '/caisse/journees', PROPRIO);

    it('GET liste ses comptables et associés avec leur accès et la raison', async () => {
      roleSurProjetDuProprio('comptable');
      const res = await par(PROPRIO, 'get', '/espaces/acces-argent');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          memberId: MOI,
          nom: '1111@exemple.fr',
          email: '1111@exemple.fr',
          roles: ['comptable'],
          acces: false,
          raison: 'a_activer',
        },
      ]);
    });

    it('PUT rend la liste relue (la réponse du serveur, pas celle du client)', async () => {
      membreDuProprio('associe');
      const res = await par(PROPRIO, 'put', `/espaces/acces-argent/${MOI}`).send({ acces: false });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([expect.objectContaining({ memberId: MOI, acces: false, raison: 'coupe_par_toi' })]);

      const reactive = await par(PROPRIO, 'put', `/espaces/acces-argent/${MOI}`).send({ acces: true });
      expect(reactive.body).toEqual([expect.objectContaining({ memberId: MOI, acces: true, raison: 'active_par_toi' })]);
      // Une seule ligne par couple, mise à jour.
      expect(choix).toHaveLength(1);
      expect(choix[0]).toEqual(expect.objectContaining({ role: 'argent', created_at: expect.any(Date) }));
    });

    it('PUT : 404 pour quelqu’un qui n’est ni comptable ni associé chez lui', async () => {
      membreDuProprio('salarie');
      const res = await par(PROPRIO, 'put', `/espaces/acces-argent/${MOI}`).send({ acces: true });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Cette personne n’est ni comptable ni associée sur un de tes projets.');
      expect(prisma.space_members.upsert).not.toHaveBeenCalled();
    });

    it('PUT : corps invalide (400), identifiant illisible (400) — rien n’est écrit', async () => {
      roleSurProjetDuProprio('comptable');
      expect((await par(PROPRIO, 'put', `/espaces/acces-argent/${MOI}`).send({ acces: 'oui' })).status).toBe(400);
      expect((await par(PROPRIO, 'put', `/espaces/acces-argent/${MOI}`).send({})).status).toBe(400);
      expect((await par(PROPRIO, 'put', '/espaces/acces-argent/pas-un-uuid').send({ acces: true })).status).toBe(400);
      expect(prisma.space_members.upsert).not.toHaveBeenCalled();
    });

    it.each([
      ['get', '/espaces/acces-argent'],
      ['put', `/espaces/acces-argent/${MOI}`],
    ] as [Methode, string][])('%s %s avec l’espace d’un autre : 403, sans rien lire ni écrire', async (methode, chemin) => {
      membreDuProprio('associe');
      const res = await en(methode, chemin, PROPRIO).send({ acces: true });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe(
        'Cette action ne se fait que dans ton propre espace. Reviens sur « Mon espace » pour la faire.',
      );
      expect(prisma.project_collaborators.findMany).not.toHaveBeenCalled();
      expect(prisma.space_members.upsert).not.toHaveBeenCalled();
    });

    it('un membre ne peut pas choisir pour l’espace d’un autre : chez lui, 404 ; avec l’en-tête, 403', async () => {
      // MOI est associé chez PROPRIO, collaborateur d'avant (aucune ligne) : à activer.
      // Il tente de s'activer lui-même dans l'argent de PROPRIO.
      roleSurProjetDuProprio('associe');
      const chezMoi = await en('put', `/espaces/acces-argent/${MOI}`).send({ acces: true });
      expect(chezMoi.status).toBe(404);
      const avecEnTete = await en('put', `/espaces/acces-argent/${MOI}`, PROPRIO).send({ acces: true });
      expect(avecEnTete.status).toBe(403);
      // Ni en se redonnant un rôle par les routes de l'équipe (réservées au propriétaire).
      const parLEquipe = await en('patch', `/projects/${PROJET}/collaborators/${MOI}`).send({ role: 'comptable' });
      expect(parLEquipe.status).toBe(403);
      expect(prisma.space_members.upsert).not.toHaveBeenCalled();
      expect(prisma.space_members.createMany).not.toHaveBeenCalled();
      expect(choix).toEqual([]);
      expect((await lireCaisseDe(MOI)).status).toBe(404);
    });
  });
});
