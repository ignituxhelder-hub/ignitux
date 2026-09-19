/**
 * LE RACHAT PROGRESSIF — la sixième pièce du modèle économique.
 *
 * Le modèle IGNITUX dit : « lorsque l'entrepreneur atteint des objectifs
 * définis — rentabilité, autonomie, stabilité — il peut récupérer
 * progressivement les parts détenues par IGNITUX ». Il nomme les trois
 * conditions et ne les chiffre pas.
 *
 * Ce module part de ce constat au lieu de le contourner. Inventer des
 * seuils (« rentable = 3 mois de bénéfice », « stable = 12 mois
 * d'ancienneté ») reviendrait à décider à la place du porteur du moment où
 * il peut racheter ses parts — sur des chiffres qu'Ignitux aurait inventés.
 * C'est exactement ce que l'article 10 interdit.
 *
 * Alors le porteur écrit lui-même ce que chaque condition signifie pour son
 * projet, et c'est lui qui déclare qu'elle est atteinte. Ignitux conserve ce
 * qu'il a écrit, le date, et compte. Rien de plus, et c'est déjà beaucoup :
 * une condition écrite noir sur blanc avant d'être atteinte est beaucoup
 * plus difficile à réinterpréter après coup — par le porteur comme par
 * Ignitux.
 */

export const BUYBACK_CONDITIONS = ['rentabilite', 'autonomie', 'stabilite'] as const;
export type BuybackCondition = (typeof BUYBACK_CONDITIONS)[number];

export function isBuybackCondition(value: string): value is BuybackCondition {
  return BUYBACK_CONDITIONS.includes(value as BuybackCondition);
}

/** Libellés affichables, dans l'ordre du modèle économique. */
export const BUYBACK_CONDITION_LABELS: Readonly<Record<BuybackCondition, string>> = {
  rentabilite: 'Rentabilité',
  autonomie: 'Autonomie',
  stabilite: 'Stabilité',
};

export const BUYBACK_SCOPE_NOTICE =
  "Le modèle IGNITUX conditionne le rachat des parts à trois objectifs — rentabilité, autonomie, " +
  "stabilité — sans les chiffrer. C'est donc toi qui écris ce que chacun veut dire pour ton " +
  "projet, et toi qui déclares qu'il est atteint : Ignitux ne le déduit d'aucune donnée. Même " +
  'quand les trois sont atteints, Ignitux ne calcule ni la valorisation de ton projet, ni le ' +
  "prix de rachat — aucune méthode n'a été choisie, et en inventer une reviendrait à fixer un " +
  'prix à ta place.';

export interface BuybackObjective {
  kind: string;
  definition: string;
  reached_at: Date | null;
}

export interface BuybackProgress {
  /** Les trois conditions, définies ou non. */
  conditions: Array<{
    kind: BuybackCondition;
    label: string;
    /** Ce que le porteur a écrit, ou null s'il ne l'a pas encore fait. */
    definition: string | null;
    reachedAt: Date | null;
  }>;
  definedCount: number;
  reachedCount: number;
  totalCount: number;
  /**
   * Les conditions du rachat sont-elles réunies ?
   *
   * `null` tant que les trois ne sont pas écrites. Répondre « non » sur des
   * conditions non définies serait affirmer qu'elles ne sont pas remplies,
   * alors que personne n'a encore dit ce qu'elles voulaient dire.
   */
  allReached: boolean | null;
  /** Ce qu'il reste à écrire, pour que l'interface puisse le dire. */
  missingDefinitions: BuybackCondition[];
}

export function buybackProgress(
  objectives: ReadonlyArray<BuybackObjective>,
): BuybackProgress {
  const byKind = new Map<string, BuybackObjective>();
  for (const objective of objectives) {
    if (isBuybackCondition(objective.kind)) {
      byKind.set(objective.kind, objective);
    }
  }

  const conditions = BUYBACK_CONDITIONS.map((kind) => {
    const objective = byKind.get(kind);
    // Une définition vide ne compte pas comme une définition : elle
    // laisserait croire que la condition est posée alors qu'elle ne dit
    // rien.
    const definition = objective?.definition.trim() ? objective.definition : null;
    return {
      kind,
      label: BUYBACK_CONDITION_LABELS[kind],
      definition,
      // Une condition non définie ne peut pas être atteinte : sinon on
      // pourrait cocher « rentabilité atteinte » sans avoir jamais dit ce
      // que « rentable » voulait dire pour ce projet.
      reachedAt: definition ? (objective?.reached_at ?? null) : null,
    };
  });

  const definedCount = conditions.filter((condition) => condition.definition !== null).length;
  const reachedCount = conditions.filter((condition) => condition.reachedAt !== null).length;
  const missingDefinitions = conditions
    .filter((condition) => condition.definition === null)
    .map((condition) => condition.kind);

  return {
    conditions,
    definedCount,
    reachedCount,
    totalCount: BUYBACK_CONDITIONS.length,
    allReached:
      definedCount === BUYBACK_CONDITIONS.length
        ? reachedCount === BUYBACK_CONDITIONS.length
        : null,
    missingDefinitions,
  };
}
