import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Domaine } from '../equipe/domaines.js';
import { ESPACE_INTROUVABLE, espaceEtranger, type EspaceService } from '../equipe/espace.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { EN_TETE_CAPTURE } from './ecriture-depassee.decorator.js';
import { EcritureDepasseeGuard } from './ecriture-depassee.guard.js';
import type { CibleDatee } from './ecriture-depassee.decorator.js';

/**
 * Le garde décide si une écriture faite hors ligne peut encore s'appliquer.
 *
 * Deux erreurs sont possibles, et elles ne coûtent pas la même chose :
 *
 *   — laisser passer une écriture périmée efface silencieusement le travail
 *     plus récent de quelqu'un ;
 *   — refuser une écriture valable bloque le travail que la personne vient
 *     de faire, et lui demande de le refaire sans qu'elle comprenne pourquoi.
 *
 * La seconde est plus fréquente et plus visible, donc le garde se trompe
 * toujours dans le premier sens. Les tests ci-dessous existent surtout pour
 * tenir cette asymétrie : la moitié d'entre eux vérifient qu'il LAISSE
 * PASSER.
 *
 * Et son 409 porte la date exacte de la dernière modification : il ne le
 * rend qu'à qui a déjà accès à la ressource. À tout autre, il laisse passer
 * et le contrôleur répond comme sans lui (404, 403) — sinon n'importe quel
 * compte apprendrait, à partir d'un identifiant, qu'une ligne existe et
 * quand elle a changé.
 */

const MAINTENANT = new Date('2026-09-24T12:00:00.000Z').getTime();
const DIX_MINUTES = 10 * 60_000;
/** La date de la dernière modification, il y a 5 minutes. */
const MODIFIEE = new Date(MAINTENANT - 5 * 60_000);

const PROPRIO = 'proprio';
/** Observateur sur le projet p1 du propriétaire. */
const COLLEGUE = 'collegue';
/** Comptable sur p1, accès à l'argent du propriétaire ouvert. */
const COMPTABLE = 'comptable';
/** Comptable sur p1, accès à l'argent du propriétaire coupé. */
const COUPE = 'coupe';
/** N'est pas dans l'équipe du propriétaire — ou n'y est plus. */
const INCONNU = 'inconnu';

type Ligne = Record<string, unknown>;
type Table = 'projects' | 'tasks' | 'billing_documents' | 'crm_contacts' | 'crm_companies';

interface Monde {
  lignes: Record<Table, Ligne[]>;
  collaborateurs: { project_id: string; user_id: string; role: string }[];
  /** Les espaces argent ouverts, notés `proprietaire>membre`. */
  argentOuvert: Set<string>;
}

function monde(updatedAt: Date | null = MODIFIEE): Monde {
  return {
    lignes: {
      projects: [{ id: 'p1', owner_id: PROPRIO, updated_at: updatedAt }],
      tasks: [{ id: 't1', project_id: 'p1', updated_at: updatedAt }],
      billing_documents: [{ id: 'd1', owner_id: PROPRIO, updated_at: updatedAt }],
      crm_contacts: [{ id: 'c1', owner_id: PROPRIO, updated_at: updatedAt }],
      crm_companies: [{ id: 'e1', owner_id: PROPRIO, updated_at: updatedAt }],
    },
    collaborateurs: [
      { project_id: 'p1', user_id: COLLEGUE, role: 'observateur' },
      { project_id: 'p1', user_id: COMPTABLE, role: 'comptable' },
      { project_id: 'p1', user_id: COUPE, role: 'comptable' },
    ],
    argentOuvert: new Set([`${PROPRIO}>${COMPTABLE}`]),
  };
}

/** Égalité stricte clé par clé ; toute autre forme de filtre fait échouer le test. */
function correspond(ligne: Ligne, where: Ligne): boolean {
  return Object.entries(where).every(([cle, valeur]) => {
    if (valeur !== null && typeof valeur === 'object') {
      throw new Error(`Filtre non géré par la fausse base : ${cle}=${JSON.stringify(valeur)}`);
    }
    return ligne[cle] === valeur;
  });
}

