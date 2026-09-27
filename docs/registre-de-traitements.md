# Registre des traitements — Ignitux

26 septembre 2026.

Ce document est le registre interne des traitements (RGPD art. 30) : il liste
ce qu'Ignitux traite, pourquoi, sur quelle base légale et pour combien de
temps. **Ce n'est pas la page de confidentialité publique** — ce texte-là
n'existe pas encore sous forme de page web (voir point 12 de
[`reste-a-faire.md`](reste-a-faire.md)) et le seul document existant à ce
jour est un `.docx` privé, hors dépôt. Ce registre-ci est un document
technique interne, à usage d'audit.

Il est dérivé **table par table** de
[`backend/src/users/user-data-scope.ts`](../backend/src/users/user-data-scope.ts),
qui classe chaque table du schéma Prisma dans un groupe exporté ou une
exclusion motivée. `user-data-scope.spec.ts` fait échouer les tests si une
table du schéma n'y est pas classée : c'est ce qui empêche ce registre de se
périmer en silence à la prochaine migration. La base légale et la durée de
conservation, en revanche, ne sont pas dans le code — elles sont écrites ici
à la main, à partir de ce que `user-data.service.ts` fait réellement (export,
aperçu de suppression, suppression).

Sauf mention contraire, **Ignitux est responsable du traitement**. Pour les
données de tiers qu'une personne saisit elle-même (contacts CRM, détenteurs
de parts, destinataires d'un message) Ignitux agit comme **sous-traitant** :
la personne qui les a saisies en est responsable, comme le rappelle déjà
l'avertissement affiché avant l'export (`frontend/src/app/account/page.tsx`).

---

## 1. Compte — groupe `compte`

**Tables :** `users`, `user_roles`, `user_applications`, `user_profiles`, `subscriptions`

- **Finalité :** créer et faire fonctionner le compte (identification, rôles tenus, applications activées sur le bureau, abonnement souscrit).
- **Base légale :** exécution du contrat (art. 6.1.b).
- **Durée de conservation :** tant que le compte existe. Supprimée intégralement et immédiatement à la demande de suppression (`DELETE /users/me`), sans période de grâce ni copie de sauvegarde conservée par Ignitux.

## 2. Projets et contenus — groupe `projets_et_contenus`

**Tables :** `projects`, `tasks`, `memories`, `concepts`, `concept_links`, `project_collaborators`, `workflow_definitions`, `workflow_steps`, `score_snapshots`, `stock_items`, `stock_movements`, `agenda_events`, `fleet_vehicles`, `fleet_entries`

- **Finalité :** fournir le service lui-même — les projets, leurs tâches, la mémoire et le graphe de connaissances d'IGINI, les processus, les relevés de score, les stocks, l'agenda et le suivi de flotte.
- **Base légale :** exécution du contrat.
- **Durée de conservation :** tant que le projet existe. Supprimée avec le projet ou avec le compte de son propriétaire.

## 3. Contenus générés par IGINI — groupe `contenus_generes_par_igini`

**Tables :** `analyses`, `build_plans`, `financing_plans`, `development_plans`, `transmission_plans`

- **Finalité :** conserver les résultats des cinq générateurs IA (Découvrir, Construire, Financer, Développer, Transmettre), demandés explicitement par la personne.
- **Base légale :** exécution du contrat.
- **Durée de conservation :** idem groupe 2 — supprimée avec le projet.

## 4. Relations professionnelles — groupe `relations_professionnelles`

**Tables :** `crm_companies`, `crm_contacts`, `crm_interactions`

- **Finalité :** permettre à la personne de gérer son propre CRM (entreprises, contacts, échanges).
- **Base légale :** exécution du contrat entre Ignitux et l'utilisateur. Pour les coordonnées des tiers (contacts, entreprises) qu'il saisit lui-même, Ignitux est **sous-traitant** : c'est l'utilisateur qui décide de leur collecte et en répond.
- **Durée de conservation :** tant que le compte existe. Supprimée intégralement à la suppression du compte — la personne est prévenue avant que ça n'arrive, puisque les tiers concernés perdent alors leurs coordonnées sans recours.

## 5. Facturation, comptabilité et banque — groupe `facturation`

**Tables :** `billing_documents`, `billing_lines`, `billing_payments`, `ledger_accounts`, `ledger_entries`, `ledger_lines`, `bank_accounts`, `bank_transactions`, `cash_register_entries`, `real_estate_properties`, `real_estate_movements`, `ad_campaigns`, `ad_campaign_entries`

