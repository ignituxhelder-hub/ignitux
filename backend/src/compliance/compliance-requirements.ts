/**
 * Contenu de référence pour la France, rédigé à partir de sources publiques
 * officielles citées ligne par ligne (source_name/source_url). Volontairement
 * générique : pas de chiffres précis qui changent chaque année (seuils de
 * TVA, plafonds de chiffre d'affaires, tarifs, durées de formation…) car ils
 * seraient rapidement faux — chaque item renvoie plutôt vers la source qui
 * les tient à jour.
 *
 * Ce n'est PAS un avis juridique : voir le message d'avertissement renvoyé
 * par ComplianceService.listRequirements() et affiché côté frontend. En cas
 * de doute, un expert-comptable ou un avocat reste la seule source fiable
 * pour une situation réelle.
 *
 * ## Les liens pourrissent, et c'est le pire défaut possible ici
 *
 * Au 20 septembre 2026, chaque lien a été ouvert et lu. Il le fallait :
 * sept des douze liens d'origine renvoyaient un 404, un huitième pointait
 * vers le mauvais sujet, et rien ne le signalait. Le domaine
 * `service-public.fr` a migré vers `service-public.gouv.fr` et plusieurs
 * fiches ont changé d'identifiant en chemin.
 *
 * Une source morte est pire qu'une source absente : elle a l'air vérifiée.
 * D'où `verifiedOn` sur chaque item, et le test qui refuse un lien vers un
 * domaine dont on sait qu'il a déménagé.
 *
 * ## Les secteurs trient, ils ne filtrent pas
 *
 * `sectors` vide = la démarche concerne toute activité. Sinon elle remonte
 * pour les projets du secteur et descend pour les autres — sans jamais
 * disparaître. Le raisonnement est dans compliance-pertinence.ts.
 */
export interface ComplianceRequirementSeed {
  slug: string;
  country: string;
  category: string;
  title: string;
  description: string;
  sourceName: string;
  sourceUrl: string;
  /**
   * Les secteurs explicitement visés. Vide = toute activité.
   *
   * Les valeurs viennent de SECTEURS (profile-fields.ts) : un secteur qui
   * n'y figure pas ne serait jamais sélectionnable, donc jamais pertinent.
   * Le test le vérifie.
   */
  sectors: readonly string[];
  /** Jour où la source a été ouverte et lue. Format ISO. */
  verifiedOn: string;
}

/** Le jour de la dernière campagne de vérification des liens. */
export const DERNIERE_VERIFICATION = '2026-09-20';