/** Seules les colonnes demandées reviennent : un `select` oublié ou incomplet se voit. */
function projeter(ligne: Ligne | undefined, select?: Record<string, boolean>): Ligne | null {
  if (!ligne) return null;
  if (!select) throw new Error('Lecture sans `select` : le garde ne lit que les colonnes dont il a besoin.');
  return Object.fromEntries(Object.keys(select).map((colonne) => [colonne, ligne[colonne]]));
}

function fausseBase(m: Monde) {
  const lecture = (table: Table) =>
    vi.fn(async ({ where, select }: { where: Ligne; select?: Record<string, boolean> }) =>
      projeter(
        m.lignes[table].find((ligne) => correspond(ligne, where)),
        select,
      ),
    );
  const table = (nom: Table) => ({ findUnique: lecture(nom), findFirst: lecture(nom) });
  return {
    projects: {
      ...table('projects'),
      // La forme exacte de la lecture d'`accesProjet` (propriétaire OU membre).
      findFirst: vi.fn(async ({ where }: { where: { id: string; OR: [{ owner_id: string }, unknown] } }) => {
        const userId = where.OR[0].owner_id;
        const projet = m.lignes.projects.find((p) => p.id === where.id);
        if (!projet) return null;
        const sesLignes = m.collaborateurs.filter((c) => c.project_id === projet.id && c.user_id === userId);
        if (projet.owner_id !== userId && sesLignes.length === 0) return null;
        return { owner_id: projet.owner_id, collaborators: sesLignes.map((c) => ({ role: c.role })) };
      }),
    },
    tasks: table('tasks'),
    billing_documents: table('billing_documents'),
    crm_contacts: table('crm_contacts'),
    crm_companies: table('crm_companies'),
  };
}

/** La résolution d'espace telle que le garde la voit : la mienne, ou 404. */
function fauxEspaces(m: Monde) {
  return {
    resoudre: vi.fn(async (userId: string, enTete: string | string[] | undefined, domaine: Domaine) => {
      const autre = espaceEtranger(userId, enTete);
      if (autre === null) return userId;
      if (domaine === 'argent' && m.argentOuvert.has(`${autre}>${userId}`)) return autre;
      throw new NotFoundException(ESPACE_INTROUVABLE);
    }),
  };
}

function contexte(
  entetes: Record<string, string>,
  parametres: Record<string, string>,
  userId: string | null = PROPRIO,
) {
  const requete = { headers: entetes, params: parametres, user: userId ? { id: userId } : undefined };
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => requete }),
  } as unknown as ExecutionContext;
}

function garde(cible: CibleDatee | undefined, m: Monde | Date | null | 'introuvable' = monde()) {
  let leMonde: Monde;
  if (m === 'introuvable') {
    leMonde = monde();
    leMonde.lignes.projects = [];
  } else if (m === null || m instanceof Date) {
    leMonde = monde(m);
  } else {
    leMonde = m;
  }
  const reflector = { getAllAndOverride: () => cible } as unknown as Reflector;
  const prisma = fausseBase(leMonde);
  const espaces = fauxEspaces(leMonde);
  return {
    garde: new EcritureDepasseeGuard(
      reflector,
      prisma as unknown as PrismaService,
      espaces as unknown as EspaceService,
    ),
    prisma,
    espaces,
  };
}

const CIBLE: CibleDatee = { ressource: 'projects', parametre: 'id' };
/** Capturée il y a 10 minutes ; la ligne a bougé il y a 5 : écriture périmée. */
const PERIMEE = { [EN_TETE_CAPTURE]: String(DIX_MINUTES) };

