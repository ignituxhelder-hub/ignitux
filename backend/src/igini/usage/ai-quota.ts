import { MICRO_EUR_PER_EUR } from './ai-pricing.js';

/**
 * LE PLAFOND DE CONSOMMATION IA — et pourquoi il y en a deux.
 *
 * Module pur : aucune base, aucun Nest. Toute la décision vit ici et se
 * teste sans rien démarrer.
 *
 * ── Deux plafonds, parce qu'ils ne protègent pas la même chose ──────────
 *
 * **Le nombre d'appels** est ce que l'offre annonce — « 5 analyses par
 * mois ». C'est ce que la personne a compris en payant, et c'est donc ce
 * qu'il faut tenir, indépendamment de ce que ça coûte.
 *
 * **Le coût** est ce que la décision du porteur fixe : le coût IA peut
 * monter à 10 % du prix, soit 2,00 € par utilisateur et par mois. Un appel
 * peut coûter dix fois plus qu'un autre — un projet richement décrit contre
 * un projet en trois lignes —, donc compter les appels ne protège pas la
 * marge.
 *
 * Le premier atteint refuse. Tenir l'un sans l'autre laisserait soit une
 * promesse non tenue, soit une marge qui fuit.
 *
 * ── Ce que ce plafond n'est PAS ─────────────────────────────────────────
 *
 * Ce n'est **pas un compteur comptable**. Le journal des appels s'écrit en
 * « meilleur effort » : il ne fait jamais échouer une génération, donc une
 * écriture perdue est un appel non décompté. C'est un plafond haut, qui
 * borne un usage pathologique — pas une caisse enregistreuse. Le jour où il
 * faudra facturer au réel, il faudra rendre l'écriture du journal bloquante,
 * et ce sera un autre dispositif.
 */

/** Plafonds en vigueur. `null` = pas de plafond sur cet axe. */
export interface QuotaLimits {
  /** Nombre d'appels aux générateurs par mois civil. */
  callsPerMonth: number | null;
  /** Coût dérivé, en micro-euros, par mois civil. */
  costMicroEurPerMonth: number | null;
}

/** Ce qui a déjà été consommé ce mois-ci. */
export interface QuotaUsage {
  calls: number;
  /**
   * Coût dérivé des appels du mois. `null` quand un modèle échappe à la
   * grille tarifaire — voir plus bas ce qu'on en fait.
   */
  costMicroEur: number | null;
}

export type QuotaBreach = 'appels' | 'cout';

export interface QuotaVerdict {
  allowed: boolean;
  /** Lequel des deux plafonds a cédé. */
  breach: QuotaBreach | null;
  /** Ce qu'on dit à la personne. Vide quand elle peut continuer. */
  reason: string | null;
  /** Ce qu'il lui reste, pour prévenir avant le mur. */
  remaining: {
    calls: number | null;
    costMicroEur: number | null;
  };
}

/**
 * Valeurs par défaut — et pourquoi le nombre d'appels n'en a plus.
 *
 * `null` ne veut pas dire « illimité » : il veut dire **ce n'est pas ici
 * qu'on compte les appels**. Le nombre d'analyses incluses est une promesse
 * commerciale, et elle vit dans le catalogue des offres — 3 en Découverte,
 * 30 en Entrepreneur, 150 en Construction. Chaque génération la fait
 * respecter en passant par `OffresService.exiger`.
 *
 * Ce repli valait 5, écrit du temps d'une offre unique à 20 €/mois pour 5
 * analyses. Cette offre n'existe plus, et le chiffre lui a survécu : il
 * serait tombé **avant** l'offre pour tout abonné payant, coupant à la
 * cinquième analyse quelqu'un qui en a acheté trente. Deux endroits qui
 * comptent la même chose finissent toujours par se contredire ; celui qui
 * connaît le prix payé gagne.
 *
 * Le plafond de **coût**, lui, reste : il ne double aucune promesse, il
 * protège la facture. C'est le seul des deux axes qui ait encore un travail
 * propre.
 *
 * Les deux restent réglables par variable d'environnement, pour pouvoir
 * serrer la vis sans redéployer.
 */
export const DEFAULT_CALLS_PER_MONTH: number | null = null;
export const DEFAULT_COST_MICRO_EUR_PER_MONTH = 2 * MICRO_EUR_PER_EUR;

