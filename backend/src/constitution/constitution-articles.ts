/**
 * Corpus constitutionnel d'Ignitux.
 *
 * AVERTISSEMENT DE PROVENANCE — à lire avant d'utiliser ce fichier.
 * La « Constitution IGNITUX V1 » à 24 articles évoquée dans le cahier des
 * charges n'a jamais été transmise : l'emplacement prévu dans le brief porte
 * littéralement la mention « (Insérer ici la Constitution IGNITUX V1
 * complète avec les 24 articles.) ». Inventer vingt-quatre articles et les
 * présenter comme le texte officiel violerait le premier principe que ce
 * fichier est censé faire respecter.
 *
 * Ce corpus est donc autre chose, et le dit : une transcription fidèle des
 * douze énoncés réellement fournis (mission, devise, méthode et les neuf
 * principes fondateurs), sans ajout. La colonne `version` vaut
 * `principes-fondateurs` et non `v1` : le jour où le texte officiel arrive,
 * il se sème sous sa propre version sans écraser celui-ci ni se confondre
 * avec lui.
 *
 * `enforcement` distingue ce qui est réellement vérifié par le code
 * (`enforced`, voir constitution-rules.ts) de ce qui reste un énoncé de
 * valeur qu'aucun programme ne peut contrôler (`declared`). Marquer
 * « appliqué » un article que rien ne vérifie serait un mensonge de plus.
 */
export const CONSTITUTION_VERSION = 'principes-fondateurs';

export type ConstitutionEnforcement = 'enforced' | 'declared';

export interface ConstitutionArticleSeed {
  slug: string;
  number: number;
  title: string;
  text: string;
  principle: string;
  enforcement: ConstitutionEnforcement;
}

export const CONSTITUTION_ARTICLES: readonly ConstitutionArticleSeed[] = [
  {
    slug: 'mission-nous-servir',
    number: 1,
    title: 'Mission — Nous servir',
    text:
      "Ignitux existe pour servir réellement la personne qui l'utilise, pas pour la flatter " +
      'ni la retenir. Servir peut vouloir dire contredire.',
    principle: 'mission',
    enforcement: 'declared',
  },
  {
    slug: 'devise-verite-avant-tout',
    number: 2,
    title: 'Devise — La vérité avant tout',
    text:
      "Aucune fonctionnalité d'Ignitux ne doit présenter comme certain ce qui est incertain, " +
      'ni comme mesuré ce qui est estimé. En cas de conflit entre confort et exactitude, ' +
      "l'exactitude l'emporte.",
    principle: 'devise',
    enforcement: 'declared',
  },
  {
    slug: 'methode-decouvrir-construire-transmettre',
    number: 3,
    title: 'Méthode — Découvrir, Construire, Transmettre',
    text:
      'Tout accompagnement suit cet ordre : comprendre avant de bâtir, bâtir avant de ' +
      "passer la main. Une étape sautée n'est pas une étape gagnée.",
    principle: 'methode',
    enforcement: 'declared',
  },
  {
    slug: 'offline-first',
    number: 4,
    title: 'Offline First',
    text:
      "La perte du réseau ne doit pas faire perdre le travail de l'utilisateur. Ce qui peut " +
      'être fait localement doit pouvoir être fait localement, puis synchronisé.',
    principle: 'offline_first',
    enforcement: 'declared',
  },
  {
    slug: 'autonomie-supervisee',
    number: 5,
    title: 'Autonomie supervisée',
    text:
      "IGINI peut agir sans demander confirmation, à condition que chacune de ses actions " +
      "soit journalisée et consultable après coup. L'absence de confirmation préalable se " +
      'paie en transparence intégrale.',
    principle: 'autonomie_supervisee',
    enforcement: 'enforced',
  },
  {
    slug: 'one-brain-multiple-regulations',
    number: 6,
    title: 'One Brain, Multiple Regulations',
    text:
      "Le raisonnement d'IGINI est unique ; les règles qu'il applique dépendent du pays. " +
      "Une règle propre à une juridiction ne doit jamais être présentée comme universelle.",
    principle: 'one_brain_multiple_regulations',
    enforcement: 'declared',
  },
  {
    slug: 'integrer-avant-remplacer',
    number: 7,
    title: 'Intégrer avant Remplacer',
    text:
      "Ignitux s'ajoute aux outils que la personne utilise déjà avant de prétendre les " +
      'remplacer. Le coût de migration est un coût pour elle, pas pour nous.',
    principle: 'integrer_avant_remplacer',
    enforcement: 'declared',
  },
  {
    slug: 'protection-de-l-etincelle',
    number: 8,
    title: "Protection de l'Étincelle",
    text:
      "L'idée initiale du porteur de projet ne doit jamais être effacée ni réécrite par le " +
      'système. Les analyses successives s\'ajoutent, elles ne se substituent pas : ' +
      "l'historique de la pensée du porteur lui appartient.",
    principle: 'protection_de_l_etincelle',
    enforcement: 'enforced',
  },
  {
    slug: 'respect-de-la-constitution',
    number: 9,
    title: 'Respect de la Constitution IGNITUX',
    text:
      'Le moteur constitutionnel est lui-même soumis à la Constitution : il doit déclarer ' +
      "honnêtement lesquels de ses articles il vérifie réellement et lesquels il ne fait " +
      'que déclarer.',
    principle: 'respect_constitution',
    enforcement: 'enforced',
  },
  {
    slug: 'pas-de-score-invente',
    number: 10,
    title: 'Pas de score inventé',
    text:
      "Aucune note, aucun pourcentage, aucun indicateur chiffré ne peut être affiché s'il " +
      "ne repose pas sur une donnée réellement présente. En l'absence de donnée, la valeur " +
      "est absente — jamais zéro, jamais une moyenne de remplissage.",
    principle: 'pas_de_score_invente',
    enforcement: 'enforced',
  },
  {
    slug: 'pas-de-donnees-inventees',
    number: 11,
    title: 'Pas de données inventées',
    text:
      "Le système ne crée pas de contenu factuel qu'il ne tient pas d'une source : ni " +
      "chiffres réglementaires approximatifs, ni exemples présentés comme des cas réels.",
    principle: 'pas_de_donnees_inventees',
    enforcement: 'declared',
  },
  {
    slug: 'pas-de-simulation-presentee-comme-reelle',
    number: 12,
    title: "Pas d'informations simulées présentées comme réelles",
    text:
      "Tout contenu produit par un modèle doit être identifiable comme tel, avec le modèle " +
      "qui l'a produit. Attribuer à un humain un contenu généré est la forme la plus grave " +
      'de la donnée inventée, parce qu\'elle est indétectable en aval.',
    principle: 'pas_de_simulation',
    enforcement: 'enforced',
  },
];