- **Finalité :** facturer les clients de la personne, tenir sa comptabilité, suivre ses comptes bancaires, ses biens immobiliers (loyers, charges) et ses dépenses publicitaires. (Les livres d'Ignitux elle-même partagent ces tables mais n'appartiennent à aucun utilisateur — ils sont filtrés hors de l'export et de la suppression par propriétaire.)
- **Base légale :** exécution du contrat. La conservation légale de dix ans des factures émises (Code de commerce) est une **obligation qui incombe à la personne**, pas à Ignitux — c'est pourquoi l'aperçu de suppression (`previewDeletion`) l'avertit explicitement de télécharger son export avant de supprimer son compte.
- **Durée de conservation :** Ignitux ne conserve rien au-delà de la vie du compte — tout part avec lui (`deleteAccount` supprime la comptabilité de la personne en totalité, sans anonymisation). Passé ce moment, la conservation légale de dix ans, si elle s'applique, redevient la responsabilité de la personne sur son propre export.

## 6. Financement — groupe `financement`

**Tables :** `financing_rounds`, `equity_holders`, `equity_events`, `dividend_distributions`, `buyback_objectives`, `investors`, `financed_projects`, `participations`, `investor_movements`

- **Finalité :** suivre le capital d'un projet (tours de table, détenteurs de parts, dividendes, objectifs de rachat) et, côté investisseur, ce qui a été placé et ce qui en est revenu.
- **Base légale :** exécution du contrat pour la personne elle-même ; intérêt légitime des tiers dont l'argent est réellement engagé dans un projet financé, pour les données qui les concernent.
- **Durée de conservation — deux régimes différents dans ce même groupe :**
  - `financing_rounds`, `equity_holders`, `equity_events`, `dividend_distributions`, `buyback_objectives` sont rattachées au projet et supprimées avec lui.
  - `investors`, `financed_projects`, `participations`, `investor_movements` **ne sont pas supprimées** à la suppression du compte : l'argent est réellement entré dans les projets d'autres personnes, et l'effacer falsifierait leurs registres. Seule l'identité est détachée ; le fait (montants, dates, mouvements) reste. Voir `investors-deletion.ts`.

## 7. Communauté et marketplace — groupe `communaute_et_marketplace`

**Tables :** `community_comments`, `marketplace_profiles`, `marketplace_contacts`

- **Finalité :** commentaires publics, profil visible sur la marketplace, mise en relation entre porteurs de projet et investisseurs.
- **Base légale :** exécution du contrat — ces fonctionnalités sont activées volontairement par la personne (voir le principe d'activation progressive, `docs/ignitux-os.md`).
- **Durée de conservation :** supprimée avec le compte. Un message envoyé à un tiers disparaît alors aussi de sa boîte de réception — la personne en est prévenue avant de supprimer son compte.

## 8. Journaux techniques — groupe `journaux_techniques`

**Tables :** `workflow_runs`, `workflow_events`, `automation_runs`, `project_compliance_checks`, `constitution_violations`, `ai_usage_events`

- **Finalité :** traçabilité des automatisations et de leurs échecs, contrôle constitutionnel (l'article 8), suivi de ce que les générateurs IGINI ont réellement consommé.
- **Base légale :** intérêt légitime (sécurité, fiabilité du service, comptabilité vérifiable des coûts déjà facturés par le fournisseur d'IA).
- **Durée de conservation — deux régimes différents dans ce même groupe :**
  - `workflow_runs`, `workflow_events`, `automation_runs`, `project_compliance_checks` sont rattachées au projet et supprimées avec lui.
  - `constitution_violations` et `ai_usage_events` **ne sont pas supprimées** à la suppression du compte, faute de clé étrangère cascadante vers `users` — et ce n'est pas un oubli : elles sont **anonymisées** (l'identifiant utilisateur est mis à `null`). Le fait reste consultable pour l'audit et pour que le total mensuel des coûts IA déjà facturés ne change pas rétroactivement ; la personne, elle, en disparaît.

---

## Ce qu'Ignitux ne collecte pas dans cet export, et pourquoi

Dérivé de `exclusions()` dans `user-data-scope.ts` :

- **`auth_tokens`** — jetons de sécurité à usage unique (réinitialisation de mot de passe, vérification d'email). Seul leur hash est stocké ; les montrer n'apprendrait rien à la personne et reviendrait à faire circuler du matériel de sécurité.
- **`compliance_requirements`** — liste des démarches réglementaires proposées par Ignitux, identique pour tout le monde. Ce que la personne a coché, en revanche, fait partie de son export (`project_compliance_checks`, groupe 8).
- **`constitution_articles`** — texte de la Constitution Ignitux, document public identique pour tout le monde.
- **`shopify_connections`** — jeton d'accès Shopify, chiffré au repos. Même motif que `auth_tokens` : le remettre chiffré n'apprendrait rien, et une fuite de l'export ne doit pas faire circuler du matériel de sécurité. Le domaine de la boutique et le forfait déclaré restent visibles depuis l'écran Boutique en ligne.

## Ce que ce registre n'est pas

Il ne remplace ni n'annonce :
- **un bandeau de consentement aux cookies** — Ignitux n'en pose aucun (voir la note « Cookies et stockage local » sur `/account`) ;
- **la page de confidentialité publique** — elle n'existe pas encore en dehors du `.docx` privé mentionné plus haut ; sa rédaction est une décision séparée, hors code ;
- **un avis juridique** — c'est un document d'audit interne, pas un texte à faire signer.

## Tenue à jour

Ce registre suit `user-data-scope.ts` pour la liste des tables et leur
groupe : toute nouvelle table doit d'abord y être classée (les tests l'exigent).
La base légale et la durée de conservation de chaque groupe, en revanche, sont
à revoir à la main si le comportement de `user-data.service.ts` change —
notamment `deleteAccount`, seule source de vérité sur ce qui est réellement
supprimé, détaché ou anonymisé.