/**
 * Lit les plafonds depuis l'environnement.
 *
 * `'illimite'` désactive un axe — utile pour un compte d'exploitation ou
 * pendant une phase de test. Une valeur illisible **n'éteint pas** le
 * plafond : elle retombe sur la valeur par défaut. Une faute de frappe dans
 * une variable d'environnement ne doit pas ouvrir les vannes en silence ;
 * c'est exactement l'inverse du choix fait pour l'interrupteur des
 * générateurs, où seule la chaîne exacte `'false'` coupe — là-bas
 * l'ambiguïté laisse le produit complet, ici elle laisse le plafond en
 * place. Dans les deux cas, l'inattendu penche du côté prudent.
 */
export function readQuotaLimits(env: {
  IGINI_QUOTA_CALLS_PER_MONTH?: string;
  IGINI_QUOTA_COST_EUR_PER_MONTH?: string;
}): QuotaLimits {
  return {
    callsPerMonth: lireEntier(env.IGINI_QUOTA_CALLS_PER_MONTH, DEFAULT_CALLS_PER_MONTH),
    costMicroEurPerMonth: lireEuros(
      env.IGINI_QUOTA_COST_EUR_PER_MONTH,
      DEFAULT_COST_MICRO_EUR_PER_MONTH,
    ),
  };
}

function lireEntier(valeur: string | undefined, defaut: number | null): number | null {
  if (valeur === undefined || valeur.trim() === '') return defaut;
  if (valeur.trim().toLowerCase() === 'illimite') return null;
  const nombre = Number(valeur);
  if (!Number.isInteger(nombre) || nombre < 0) return defaut;
  return nombre;
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
 * ── Le cas du coût inconnu ──────────────────────────────────────────────
 *
 * Quand un appel du mois porte un modèle absent de la grille tarifaire, le
 * coût du mois vaut `null` : on ne sait pas. Deux réponses possibles, et
 * elles s'excluent.
 *
 * Refuser reviendrait à couper le service parce qu'une grille est
 * incomplète — punir la personne pour un défaut de configuration qui ne la
 * concerne pas. Laisser passer, c'est renoncer temporairement au plafond de
 * coût, en gardant celui du nombre d'appels qui, lui, reste exact.
 *
 * On laisse passer, et le verdict le dit : `remaining.costMicroEur` vaut
 * `null`, ce qui se lit « plafond de coût non applicable » et non « il
 * reste de la marge ». L'écart se voit alors dans les totaux plutôt que de
 * se transformer en refus inexplicable.
 */
export function checkQuota(usage: QuotaUsage, limits: QuotaLimits): QuotaVerdict {
  const restantAppels =
    limits.callsPerMonth === null ? null : Math.max(0, limits.callsPerMonth - usage.calls);

  const restantCout =
    limits.costMicroEurPerMonth === null || usage.costMicroEur === null
      ? null
      : Math.max(0, limits.costMicroEurPerMonth - usage.costMicroEur);

  // Le nombre d'appels d'abord : c'est ce que l'offre annonce, donc ce que
  // la personne comprendra le plus vite si on le lui oppose.
  if (limits.callsPerMonth !== null && usage.calls >= limits.callsPerMonth) {
    return {
      allowed: false,
      breach: 'appels',
      reason:
        `Tu as utilisé les ${limits.callsPerMonth} analyses incluses ce mois-ci. ` +
        'Le compteur repart au premier jour du mois prochain.',
      remaining: { calls: 0, costMicroEur: restantCout },
    };
  }

  if (
    limits.costMicroEurPerMonth !== null &&
    usage.costMicroEur !== null &&
    usage.costMicroEur >= limits.costMicroEurPerMonth
  ) {
    return {
      allowed: false,
      breach: 'cout',
      reason:
        `Les générations de ce mois ont atteint le plafond de ${formatEuros(limits.costMicroEurPerMonth)} ` +
        'de coût IA inclus. Le compteur repart au premier jour du mois prochain.',
      remaining: { calls: restantAppels, costMicroEur: 0 },
    };
  }

  return {
    allowed: true,
    breach: null,
    reason: null,
    remaining: { calls: restantAppels, costMicroEur: restantCout },
  };
}

/**
 * Faut-il prévenir la personne qu'elle approche du plafond ?
 *
 * À un appel près, ou à un cinquième du budget près. Prévenir trop tôt
 * transforme l'avertissement en décor qu'on n'aperçoit plus ; prévenir au
 * dernier moment ne sert à rien.
 */
export function shouldWarn(verdict: QuotaVerdict): boolean {
  if (!verdict.allowed) return false;
  if (verdict.remaining.calls !== null && verdict.remaining.calls <= 1) return true;
  if (
    verdict.remaining.costMicroEur !== null &&
    verdict.remaining.costMicroEur <= DEFAULT_COST_MICRO_EUR_PER_MONTH / 5
  ) {
    return true;
  }
  return false;
}
