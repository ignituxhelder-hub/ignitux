/**
 * CE QUE CONTIENT « MES DONNÉES », TABLE PAR TABLE.
 *
 * Ce module existe pour une raison précise : les CGU d'Ignitux énumèrent dix
 * catégories de données collectées. Un export qui en oublierait une rendrait
 * ce document faux, et un document faux sur les données personnelles est pire
 * que pas de document du tout — il donne une assurance qui n'existe pas.
 *
 * La liste ci-dessous classe **chaque table du schéma**. Une table est soit
 * exportée dans un groupe, soit exclue avec un motif écrit. Il n'y a pas de
 * troisième possibilité, et `user-data-scope.spec.ts` lit
 * `prisma/schema.prisma` pour vérifier qu'aucun modèle n'y échappe : ajouter
 * une table sans la classer fait échouer les tests. C'est le seul dispositif
 * qui empêche l'export de se périmer en silence à la prochaine migration.
 *
 * Les groupes suivent l'ordre et le découpage des CGU §2.2, pour qu'une
 * personne puisse tenir le document d'une main et son export de l'autre.
 */

export const EXPORT_GROUPS = [
  'compte',
  'projets_et_contenus',
  'contenus_generes_par_igini',
  'relations_professionnelles',
  'facturation',
  'financement',
  'communaute_et_marketplace',
  'journaux_techniques',
] as const;

export type ExportGroup = (typeof EXPORT_GROUPS)[number];

export type TableTreatment =
  | { kind: 'exported'; group: ExportGroup }
  | { kind: 'excluded'; reason: string };

function exported(group: ExportGroup): TableTreatment {
  return { kind: 'exported', group };
}

function excluded(reason: string): TableTreatment {
  return { kind: 'excluded', reason };
}

