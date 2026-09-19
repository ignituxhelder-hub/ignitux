/**
 * Constitution IGNITUX V1 — les 24 articles officiels.
 *
 * Le texte a été transmis par le porteur du projet le 19 septembre 2026. Il
 * remplace le corpus provisoire `principes-fondateurs` qui servait
 * d'intérim tant que la V1 n'existait pas : ce corpus-là transcrivait les
 * douze énoncés alors disponibles, en disant explicitement qu'il n'était
 * pas la V1. Les deux versions coexistent en base sans se confondre,
 * chacune sous sa propre valeur de `version` — c'est précisément ce que ce
 * champ permettait d'anticiper.
 *
 * Le libellé des articles est repris mot pour mot. Ce qui est ajouté ici et
 * ne figure pas dans le texte source : le `slug` (clé de semis), le
 * `principle` (rattachement au vocabulaire interne) et surtout
 * l'`enforcement`, qui dit si une règle du moteur vérifie réellement
 * l'article ou s'il reste un énoncé de valeur. Cette distinction n'est pas
 * dans la Constitution : c'est un constat technique sur notre code, et le
 * marquer honnêtement est ce qu'exige l'article 11 (Transparence).
 */
export const CONSTITUTION_VERSION = 'v1';

/**
 * Corpus antérieur, conservé pour que les violations journalisées avant la
 * V1 restent rattachables à leur article d'origine.
 */
export const LEGACY_CONSTITUTION_VERSION = 'principes-fondateurs';

export type ConstitutionEnforcement = 'enforced' | 'declared';

export interface ConstitutionArticleSeed {
  slug: string;
  number: number;
  title: string;
  text: string;
  principle: string;
  enforcement: ConstitutionEnforcement;
}

export const CONSTITUTION_PREAMBLE =
  "IGNITUX existe pour aider chaque être humain à découvrir, construire et transmettre son " +
  'potentiel. Mission : nous servir. Devise : la vérité avant tout. Méthode : Découvrir → ' +
  'Construire → Transmettre.';

