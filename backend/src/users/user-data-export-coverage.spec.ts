import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { USER_DATA_SCOPE, exportedTables } from './user-data-scope.js';
import { UserDataService } from './user-data.service.js';

/**
 * L'EXPORT FAIT-IL CE QUE LE CLASSEMENT ANNONCE ?
 *
 * `user-data-scope.spec.ts` vérifie que chaque table du schéma est classée.
 * Il ne vérifie pas que l'export lit réellement les tables classées
 * « exportées » : une table pouvait être déclarée exportée, apparaître comme
 * telle dans les CGU, et ne jamais sortir du service. L'export mentait alors
 * par omission — exactement ce que user-data-scope.ts dit vouloir empêcher.
 *
 * Ce fichier ferme cet écart sans base de données : le client Prisma est
 * remplacé par un faux qui renvoie, pour chaque table lue, une ligne
 * marquée du nom de sa table (`__table`). Les relations demandées par
 * `include`/`select` sont remplies de la même façon, en lisant
 * `prisma/schema.prisma` pour savoir vers quelle table pointe chaque
 * relation. On vérifie ensuite que chaque table exportée a laissé sa marque
 * dans le fichier, **sous le groupe que lui donne le classement**.
 */

interface RelationField {
  target: string;
  list: boolean;
}

/** Pour chaque modèle du schéma, ses champs de relation vers d'autres modèles. */
function relationsInSchema(): Map<string, Map<string, RelationField>> {
  const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
  const blocks = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
  const models = new Set(blocks.map((block) => block[1]));
  const relations = new Map<string, Map<string, RelationField>>();

  for (const [, model, body] of blocks) {
    const fields = new Map<string, RelationField>();
    for (const line of body.split('\n')) {
      const match = /^\s*(\w+)\s+(\w+)(\[\])?\??/.exec(line);
      if (match && models.has(match[2])) {
        fields.set(match[1], { target: match[2], list: Boolean(match[3]) });
      }
    }
    relations.set(model, fields);
  }
  return relations;
}

const RELATIONS = relationsInSchema();

type Row = Record<string, unknown> & { __table: string; id: string };

/**
 * Une ligne factice de `table`, avec les relations demandées remplies
 * récursivement (include et select se traitent de la même façon : dans les
 * deux cas, la relation part dans le fichier).
 */
function fakeRow(table: string, args: unknown): Row {
  const row: Row = { __table: table, id: `${table}-1` };
  const query = (args ?? {}) as { include?: Record<string, unknown>; select?: Record<string, unknown> };
  const nested = { ...(query.select ?? {}), ...(query.include ?? {}) };

  for (const [field, value] of Object.entries(nested)) {
    const relation = RELATIONS.get(table)?.get(field);
    if (!relation || value === false) continue;
    const child = fakeRow(relation.target, value === true ? undefined : value);
    row[field] = relation.list ? [child] : child;
  }
  return row;
}

/** Faux client Prisma : chaque table du schéma, chaque lecture enregistrée. */
function buildRecordingPrisma() {
  const read = new Set<string>();
  const prisma: Record<string, unknown> = {};

  for (const table of RELATIONS.keys()) {
    const record = (args: unknown) => {
      read.add(table);
      return fakeRow(table, args);
    };
    prisma[table] = {
      findMany: (args: unknown) => Promise.resolve([record(args)]),
      findFirst: (args: unknown) => Promise.resolve(record(args)),
      findUnique: (args: unknown) => Promise.resolve(record(args)),
      findUniqueOrThrow: (args: unknown) =>
        Promise.resolve({
          ...record(args),
          email: 'a@b.com',
          email_verified_at: null,
          created_at: new Date('2026-01-01'),
        }),
      count: () => Promise.resolve(0),
    };
  }

  return { prisma, read };
}

/** Toutes les tables dont une ligne marquée apparaît sous `node`. */
function tablesFoundIn(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) tablesFoundIn(item, found);
  } else if (node && typeof node === 'object' && !(node instanceof Date)) {
    const table = (node as { __table?: unknown }).__table;
    if (typeof table === 'string') found.add(table);
    for (const value of Object.values(node)) tablesFoundIn(value, found);
  }
  return found;
}

describe("export RGPD — couverture réelle du périmètre déclaré", () => {
  async function runExport() {
    const { prisma, read } = buildRecordingPrisma();
    const module = await Test.createTestingModule({
      providers: [UserDataService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const exported = await module.get(UserDataService).exportUserData('u1');
    return { exported, read };
  }

  it('lit dans la base chaque table classée « exportée »', async () => {
    // Directement, ou par une relation demandée à la table parente.
    const { exported } = await runExport();
    const present = tablesFoundIn(exported.donnees);
    // `users` est recomposé champ par champ (voir le service) : sa marque
    // disparaît volontairement, on vérifie donc le compte par son id.
    present.add('users');
    expect(exported.donnees.compte.id).toBe('users-1');

    const missing = exportedTables().filter((table) => !present.has(table));

    expect(missing).toEqual([]);
  });

  it('range chaque table exportée sous le groupe que lui donne le classement', async () => {
    const { exported } = await runExport();
    const misplaced: string[] = [];

    for (const table of exportedTables()) {
      if (table === 'users') continue;
      const treatment = USER_DATA_SCOPE[table] as { group: keyof typeof exported.donnees };
      if (!tablesFoundIn(exported.donnees[treatment.group]).has(table)) {
        misplaced.push(`${table} → ${treatment.group}`);
      }
    }

    expect(misplaced).toEqual([]);
  });

  it("ne lit aucune table exclue du périmètre", async () => {
    // Les exclusions motivées (jetons, accès chiffrés) ne doivent pas
    // être interrogées par l'export, même pour ne rien en faire.
    const { read } = await runExport();
    const excludedRead = Object.entries(USER_DATA_SCOPE)
      .filter(([table, treatment]) => treatment.kind === 'excluded' && read.has(table))
      .map(([table]) => table);

    expect(excludedRead).toEqual([]);
  });

  it('lit bien le schéma (garde-fou du garde-fou)', () => {
    // Si l'analyse du schéma cassait, les tests ci-dessus ne vérifieraient
    // plus les tables filles atteintes par relation.
    expect(RELATIONS.get('stock_items')?.get('movements')).toEqual({
      target: 'stock_movements',
      list: true,
    });
    expect(RELATIONS.get('mandates')?.get('project')).toEqual({ target: 'projects', list: false });
  });
});
