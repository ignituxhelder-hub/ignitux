import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * POUR LES TESTS SEULEMENT (exclu du build, voir tsconfig.build.json).
 *
 * Une fausse base en mémoire pour `CreditsService`, qui reproduit les deux
 * choses dont la justesse du solde dépend :
 *
 * - **l'entrelacement** : chaque lecture et chaque écriture rend la main
 *   (`setImmediate`) avant de s'exécuter, comme un aller-retour réseau vers
 *   Postgres. Deux réservations lancées ensemble se chevauchent donc pour de
 *   vrai : sans verrou, toutes deux lisent le solde avant que l'une écrive ;
 * - **le verrou de ligne** : `SELECT … FROM users … FOR NO KEY UPDATE` dans
 *   une transaction prend un verrou par compte, rendu à la fin de la
 *   transaction (validée ou annulée) — ce que fait Postgres.
 *
 * `verrouActif = false` retire le verrou : un test témoin montre alors que la
 * course existe, et donc que le test qui la ferme prouve quelque chose.
 *
 * Une transaction annulée (exception) n'efface rien ici : les tests du
 * service n'écrivent qu'en dernier geste d'une transaction, et un refus lève
 * avant toute écriture.
 */

export interface LigneCredit {
  id: string;
  owner_id: string;
  actor_id: string | null;
  kind: string;
  credits: number;
  generator: string | null;
  project_id: string | null;
  ai_usage_event_id: string | null;
  motif: string | null;
  created_at: Date;
}

export interface CompteFaux {
  id: string;
  email: string;
  created_at?: Date;
  display_name?: string | null;
}

export interface ProjetFaux {
  id: string;
  title: string;
  owner_id: string;
  membres?: string[];
}

type Where = Record<string, unknown>;

const rendreLaMain = () => new Promise<void>((resolve) => setImmediate(resolve));

function correspond(ligne: Record<string, unknown>, where: Where = {}): boolean {
  return Object.entries(where).every(([cle, attendu]) => {
    const valeur = ligne[cle];
    if (attendu !== null && typeof attendu === 'object' && !(attendu instanceof Date)) {
      const filtre = attendu as { in?: unknown[]; contains?: string; mode?: string };
      if (filtre.in) return filtre.in.includes(valeur);
      if (filtre.contains !== undefined) {
        return String(valeur).toLowerCase().includes(filtre.contains.toLowerCase());
      }
      throw new Error(`Filtre non géré par la fausse base : ${cle}=${JSON.stringify(attendu)}`);
    }
    return valeur === attendu;
  });
}

/** Un verrou par compte, rendu dans l'ordre d'arrivée. */
class Verrou {
  private file: Promise<void> = Promise.resolve();
  prendre(): Promise<() => void> {
    let rendre!: () => void;
    const tenu = new Promise<void>((resolve) => (rendre = resolve));
    const precedent = this.file;
    this.file = precedent.then(() => tenu);
    return precedent.then(() => rendre);
  }
}

export class FausseBaseCredits {
  lignes: LigneCredit[] = [];
  comptes: CompteFaux[] = [];
  projets: ProjetFaux[] = [];
  verrouActif = true;
  /** Le SQL brut reçu, pour vérifier la forme du verrou. */
  sql: Array<{ texte: string; valeurs: unknown[] }> = [];
  /**
   * Les identifiants présents dans `ai_usage_events` : un appel qui a obtenu
   * sa réponse (voir `ClaudeService`). Un débit dont l'appel n'y est pas est
   * en cours — ou orphelin, s'il est vieux.
   */
  appelsJournalises = new Set<string>();
  private verrous = new Map<string, Verrou>();
  private suivant = 1;

  constructor(init: { comptes?: CompteFaux[]; projets?: ProjetFaux[]; lignes?: Array<Partial<LigneCredit>> } = {}) {
    this.comptes = init.comptes ?? [];
    this.projets = init.projets ?? [];
    for (const ligne of init.lignes ?? []) this.inserer(ligne);
  }

