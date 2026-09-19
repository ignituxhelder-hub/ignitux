/**
 * Moteur de règles constitutionnel — la partie exécutable de la Constitution.
 *
 * Principe de conception : une règle n'existe ici que si elle vérifie quelque
 * chose de concret sur une action réelle. On ne crée pas de règle pour faire
 * nombre en face d'un article ; les articles sans règle sont marqués
 * `declared` dans constitution-articles.ts et c'est tout.
 *
 * Le moteur est volontairement pur (aucune dépendance Nest, aucun accès base)
 * pour rester testable ligne à ligne et réutilisable partout — y compris,
 * plus tard, côté client en mode hors ligne.
 */

/**
 * Les actions que le reste du code soumet au moteur avant de les accomplir.
 * Chaque variante correspond à un point d'appel réel : si une variante n'est
 * appelée nulle part, elle doit être retirée plutôt que conservée « au cas
 * où » (code mort déguisé en architecture).
 */
export type ConstitutionAction =
  /** Un moteur s'apprête à exposer un indicateur chiffré. */
  | { kind: 'publish_score'; field: string; value: number | null; hasSource: boolean }
  /** Un contenu produit par un modèle s'apprête à être enregistré. */
  | { kind: 'persist_generated'; entity: string; generatedBy: string; generatedModel: string | null }
  /** Un moteur agit sans confirmation humaine préalable. */
  | { kind: 'autonomous_act'; engine: string; journalled: boolean }
  /** Une écriture s'apprête à remplacer une trace existante de l'Étincelle. */
  | { kind: 'overwrite_spark'; entity: string; mode: 'append' | 'replace' };

export type ConstitutionSeverity = 'blocking' | 'warning';

export interface ConstitutionViolation {
  ruleId: string;
  articleSlug: string;
  severity: ConstitutionSeverity;
  detail: string;
}

export interface ConstitutionRule {
  id: string;
  articleSlug: string;
  severity: ConstitutionSeverity;
  /** Ce que la règle vérifie, en une phrase — repris tel quel dans l'API. */
  description: string;
  /** Retourne le détail de la violation, ou null si l'action est conforme. */
  check(action: ConstitutionAction): string | null;
}

/**
 * Les contenus générés doivent nommer un modèle. `igini` sans modèle est
 * toléré en avertissement et non en blocage : les lignes créées avant que la
 * traçabilité n'existe sont dans ce cas, et refuser de les lire serait pire
 * que de signaler qu'on ignore leur modèle.
 */
const PROVENANCE_SOURCES = ['igini', 'human'] as const;

export const CONSTITUTION_RULES: readonly ConstitutionRule[] = [
  {
    id: 'score-sans-source',
    articleSlug: 'pas-de-score-invente',
    severity: 'blocking',
    description:
      "Un indicateur chiffré ne peut être publié que si la donnée dont il est tiré existe " +
      "réellement ; sinon il doit valoir null.",
    check(action) {
      if (action.kind !== 'publish_score') return null;
      if (action.value !== null && !action.hasSource) {
        return `Le score « ${action.field} » vaut ${action.value} alors qu'aucune donnée source ne le justifie.`;
      }
      return null;
    },
  },
  {
    id: 'provenance-inconnue',
    articleSlug: 'pas-de-simulation-presentee-comme-reelle',
    severity: 'warning',
    description:
      "Un contenu enregistré comme produit par IGINI devrait nommer le modèle qui l'a produit.",
    check(action) {
      if (action.kind !== 'persist_generated') return null;
      if (action.generatedBy === 'igini' && !action.generatedModel) {
        return `Le contenu « ${action.entity} » est attribué à IGINI sans nommer de modèle.`;
      }
      return null;
    },
  },
  {
    id: 'provenance-usurpee',
    articleSlug: 'pas-de-simulation-presentee-comme-reelle',
    severity: 'blocking',
    description:
      "Un contenu produit par un modèle ne peut pas être enregistré comme saisi par un humain.",
    check(action) {
      if (action.kind !== 'persist_generated') return null;
      if (action.generatedBy === 'human' && action.generatedModel) {
        return `Le contenu « ${action.entity} » est attribué à un humain alors que le modèle ${action.generatedModel} l'a produit.`;
      }
      if (!PROVENANCE_SOURCES.includes(action.generatedBy as (typeof PROVENANCE_SOURCES)[number])) {
        return `Provenance inconnue « ${action.generatedBy} » pour le contenu « ${action.entity} ».`;
      }
      return null;
    },
  },
  {
    id: 'automatisation-non-journalisee',
    articleSlug: 'autonomie-supervisee',
    severity: 'blocking',
    description:
      "Une action menée sans confirmation humaine doit être journalisée : sans journal, " +
      "l'autonomie n'est plus supervisée.",
    check(action) {
      if (action.kind !== 'autonomous_act') return null;
      if (!action.journalled) {
        return `Le moteur « ${action.engine} » a agi sans confirmation et sans journaliser son exécution.`;
      }
      return null;
    },
  },
  {
    id: 'etincelle-remplacee',
    articleSlug: 'protection-de-l-etincelle',
    severity: 'blocking',
    description:
      "Les traces de la pensée du porteur (analyses, plans) s'ajoutent et ne se remplacent " +
      'jamais.',
    check(action) {
      if (action.kind !== 'overwrite_spark') return null;
      if (action.mode === 'replace') {
        return `Une écriture tente de remplacer « ${action.entity} » au lieu d'ajouter une version.`;
      }
      return null;
    },
  },
];

/**
 * Soumet une action au corpus de règles. Retourne toutes les violations
 * relevées — on ne s'arrête pas à la première : un appelant qui journalise a
 * besoin du tableau complet, pas d'un échantillon.
 */
export function reviewAction(action: ConstitutionAction): ConstitutionViolation[] {
  const violations: ConstitutionViolation[] = [];
  for (const rule of CONSTITUTION_RULES) {
    const detail = rule.check(action);
    if (detail !== null) {
      violations.push({
        ruleId: rule.id,
        articleSlug: rule.articleSlug,
        severity: rule.severity,
        detail,
      });
    }
  }
  return violations;
}

export function hasBlockingViolation(violations: readonly ConstitutionViolation[]): boolean {
  return violations.some((violation) => violation.severity === 'blocking');
}
