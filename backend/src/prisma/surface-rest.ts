/**
 * LA SURFACE REST DE L'HÉBERGEUR — vérifiée, pas supposée.
 *
 * Supabase monte une API REST (PostgREST) devant le Postgres d'Ignitux, avec
 * deux rôles : `anon` (clé publique, faite pour du code de navigateur) et
 * `authenticated`. Ignitux n'utilise ni l'une ni l'autre : tout passe par
 * Prisma. `scripts/fermer-surface-rest.mjs` leur a retiré tout droit, et
 * aussi les privilèges par défaut — pour qu'une table créée plus tard par
 * `prisma db push` n'en reçoive pas (voir docs/validation-finale.md § 6.1).
 *
 * Ce module dit si c'est toujours vrai. Une table neuve compte double : le
 * journal des crédits (`credit_entries`) est le solde de chaque compte. Si
 * `anon` pouvait y écrire, n'importe qui s'offrirait des crédits.
 *
 * Module pur, compilé dans `dist/` : `scripts/verifier-base.mjs` et
 * `scripts/fermer-surface-rest.mjs` le lisent après `npm run build`, comme le
 * client Prisma.
 */

export const ROLES_REST = ['anon', 'authenticated'] as const;
export const PRIVILEGES_VERIFIES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;
/**
 * Les tables qu'on nomme à part, même quand tout va bien, avec ce qu'une
 * ouverture exposerait : l'argent, et les jetons d'accès aux comptes
 * Instagram/TikTok des personnes (chiffrés, mais pas à laisser lire).
 */
export const TABLES_SENSIBLES: Readonly<Record<string, string>> = {
  credit_entries: 'LE SOLDE DES COMPTES EST EXPOSÉ',
  social_accounts: 'LES JETONS INSTAGRAM/TIKTOK DES PERSONNES SONT EXPOSÉS',
};

/**
 * Les rôles REST présents. Une base hors Supabase (la CI, un Postgres local)
 * ne les a pas : `has_table_privilege` sur un rôle absent lèverait.
 */
export const SQL_ROLES_REST = `
  SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') ORDER BY rolname`;

/**
 * Chaque droit encore accordé à `anon`/`authenticated` sur une table du
 * schéma public — directement, par un rôle dont ils héritent, ou par PUBLIC :
 * `has_table_privilege` répond pour le droit effectif, pas seulement pour la
 * ligne de `GRANT`. À n'exécuter que si `SQL_ROLES_REST` en a trouvé un.
 */
export const SQL_DROITS_OUVERTS = `
  SELECT r.rolname AS role, c.relname AS "table", p.privilege
  FROM pg_roles r
  CROSS JOIN pg_class c
  JOIN pg_namespace ns ON ns.oid = c.relnamespace
  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(privilege)
  WHERE r.rolname IN ('anon', 'authenticated')
    AND ns.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND has_table_privilege(r.oid, c.oid, p.privilege)
  ORDER BY 2, 1, 3`;

export interface DroitOuvert {
  role: string;
  table: string;
  privilege: string;
}

export interface VerdictSurfaceRest {
  /** `true` : aucun droit pour `anon`/`authenticated` (ou rôles absents). */
  fermee: boolean;
  lignes: string[];
}

/**
 * Le verdict lisible. `tablesPresentes` dit si une table sensible existe :
 * absente, elle n'est ni ouverte ni fermée — la migration n'est pas passée.
 */
export function verdictSurfaceRest(entree: {
  rolesPresents: readonly string[];
  ouverts: readonly DroitOuvert[];
  tablesPresentes: ReadonlySet<string>;
  fichier: string;
}): VerdictSurfaceRest {
  if (entree.rolesPresents.length === 0) {
    return {
      fermee: true,
      lignes: ['  ✓ rôles anon/authenticated absents (base hors Supabase) : aucune surface REST'],
    };
  }

  const lignes: string[] = [];
  for (const [table, risque] of Object.entries(TABLES_SENSIBLES)) {
    if (!entree.tablesPresentes.has(table)) {
      lignes.push(`  · ${table} : absente (migration pas encore passée)`);
      continue;
    }
    const surTable = entree.ouverts.filter((o) => o.table === table);
    lignes.push(
      surTable.length === 0
        ? `  ✓ ${table} : aucun droit pour ${ROLES_REST.join(' ni ')} (${PRIVILEGES_VERIFIES.join(', ')})`
        : `  ✗ ${table} : ${decrire(surTable)}  ← ${risque}`,
    );
  }

  const autres = entree.ouverts.filter((o) => !Object.hasOwn(TABLES_SENSIBLES, o.table));
  const tablesAutres = [...new Set(autres.map((o) => o.table))];
  lignes.push(
    tablesAutres.length === 0
      ? '  ✓ aucune autre table ouverte à anon/authenticated'
      : `  ✗ ${tablesAutres.length} autre(s) table(s) ouverte(s) : ${tablesAutres.slice(0, 10).join(', ')}` +
          (tablesAutres.length > 10 ? '…' : ''),
  );

  const fermee = entree.ouverts.length === 0;
  if (!fermee) {
    lignes.push(
      '',
      '  À FAIRE MAINTENANT, avant tout push :',
      `    node scripts/fermer-surface-rest.mjs ${entree.fichier} --appliquer`,
      `    node scripts/verifier-base.mjs ${entree.fichier}      → doit répondre « surface REST fermée »`,
    );
  }
  return { fermee, lignes };
}

/** « anon : INSERT, SELECT ; authenticated : SELECT » */
function decrire(droits: readonly DroitOuvert[]): string {
  const parRole = new Map<string, string[]>();
  for (const d of droits) parRole.set(d.role, [...(parRole.get(d.role) ?? []), d.privilege]);
  return [...parRole].map(([role, privileges]) => `${role} : ${privileges.join(', ')}`).join(' ; ');
}
