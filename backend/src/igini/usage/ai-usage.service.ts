import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { getEnv } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  costMicroEur,
  microEurToEur,
  PRICE_GRID_DATE,
  type TokenCounts,
} from './ai-pricing.js';
import { checkQuota, readQuotaLimits, type QuotaLimits, type QuotaVerdict } from './ai-quota.js';

/**
 * Les cinq générateurs, nommés comme la méthode IGINI les nomme.
 *
 * C'est un type union et pas un `string` : le jour où un sixième générateur
 * arrive, il ne compilera pas tant qu'il n'aura pas été ajouté ici. Une
 * chaîne libre aurait laissé passer un `'analyse'` au singulier ou un
 * `'Analyser'` majuscule, et le journal se serait mis à compter deux
 * générateurs là où il n'y en a qu'un — sans que rien n'échoue.
 *
 * La liste elle-même a déménagé dans `generator-names.ts` : le catalogue
 * des offres en a besoin et doit rester pur, sans Nest ni base. Réexportée
 * ici pour que les appelants existants n'aient rien à changer.
 */
export {
  GENERATOR_NAMES,
  estGenerateur,
  type GeneratorName,
} from './generator-names.js';
import { GENERATOR_NAMES, type GeneratorName } from './generator-names.js';

/**
 * Le « qui » d'un appel.
 *
 * Le « quoi » n'y figure pas : chaque générateur se nomme lui-même au moment
 * de passer commande, pour qu'un appelant ne puisse pas étiqueter une analyse
 * comme un plan de financement. L'appelant sait qui il est, le générateur
 * sait ce qu'il est ; chacun ne fournit que ce qu'il est seul à savoir.
 */
export interface GenerationAttribution {
  userId: string;
  projectId: string;
}

/**
 * L'attribution complète, telle qu'elle part au journal. Exigée — et non
 * optionnelle — par `StructuredOutputRequest` : c'est ce qui garantit
 * qu'aucun appel facturé ne puisse rester anonyme.
 */
export interface AiUsageContext extends GenerationAttribution {
  generator: GeneratorName;
}

/**
 * Ce que le SDK renvoie et que le code jetait jusqu'ici.
 *
 * La forme est celle de l'objet `usage` du SDK, repris tel quel plutôt que
 * recopié champ par champ au point d'appel. La raison est dans `record()` :
 * tout ce qui touche à cet objet doit se produire à l'intérieur du `try` qui
 * protège la génération déjà payée.
 */
export interface ClaudeTokenUsage extends TokenCounts {
  /**
   * Décomposition de la sortie. `thinking_tokens` y est un sous-ensemble de
   * `output_tokens`, facturé au même tarif. Absent sur les modèles qui ne
   * l'exposent pas.
   */
  output_tokens_details?: { thinking_tokens: number } | null;
}

export interface GeneratorBreakdown {
  generateur: string;
  appels: number;
  tokensEntree: number;
  tokensSortie: number;
  tokensReflexion: number;
  coutMicroEur: number | null;
}

export interface UsageSummary {
  depuis: Date;
  jusqua: Date;
  appels: number;
  tokensEntree: number;
  tokensSortie: number;
  /** Part de la sortie passée en réflexion interne, facturée au même tarif. */
  tokensReflexion: number;
  /**
   * Coût dérivé de la grille en vigueur. `null` si au moins un appel porte un
   * modèle que la grille ne connaît pas : un total partiel présenté comme
   * complet serait pire qu'une absence de total.
   */
  coutMicroEur: number | null;
  coutEur: number | null;
  /** Les modèles rencontrés que la grille ne sait pas tarifer. */
  modelesNonTarifes: string[];
  parGenerateur: GeneratorBreakdown[];
}