  /**
   * Un débit sans ligne de coût ni remboursement — les deux `NOT EXISTS` du
   * SQL du service (rattrapage des orphelins, exécution déjà en cours).
   */
  private sansSuite(d: LigneCredit): boolean {
    return (
      d.kind === 'debit' &&
      d.ai_usage_event_id !== null &&
      !this.appelsJournalises.has(d.ai_usage_event_id) &&
      !this.lignes.some(
        (r) => r.kind === 'remboursement' && r.owner_id === d.owner_id && r.ai_usage_event_id === d.ai_usage_event_id,
      )
    );
  }

  /**
   * Le SQL brut hors verrou, reconnu à sa forme : la recherche des débits
   * orphelins (`rattraperDebitsOrphelins`) ou d'une exécution en cours
   * (`reserver` avec `exclusif`).
   */
  private requeteBrute(texte: string, valeurs: unknown[]): Array<{ id: string }> {
    if (!/ai_usage_events/.test(texte)) throw new Error(`SQL brut non géré par la fausse base : ${texte}`);
    if (/d\.owner_id\s*=/.test(texte)) {
      const [ownerId, generator, projectId, depuis] = valeurs as [string, string, string, Date];
      return this.lignes
        .filter(
          (d) =>
            d.owner_id === ownerId &&
            d.generator === generator &&
            d.project_id === projectId &&
            d.created_at >= depuis &&
            this.sansSuite(d),
        )
        .slice(0, 1)
        .map((d) => ({ id: d.id }));
    }
    const [avant, depuis, lot] = valeurs as [Date, Date, number];
    return this.lignes
      .filter((d) => d.created_at < avant && d.created_at >= depuis && this.sansSuite(d))
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
      .slice(0, lot)
      .map((d) => ({ id: d.id }));
  }

  solde(ownerId: string): number {
    return this.lignes.filter((l) => l.owner_id === ownerId).reduce((s, l) => s + l.credits, 0);
  }

  de(ownerId: string, kind?: string): LigneCredit[] {
    return this.lignes.filter((l) => l.owner_id === ownerId && (kind === undefined || l.kind === kind));
  }

  private inserer(data: Partial<LigneCredit>): LigneCredit {
    const ligne: LigneCredit = {
      id: data.id ?? `ce-${this.suivant++}`,
      owner_id: data.owner_id as string,
      actor_id: data.actor_id ?? null,
      kind: data.kind as string,
      credits: data.credits as number,
      generator: data.generator ?? null,
      project_id: data.project_id ?? null,
      ai_usage_event_id: data.ai_usage_event_id ?? null,
      motif: data.motif ?? null,
      // Des dates strictement croissantes : l'ordre d'insertion se lit dans l'historique.
      created_at: data.created_at ?? new Date(Date.UTC(2026, 9, 25, 12, 0, 0, this.suivant)),
    };
    this.lignes.push(ligne);
    return ligne;
  }

  private choisir(ligne: LigneCredit, select?: Record<string, unknown>) {
    if (!select) return { ...ligne };
    const vu: Record<string, unknown> = {};
    for (const [cle, voulu] of Object.entries(select)) {
      if (!voulu) continue;
      if (cle === 'actor') {
        const compte = this.comptes.find((c) => c.id === ligne.actor_id);
        vu.actor = compte
          ? { email: compte.email, profile: compte.display_name === undefined ? null : { display_name: compte.display_name } }
          : null;
      } else {
        vu[cle] = (ligne as unknown as Record<string, unknown>)[cle];
      }
    }
    return vu;
  }

