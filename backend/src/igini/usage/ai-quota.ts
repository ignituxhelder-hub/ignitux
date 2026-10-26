import { MICRO_EUR_PER_EUR } from './ai-pricing.js';

/**
 * LE GARDE-FOU DE COÛT IA PAR COMPTE — anti-abus, pas une caisse.
 *
 * Module pur : aucune base, aucun Nest. Toute la décision vit ici et se
 * teste sans rien démarrer.
 *
 * ── Ce qu'il est devenu (2026-10-25) ────────────────────────────────────
 *
 * Depuis les crédits IGINI (docs/superpowers/specs/2026-10-25-credits-design.md),
 * **le solde de crédits est la seule limite d'usage** : chaque action se
 * paie à son prix, avant l'appel. L'ancien plafond en nombre d'appels
 * (`IGINI_QUOTA_CALLS_PER_MONTH`, « 3 analyses en Découverte ») a disparu
 * avec les offres : il n'est plus lu.
 *
 * Reste ce plafond de coût mensuel par compte, comme filet : il protège la
 * facture d'Ignitux contre un défaut du barème (une action sous-évaluée),
 * un compte abusif ou un bug qui oublierait de débiter. Il ne doit jamais
 * arrêter quelqu'un qui a payé ses crédits — d'où une valeur par défaut
 * haute, et un message qui dit que ce n'est pas le solde.
 *
 * Ce n'est **pas un compteur comptable** : le journal des appels s'écrit en
 * « meilleur effort », une écriture perdue est un appel non décompté.
 */

/** Plafond en vigueur. `null` = pas de plafond. */
export interface QuotaLimits {
  /** Coût IA dérivé, en micro-euros, par mois civil et par compte. */
  costMicroEurPerMonth: number | null;
}

/** Ce qui a déjà été consommé ce mois-ci. */
export interface QuotaUsage {
  /** `null` quand un modèle échappe à la grille tarifaire — voir plus bas. */
  costMicroEur: number | null;
}

export type QuotaBreach = 'cout';

export interface QuotaVerdict {
  allowed: boolean;
  breach: QuotaBreach | null;
  /** Ce qu'on dit à la personne. Vide quand elle peut continuer. */
  reason: string | null;
  remaining: { costMicroEur: number | null };
}

/** Le code machine du refus, distinct de `credits_insuffisants` : recharger n'y changerait rien. */
export const CODE_PLAFOND_SECURITE = 'plafond_securite';

/**
 * 50 € de coût IA par compte et par mois.
 *
 * Au barème (prix = coût × 5, 0,10 € le crédit), c'est 2 500 crédits — 250 €
 * de crédits consommés dans le mois, cinq fois la plus grosse recharge.
 * Personne qui paie ses crédits ne l'atteint par un usage normal ; s'il est
 * atteint, c'est que quelque chose cloche, et il vaut mieux le voir.
 *
 * Il valait 2 € (bêta, avant les crédits) et la production le fixe par
 * `IGINI_QUOTA_COST_EUR_PER_MONTH` (5 € au 2026-10-18) : **la variable
 * d'environnement prime sur ce défaut**. Tant qu'elle reste à 5 €, elle
 * coupera vers 250 crédits consommés dans le mois — à relever (ou retirer)
 * côté hébergeur quand les recharges arrivent.
 */
export const DEFAULT_COST_MICRO_EUR_PER_MONTH = 50 * MICRO_EUR_PER_EUR;

/**
 * Lit le plafond depuis l'environnement.
 *
 * `'illimite'` le désactive. Une valeur illisible **n'éteint pas** le
 * plafond : elle retombe sur la valeur par défaut. Une faute de frappe dans
 * une variable d'environnement ne doit pas ouvrir les vannes en silence.
 */
export function readQuotaLimits(env: { IGINI_QUOTA_COST_EUR_PER_MONTH?: string }): QuotaLimits {
  return { costMicroEurPerMonth: lireEuros(env.IGINI_QUOTA_COST_EUR_PER_MONTH, DEFAULT_COST_MICRO_EUR_PER_MONTH) };
}

function lireEuros(valeur: string | undefined, defaut: number): number | null {
  if (valeur === undefined || valeur.trim() === '') return defaut;
  if (valeur.trim().toLowerCase() === 'illimite') return null;
  const euros = Number(valeur);
  if (!Number.isFinite(euros) || euros < 0) return defaut;
  return Math.round(euros * MICRO_EUR_PER_EUR);
}

/** Les centimes en euros lisibles, pour les messages. */
function formatEuros(microEur: number): string {
  const centimes = Math.round(microEur / 10000);
  return `${Math.floor(centimes / 100)},${String(centimes % 100).padStart(2, '0')} €`;
}

/**
 * Décide si un appel de plus est permis.
 *
 * Quand un appel du mois porte un modèle absent de la grille tarifaire, le
 * coût du mois vaut `null` : on ne sait pas. On laisse passer — couper le
 * service pour une grille incomplète punirait la personne d'un défaut qui ne
 * la concerne pas — et le verdict le dit : `remaining.costMicroEur` vaut
 * `null` (« plafond non applicable », pas « il reste de la marge »).
 */
export function checkQuota(usage: QuotaUsage, limits: QuotaLimits): QuotaVerdict {
  if (limits.costMicroEurPerMonth === null || usage.costMicroEur === null) {
    return { allowed: true, breach: null, reason: null, remaining: { costMicroEur: null } };
  }
  if (usage.costMicroEur >= limits.costMicroEurPerMonth) {
    return {
      allowed: false,
      breach: 'cout',
      reason:
        `Garde-fou de sécurité : ce compte a atteint ${formatEuros(limits.costMicroEurPerMonth)} de coût IA ` +
        'ce mois-ci, le plafond anti-abus d’Ignitux. Ce n’est pas ton solde : tes crédits ne sont pas touchés. ' +
        'Le compteur repart le 1er du mois prochain ; si tu en as besoin avant, écris à contact@ignitux.com.',
      remaining: { costMicroEur: 0 },
    };
  }
  return {
    allowed: true,
    breach: null,
    reason: null,
    remaining: { costMicroEur: limits.costMicroEurPerMonth - usage.costMicroEur },
  };
}

/**
 * Faut-il prévenir la personne qu'elle approche du garde-fou ? Au dernier
 * cinquième du plafond APPLIQUÉ — celui que l'environnement règle (5 € en
 * production au 2026-10-18), pas le défaut : comparé aux 50 € du défaut, un
 * plafond de 5 € laissait toujours moins de 10 €, et l'avertissement
 * s'affichait dès le premier appel.
 */
export function shouldWarn(verdict: QuotaVerdict, limits: QuotaLimits): boolean {
  if (!verdict.allowed) return false;
  if (verdict.remaining.costMicroEur === null || limits.costMicroEurPerMonth === null) return false;
  return verdict.remaining.costMicroEur <= limits.costMicroEurPerMonth / 5;
}