/**
 * JOURNAL DES APPELS IA.
 *
 * Avant ce service, `response.usage` était lu par le SDK puis jeté. Cette
 * seule ligne manquante rendait quatre choses impossibles : connaître le coût
 * réel, poser un plafond, détecter un abus, et produire une statistique qui
 * ne soit pas une estimation. PRICING.md a dû chiffrer la rentabilité en
 * comptant des caractères faute de ces enregistrements.
 */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enregistre un appel facturé. **N'échoue jamais vers l'appelant.**
   *
   * Le compromis est délibéré et mérite d'être nommé : au moment où cette
   * méthode est appelée, les tokens sont déjà consommés et le résultat est
   * déjà produit. Faire échouer la génération parce que le journal n'a pas pu
   * s'écrire ferait perdre à la personne un résultat qu'elle a bel et bien
   * payé, pour un problème qui ne la concerne pas. On journalise l'échec au
   * niveau `error` et on rend la main.
   *
   * Conséquence à retenir pour la suite : ce journal est fiable mais pas
   * transactionnel. Le jour où un plafond s'appuiera dessus pour refuser un
   * appel, une écriture perdue sera un appel non décompté. À ce moment-là il
   * faudra soit rendre l'écriture bloquante, soit accepter que le plafond
   * soit un plafond haut et non un compteur comptable.
   */
  async record(input: {
    context: AiUsageContext;
    model: string;
    usage: ClaudeTokenUsage;
    durationMs: number;
  }): Promise<void> {
    try {
      // La lecture des champs se fait ICI, dans le try, et pas au point
      // d'appel. Le type du SDK promet un bloc `usage` complet ; si cette
      // promesse se révélait fausse un jour, une lecture faite dehors
      // remonterait en exception et ferait perdre à la personne une
      // génération de quarante secondes qu'elle a réellement payée. Le
      // journal peut se tromper, la génération non.
      await this.prisma.ai_usage_events.create({
        data: {
          user_id: input.context.userId,
          project_id: input.context.projectId,
          generator: input.context.generator,
          model: input.model,
          input_tokens: input.usage.input_tokens,
          output_tokens: input.usage.output_tokens,
          thinking_tokens: input.usage.output_tokens_details?.thinking_tokens ?? null,
          cache_creation_input_tokens: input.usage.cache_creation_input_tokens ?? null,
          cache_read_input_tokens: input.usage.cache_read_input_tokens ?? null,
          duration_ms: input.durationMs,
        },
      });
    } catch (error) {
      this.logger.error(
        `Appel IA facturé non journalisé (générateur ${input.context.generator}, modèle ${input.model}, ` +
          `${input.usage?.input_tokens ?? '?'} entrée / ${input.usage?.output_tokens ?? '?'} sortie). ` +
          'La dépense a eu lieu mais elle manquera aux totaux.',
        error as Error,
      );
    }
  }

  /**
   * Les appels de la personne, du plus récent au plus ancien.
   *
   * Chaque ligne porte son coût dérivé, et `coutMicroEur: null` quand le
   * modèle échappe à la grille tarifaire. Rendre 0 dans ce cas ferait croire
   * que l'appel était gratuit — il ne l'était pas, on ignore seulement
   * combien il a coûté, et c'est une information différente.
   */
  async history(userId: string, limit: number) {
    const events = await this.prisma.ai_usage_events.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: limit,
    });

    return {
      limite: limit,
      grille_du: PRICE_GRID_DATE,
      appels: events.map((event) => {
        const cout = costMicroEur(event.model, {
          input_tokens: event.input_tokens,
          output_tokens: event.output_tokens,
          cache_creation_input_tokens: event.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: event.cache_read_input_tokens ?? 0,
        });
        return {
          id: event.id,
          quand: event.created_at?.toISOString() ?? null,
          generateur: event.generator,
          modele: event.model,
          projet_id: event.project_id,
          tokens_entree: event.input_tokens,
          tokens_sortie: event.output_tokens,
          dont_reflexion: event.thinking_tokens,
          duree_ms: event.duration_ms,
          cout_euros: cout === null ? null : microEurToEur(cout),
        };
      }),
    };
  }

  /** Consommation d'une personne sur le mois civil contenant `reference` (UTC). */
  async monthlySummary(userId: string, reference: Date = new Date()): Promise<UsageSummary> {
    const { depuis, jusqua } = monthRange(reference);

    const events = await this.prisma.ai_usage_events.findMany({
      where: { user_id: userId, created_at: { gte: depuis, lt: jusqua } },
      orderBy: { created_at: 'asc' },
    });

    return summarise(events, depuis, jusqua);
  }

  /**
   * Le nombre d appels de cette personne sur le mois civil en cours.
   *
   * Distinct du plafond technique : celui-ci protege le budget d Ignitux,
   * ce compteur-la sert a savoir ou en est la personne dans ce que son
   * offre inclut. Les deux repondent a des questions differentes et n ont
   * pas les memes seuils.
   */
  async callsThisMonth(userId: string, reference: Date = new Date()): Promise<number> {
    const { depuis, jusqua } = monthRange(reference);
    return this.prisma.ai_usage_events.count({
      where: { user_id: userId, created_at: { gte: depuis, lt: jusqua } },
    });
  }

  /** Les plafonds en vigueur, relus à chaque appel plutôt que mémorisés. */
  limits(): QuotaLimits {
    // Même raison que pour l'interrupteur des générateurs : une valeur figée
    // au démarrage survivrait à un changement de configuration, et c'est le
    // genre d'écart qui fait dépenser du budget qu'on croyait borné.
    return readQuotaLimits(getEnv());
  }

  /** Où en est cette personne par rapport à ses plafonds, ce mois-ci. */
  async quotaFor(userId: string, reference: Date = new Date()): Promise<QuotaVerdict> {
    const resume = await this.monthlySummary(userId, reference);
    return checkQuota({ calls: resume.appels, costMicroEur: resume.coutMicroEur }, this.limits());
  }

  /**
   * Refuse un appel de plus quand le plafond est atteint.
   *
   * **402 Payment Required**, et le choix mérite d'être justifié. Les autres
   * codes du produit sont déjà pris et voudraient dire autre chose : 503 dit
   * « la fonctionnalité est éteinte » alors qu'elle marche, 422 dit « la
   * Constitution refuse » alors qu'elle n'a rien à voir, 429 est celui du
   * limiteur de débit — le confondre avec un quota mensuel rendrait les deux
   * illisibles côté interface —, et 401 déclencherait une déconnexion.
   *
   * 402 dit exactement ce qui se passe : ce qui était inclus est consommé.
   */
  async assertWithinQuota(userId: string): Promise<void> {
    const verdict = await this.quotaFor(userId);
    if (verdict.allowed) return;

    this.logger.log(
      `Plafond ${verdict.breach} atteint pour l'utilisateur ${userId} : appel refusé avant tout appel réseau.`,
    );
    throw new HttpException(verdict.reason ?? 'Plafond atteint.', HttpStatus.PAYMENT_REQUIRED);
  }

  /** Consommation de tout le monde sur le mois — la vue de l'exploitant. */
  async monthlyTotal(reference: Date = new Date()): Promise<UsageSummary> {
    const { depuis, jusqua } = monthRange(reference);

    const events = await this.prisma.ai_usage_events.findMany({
      where: { created_at: { gte: depuis, lt: jusqua } },
      orderBy: { created_at: 'asc' },
    });

    return summarise(events, depuis, jusqua);
  }
}