  /** Le client tel que le service le voit (`$transaction` comprise). */
  client(): PrismaService {
    const base = this;
    const credit_entries = {
      async aggregate({ where }: { where: Where }) {
        await rendreLaMain();
        const somme = base.lignes.filter((l) => correspond(l as never, where)).reduce((s, l) => s + l.credits, 0);
        const trouve = base.lignes.some((l) => correspond(l as never, where));
        return { _sum: { credits: trouve ? somme : null } };
      },
      async findFirst({ where, select }: { where: Where; select?: Record<string, unknown> }) {
        await rendreLaMain();
        const ligne = base.lignes.find((l) => correspond(l as never, where));
        return ligne ? base.choisir(ligne, select) : null;
      },
      async findUnique({ where, select }: { where: { id: string }; select?: Record<string, unknown> }) {
        await rendreLaMain();
        const ligne = base.lignes.find((l) => l.id === where.id);
        return ligne ? base.choisir(ligne, select) : null;
      },
      async findMany({
        where,
        take,
        select,
      }: {
        where: Where;
        take?: number;
        orderBy?: unknown;
        select?: Record<string, unknown>;
      }) {
        await rendreLaMain();
        const trouvees = base.lignes
          .filter((l) => correspond(l as never, where))
          .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
        return trouvees.slice(0, take ?? trouvees.length).map((l) => base.choisir(l, select));
      },
      async groupBy({ where }: { by: string[]; where: Where; _sum: unknown }) {
        await rendreLaMain();
        const parCompte = new Map<string, number>();
        for (const l of base.lignes.filter((x) => correspond(x as never, where))) {
          parCompte.set(l.owner_id, (parCompte.get(l.owner_id) ?? 0) + l.credits);
        }
        return [...parCompte].map(([owner_id, credits]) => ({ owner_id, _sum: { credits } }));
      },
      async create({ data, select }: { data: Partial<LigneCredit>; select?: Record<string, unknown> }) {
        await rendreLaMain();
        return base.choisir(base.inserer(data), select);
      },
    };

    const users = {
      async count({ where }: { where?: Where } = {}) {
        return base.comptes.filter((c) => correspond(c as never, where)).length;
      },
      async findMany({ where, skip, take }: { where?: Where; skip?: number; take?: number }) {
        const trouves = base.comptes.filter((c) => correspond(c as never, where));
        return trouves
          .slice(skip ?? 0, (skip ?? 0) + (take ?? trouves.length))
          .map((c) => ({ id: c.id, email: c.email, created_at: c.created_at ?? null }));
      },
    };

    const projects = {
      async findMany({ where }: { where: { id: { in: string[] }; OR: unknown } }) {
        // Le filtre de visibilité (`projetVisiblePar`) : propriétaire ou membre.
        const ou = where.OR as Array<{ owner_id?: string; collaborators?: { some: { user_id: string } } }>;
        const moi = ou.find((o) => o.owner_id)?.owner_id;
        return base.projets
          .filter((p) => where.id.in.includes(p.id))
          .filter((p) => p.owner_id === moi || (moi !== undefined && (p.membres ?? []).includes(moi)))
          .map((p) => ({ id: p.id, title: p.title }));
      },
    };

    const ai_usage_events = {
      async findUnique({ where }: { where: { id: string }; select?: unknown }) {
        await rendreLaMain();
        return base.appelsJournalises.has(where.id) ? { id: where.id } : null;
      },
    };

    const client = {
      credit_entries,
      users,
      projects,
      ai_usage_events,
      async $queryRaw(chaines: TemplateStringsArray, ...valeurs: unknown[]) {
        const texte = chaines.join('$');
        base.sql.push({ texte, valeurs });
        await rendreLaMain();
        return base.requeteBrute(texte, valeurs);
      },
      async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
        const aRendre: Array<() => void> = [];
        const tx = {
          credit_entries,
          users,
          projects,
          ai_usage_events,
          async $queryRaw(chaines: TemplateStringsArray, ...valeurs: unknown[]) {
            const texte = chaines.join('$');
            base.sql.push({ texte, valeurs });
            if (!/FOR NO KEY UPDATE/.test(texte)) {
              await rendreLaMain();
              return base.requeteBrute(texte, valeurs);
            }
            if (base.verrouActif) {
              const id = String(valeurs[0]);
              const verrou = base.verrous.get(id) ?? new Verrou();
              base.verrous.set(id, verrou);
              aRendre.push(await verrou.prendre());
            }
            await rendreLaMain();
            const id = String(valeurs[0]);
            return base.comptes.some((c) => c.id === id) ? [{ id }] : [];
          },
        };
        try {
          return await fn(tx);
        } finally {
          for (const rendre of aRendre) rendre();
        }
      },
    };
    return client as unknown as PrismaService;
  }
}