describe('le garde des écritures revenues du froid', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MAINTENANT);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ce qu’il refuse', () => {
    it('refuse une écriture capturée avant la dernière modification', async () => {
      await expect(
        garde(CIBLE, MODIFIEE).garde.canActivate(contexte(PERIMEE, { id: 'p1' })),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('dit ce qui s’est passé et quoi faire, sans accuser la personne', async () => {
      const erreur = await garde(CIBLE, MODIFIEE)
        .garde.canActivate(contexte(PERIMEE, { id: 'p1' }))
        .then(
          () => {
            throw new Error('le garde aurait dû refuser');
          },
          (e: unknown) => e as ConflictException,
        );

      const corps = erreur.getResponse() as { message: string; modifieA: string };
      expect(erreur.getStatus()).toBe(409);
      expect(corps.message).toContain('hors ligne');
      expect(corps.message).toContain('refais');
      // La date de la modification concurrente, pour que l'interface puisse
      // un jour la montrer sans que le serveur ait à changer.
      expect(corps.modifieA).toBe(MODIFIEE.toISOString());
    });
  });

  describe('à qui il répond 409 — seulement à qui a déjà accès à la ressource', () => {
    type Cas = [string, CibleDatee, string, string, Record<string, string>];

    const AUTORISES: Cas[] = [
      ['le propriétaire du projet', CIBLE, 'p1', PROPRIO, {}],
      ['un membre de l’équipe du projet, même observateur', CIBLE, 'p1', COLLEGUE, {}],
      ['le propriétaire du projet de la tâche', { ressource: 'tasks', parametre: 'taskId' }, 't1', PROPRIO, {}],
      ['un membre de l’équipe du projet de la tâche', { ressource: 'tasks', parametre: 'taskId' }, 't1', COLLEGUE, {}],
      ['le propriétaire du document, chez lui', { ressource: 'billing_documents', parametre: 'id' }, 'd1', PROPRIO, {}],
      [
        'le propriétaire du document qui nomme son propre espace',
        { ressource: 'billing_documents', parametre: 'id' },
        'd1',
        PROPRIO,
        { 'x-espace': PROPRIO },
      ],
      [
        'son comptable à l’accès ouvert, dans l’espace du propriétaire',
        { ressource: 'billing_documents', parametre: 'id' },
        'd1',
        COMPTABLE,
        { 'x-espace': PROPRIO },
      ],
      ['le propriétaire du contact', { ressource: 'crm_contacts', parametre: 'id' }, 'c1', PROPRIO, {}],
      ['le propriétaire de l’entreprise', { ressource: 'crm_companies', parametre: 'id' }, 'e1', PROPRIO, {}],
    ];

    it.each(AUTORISES)('refuse l’écriture périmée de %s', async (_qui, cible, id, userId, entetes) => {
      const erreur = await garde(cible)
        .garde.canActivate(contexte({ ...PERIMEE, ...entetes }, { [cible.parametre]: id }, userId))
        .then(
          () => {
            throw new Error('le garde aurait dû refuser');
          },
          (e: unknown) => e as ConflictException,
        );

      expect(erreur).toBeInstanceOf(ConflictException);
      expect((erreur.getResponse() as { modifieA: string }).modifieA).toBe(MODIFIEE.toISOString());
    });

    const ETRANGERS: Cas[] = [
      ['quelqu’un qui n’est pas (ou plus) dans l’équipe du projet', CIBLE, 'p1', INCONNU, {}],
      [
        'quelqu’un qui n’est pas dans l’équipe du projet de la tâche',
        { ressource: 'tasks', parametre: 'taskId' },
        't1',
        INCONNU,
        {},
      ],
      ['un inconnu, dans son propre espace', { ressource: 'billing_documents', parametre: 'id' }, 'd1', INCONNU, {}],
      [
        'un inconnu qui nomme l’espace du propriétaire',
        { ressource: 'billing_documents', parametre: 'id' },
        'd1',
        INCONNU,
        { 'x-espace': PROPRIO },
      ],
      [
        'un comptable dont l’accès à l’argent est coupé',
        { ressource: 'billing_documents', parametre: 'id' },
        'd1',
        COUPE,
        { 'x-espace': PROPRIO },
      ],
      [
        'le comptable dans son propre espace, où le document n’est pas',
        { ressource: 'billing_documents', parametre: 'id' },
        'd1',
        COMPTABLE,
        {},
      ],
      [
        'un observateur, dont le rôle n’ouvre pas l’argent',
        { ressource: 'billing_documents', parametre: 'id' },
        'd1',
        COLLEGUE,
        { 'x-espace': PROPRIO },
      ],
      ['un inconnu, sur un contact', { ressource: 'crm_contacts', parametre: 'id' }, 'c1', INCONNU, {}],
      [
        'le comptable du propriétaire, sur un contact : le CRM ne se délègue pas',
        { ressource: 'crm_contacts', parametre: 'id' },
        'c1',
        COMPTABLE,
        { 'x-espace': PROPRIO },
      ],
      ['un inconnu, sur une entreprise', { ressource: 'crm_companies', parametre: 'id' }, 'e1', INCONNU, {}],
      [
        'un membre d’un projet du propriétaire, sur une entreprise',
        { ressource: 'crm_companies', parametre: 'id' },
        'e1',
        COLLEGUE,
        {},
      ],
    ];

    it.each(ETRANGERS)(
      'laisse passer %s, même périmé : le contrôleur répond comme sans le garde',
      async (_qui, cible, id, userId, entetes) => {
        await expect(
          garde(cible).garde.canActivate(contexte({ ...PERIMEE, ...entetes }, { [cible.parametre]: id }, userId)),
        ).resolves.toBe(true);
      },
    );

    it('ne lit même pas la date d’un projet auquel la personne n’a pas accès', async () => {
      const { garde: g, prisma } = garde(CIBLE);

      await expect(g.canActivate(contexte(PERIMEE, { id: 'p1' }, INCONNU))).resolves.toBe(true);
      expect(prisma.projects.findUnique).not.toHaveBeenCalled();
    });

    it('juge une tâche sur le projet auquel elle appartient', async () => {
      const m = monde();
      m.lignes.projects.push({ id: 'p2', owner_id: INCONNU, updated_at: MODIFIEE });
      m.lignes.tasks = [{ id: 't1', project_id: 'p2', updated_at: MODIFIEE }];
      const cible: CibleDatee = { ressource: 'tasks', parametre: 'taskId' };

      // La tâche est dans le projet d'INCONNU : c'est lui qui la voit, plus le propriétaire de p1.
      await expect(garde(cible, m).garde.canActivate(contexte(PERIMEE, { taskId: 't1' }, PROPRIO))).resolves.toBe(
        true,
      );
      await expect(
        garde(cible, m).garde.canActivate(contexte(PERIMEE, { taskId: 't1' }, INCONNU)),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('ne cherche l’espace que pour l’argent', async () => {
      const { garde: g, espaces } = garde(CIBLE);

      await expect(g.canActivate(contexte({ ...PERIMEE, 'x-espace': PROPRIO }, { id: 'p1' }))).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(espaces.resoudre).not.toHaveBeenCalled();
    });

    it('laisse passer une requête sans personne authentifiée : erreur de câblage, pas un 409', async () => {
      await expect(
        garde(CIBLE).garde.canActivate(contexte(PERIMEE, { id: 'p1' }, null)),
      ).resolves.toBe(true);
    });

    it('ne prend pas une panne de base pour un refus d’accès', async () => {
      // Seuls les refus (404, 403) veulent dire « pas d'accès ». Une panne
      // remonte telle quelle, comme avant ce contrôle : la confondre avec un
      // refus cacherait la panne derrière un faux « tout va bien ».
      const { garde: g, prisma } = garde(CIBLE);
      prisma.projects.findFirst.mockRejectedValueOnce(new Error('connexion perdue'));

      await expect(g.canActivate(contexte(PERIMEE, { id: 'p1' }))).rejects.toThrow('connexion perdue');
    });
  });

  describe('ce qu’il laisse passer — la moitié qui compte', () => {
    it('laisse passer une requête sans en-tête : c’est une écriture en ligne', async () => {
      const { garde: g, prisma, espaces } = garde(CIBLE, new Date(MAINTENANT));

      await expect(g.canActivate(contexte({}, { id: 'p1' }))).resolves.toBe(true);
      // Sans en-tête, pas la moindre requête en base.
      for (const table of Object.values(prisma)) {
        for (const lecture of Object.values(table)) expect(lecture).not.toHaveBeenCalled();
      }
      expect(espaces.resoudre).not.toHaveBeenCalled();
    });

    it('laisse passer quand la route n’est pas décorée', async () => {
      await expect(
        garde(undefined, new Date(MAINTENANT)).garde.canActivate(
          contexte({ [EN_TETE_CAPTURE]: '999999' }, { id: 'p1' }),
        ),
      ).resolves.toBe(true);
    });

    it('laisse passer quand la ligne n’a pas bougé depuis la capture', async () => {
      // Capturée il y a 10 minutes ; la ligne n'a pas bougé depuis une heure.
      await expect(
        garde(CIBLE, new Date(MAINTENANT - 60 * 60_000)).garde.canActivate(contexte(PERIMEE, { id: 'p1' })),
      ).resolves.toBe(true);
    });

    it('laisse passer quand la modification est exactement contemporaine', async () => {
      // Égalité : rien ne prouve qu'une autre écriture est passée entre les
      // deux. Refuser sur une égalité serait refuser sur un doute.
      await expect(
        garde(CIBLE, new Date(MAINTENANT - DIX_MINUTES)).garde.canActivate(contexte(PERIMEE, { id: 'p1' })),
      ).resolves.toBe(true);
    });

    it('laisse passer quand la ligne ne sait pas quand elle a changé', async () => {
      // `updated_at` est nullable au schéma. Sans date, il n'y a rien à
      // comparer — et un soupçon n'est pas un motif de refus.
      await expect(garde(CIBLE, null).garde.canActivate(contexte(PERIMEE, { id: 'p1' }))).resolves.toBe(true);
    });

    it('laisse passer quand la ligne est introuvable : le 404 du contrôleur dit mieux', async () => {
      await expect(
        garde(CIBLE, 'introuvable').garde.canActivate(contexte(PERIMEE, { id: 'p1' })),
      ).resolves.toBe(true);
    });

    it('laisse passer un en-tête illisible plutôt que de bloquer sur notre propre bogue', async () => {
      for (const valeur of ['bientot', '', '-1', 'NaN']) {
        await expect(
          garde(CIBLE, new Date(MAINTENANT)).garde.canActivate(
            contexte({ [EN_TETE_CAPTURE]: valeur }, { id: 'p1' }),
          ),
        ).resolves.toBe(true);
      }
    });

    it('laisse passer quand le paramètre attendu n’est pas dans l’URL', async () => {
      await expect(
        garde(CIBLE, new Date(MAINTENANT)).garde.canActivate(contexte(PERIMEE, { autre: 'p1' })),
      ).resolves.toBe(true);
    });
  });

  describe('l’horloge de l’appareil ne peut pas fausser la décision', () => {
    it('une montre en retard d’une heure ne fait rien refuser', async () => {
      // C'est tout l'intérêt de transmettre un ÂGE et non une DATE. Si la
      // file envoyait `queuedAt`, ce cas refuserait tout ce que la personne
      // a fait hors ligne — la panne que ce dispositif doit éviter, pas
      // provoquer. L'âge, lui, ne dépend d'aucune horloge partagée.
      const modifieeAvant = new Date(MAINTENANT - 30 * 60_000);

      await expect(
        garde(CIBLE, modifieeAvant).garde.canActivate(contexte(PERIMEE, { id: 'p1' })),
      ).resolves.toBe(true);
    });
  });
});
