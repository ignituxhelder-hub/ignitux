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

  analyses: exported('contenus_generes_par_igini'),
  build_plans: exported('contenus_generes_par_igini'),
  financing_plans: exported('contenus_generes_par_igini'),
  development_plans: exported('contenus_generes_par_igini'),
  transmission_plans: exported('contenus_generes_par_igini'),

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

  financing_rounds: exported('financement'),
  equity_holders: exported('financement'),
  equity_events: exported('financement'),
  dividend_distributions: exported('financement'),
  buyback_objectives: exported('financement'),

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
