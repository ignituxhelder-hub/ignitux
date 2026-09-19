/**
 * DU TOKEN À L'EURO — et pourquoi la base ne stocke que le token.
 *
 * `ai_usage_events` enregistre des tokens, jamais un montant. Un token
 * consommé est un fait mesuré, définitif, qui ne changera plus. Un montant est
 * le produit de ce fait par une grille tarifaire qui, elle, change : celle
 * utilisée par PRICING.md avait déjà trois mois au moment de son écriture.
 * Écrire l'euro en base scellerait une grille périmée dans l'historique pour
 * toujours, et personne ne saurait plus, six mois après, à quel tarif une
 * ligne avait été valorisée.
 *
 * Le coût se dérive donc à la lecture, ici. La contrepartie est assumée et il
 * faut la nommer : recalculer un historique avec la grille d'aujourd'hui est
 * faux pour les lignes anciennes si les prix ont bougé. Le jour où ils
 * bougeront, ce module devra porter une grille **datée** (plusieurs entrées
 * par modèle, avec période de validité) plutôt qu'une seule. La structure
 * ci-dessous est prête pour ça — `GRILLE` est déjà indexée par modèle, il n'y
 * manque que l'axe du temps — mais tant qu'aucun prix n'a changé, ajouter cet
 * axe serait de la complexité sans contrepartie.
 */

/** Tarifs en dollars par million de tokens. */
export interface ModelRates {
  /** Tokens d'entrée, tarif de base. */
  input: number;
  /** Tokens de sortie — la réflexion interne y est incluse et facturée pareil. */
  output: number;
}

/**
 * Date de la grille ci-dessous. Exposée parce qu'un chiffre de coût sans la
 * date de son tarif est une affirmation invérifiable.
 */
export const PRICE_GRID_DATE = '2026-06-24';

/**
 * Source de la grille : référence tarifaire Anthropic. À revérifier avant
 * toute décision engageante — voir PRICING.md §1.
 */
export const GRILLE: Readonly<Record<string, ModelRates>> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

/**
 * Multiplicateurs appliqués au tarif d'entrée pour les tokens de cache.
 * Ignitux ne met rien en cache aujourd'hui (aucun `cache_control` n'est
 * envoyé), donc ces colonnes sont nulles en pratique. Ils sont ici pour que
 * le jour où le cache sera activé, le coût ne soit pas sous-estimé en silence
 * — ce qui est exactement le genre d'écart qu'on ne remarque jamais.
 */
export const CACHE_WRITE_MULTIPLIER = 1.25;
export const CACHE_READ_MULTIPLIER = 0.1;

/**
 * Taux de conversion, écrit en fraction et non en décimal.
 *
 * `0.92` n'est pas représentable exactement en binaire. Le calcul ci-dessous
 * enchaîne plusieurs multiplications avant un arrondi au supérieur : avec un
 * décimal, l'erreur de représentation suffit à faire basculer l'arrondi. Un
 * balayage de 300 000 tirages l'a montré sur 2,6 % des cas — un micro-euro à
 * chaque fois, donc sans conséquence sur un total, mais qui rendait l'arrondi
 * arbitraire alors qu'il est censé être une décision. En fraction, le
 * numérateur reste entier et un seul arrondi intervient, à la toute fin.
 *
 * Même remarque que pour la grille : c'est une hypothèse datée.
 */
export const USD_TO_EUR_NUMERATOR = 92;
export const USD_TO_EUR_DENOMINATOR = 100;

/** Le même taux en décimal, pour l'affichage et la documentation. */
export const USD_TO_EUR = USD_TO_EUR_NUMERATOR / USD_TO_EUR_DENOMINATOR;

/**
 * Les montants sont en **micro-euros entiers** (millionièmes d'euro).
 *
 * Le reste du produit compte en centimes entiers, mais un appel coûte ici de
 * l'ordre de 0,02 € : en centimes, la moitié des appels vaudrait zéro et un
 * total mensuel serait faux par construction. Le micro-euro garde la
 * discipline (des entiers, jamais de flottant qui traîne dans un total) avec
 * la précision que l'ordre de grandeur impose.
 */
export const MICRO_EUR_PER_EUR = 1_000_000;

export interface TokenCounts {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/**
 * Coût d'un appel en micro-euros, ou `null` si le modèle est inconnu de la
 * grille.
 *
 * `null` et non `0` : un modèle absent de la grille n'est pas gratuit, il est
 * non tarifé. Renvoyer zéro ferait disparaître sa dépense d'un total sans que
 * rien ne le signale — un mensonge par omission dans un chiffre censé servir
 * à décider. Les appelants doivent traiter ce cas explicitement.
 */
export function costMicroEur(model: string, tokens: TokenCounts): number | null {
  const rates = GRILLE[model];
  if (!rates) return null;

  // Le micro-euro tombe juste sans facteur d'échelle : un coût vaut
  // (tokens / 1e6) × tarif × taux euro, et le passage en millionièmes
  // remultiplie par 1e6. Les deux s'annulent, il ne reste que
  // tokens × tarif × taux. On accumule donc le numérateur entier et on ne
  // divise qu'une fois, à la fin.
  const numerateur =
    tokens.input_tokens * rates.input * USD_TO_EUR_NUMERATOR +
    tokens.output_tokens * rates.output * USD_TO_EUR_NUMERATOR +
    (tokens.cache_creation_input_tokens ?? 0) *
      rates.input *
      CACHE_WRITE_MULTIPLIER *
      USD_TO_EUR_NUMERATOR +
    (tokens.cache_read_input_tokens ?? 0) *
      rates.input *
      CACHE_READ_MULTIPLIER *
      USD_TO_EUR_NUMERATOR;

  // Arrondi au micro-euro supérieur : sur un coût, arrondir vers le bas
  // flatterait systématiquement le total. Entre deux erreurs d'un millionième
  // d'euro, autant prendre celle qui ne raconte pas d'histoire.
  return Math.ceil(numerateur / USD_TO_EUR_DENOMINATOR);
}

/** Micro-euros vers un affichage en euros, pour les réponses d'API. */
export function microEurToEur(micro: number): number {
  return micro / MICRO_EUR_PER_EUR;
}

/** Les modèles que la grille sait tarifer. */
export function pricedModels(): string[] {
  return Object.keys(GRILLE);
}
