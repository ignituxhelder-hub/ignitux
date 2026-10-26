import { SQL_DROITS_OUVERTS, verdictSurfaceRest } from './surface-rest.js';

const AVEC_CREDITS = new Set(['users', 'credit_entries', 'social_accounts']);

describe('la surface REST de l’hébergeur', () => {
  it('vérifie les quatre droits pour anon et authenticated, droit effectif compris', () => {
    const sql = SQL_DROITS_OUVERTS.replace(/\s+/g, ' ');
    expect(sql).toContain("('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')");
    expect(sql).toContain("r.rolname IN ('anon', 'authenticated')");
    expect(sql).toContain('has_table_privilege(r.oid, c.oid, p.privilege)');
  });

  it('fermée : credit_entries nommée, aucune autre table, rien à faire', () => {
    const verdict = verdictSurfaceRest({
      rolesPresents: ['anon', 'authenticated'],
      ouverts: [],
      tablesPresentes: AVEC_CREDITS,
      fichier: '.env.production',
    });

    expect(verdict.fermee).toBe(true);
    expect(verdict.lignes.join('\n')).toMatch(/✓ credit_entries : aucun droit pour anon ni authenticated/);
    expect(verdict.lignes.join('\n')).not.toContain('--appliquer');
  });

  it('un droit sur credit_entries : ouverte, dit lequel, et donne la commande exacte', () => {
    const verdict = verdictSurfaceRest({
      rolesPresents: ['anon', 'authenticated'],
      ouverts: [
        { role: 'anon', table: 'credit_entries', privilege: 'INSERT' },
        { role: 'anon', table: 'credit_entries', privilege: 'SELECT' },
        { role: 'authenticated', table: 'credit_entries', privilege: 'SELECT' },
      ],
      tablesPresentes: AVEC_CREDITS,
      fichier: '.env.production',
    });

    expect(verdict.fermee).toBe(false);
    const texte = verdict.lignes.join('\n');
    expect(texte).toContain('✗ credit_entries : anon : INSERT, SELECT ; authenticated : SELECT');
    expect(texte).toContain('node scripts/fermer-surface-rest.mjs .env.production --appliquer');
  });

  it('nomme aussi social_accounts : les jetons Instagram/TikTok des personnes', () => {
    const verdict = verdictSurfaceRest({
      rolesPresents: ['anon', 'authenticated'],
      ouverts: [{ role: 'anon', table: 'social_accounts', privilege: 'SELECT' }],
      tablesPresentes: AVEC_CREDITS,
      fichier: '.env.production',
    });

    expect(verdict.fermee).toBe(false);
    const texte = verdict.lignes.join('\n');
    expect(texte).toContain('✓ credit_entries : aucun droit');
    expect(texte).toContain('✗ social_accounts : anon : SELECT  ← LES JETONS INSTAGRAM/TIKTOK');
  });

  it('une autre table ouverte compte aussi', () => {
    const verdict = verdictSurfaceRest({
      rolesPresents: ['anon'],
      ouverts: [{ role: 'anon', table: 'users', privilege: 'SELECT' }],
      tablesPresentes: AVEC_CREDITS,
      fichier: '.env',
    });

    expect(verdict.fermee).toBe(false);
    expect(verdict.lignes.join('\n')).toContain('1 autre(s) table(s) ouverte(s) : users');
  });

  it('table pas encore migrée : dit qu’elle est absente', () => {
    const verdict = verdictSurfaceRest({
      rolesPresents: ['anon', 'authenticated'],
      ouverts: [],
      tablesPresentes: new Set(['users']),
      fichier: '.env.production',
    });

    expect(verdict.lignes[0]).toContain('credit_entries : absente');
  });

  it('base hors Supabase (CI, Postgres local) : pas de rôle REST, rien à vérifier', () => {
    const verdict = verdictSurfaceRest({
      rolesPresents: [],
      ouverts: [],
      tablesPresentes: AVEC_CREDITS,
      fichier: '.env.test',
    });

    expect(verdict.fermee).toBe(true);
    expect(verdict.lignes[0]).toMatch(/absents/);
  });
});
