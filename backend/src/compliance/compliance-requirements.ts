/**
 * Contenu de référence pour la France, rédigé à partir de sources publiques
 * officielles citées ligne par ligne (source_name/source_url). Volontairement
 * générique : pas de chiffres précis qui changent chaque année (seuils de
 * TVA, plafonds de chiffre d'affaires…) car ils seraient rapidement faux —
 * chaque item renvoie plutôt vers la source qui les tient à jour.
 *
 * Ce n'est PAS un avis juridique : voir le message d'avertissement renvoyé
 * par ComplianceService.listRequirements() et affiché côté frontend. En cas
 * de doute, un expert-comptable ou un avocat reste la seule source fiable
 * pour une situation réelle.
 */
export interface ComplianceRequirementSeed {
  slug: string;
  country: string;
  category: string;
  title: string;
  description: string;
  sourceName: string;
  sourceUrl: string;
}

export const COMPLIANCE_REQUIREMENTS_FR: ComplianceRequirementSeed[] = [
  {
    slug: 'fr-statut-juridique',
    country: 'FR',
    category: 'Création',
    title: 'Choisir un statut juridique',
    description:
      "Entreprise individuelle (dont micro-entreprise) ou société (EURL, SASU, SARL, SAS…) : le choix détermine le régime fiscal, social et la responsabilité sur les biens personnels. À comparer avant toute immatriculation.",
    sourceName: 'entreprendre.service-public.fr',
    sourceUrl: 'https://entreprendre.service-public.fr/vosdroits/N31676',
  },
  {
    slug: 'fr-guichet-unique',
    country: 'FR',
    category: 'Création',
    title: "Immatriculer l'entreprise via le guichet unique",
    description:
      "Toutes les formalités de création, modification et cessation d'entreprise passent par le guichet unique en ligne (géré par l'INPI), qui a remplacé les anciens CFE.",
    sourceName: 'formalites.entreprises.gouv.fr',
    sourceUrl: 'https://formalites.entreprises.gouv.fr',
  },
  {
    slug: 'fr-siren-siret',
    country: 'FR',
    category: 'Création',
    title: 'Obtenir un numéro SIREN/SIRET',
    description:
      "Attribué automatiquement par l'INSEE après immatriculation via le guichet unique. Nécessaire pour facturer, ouvrir un compte pro et répondre à certains appels d'offres.",
    sourceName: 'insee.fr',
    sourceUrl: 'https://www.insee.fr/fr/information/2015467',
  },
  {
    slug: 'fr-affiliation-urssaf',
    country: 'FR',
    category: 'Social',
    title: 'Affiliation et déclarations sociales (URSSAF)',
    description:
      "Déclarer et payer ses cotisations sociales (auto-entrepreneur : déclaration périodique du chiffre d'affaires ; autres statuts : régime social du dirigeant à vérifier selon la forme choisie).",
    sourceName: 'urssaf.fr / autoentrepreneur.urssaf.fr',
    sourceUrl: 'https://www.autoentrepreneur.urssaf.fr',
  },
  {
    slug: 'fr-regime-fiscal',
    country: 'FR',
    category: 'Fiscalité',
    title: 'Choisir et déclarer son régime fiscal',
    description:
      "Micro-BIC/micro-BNC, régime réel, impôt sur le revenu ou sur les sociétés selon le statut : le choix a un impact direct sur la trésorerie. Déclarations à faire sur le site des impôts.",
    sourceName: 'impots.gouv.fr',
    sourceUrl: 'https://www.impots.gouv.fr/professionnel',
  },
  {
    slug: 'fr-tva',
    country: 'FR',
    category: 'Fiscalité',
    title: 'Vérifier son régime de TVA',
    description:
      "Franchise en base de TVA (pas de TVA facturée en dessous d'un certain seuil de chiffre d'affaires) ou immatriculation à la TVA au-delà. Les seuils sont réévalués chaque année : à vérifier sur le site des impôts avant de facturer, pas à partir d'un chiffre mémorisé d'une année précédente.",
    sourceName: 'impots.gouv.fr',
    sourceUrl: 'https://www.impots.gouv.fr/professionnel/la-franchise-en-base-de-tva',
  },
  {
    slug: 'fr-compte-bancaire-dedie',
    country: 'FR',
    category: 'Finances',
    title: 'Ouvrir un compte bancaire dédié à l\'activité',
    description:
      "Obligatoire pour certains statuts (sociétés) et recommandé dans tous les cas dès que l'activité génère un chiffre d'affaires régulier, pour séparer les flux personnels et professionnels.",
    sourceName: 'service-public.fr',
    sourceUrl: 'https://entreprendre.service-public.fr/vosdroits/F32006',
  },
  {
    slug: 'fr-assurance-rc-pro',
    country: 'FR',
    category: 'Assurance',
    title: 'Vérifier si une assurance professionnelle est obligatoire',
    description:
      "La responsabilité civile professionnelle est obligatoire pour certaines activités réglementées (bâtiment, professions du droit et de la santé…) et fortement recommandée pour les autres.",
    sourceName: 'service-public.fr',
    sourceUrl: 'https://entreprendre.service-public.fr/vosdroits/F31217',
  },
  {
    slug: 'fr-activite-reglementee',
    country: 'FR',
    category: 'Activité',
    title: "Vérifier si l'activité est réglementée",
    description:
      "Certaines activités (artisanat, restauration, professions de santé, transport…) exigent une qualification, un diplôme ou une autorisation spécifique avant de pouvoir exercer légalement.",
    sourceName: 'entreprendre.service-public.fr',
    sourceUrl: 'https://entreprendre.service-public.fr/vosdroits/F32350',
  },
  {
    slug: 'fr-hygiene-alimentaire',
    country: 'FR',
    category: 'Activité',
    title: 'Formation en hygiène alimentaire (si restauration)',
    description:
      "Une formation spécifique à l'hygiène alimentaire (type HACCP) est obligatoire pour toute activité de restauration commerciale, y compris ambulante (food-truck, stand sur marché).",
    sourceName: 'economie.gouv.fr',
    sourceUrl: 'https://www.economie.gouv.fr/entreprises/hygiene-alimentaire-formation-haccp',
  },
  {
    slug: 'fr-domaine-public',
    country: 'FR',
    category: 'Activité',
    title: "Autorisation d'occupation du domaine public (activité ambulante)",
    description:
      "Vendre sur la voie publique, un marché ou un événement nécessite une autorisation d'occupation temporaire (AOT) délivrée par la mairie concernée — à demander directement auprès d'elle, les disponibilités et tarifs variant par commune.",
    sourceName: 'service-public.fr',
    sourceUrl: 'https://entreprendre.service-public.fr/vosdroits/F23509',
  },
  {
    slug: 'fr-rgpd',
    country: 'FR',
    category: 'Données',
    title: 'RGPD si collecte de données clients',
    description:
      "Dès qu'une liste de contacts, un CRM ou un programme de fidélité collecte des données personnelles, les règles RGPD s'appliquent (information des personnes, durée de conservation, sécurité).",
    sourceName: 'cnil.fr',
    sourceUrl: 'https://www.cnil.fr/fr/les-tpe-pme-en-10-questions',
  },
];
