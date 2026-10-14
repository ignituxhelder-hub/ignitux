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

/** Un collaborateur de projet : la seule source des droits sur l'espace argent. */
interface Collaborateur {
  user_id: string;
  project_id: string;
  role: string;
}

function collaborateurCorrespond(c: Collaborateur, where: Ligne): boolean {
  return Object.entries(where).every(([cle, valeur]) => {
    if (cle === 'user_id') return c.user_id === valeur;
    if (cle === 'role') return ((valeur as { in: string[] }).in ?? []).includes(c.role);
    if (cle === 'project') {
      const projet = PROJETS.find((p) => p.id === c.project_id);
      return projet?.owner_id === (valeur as { owner_id: string }).owner_id;
    }
    throw new Error(`Filtre de collaborateur non géré : ${cle}=${JSON.stringify(valeur)}`);
  });
}

function fauxPrisma(collaborateurs: Collaborateur[], donnees: { lignes: Record<string, Ligne[]> }) {
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
  /** Lectures évaluées sur les lignes du test ; toute autre opération reste neutre. */
  const evaluee = (nom: string, lignes: () => Ligne[]) => {
    const lectures: Record<string, Fn> = tableEvaluee(lignes);
    return new Proxy(lectures, { get: (cible, op) => (typeof op === 'string' && op in cible ? cible[op] : modele(nom)[op as string]) });
  };
  const base: Record<string, unknown> = {
    users: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string } }) =>
        where.id ? { id: where.id, email: `${where.id.slice(0, 4)}@exemple.fr` } : null,
      ),
    },
    project_collaborators: {
      findFirst: vi.fn(async ({ where }: { where: Ligne }) => {
        const trouve = collaborateurs.find((c) => collaborateurCorrespond(c, where));
        return trouve ? { role: trouve.role } : null;
      }),
      findMany: vi.fn(async ({ where }: { where: Ligne }) =>
        collaborateurs
          .filter((c) => collaborateurCorrespond(c, where))
          .map((c) => {
            const owner_id = PROJETS.find((p) => p.id === c.project_id)!.owner_id;
            return {
              role: c.role,
              project: { owner_id, owner: { email: `${owner_id.slice(0, 4)}@exemple.fr`, profile: null } },
            };
          }),
      ),
    },
    space_activity: { create: vi.fn(async () => ({})), deleteMany: vi.fn(async () => ({ count: 0 })) },
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
    space_activity: { create: Fn; deleteMany: Fn };
    project_collaborators: { findFirst: Fn; findMany: Fn };
  };
}

describe('Espace argent sur les vrais contrôleurs — application entière, sans base', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof fauxPrisma>;
  const collaborateurs: Collaborateur[] = [];
  const donnees = { lignes: lignesArgent() };
  let jeton: (userId: string) => string;
  let service: <T>(classe: Type<T>) => T;

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
    prisma = fauxPrisma(collaborateurs, donnees);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const jwt = app.get(JwtService);
    jeton = (userId) => jwt.sign({ sub: userId, email: `${userId.slice(0, 4)}@exemple.fr` });
    service = (classe) => app.get(classe, { strict: false });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    collaborateurs.length = 0;
    donnees.lignes = lignesArgent();
    vi.restoreAllMocks();
    prisma.space_activity.create.mockClear();
    prisma.project_collaborators.findFirst.mockClear();
  });

  type Methode = 'get' | 'post' | 'put' | 'patch' | 'delete';
  const par = (qui: string, methode: Methode, chemin: string, espace?: string) => {
    const req = request(app.getHttpServer())[methode](chemin).set('Authorization', `Bearer ${jeton(qui)}`);
    return espace ? req.set('X-Espace', espace) : req;
  };
  const en = (methode: Methode, chemin: string, espace?: string) => par(MOI, methode, chemin, espace);
  const roleSurProjetDuProprio = (role: string) =>
    collaborateurs.push({ user_id: MOI, project_id: PROJET, role });
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
      roleSurProjetDuProprio(role);
      const res = await en('get', chemin, PROPRIO);
      expect(res.status).toBe(200);
      expect(extraire(res.body)).toEqual(DU_PROPRIO[nom]);
    });
  });

  describe.each(['salarie', 'observateur'])('%s sur un projet du propriétaire', (role) => {
    it.each(MODULES)('%s : 404 « Espace introuvable. »', async (_nom, chemin) => {
      roleSurProjetDuProprio(role);
      const res = await en('get', chemin, PROPRIO);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Espace introuvable.');
    });
  });

  it('retiré du projet : 404 dès la requête suivante (relu à chaque fois)', async () => {
    roleSurProjetDuProprio('comptable');
    expect((await en('get', '/caisse/journees', PROPRIO)).status).toBe(200);
    collaborateurs.length = 0;
    const res = await en('get', '/caisse/journees', PROPRIO);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Espace introuvable.');
  });

  it('comptable chez un AUTRE propriétaire : rien ici (404), même avec un en-tête bien formé', async () => {
    collaborateurs.push({ user_id: MOI, project_id: PROJET_ETRANGER, role: 'comptable' });
    expect((await en('get', '/billing/documents', PROPRIO)).status).toBe(404);
    expect((await en('get', '/billing/documents', 'pas-un-uuid')).status).toBe(404);
  });

  describe('le propriétaire chez lui : inchangé', () => {
    it.each(MODULES)('%s : sans en-tête, ses propres données, sans consulter les collaborateurs', async (nom, chemin, extraire) => {
      const res = await par(PROPRIO, 'get', chemin);
      expect(res.status).toBe(200);
      expect(extraire(res.body)).toEqual(DU_PROPRIO[nom]);
      expect(prisma.project_collaborators.findFirst).not.toHaveBeenCalled();
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
    roleSurProjetDuProprio('comptable');
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
    roleSurProjetDuProprio('associe');
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
      roleSurProjetDuProprio('associe');
      const res = await en(methode, chemin, PROPRIO);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe(
        'Cette action ne se fait que dans ton propre espace. Reviens sur « Mon espace » pour la faire.',
      );
      expect(prisma.project_collaborators.findFirst).not.toHaveBeenCalled();
    });

    it('le service n’est jamais appelé', async () => {
      roleSurProjetDuProprio('associe');
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
      roleSurProjetDuProprio('comptable');
      const res = await en('get', '/espaces');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { ownerId: MOI, nom: 'Mon espace', roles: ['proprietaire'] },
        { ownerId: PROPRIO, nom: 'Espace de 2222@exemple.fr', roles: ['comptable'] },
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
});