export const CONSTITUTION_ARTICLES: readonly ConstitutionArticleSeed[] = [
  {
    slug: 'v1-01-la-verite',
    number: 1,
    title: 'La Vérité',
    text: 'Toute décision doit privilégier la vérité aux intérêts particuliers.',
    principle: 'verite',
    enforcement: 'declared',
  },
  {
    slug: 'v1-02-humain-avant-profit',
    number: 2,
    title: "L'Humain Avant le Profit",
    text: "Le profit est un moyen. L'humain est la finalité.",
    principle: 'humain_avant_profit',
    enforcement: 'declared',
  },
  {
    slug: 'v1-03-protection-de-l-etincelle',
    number: 3,
    title: "Protection de l'Étincelle",
    text: "Chaque individu possède une Étincelle unique. IGNITUX doit la protéger.",
    principle: 'protection_de_l_etincelle',
    // Vérifié : règle `etincelle-remplacee` — les analyses s'ajoutent et ne
    // s'écrasent jamais.
    enforcement: 'enforced',
  },
  {
    slug: 'v1-04-decouvrir',
    number: 4,
    title: 'Découvrir',
    text: 'IGNITUX aide à découvrir les talents, compétences et potentiels.',
    principle: 'methode',
    enforcement: 'declared',
  },
  {
    slug: 'v1-05-construire',
    number: 5,
    title: 'Construire',
    text: 'IGNITUX aide à transformer les idées en réalisations concrètes.',
    principle: 'methode',
    enforcement: 'declared',
  },
  {
    slug: 'v1-06-transmettre',
    number: 6,
    title: 'Transmettre',
    text: 'Le savoir doit pouvoir être transmis aux générations suivantes.',
    principle: 'methode',
    enforcement: 'declared',
  },
  {
    slug: 'v1-07-responsabilite',
    number: 7,
    title: 'Responsabilité',
    text: 'Chaque utilisateur reste responsable de ses décisions.',
    principle: 'responsabilite',
    enforcement: 'declared',
  },
  {
    slug: 'v1-08-autonomie-supervisee',
    number: 8,
    title: 'Autonomie Supervisée',
    text: 'IGINI peut agir dans les limites autorisées. Les décisions majeures restent humaines.',
    principle: 'autonomie_supervisee',
    // Vérifié : règle `automatisation-non-journalisee` — une action menée
    // sans confirmation doit être journalisée.
    enforcement: 'enforced',
  },
  {
    slug: 'v1-09-pas-de-donnees-inventees',
    number: 9,
    title: 'Pas de Données Inventées',
    text: 'Aucune donnée fictive ne doit être présentée comme réelle.',
    principle: 'pas_de_donnees_inventees',
    // Vérifié : règles `provenance-usurpee` et `provenance-inconnue`.
    enforcement: 'enforced',
  },
  {
    slug: 'v1-10-pas-de-score-invente',
    number: 10,
    title: 'Pas de Score Inventé',
    text: 'Aucun score ne doit être calculé sans données réelles suffisantes.',
    principle: 'pas_de_score_invente',
    // Vérifié : règle `score-sans-source`.
    enforcement: 'enforced',
  },
  {
    slug: 'v1-11-transparence',
    number: 11,
    title: 'Transparence',
    text: "Les décisions d'IGINI doivent être explicables.",
    principle: 'transparence',
    // Vérifié : règle `transition-inexplicable` — le moteur de workflow
    // refuse de franchir une étape dont il ne sait pas énoncer la raison.
    enforcement: 'enforced',
  },
  {
    slug: 'v1-12-memoire-responsable',
    number: 12,
    title: 'Mémoire Responsable',
    text: 'Toute mémoire doit être traçable.',
    principle: 'memoire_responsable',
    // Vérifié : règle `memoire-sans-auteur`.
    enforcement: 'enforced',
  },
  {
    slug: 'v1-13-respect-de-la-vie-privee',
    number: 13,
    title: 'Respect de la Vie Privée',
    text: 'Les données privées sont protégées par défaut.',
    principle: 'vie_privee',
    // Vérifié : règle `partage-par-defaut` — un projet est privé tant que
    // son porteur ne le rend pas public explicitement.
    enforcement: 'enforced',
  },
  {
    slug: 'v1-14-integrer-avant-remplacer',
    number: 14,
    title: 'Intégrer Avant Remplacer',
    text: "Toujours privilégier l'intégration avant la substitution.",
    principle: 'integrer_avant_remplacer',
    enforcement: 'declared',
  },
  {
    slug: 'v1-15-one-brain-multiple-regulations',
    number: 15,
    title: 'One Brain Multiple Regulations',
    text: 'Un seul cerveau. Plusieurs réglementations locales.',
    principle: 'one_brain_multiple_regulations',
    // Vérifié : règle `regle-locale-sans-source` — une règle propre à un
    // pays doit citer sa source officielle.
    enforcement: 'enforced',
  },
  {
    slug: 'v1-16-offline-first',
    number: 16,
    title: 'Offline First',
    text: 'IGNITUX doit continuer à fonctionner sans connexion.',
    principle: 'offline_first',
    // Partiellement seulement, et c'est dit dans l'audit : les données déjà
    // chargées restent consultables et les écritures sont mises en file,
    // mais l'application ne démarre pas hors ligne (pas de service worker).
    enforcement: 'declared',
  },
  {
    slug: 'v1-17-les-gardiens',
    number: 17,
    title: 'Les Gardiens',
    text: 'Les Gardiens protègent la Constitution.',
    principle: 'gardiens',
    // Aucun rôle « Gardien » n'existe dans le produit à ce jour : le
    // marquer `enforced` serait annoncer un dispositif inexistant.
    enforcement: 'declared',
  },
  {
    slug: 'v1-18-evolution-sans-trahison',
    number: 18,
    title: 'Évolution Sans Trahison',
    text: "La croissance ne justifie jamais l'abandon des principes.",
    principle: 'evolution_sans_trahison',
    enforcement: 'declared',
  },
  {
    slug: 'v1-19-confiance',
    number: 19,
    title: 'Confiance',
    text: 'La confiance est un actif fondamental.',
    principle: 'confiance',
    enforcement: 'declared',
  },
  {
    slug: 'v1-20-reputation',
    number: 20,
    title: 'Réputation',
    text: 'La réputation se construit par les actions.',
    principle: 'reputation',
    enforcement: 'declared',
  },
  {
    slug: 'v1-21-protection-des-idees',
    number: 21,
    title: 'Protection des Idées',
    text: 'Les créateurs conservent la reconnaissance de leurs idées.',
    principle: 'protection_des_idees',
    enforcement: 'declared',
  },
  {
    slug: 'v1-22-financement-ethique',
    number: 22,
    title: 'Financement Éthique',
    text: 'Le financement doit servir la création de valeur réelle.',
    principle: 'financement_ethique',
    // Vérifié : règle `majorite-du-porteur` — une répartition qui ferait
    // passer le porteur sous la majorité est refusée (modèle économique
    // IGNITUX : l'entrepreneur reste propriétaire principal).
    enforcement: 'enforced',
  },
  {
    slug: 'v1-23-independance-du-fondateur',
    number: 23,
    title: 'Indépendance du Fondateur',
    text: 'IGNITUX doit survivre à son fondateur.',
    principle: 'independance_du_fondateur',
    enforcement: 'declared',
  },
  {
    slug: 'v1-24-constitution-supreme',
    number: 24,
    title: 'Constitution Suprême',
    text:
      'Aucun module, IA, Gardien ou utilisateur ne peut être au-dessus de la Constitution.',
    principle: 'constitution_supreme',
    // Vérifié par le corpus lui-même : un test échoue si un article déclaré
    // `enforced` n'est couvert par aucune règle exécutable.
    enforcement: 'enforced',
  },
];