/** Bornes du mois civil contenant `reference`, en UTC. */
export function monthRange(reference: Date): { depuis: Date; jusqua: Date } {
  const depuis = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const jusqua = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return { depuis, jusqua };
}

/** Une ligne du journal, réduite à ce dont le résumé a besoin. */
export interface UsageEventRow {
  generator: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number | null;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
}

/**
 * Agrège des lignes de journal. Fonction pure et exportée : c'est là que vit
 * toute la logique de total, et elle se teste sans base ni Nest.
 */
export function summarise(
  events: ReadonlyArray<UsageEventRow>,
  depuis: Date,
  jusqua: Date,
): UsageSummary {
  const nonTarifes = new Set<string>();
  const parGenerateur = new Map<string, GeneratorBreakdown>();

  let tokensEntree = 0;
  let tokensSortie = 0;
  let tokensReflexion = 0;
  let coutMicroEur = 0;

  for (const event of events) {
    tokensEntree += event.input_tokens;
    tokensSortie += event.output_tokens;
    tokensReflexion += event.thinking_tokens ?? 0;

    const cout = costMicroEur(event.model, event);
    if (cout === null) {
      nonTarifes.add(event.model);
    } else {
      coutMicroEur += cout;
    }

    const ligne = parGenerateur.get(event.generator) ?? {
      generateur: event.generator,
      appels: 0,
      tokensEntree: 0,
      tokensSortie: 0,
      tokensReflexion: 0,
      coutMicroEur: 0,
    };
    ligne.appels += 1;
    ligne.tokensEntree += event.input_tokens;
    ligne.tokensSortie += event.output_tokens;
    ligne.tokensReflexion += event.thinking_tokens ?? 0;
    // Un seul appel non tarifé suffit à rendre le sous-total faux : on le
    // marque `null` pour de bon plutôt que de continuer à additionner le reste.
    ligne.coutMicroEur = cout === null || ligne.coutMicroEur === null ? null : ligne.coutMicroEur + cout;
    parGenerateur.set(event.generator, ligne);
  }

  const totalFiable = nonTarifes.size === 0;

  return {
    depuis,
    jusqua,
    appels: events.length,
    tokensEntree,
    tokensSortie,
    tokensReflexion,
    coutMicroEur: totalFiable ? coutMicroEur : null,
    coutEur: totalFiable ? microEurToEur(coutMicroEur) : null,
    modelesNonTarifes: [...nonTarifes].sort(),
    // Ordre stable : celui de GENERATOR_NAMES, puis les inconnus, pour qu'un
    // affichage ne change pas d'ordre d'un mois à l'autre.
    parGenerateur: [...parGenerateur.values()].sort((a, b) => {
      const rank = (nom: string) => {
        const index = (GENERATOR_NAMES as readonly string[]).indexOf(nom);
        return index === -1 ? GENERATOR_NAMES.length : index;
      };
      return rank(a.generateur) - rank(b.generateur) || a.generateur.localeCompare(b.generateur);
    }),
  };
}
