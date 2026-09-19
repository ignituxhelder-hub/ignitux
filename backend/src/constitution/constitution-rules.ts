/**
 * Moteur de règles constitutionnel — la partie exécutable de la
 * Constitution IGNITUX V1.
 *
 * Principe de conception : une règle n'existe ici que si elle vérifie
 * quelque chose de concret sur une action réelle, branchée sur un vrai
 * point d'appel. On ne crée pas de règle pour faire nombre en face d'un
 * article ; les articles sans règle sont marqués `declared` dans
 * constitution-articles.ts, et un test échoue si un article prétend être
 * `enforced` sans règle qui le couvre (article 24).
 *
 * Le moteur est volontairement pur (aucune dépendance Nest, aucun accès
 * base) pour rester testable ligne à ligne.
 */

/**
 * Les actions que le reste du code soumet au moteur avant de les
 * accomplir. Chaque variante correspond à un point d'appel réel : une
 * variante appelée nulle part doit être retirée plutôt que conservée
 * « au cas où » (code mort déguisé en architecture).
 */
export type ConstitutionAction =
  /** Un moteur s'apprête à exposer un indicateur chiffré. (art. 10) */
  | { kind: 'publish_score'; field: string; value: number | null; hasSource: boolean }
  /** Un contenu produit par un modèle s'apprête à être enregistré. (art. 9) */
  | { kind: 'persist_generated'; entity: string; generatedBy: string; generatedModel: string | null }
  /** Un moteur agit sans confirmation humaine préalable. (art. 8) */
  | { kind: 'autonomous_act'; engine: string; journalled: boolean }
  /** Une écriture s'apprête à remplacer une trace existante. (art. 3) */
  | { kind: 'overwrite_spark'; entity: string; mode: 'append' | 'replace' }
  /** IGINI franchit une étape et doit pouvoir dire pourquoi. (art. 11) */
  | { kind: 'explain_decision'; engine: string; reason: string }
  /** Un souvenir s'apprête à être enregistré. (art. 12) */
  | { kind: 'persist_memory'; hasAuthor: boolean }
  /** Un projet est créé : il doit naître privé. (art. 13) */
  | { kind: 'create_project'; isPublic: boolean }
  /** Une règle propre à un pays s'apprête à être semée. (art. 15) */
  | { kind: 'publish_local_rule'; country: string; slug: string; sourceUrl: string | null }
  /** La répartition du capital s'apprête à changer. (art. 22) */
  | {
      kind: 'set_equity';
      holderName: string;
      isFounder: boolean;
      founderBasisPointsAfter: number;
      /** null quand la répartition ne totalise pas 100 % : on ne tranche pas. */
      totalBasisPointsAfter: number | null;
    }
  /** Un module s'apprête à rendre une indication sur laquelle quelqu'un va décider. (art. 7) */
  | { kind: 'publish_guidance'; module: string; notice: string | null };

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

const PROVENANCE_SOURCES = ['igini', 'human'] as const;

/** 10000 points de base = 100 %. */
const TOTAL_BASIS_POINTS = 10000;

export const CONSTITUTION_RULES: readonly ConstitutionRule[] = [
  {
    id: 'score-sans-source',
    articleSlug: 'v1-10-pas-de-score-invente',
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
    articleSlug: 'v1-09-pas-de-donnees-inventees',
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
    articleSlug: 'v1-09-pas-de-donnees-inventees',
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
    articleSlug: 'v1-08-autonomie-supervisee',
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
    articleSlug: 'v1-03-protection-de-l-etincelle',
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
  {
    id: 'transition-inexplicable',
    articleSlug: 'v1-11-transparence',
    severity: 'blocking',
    description:
      "IGINI ne franchit une étape que s'il peut en énoncer la raison : une décision qu'on " +
      'ne sait pas expliquer ne doit pas être prise.',
    check(action) {
      if (action.kind !== 'explain_decision') return null;
      if (action.reason.trim().length === 0) {
        return `Le moteur « ${action.engine} » a pris une décision sans pouvoir l'expliquer.`;
      }
      return null;
    },
  },
  {
    id: 'memoire-sans-auteur',
    articleSlug: 'v1-12-memoire-responsable',
    severity: 'blocking',
    description:
      "Un souvenir doit être rattaché à la personne qui l'a enregistré : une mémoire " +
      'anonyme est une mémoire non traçable.',
    check(action) {
      if (action.kind !== 'persist_memory') return null;
      if (!action.hasAuthor) {
        return "Un souvenir s'apprête à être enregistré sans auteur identifié.";
      }
      return null;
    },
  },
  {
    id: 'partage-par-defaut',
    articleSlug: 'v1-13-respect-de-la-vie-privee',
    severity: 'blocking',
    description:
      'Un projet naît privé. Le rendre public est une décision explicite de son porteur, ' +
      'jamais un défaut de configuration.',
    check(action) {
      if (action.kind !== 'create_project') return null;
      if (action.isPublic) {
        return "Un projet est créé directement public : la visibilité par défaut doit être privée.";
      }
      return null;
    },
  },
  {
    id: 'regle-locale-sans-source',
    articleSlug: 'v1-15-one-brain-multiple-regulations',
    severity: 'blocking',
    description:
      "Une règle propre à un pays doit citer sa source officielle : sans source, on ne peut " +
      'ni la vérifier ni la mettre à jour.',
    check(action) {
      if (action.kind !== 'publish_local_rule') return null;
      if (!action.sourceUrl || action.sourceUrl.trim().length === 0) {
        return `La règle « ${action.slug} » (${action.country}) ne cite aucune source officielle.`;
      }
      return null;
    },
  },
  {
    id: 'majorite-du-porteur',
    articleSlug: 'v1-22-financement-ethique',
    severity: 'blocking',
    description:
      "Le porteur de projet reste propriétaire principal : une répartition qui le ferait " +
      'passer sous la majorité est refusée.',
    check(action) {
      if (action.kind !== 'set_equity') return null;
      // Sur une répartition qui ne boucle pas à 100 %, on ne se prononce
      // pas : bloquer sur une donnée partielle empêcherait de saisir la
      // répartition ligne par ligne, ce qui est le cas normal.
      if (action.totalBasisPointsAfter !== TOTAL_BASIS_POINTS) return null;
      if (action.founderBasisPointsAfter * 2 <= TOTAL_BASIS_POINTS) {
        return (
          `Cette répartition laisserait le porteur à ${(action.founderBasisPointsAfter / 100).toFixed(2)} %, ` +
          "soit sans majorité. Le modèle IGNITUX pose que l'entrepreneur reste propriétaire principal."
        );
      }
      return null;
    },
  },
  {
    id: 'conseil-sans-avertissement',
    articleSlug: 'v1-07-responsabilite',
    severity: 'blocking',
    description:
      "Un module qui rend une indication doit dire ce qu'Ignitux ne décide pas à la place de " +
      'la personne. Une réponse sans son avertissement est refusée.',
    check(action) {
      if (action.kind !== 'publish_guidance') return null;
      if (action.notice !== null && action.notice.trim().length > 0) return null;
      return (
        `Le module « ${action.module} » s'apprête à rendre une indication sans l'avertissement ` +
        "qui dit ce qu'Ignitux ne décide pas. La personne reste responsable de sa décision, " +
        "encore faut-il qu'elle sache sur quoi elle décide seule."
      );
    },
  },
];

/**
 * Soumet une action au corpus de règles. Retourne toutes les violations
 * relevées — on ne s'arrête pas à la première : un appelant qui journalise
 * a besoin du tableau complet, pas d'un échantillon.
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
