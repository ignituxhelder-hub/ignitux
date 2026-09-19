import { ForbiddenException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { exclusions } from './user-data-scope.js';

/**
 * DROIT D'ACCÈS ET DROIT À L'EFFACEMENT.
 *
 * Les CGU d'Ignitux énumèrent dix catégories de données collectées. Jusqu'ici
 * aucune route ne permettait ni de les récupérer, ni de les effacer : le
 * document annonçait des droits que le code ne savait pas exercer. C'est le
 * même défaut que la traçabilité IA qui existait en base sans être affichée —
 * une promesse tenue à moitié.
 *
 * Deux principes gouvernent ce service :
 *
 *   1. **l'export dit aussi ce qu'il ne contient pas.** Un fichier qui se
 *      présente comme « toutes tes données » sans lister ses exclusions ment
 *      par omission. Les motifs viennent de `user-data-scope.ts` ;
 *   2. **la suppression s'annonce avant de s'exécuter.** L'article 8 de la
 *      Constitution interdit d'engager une action irréversible sans
 *      validation humaine. On montre donc d'abord ce qui va disparaître,
 *      y compris ce que la personne pourrait avoir l'obligation légale de
 *      conserver.
 */
@Injectable()
export class UserDataService {
  constructor(private readonly prisma: PrismaService) {}

  /** Identifiants des projets dont la personne est propriétaire. */
  private async ownedProjectIds(userId: string): Promise<string[]> {
    const projects = await this.prisma.projects.findMany({
      where: { owner_id: userId },
      select: { id: true },
    });
    return projects.map((project) => project.id);
  }

  async exportUserData(userId: string) {
    const row = await this.prisma.users.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, email_verified_at: true, created_at: true },
    });

    // Deux protections plutôt qu'une sur le champ le plus dangereux du
    // projet. Le `select` ci-dessus suffirait aujourd'hui, mais il suffirait
    // qu'on l'élargisse un jour — pour ajouter un champ — pour que le hash
    // du mot de passe parte dans un fichier destiné à circuler par email.
    // Recomposer l'objet explicitement rend cet accident impossible :
    // seul ce qui est écrit ici sort.
    const compte = {
      id: row.id,
      email: row.email,
      email_verifie_le: row.email_verified_at,
      compte_cree_le: row.created_at,
    };

    const projectIds = await this.ownedProjectIds(userId);
    const byProject = { project_id: { in: projectIds } };

    const [projects, concepts, contacts, documents, workflows, profile] = await Promise.all([
      this.prisma.projects.findMany({ where: { owner_id: userId } }),
      this.prisma.concepts.findMany({ where: { user_id: userId } }),
      this.prisma.crm_contacts.findMany({ where: { owner_id: userId } }),
      this.prisma.billing_documents.findMany({ where: { owner_id: userId } }),
      this.prisma.workflow_definitions.findMany({ where: byProject }),
      this.prisma.marketplace_profiles.findUnique({ where: { user_id: userId } }),
    ]);

    const conceptIds = concepts.map((concept) => concept.id);
    const contactIds = contacts.map((contact) => contact.id);
    const documentIds = documents.map((document) => document.id);
    const workflowIds = workflows.map((workflow) => workflow.id);

    const runs = await this.prisma.workflow_runs.findMany({ where: byProject });
    const runIds = runs.map((run) => run.id);

    const [
      tasks,
      memories,
      conceptLinks,
      collaborationsMine,
      collaboratorsInvited,
      workflowSteps,
      analyses,
      buildPlans,
      financingPlans,
      developmentPlans,
      transmissionPlans,
      companies,
      interactions,
      lines,
      payments,
      rounds,
      holders,
      equityEvents,
      dividends,
      buybackObjectives,
      comments,
      contactsSent,
      contactsReceived,
      workflowEvents,
      automationRuns,
      complianceChecks,
      violations,
    ] = await Promise.all([
      this.prisma.tasks.findMany({ where: byProject }),
      this.prisma.memories.findMany({ where: { user_id: userId } }),
      this.prisma.concept_links.findMany({ where: { from_concept_id: { in: conceptIds } } }),
      this.prisma.project_collaborators.findMany({ where: { user_id: userId } }),
      this.prisma.project_collaborators.findMany({ where: byProject }),
      this.prisma.workflow_steps.findMany({ where: { workflow_id: { in: workflowIds } } }),
      this.prisma.analyses.findMany({ where: byProject }),
      this.prisma.build_plans.findMany({ where: byProject }),
      this.prisma.financing_plans.findMany({ where: byProject }),
      this.prisma.development_plans.findMany({ where: byProject }),
      this.prisma.transmission_plans.findMany({ where: byProject }),
      this.prisma.crm_companies.findMany({ where: { owner_id: userId } }),
      this.prisma.crm_interactions.findMany({ where: { contact_id: { in: contactIds } } }),
      this.prisma.billing_lines.findMany({ where: { document_id: { in: documentIds } } }),
      this.prisma.billing_payments.findMany({ where: { document_id: { in: documentIds } } }),
      this.prisma.financing_rounds.findMany({ where: byProject }),
      this.prisma.equity_holders.findMany({ where: byProject }),
      this.prisma.equity_events.findMany({ where: byProject }),
      this.prisma.dividend_distributions.findMany({ where: byProject }),
      this.prisma.buyback_objectives.findMany({ where: byProject }),
      this.prisma.community_comments.findMany({ where: { author_id: userId } }),
      this.prisma.marketplace_contacts.findMany({ where: { from_user_id: userId } }),
      profile
        ? this.prisma.marketplace_contacts.findMany({ where: { to_profile_id: profile.id } })
        : Promise.resolve([]),
      this.prisma.workflow_events.findMany({ where: { run_id: { in: runIds } } }),
      this.prisma.automation_runs.findMany({ where: byProject }),
      this.prisma.project_compliance_checks.findMany({ where: byProject }),
      this.prisma.constitution_violations.findMany({ where: { user_id: userId } }),
    ]);

    return {
      genere_le: new Date().toISOString(),
      a_propos_de_ce_fichier:
        "Cet export contient les données qu'Ignitux détient à ton sujet, dans les mêmes " +
        'catégories que celles annoncées par les Conditions Générales (§2.2).',
      avertissement:
        'Ce fichier contient des données personnelles, y compris celles de tiers que tu as ' +
        'saisies toi-même (contacts, clients, détenteurs de parts). En le téléchargeant tu en ' +
        'deviens le gardien : conserve-le comme tu conserverais ces informations elles-mêmes, ' +
        "et ne le transmets pas plus largement qu'elles.",
      donnees: {
        compte,
        projets_et_contenus: {
          projets: projects,
          taches: tasks,
          memoire: memories,
          concepts,
          liens_entre_concepts: conceptLinks,
          projets_ou_je_suis_collaborateur: collaborationsMine,
          collaborateurs_que_j_ai_invites: collaboratorsInvited,
          processus: workflows,
          etapes_de_processus: workflowSteps,
        },
        contenus_generes_par_igini: {
          analyses,
          plans_de_construction: buildPlans,
          plans_de_financement: financingPlans,
          plans_de_developpement: developmentPlans,
          plans_de_transmission: transmissionPlans,
        },
        relations_professionnelles: {
          entreprises: companies,
          contacts,
          echanges: interactions,
        },
        facturation: {
          documents,
          lignes: lines,
          reglements: payments,
        },
        financement: {
          apports: rounds,
          detenteurs_de_parts: holders,
          evenements_de_repartition: equityEvents,
          dividendes_verses: dividends,
          objectifs_de_rachat: buybackObjectives,
        },
        communaute_et_marketplace: {
          commentaires: comments,
          mon_profil: profile,
          messages_envoyes: contactsSent,
          messages_recus: contactsReceived,
        },
        journaux_techniques: {
          executions_de_processus: runs,
          evenements_de_processus: workflowEvents,
          executions_de_l_automatisation: automationRuns,
          demarches_de_conformite_cochees: complianceChecks,
          violations_constitutionnelles: violations,
        },
      },
      non_inclus: exclusions(),
    };
  }

  /**
   * Ce que la suppression détruira, annoncé avant de la lancer.
   *
   * Les avertissements ne sont pas décoratifs : deux d'entre eux portent sur
   * des conséquences que la personne ne peut pas deviner — une obligation
   * légale de conservation qui lui incombe, et un effet sur des tiers.
   */
  async previewDeletion(userId: string) {
    const projectIds = await this.ownedProjectIds(userId);
    const byProject = { project_id: { in: projectIds } };

    const [
      projects,
      issuedDocuments,
      draftDocuments,
      contacts,
      companies,
      memories,
      concepts,
      tasks,
      comments,
      contactsSent,
      collaborationsMine,
      collaboratorsInvited,
      holders,
    ] = await Promise.all([
      this.prisma.projects.count({ where: { owner_id: userId } }),
      this.prisma.billing_documents.count({
        where: { owner_id: userId, status: { not: 'brouillon' } },
      }),
      this.prisma.billing_documents.count({ where: { owner_id: userId, status: 'brouillon' } }),
      this.prisma.crm_contacts.count({ where: { owner_id: userId } }),
      this.prisma.crm_companies.count({ where: { owner_id: userId } }),
      this.prisma.memories.count({ where: { user_id: userId } }),
      this.prisma.concepts.count({ where: { user_id: userId } }),
      this.prisma.tasks.count({ where: byProject }),
      this.prisma.community_comments.count({ where: { author_id: userId } }),
      this.prisma.marketplace_contacts.count({ where: { from_user_id: userId } }),
      this.prisma.project_collaborators.count({ where: { user_id: userId } }),
      this.prisma.project_collaborators.count({ where: byProject }),
      this.prisma.equity_holders.count({ where: byProject }),
    ]);

    const warnings: string[] = [];

    if (issuedDocuments > 0) {
      warnings.push(
        `Tu as émis ${issuedDocuments} document(s) de facturation. En France, une facture ` +
          'émise doit être conservée dix ans, et cette obligation te concerne, pas Ignitux : ' +
          'télécharge ton export avant de supprimer ton compte.',
      );
    }

    if (contacts > 0 || companies > 0) {
      warnings.push(
        `Les ${contacts} contact(s) et ${companies} entreprise(s) de ton CRM seront supprimés. ` +
          "C'est une bonne chose pour les personnes concernées, et cela signifie aussi que tu " +
          'perdras leurs coordonnées définitivement.',
      );
    }

    if (contactsSent > 0) {
      warnings.push(
        `Les ${contactsSent} message(s) que tu as envoyés via la mise en relation disparaîtront ` +
          'aussi chez leurs destinataires, qui les avaient pourtant reçus.',
      );
    }

    if (collaborationsMine > 0) {
      warnings.push(
        `Tu es collaborateur sur ${collaborationsMine} projet(s) appartenant à quelqu'un ` +
          "d'autre. Ces projets ne seront pas supprimés — tu perdras simplement leur accès.",
      );
    }

    if (collaboratorsInvited > 0) {
      warnings.push(
        `${collaboratorsInvited} personne(s) que tu as invitée(s) sur tes projets perdront ` +
          'leur accès, puisque les projets eux-mêmes seront supprimés.',
      );
    }

    if (holders > 0) {
      warnings.push(
        `L'historique de répartition du capital de tes projets (${holders} détenteur(s) de ` +
          'parts) sera supprimé. Si cet historique a une valeur juridique pour toi, exporte-le ' +
          "avant : Ignitux n'en garde aucune copie.",
      );
    }

    return {
      compte_supprime_definitivement: true,
      resume: {
        projets: projects,
        taches: tasks,
        souvenirs: memories,
        concepts,
        contacts_crm: contacts,
        entreprises_crm: companies,
        documents_de_facturation_emis: issuedDocuments,
        documents_de_facturation_en_brouillon: draftDocuments,
        commentaires_communaute: comments,
      },
      avertissements: warnings,
      journal_constitutionnel:
        "Les entrées du journal des violations qui te concernent ne sont pas supprimées mais " +
        "rendues anonymes : ton identifiant en est retiré. Le fait reste consultable, la " +
        'personne disparaît.',
    };
  }

  /**
   * Supprime définitivement le compte. Exige le mot de passe : une action
   * irréversible ne doit pas pouvoir être déclenchée par un simple jeton
   * volé ou un onglet resté ouvert.
   *
   * 403 et non 401 : un 401 déclenche la déconnexion automatique côté
   * frontend, et un mot de passe mal tapé déconnecterait la personne au
   * lieu de lui afficher une erreur (même raison que pour le changement de
   * mot de passe).
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.users.findUniqueOrThrow({ where: { id: userId } });

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new ForbiddenException('Mot de passe incorrect.');
    }

    // `constitution_violations` n'a pas de clé étrangère vers `users` : rien
    // ne cascade, et l'identifiant survivrait à la suppression du compte.
    // On garde la ligne — le journal est ce qui rend l'article 8 vérifiable —
    // mais on en retire la personne. Le fait reste, l'identité part.
    await this.prisma.$transaction([
      this.prisma.constitution_violations.updateMany({
        where: { user_id: userId },
        data: { user_id: null },
      }),
      // Tout le reste part en cascade depuis `users` (voir schema.prisma).
      this.prisma.users.delete({ where: { id: userId } }),
    ]);
  }
}