export const COMPLIANCE_REQUIREMENTS_FR: ComplianceRequirementSeed[] = [
  {
    slug: 'fr-statut-juridique',
    country: 'FR',
    category: 'Création',
    title: 'Choisir un statut juridique',
    description:
      "Entreprise individuelle (dont micro-entreprise) ou société (EURL, SASU, SARL, SAS…) : le choix détermine le régime fiscal, social et la responsabilité sur les biens personnels. À comparer avant toute immatriculation.",
    sourceName: 'entreprendre.service-public.gouv.fr',
    sourceUrl: 'https://entreprendre.service-public.gouv.fr/vosdroits/F23844',
    sectors: [],
    verifiedOn: DERNIERE_VERIFICATION,
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
    sectors: [],
    verifiedOn: DERNIERE_VERIFICATION,
  },
  {
    slug: 'fr-siren-siret',
    country: 'FR',
    category: 'Création',
    title: 'Obtenir un numéro SIREN/SIRET',
    description:
      "Attribué par l'INSEE après immatriculation via le guichet unique, où le numéro est mis à disposition dans l'espace du déclarant. Nécessaire pour facturer, ouvrir un compte pro et répondre à certains appels d'offres.",
    sourceName: 'insee.fr',
    sourceUrl: 'https://www.insee.fr/fr/information/1401387',
    sectors: [],
    verifiedOn: DERNIERE_VERIFICATION,
  },
  {
    slug: 'fr-affiliation-urssaf',
    country: 'FR',
    category: 'Social',
    title: 'Affiliation et déclarations sociales (URSSAF)',
    description:
      "Déclarer et payer ses cotisations sociales (micro-entrepreneur : déclaration périodique du chiffre d'affaires auprès de l'URSSAF, obligatoire même à zéro ; autres statuts : régime social du dirigeant à vérifier selon la forme choisie).",
    sourceName: 'entreprendre.service-public.gouv.fr',
    sourceUrl: 'https://entreprendre.service-public.gouv.fr/vosdroits/F36232',
    sectors: [],
    verifiedOn: DERNIERE_VERIFICATION,
  },
  {
    slug: 'fr-regime-fiscal',
    country: 'FR',
    category: 'Fiscalité',
    title: 'Choisir et déclarer son régime fiscal',
    description:
      "Impôt sur le revenu ou impôt sur les sociétés, régime micro ou réel : le régime conditionne les obligations comptables et les déclarations à produire.",
    sourceName: 'impots.gouv.fr',
    sourceUrl: 'https://www.impots.gouv.fr/professionnel',
    sectors: [],
    verifiedOn: DERNIERE_VERIFICATION,
  },
  {
    slug: 'fr-tva',
    country: 'FR',
    category: 'Fiscalité',
    title: 'Vérifier son régime de TVA',
    description:
      "Franchise en base, régime simplifié ou régime réel normal : le régime dépend du chiffre d'affaires et de la nature de l'activité, et détermine s'il faut facturer la TVA et la déclarer. Les seuils changent — se référer à la source.",
    sourceName: 'impots.gouv.fr',
    sourceUrl: 'https://www.impots.gouv.fr/professionnel/les-regimes-dimposition-la-tva',
    sectors: [],
    verifiedOn: DERNIERE_VERIFICATION,
  },
  {
    slug: 'fr-compte-bancaire-dedie',
    country: 'FR',
    category: 'Finances',
    title: "Ouvrir un compte bancaire dédié à l'activité",
    description:
      "Séparer les flux professionnels des flux personnels. Ce n'est pas toujours obligatoire — pour un micro-entrepreneur cela le devient au-delà d'un certain chiffre d'affaires maintenu dans le temps — mais un compte dédié simplifie la comptabilité et les contrôles.",
    sourceName: 'entreprendre.service-public.gouv.fr',
    sourceUrl: 'https://entreprendre.service-public.gouv.fr/vosdroits/F35991',
    sectors: [],
    verifiedOn: DERNIERE_VERIFICATION,
  },
  {
    slug: 'fr-assurance-rc-pro',
    country: 'FR',
    category: 'Assurance',
    title: 'Vérifier si une assurance professionnelle est obligatoire',
    description:
      "Obligatoire pour certaines activités (santé, bâtiment, professions réglementées, véhicules, locaux loués), vivement conseillée sinon. À vérifier avant le premier client, pas après le premier sinistre.",
    sourceName: 'entreprendre.service-public.gouv.fr',
    sourceUrl: 'https://entreprendre.service-public.gouv.fr/vosdroits/F37365',
    sectors: [],
    verifiedOn: DERNIERE_VERIFICATION,
  },
  {
    slug: 'fr-activite-reglementee',
    country: 'FR',
    category: 'Activité',
    title: "Vérifier si l'activité est réglementée",
    description:
      "Plus de 250 professions sont réglementées : artisanat, restauration, santé, transport, immobilier… Elles exigent une qualification, un diplôme ou une autorisation avant de pouvoir exercer légalement. À vérifier avant le démarrage.",
    sourceName: 'entreprendre.service-public.gouv.fr',
    sourceUrl: 'https://entreprendre.service-public.gouv.fr/vosdroits/F35897',
    sectors: [],
    verifiedOn: DERNIERE_VERIFICATION,
  },
  {
    slug: 'fr-hygiene-alimentaire',
    country: 'FR',
    category: 'Activité',
    title: "Règles d'hygiène alimentaire et formation du personnel",
    description:
      "Restauration commerciale et commerces alimentaires : locaux, chaîne du froid, traçabilité, et au moins une personne formée à l'hygiène alimentaire dans l'établissement. La manipulation de denrées d'origine animale demande en plus une déclaration avant ouverture.",
    sourceName: 'entreprendre.service-public.gouv.fr',
    sourceUrl: 'https://entreprendre.service-public.gouv.fr/vosdroits/F32189',
    sectors: ['Restauration', 'Commerce', 'Agriculture'],
    verifiedOn: DERNIERE_VERIFICATION,
  },
  {
    slug: 'fr-domaine-public',
    country: 'FR',
    category: 'Activité',
    title: 'Carte et autorisations pour une activité ambulante',
    description:
      "Vendre sur un marché, la voie publique ou en tournée demande une autorisation d'occupation temporaire délivrée par la commune, et le plus souvent une carte d'activité ambulante à demander auprès de la CCI ou de la CMA. Les disponibilités et tarifs varient par commune.",
    sourceName: 'entreprendre.service-public.gouv.fr',
    sourceUrl: 'https://entreprendre.service-public.gouv.fr/vosdroits/F21856',
    sectors: ['Commerce', 'Restauration', 'Artisanat'],
    verifiedOn: DERNIERE_VERIFICATION,
  },
  {
    slug: 'fr-rgpd',
    country: 'FR',
    category: 'Données',
    title: 'RGPD si collecte de données clients',
    description:
      "Dès qu'une liste de contacts, un CRM ou un programme de fidélité collecte des données personnelles, les règles RGPD s'appliquent (registre des traitements, information des personnes, durée de conservation, sécurité, notification en cas de violation).",
    sourceName: 'cnil.fr',
    sourceUrl: 'https://www.cnil.fr/fr/tpe-et-pme',
    sectors: [],
    verifiedOn: DERNIERE_VERIFICATION,
  },
];