export const USER_DATA_SCOPE: Readonly<Record<string, TableTreatment>> = {
  users: exported('compte'),
  // Les rôles tenus font partie du compte, pas des données metier : ils ne
  // detiennent rien et disparaissent en cascade avec lui. Les exporter reste
  // utile — ils disent sous quelles casquettes la personne a travaille.
  user_roles: exported('compte'),
  // Le bureau : les applications que la personne a ajoutées ou retirées.
  // Même nature que les rôles — une préférence d'affichage, qui ne détient
  // rien — et exportée pour la même raison : elle l'a choisie.
  user_applications: exported('compte'),
  // Le profil est la donnée la plus personnelle du produit — parcours,
  // motivations, disponibilité. Elle appartient à la personne de la façon
  // la plus directe qui soit : elle l'a écrite sur elle-même.
  user_profiles: exported('compte'),
  // L offre souscrite fait partie du compte : c est une relation
  // contractuelle avec Ignitux, pas une donnee metier du projet. Exportee
  // parce que la personne a le droit de savoir ce qu Ignitux retient de
  // son abonnement — la reference chez le fournisseur de paiement comprise,
  // qui est le seul fil permettant de retrouver ses propres paiements.
  subscriptions: exported('compte'),
  // Vérification d'identité et mandats donnés à Ignitux pour agir comme
  // mandataire : même nature qu'un abonnement, une relation contractuelle
  // avec Ignitux, pas une donnée métier de projet.
  identity_verifications: exported('compte'),
  mandates: exported('compte'),

  projects: exported('projets_et_contenus'),
  tasks: exported('projets_et_contenus'),
  memories: exported('projets_et_contenus'),
  concepts: exported('projets_et_contenus'),
  concept_links: exported('projets_et_contenus'),
  project_collaborators: exported('projets_et_contenus'),
  workflow_definitions: exported('projets_et_contenus'),
  workflow_steps: exported('projets_et_contenus'),
  // Les releves de scores decrivent le projet, pas la personne : ils
  // partent donc avec les contenus du projet. Exportes parce qu ils
  // racontent son evolution, qui est le travail de la personne autant que
  // les taches qu elle a cochees.
  score_snapshots: exported('projets_et_contenus'),

  // Stocks et agenda sont des contenus de travail au même titre que les
  // tâches : mêmes conventions, même groupe, pas de raison d'en distinguer
  // la finalité (fournir le service lui-même) de celle de `tasks`.
  stock_items: exported('projets_et_contenus'),
  stock_movements: exported('projets_et_contenus'),
  agenda_events: exported('projets_et_contenus'),
  // Le dossier de création : l'avancement de la préparation du dépôt, que
  // la personne tient elle-même (pièces cochées, date et référence du dépôt).
  // Un contenu de travail du projet, pas un contenu généré par IGINI.
  creation_filings: exported('projets_et_contenus'),
  // Suivi de flotte : même nature que stocks/agenda, la dépense d'entretien
  // n'en fait pas un enregistrement financier au sens des CGU.
  fleet_vehicles: exported('projets_et_contenus'),
  fleet_entries: exported('projets_et_contenus'),

  analyses: exported('contenus_generes_par_igini'),
  // Les pages que la recherche web d'IGINI a réellement consultées pour
  // étayer une analyse (voir ClaudeService.WebSearchSource) — même groupe
  // que l'analyse elle-même, dont elles ne sont qu'un détail à part.
  analysis_sources: exported('contenus_generes_par_igini'),
  // Le générateur Former et ses trois tables filles (hypothèses,
  // alternatives, sources) — même groupe que les autres contenus générés
  // par IGINI, même raisonnement que analysis_sources ci-dessus.
  legal_form_recommendations: exported('contenus_generes_par_igini'),
  legal_form_assumptions: exported('contenus_generes_par_igini'),
  legal_form_alternatives: exported('contenus_generes_par_igini'),
  legal_form_sources: exported('contenus_generes_par_igini'),
  // Les statuts générés pour un projet : un contenu que la personne a
  // produit via IGINI pour son propre projet, même nature que les autres
  // contenus générés (groupe « contenus_generes_par_igini »), pas une
  // donnée de compte.
  company_bylaws: exported('contenus_generes_par_igini'),
  bylaw_associates: exported('contenus_generes_par_igini'),
  build_plans: exported('contenus_generes_par_igini'),
  financing_plans: exported('contenus_generes_par_igini'),
  development_plans: exported('contenus_generes_par_igini'),
  transmission_plans: exported('contenus_generes_par_igini'),
  // Le fil de conversation avec Igini : contrairement aux cinq lignes
  // ci-dessus, il n'est rattaché à aucun projet (l'orchestrateur est un
  // assistant général), mais il reste un échange avec Igini au même titre.
  chat_messages: exported('contenus_generes_par_igini'),

  crm_companies: exported('relations_professionnelles'),
  crm_contacts: exported('relations_professionnelles'),
  crm_interactions: exported('relations_professionnelles'),

  billing_documents: exported('facturation'),
  billing_lines: exported('facturation'),
  billing_payments: exported('facturation'),

  // Comptabilité et banque. Rattachées au groupe « facturation » parce que
  // les groupes suivent le découpage des CGU §2.2 et qu'en inventer un
  // nouveau ferait diverger l'export du document qu'il est censé refléter.
  // Les clés du fichier exporté, elles, disent précisément ce que c'est.
  //
  // Seules les lignes de la personne sortent : ces tables contiennent aussi
  // les livres d'IGNITUX, qui ne sont les données personnelles de personne.
  // C'est la requête qui filtre sur le propriétaire, pas le classement.
  ledger_accounts: exported('facturation'),
  ledger_entries: exported('facturation'),
  ledger_lines: exported('facturation'),
  bank_accounts: exported('facturation'),
  bank_transactions: exported('facturation'),
  // Relevé manuel d'une caisse certifiée externe, lié à l'écriture comptable
  // qu'il produit : même nature, même groupe que le reste de la compta.
  cash_register_entries: exported('facturation'),
  // Loyers perçus et charges payées sont de vrais mouvements d'argent, au
  // même titre que la caisse ou la banque.
  real_estate_properties: exported('facturation'),
  real_estate_movements: exported('facturation'),
  // Le budget publicitaire dépensé est un enregistrement financier, même
  // motif.
  ad_campaigns: exported('facturation'),
  ad_campaign_entries: exported('facturation'),

  financing_rounds: exported('financement'),
  equity_holders: exported('financement'),
  equity_events: exported('financement'),
  dividend_distributions: exported('financement'),
  buyback_objectives: exported('financement'),
  // L'accord de participation IGNITUX d'un projet, ses paliers et le droit
  // sur les dividendes constaté : trois tables, une seule catégorie. Elles
  // sortent ensemble (l'accord porte ses paliers et ses lignes), séparément
  // des parts de capital, parce que le droit économique n'est pas du capital.
  participation_agreements: exported('financement'),
  participation_milestones: exported('financement'),
  dividend_right_entries: exported('financement'),

  // Investissements. Seules les lignes de la personne sortent : ces tables
  // contiennent aussi celles des autres investisseurs des mêmes projets.
  //
  // À la suppression du compte, rien n'est effacé et tout est détaché :
  // l'argent est réellement entré dans les projets d'autres personnes, et
  // effacer ses participations falsifierait leurs registres. Le fait reste,
  // l'identité part. Voir investors-deletion.ts.
  investors: exported('financement'),
  financed_projects: exported('financement'),
  participations: exported('financement'),
  investor_movements: exported('financement'),

  community_comments: exported('communaute_et_marketplace'),
  marketplace_profiles: exported('communaute_et_marketplace'),
  marketplace_contacts: exported('communaute_et_marketplace'),

  workflow_runs: exported('journaux_techniques'),
  workflow_events: exported('journaux_techniques'),
  automation_runs: exported('journaux_techniques'),
  project_compliance_checks: exported('journaux_techniques'),
  project_compliance_ai_runs: exported('journaux_techniques'),
  constitution_violations: exported('journaux_techniques'),
  ai_usage_events: exported('journaux_techniques'),

  // — Exclusions, chacune motivée —

  auth_tokens: excluded(
    "Jetons de sécurité à usage unique (réinitialisation de mot de passe, vérification d'email). " +
      "Seul leur hash est stocké : te le remettre ne t'apprendrait rien et reviendrait à recopier " +
      'du matériel de sécurité dans un fichier qui circulera par email ou par clé USB.',
  ),
  compliance_requirements: excluded(
    "Liste des démarches réglementaires proposée par Ignitux. Elle est identique pour tout le " +
      "monde et ne te concerne pas personnellement — ce que tu as coché, en revanche, est bien " +
      'dans ton export.',
  ),
  constitution_articles: excluded(
    'Texte de la Constitution Ignitux. Document public, identique pour tout le monde.',
  ),
  shopify_connections: excluded(
    "Jeton d'accès Shopify, chiffré au repos. Même motif que auth_tokens : le remettre " +
      "chiffré n'apprendrait rien à la personne, et une éventuelle fuite de l'export ne doit " +
      'pas non plus faire circuler du matériel de sécurité. Le domaine de la boutique et le ' +
      "forfait déclaré restent visibles depuis l'écran Boutique en ligne lui-même.",
  ),
};

/** Les tables réellement écrites dans le fichier d'export. */
export function exportedTables(): string[] {
  return Object.keys(USER_DATA_SCOPE).filter(
    (table) => USER_DATA_SCOPE[table].kind === 'exported',
  );
}

/** Ce que l'export ne contient pas, et pourquoi — écrit dans le fichier lui-même. */
export function exclusions(): Array<{ donnees: string; pourquoi: string }> {
  return Object.entries(USER_DATA_SCOPE)
    .filter(([, treatment]) => treatment.kind === 'excluded')
    .map(([table, treatment]) => ({
      donnees: table,
      pourquoi: (treatment as { kind: 'excluded'; reason: string }).reason,
    }));
}
