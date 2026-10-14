# Registre des traitements — Ignitux

26 septembre 2026 — mis à jour le 11 octobre 2026 (traitements 9 à 19, prestataires).

Ce document est le registre interne des traitements (RGPD art. 30) : il liste
ce qu'Ignitux traite, pourquoi, sur quelle base légale et pour combien de
temps. **Ce n'est pas la page de confidentialité publique** — celle-ci est
publiée sur `/confidentialite` (`frontend/src/app/confidentialite/page.tsx`)
et doit rester cohérente avec ce registre. Ce registre-ci est un document
technique interne, à usage d'audit.

Les bases légales marquées « à préciser » n'ont pas été arrêtées : elles ne
doivent pas être reprises dans un texte public tant qu'elles ne le sont pas.

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

**Tables :** `users`, `user_roles`, `user_applications`, `user_profiles`, `subscriptions` (et `identity_verifications`, `mandates`, classées dans ce groupe d'export mais décrites à part : traitements 9 et 10)

- **Finalité :** créer et faire fonctionner le compte (identification, rôles tenus, applications activées sur le bureau, abonnement souscrit). L'acceptation des CGU, enregistrée dans `users`, est décrite au traitement 16.
- **Base légale :** exécution du contrat (art. 6.1.b).
- **Durée de conservation :** tant que le compte existe. Supprimée intégralement et immédiatement à la demande de suppression (`DELETE /users/me`), sans période de grâce ni copie de sauvegarde conservée par Ignitux.

## 2. Projets et contenus — groupe `projets_et_contenus`

**Tables :** `projects`, `tasks`, `memories`, `concepts`, `concept_links`, `project_collaborators`, `workflow_definitions`, `workflow_steps`, `score_snapshots`, `stock_items`, `stock_movements`, `agenda_events`, `fleet_vehicles`, `fleet_entries` (et `creation_filings`, `company_registrations`, décrites au traitement 12)

- **Finalité :** fournir le service lui-même — les projets, leurs tâches, la mémoire et le graphe de connaissances d'IGINI, les processus, les relevés de score, les stocks, l'agenda et le suivi de flotte.
- **Base légale :** exécution du contrat.
- **Durée de conservation :** tant que le projet existe. Supprimée avec le projet ou avec le compte de son propriétaire.

## 3. Contenus générés par IGINI — groupe `contenus_generes_par_igini`

**Tables :** `analyses`, `analysis_sources`, `legal_form_recommendations`, `legal_form_assumptions`, `legal_form_alternatives`, `legal_form_sources`, `build_plans`, `financing_plans`, `development_plans`, `transmission_plans` (et `company_bylaws`, `bylaw_associates`, `chat_messages`, `financing_evaluations` — traitements 11, 13 et 14)

- **Finalité :** conserver les résultats des générateurs IA (Analyser, Former, Construire, Financer, Développer, Transmettre), demandés explicitement par la personne, et les pages web consultées par IGINI pour étayer une analyse.
- **Destinataire :** Anthropic (API Claude), qui reçoit le contenu du projet, les éléments utiles du profil et la demande au moment de la génération — voir « Prestataires » plus bas.
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

**Tables :** `financing_rounds`, `equity_holders`, `equity_events`, `dividend_distributions`, `buyback_objectives`, `participation_agreements`, `participation_milestones`, `dividend_right_entries`, `investors`, `financed_projects`, `participations`, `investor_movements`

- **Finalité :** suivre le capital d'un projet (tours de table, détenteurs de parts, dividendes, objectifs de rachat) et, côté investisseur, ce qui a été placé et ce qui en est revenu.
- **Base légale :** exécution du contrat pour la personne elle-même ; intérêt légitime des tiers dont l'argent est réellement engagé dans un projet financé, pour les données qui les concernent.
- **Durée de conservation — deux régimes différents dans ce même groupe :**
  - `financing_rounds`, `equity_holders`, `equity_events`, `dividend_distributions`, `buyback_objectives`, `participation_agreements`, `participation_milestones`, `dividend_right_entries` sont rattachées au projet et supprimées avec lui.
  - `investors`, `financed_projects`, `participations`, `investor_movements` **ne sont pas supprimées** à la suppression du compte : l'argent est réellement entré dans les projets d'autres personnes, et l'effacer falsifierait leurs registres. Seule l'identité est détachée ; le fait (montants, dates, mouvements) reste. Voir `investors-deletion.ts`.

## 7. Communauté et marketplace — groupe `communaute_et_marketplace`

**Tables :** `community_comments`, `marketplace_profiles`, `marketplace_contacts`

- **Finalité :** commentaires publics, profil visible sur la marketplace, mise en relation entre porteurs de projet et investisseurs.
- **Base légale :** exécution du contrat — ces fonctionnalités sont activées volontairement par la personne (voir le principe d'activation progressive, `docs/ignitux-os.md`).
- **Durée de conservation :** supprimée avec le compte. Un message envoyé à un tiers disparaît alors aussi de sa boîte de réception — la personne en est prévenue avant de supprimer son compte.

## 8. Journaux techniques — groupe `journaux_techniques`

**Tables :** `workflow_runs`, `workflow_events`, `automation_runs`, `project_compliance_checks`, `project_compliance_ai_runs`, `constitution_violations`, `ai_usage_events`, `space_activity`

- **Finalité :** traçabilité des automatisations et de leurs échecs, contrôle constitutionnel (l'article 8), suivi de ce que les générateurs IGINI ont réellement consommé, et journal d'activité de l'équipe (`space_activity` : ce qu'un comptable ou un associé a écrit — méthode, chemin, statut — dans la facturation, la comptabilité, la banque ou la caisse d'un propriétaire).
- **Base légale :** intérêt légitime (sécurité, fiabilité du service, comptabilité vérifiable des coûts déjà facturés par le fournisseur d'IA).
- **Durée de conservation — trois régimes différents dans ce même groupe :**
  - `workflow_runs`, `workflow_events`, `automation_runs`, `project_compliance_checks`, `project_compliance_ai_runs` sont rattachées au projet et supprimées avec lui.
  - `constitution_violations` et `ai_usage_events` **ne sont pas supprimées** à la suppression du compte, faute de clé étrangère cascadante vers `users` — et ce n'est pas un oubli : elles sont **anonymisées** (l'identifiant utilisateur est mis à `null`). Le fait reste consultable pour l'audit et pour que le total mensuel des coûts IA déjà facturés ne change pas rétroactivement ; la personne, elle, en disparaît.
  - `space_activity` (journal d'activité des membres) est conservé **12 mois** : les lignes de plus de 365 jours sont supprimées automatiquement au fil des écritures (`EspaceInterceptor`, à la première écriture après le démarrage puis une fois toutes les 200). Supprimé en cascade avec le compte du propriétaire de l'espace ; l'acteur est détaché (`null`) quand c'est son compte qui est supprimé.

## 9. Vérification d'identité — groupe `compte`

**Tables :** `identity_verifications`

- **Finalité :** vérifier l'identité de la personne avant qu'elle puisse signer un mandat (traitement 10).
- **Données :** images du recto et, selon le document, du verso (JPEG ou PNG, stockées en base) ; type de document ; numéro du document, date de naissance et date d'expiration lorsqu'elles sont extraites ; résultat des contrôles (MRZ, cohérence du nom affiché) ; statut, motif de rejet, auteur et date de la revue.
- **Traitement :** lecture optique (Tesseract, exécuté sur le serveur d'Ignitux, sans service extérieur — `ocr-extraction.ts`) ; puis revue humaine obligatoire par un compte `administrateur`. Les octets ne sortent que par `lireDocument`, au propriétaire ou à un administrateur.
- **Base légale :** à préciser.
- **Durée de conservation :** tant que le compte existe, y compris après validation ou rejet ; supprimée en cascade avec le compte. Aucune durée plus courte n'est appliquée par le code — à préciser.
- **Export :** inclus, images comprises (encodées en base64).

## 10. Mandats — groupe `compte`

**Tables :** `mandates`

- **Finalité :** enregistrer l'autorisation donnée à Ignitux d'agir au nom de la personne pour un projet. **Création et signature suspendues depuis le 11 octobre 2026** (`MANDATS_SUSPENDUS`, `mandats-suspension.ts`) : seuls la lecture et la révocation des mandats existants restent possibles. Aucun mandat n'est utilisé pour un dépôt.
- **Données :** texte exact lu (figé), nom complet retapé, date et heure de signature, adresse IP du signataire, statut, date de révocation.
- **Base légale :** à préciser.
- **Durée de conservation :** tant que le compte existe (supprimé en cascade avec le compte ou le projet). Un mandat révoqué reste enregistré comme révoqué.

## 11. Statuts — groupe `contenus_generes_par_igini`

**Tables :** `company_bylaws`, `bylaw_associates`

- **Finalité :** générer un projet de statuts pour le projet de la personne.
- **Données :** forme, objet, dénomination, siège, capital, et les associés saisis par la personne (nom et répartition) — données de tiers pour lesquelles Ignitux agit comme sous-traitant.
- **Destinataire :** Anthropic, au moment de la génération (les noms des associés font partie de la demande).
- **Base légale :** exécution du contrat — à valider.
- **Durée de conservation :** supprimées avec le projet ou le compte.

## 12. Dossier de création et immatriculation — groupe `projets_et_contenus`

**Tables :** `creation_filings`, `company_registrations`

- **Finalité :** suivre la préparation du dépôt que la personne fait elle-même (pièces cochées, date et référence du dépôt), puis enregistrer la fiche d'immatriculation qu'elle saisit depuis son Kbis (SIREN, SIRET, TVA, dénomination, siège). Ignitux ne dépose rien et ne vérifie pas ces informations auprès de l'État.
- **Base légale :** exécution du contrat — à valider.
- **Durée de conservation :** supprimées avec le projet ou le compte.

## 13. Conversation avec IGINI — groupe `contenus_generes_par_igini`

**Tables :** `chat_messages`

- **Finalité :** l'assistant conversationnel IGINI (non rattaché à un projet).
- **Destinataire :** Anthropic, à chaque message.
- **Base légale :** exécution du contrat — à valider.
- **Durée de conservation :** supprimée avec le compte.

## 14. Évaluation de financement — groupe `contenus_generes_par_igini`

**Tables :** `financing_evaluations` (exportée), `financing_evaluation_edits` (exclue — traces internes de la revue)

- **Finalité :** produire, à la demande du propriétaire du projet (offre Entrepreneur), un avis sur la finançabilité du projet et un dossier PDF qu'il transmet lui-même. Rapport rédigé par IGINI à partir des données du projet, relu, modifiable et validé par un administrateur avant d'être remis ; chaque modification est tracée.
- **Destinataire :** Anthropic, au moment de la génération (données du projet).
- **Base légale :** exécution du contrat — à valider.
- **Durée de conservation :** supprimées avec le projet ou le compte du demandeur. L'export ne montre le contenu qu'une fois l'évaluation validée (`evaluationPourExport`).

## 15. Boutique en ligne Shopify — non exportée

**Tables :** `shopify_connections`

- **Finalité :** afficher dans Ignitux les produits et commandes de la boutique Shopify de la personne, uniquement si elle la connecte.
- **Données :** domaine de la boutique, forfait déclaré, jeton d'accès chiffré au repos (AES-256-GCM, `chiffrement.ts`).
- **Base légale :** exécution du contrat — à valider.
- **Durée de conservation :** supprimée avec le projet ou le compte. Le code ne prévoit pas de suppression à la déconnexion — à préciser.
- **État :** intégration présente dans le logiciel ; son activation en production (clés d'application Shopify) est à préciser.

## 16. Acceptation des CGU — groupe `compte`

**Tables :** `users` (colonnes `cgu_accepted_at`, `cgu_version`)

- **Finalité :** garder la preuve de la version des conditions d'utilisation acceptée à l'inscription (`CGU_VERSION_EN_VIGUEUR`, `backend/src/users/cgu.ts`).
- **Données :** date d'acceptation et version. Enregistrées depuis le 11 octobre 2026 ; vides pour les comptes antérieurs.
- **Base légale :** à préciser.
- **Durée de conservation :** tant que le compte existe ; supprimées avec lui. Incluses dans l'export.

## 17. Courriels transactionnels — Brevo

**Tables :** `auth_tokens` (non exportée : seule l'empreinte du jeton est stockée)

- **Finalité :** envoyer les courriels de vérification d'adresse et de réinitialisation du mot de passe, depuis contact@ignitux.com, par le relais SMTP de Brevo (`MailService`, variables `SMTP_*` et `MAIL_FROM`).
- **Données transmises :** adresse email du destinataire, contenu du courriel (lien contenant un jeton à usage unique).
- **Base légale :** exécution du contrat — à valider.
- **Durée de conservation :** chez Ignitux, jetons supprimés avec le compte ; chez Brevo, à préciser.

## 18. Rapports d'erreur — Discord

**Tables :** aucune (envoi direct depuis `observability/rapporteur-erreurs.ts`)

- **Finalité :** détecter et corriger les pannes de production.
- **Données transmises :** référence, méthode HTTP, chemin sans chaîne de requête, message et pile expurgés (adresses email et chemins d'utilisateur retirés — sans garantie absolue), UUID de l'utilisateur ou « non connecté », horodatage. Jamais : corps de requête, en-têtes, témoins, chaîne de requête, variables d'environnement.
- **Destinataire :** un salon privé Discord, par webhook (`ERREURS_WEBHOOK_URL`).
- **Base légale :** intérêt légitime (fiabilité du service) — à valider.
- **Durée de conservation :** à préciser (rien ne supprime automatiquement les messages du salon).

## 19. Contrôle anti-robot à l'inscription — Cloudflare Turnstile

**Tables :** aucune

- **Finalité :** empêcher la création de comptes en masse par des scripts (exigé en production par `production-preflight.ts`).
- **Données :** le widget, chargé depuis `challenges.cloudflare.com` sur `/signup`, s'exécute dans le navigateur et reçoit ses données techniques (dont l'adresse IP) ; le serveur transmet seulement le jeton reçu à Cloudflare pour vérification (`turnstile-verification.service.ts`). Ignitux ne stocke rien.
- **Base légale :** intérêt légitime (sécurité) — à valider.
- **Durée de conservation :** chez Cloudflare, à préciser ; ce que le widget enregistre dans le navigateur (cookies ou stockage) relève de Cloudflare — à préciser.

---

## Prestataires

| Prestataire | Rôle | Données concernées | Localisation | Contrat / garanties de transfert |
|---|---|---|---|---|
| Supabase | Base de données PostgreSQL | Toutes | Projet en `eu-west-1` (Irlande) selon `docs/hebergement.md` ; société américaine | à préciser |
| Render | Hébergement du serveur | Toutes, en transit ; journaux du serveur | Société américaine ; région d'exécution à préciser | à préciser |
| Vercel | Hébergement du site ignitux.com | Données techniques de navigation (IP, journaux) | Société américaine ; région d'exécution à préciser | à préciser |
| Anthropic | IA d'IGINI (générateurs, statuts, conversation, évaluation, recherche web) | Contenu du projet, éléments du profil, messages, noms des associés | États-Unis | à préciser |
| Brevo | Envoi des courriels transactionnels | Adresse email, contenu du courriel | Société française ; localisation des serveurs à préciser | à préciser |
| Cloudflare | Turnstile (anti-robot à l'inscription) | Données techniques du navigateur, IP | Société américaine | à préciser |
| Discord | Réception des rapports d'erreur | UUID d'utilisateur, données techniques | Société américaine | à préciser |
| OVH | Nom de domaine ignitux.com (site, adresse contact@ignitux.com) | Données d'enregistrement du domaine ; courrier reçu selon la messagerie retenue — à préciser | France | à préciser |
| Shopify | Boutique de la personne, si elle la connecte | Jeton d'accès ; produits et commandes lus | à préciser | à préciser |

---

## Ce qu'Ignitux ne collecte pas dans cet export, et pourquoi

Dérivé de `exclusions()` dans `user-data-scope.ts` :

- **`auth_tokens`** — jetons de sécurité à usage unique (réinitialisation de mot de passe, vérification d'email). Seul leur hash est stocké ; les montrer n'apprendrait rien à la personne et reviendrait à faire circuler du matériel de sécurité.
- **`compliance_requirements`** — liste des démarches réglementaires proposées par Ignitux, identique pour tout le monde. Ce que la personne a coché, en revanche, fait partie de son export (`project_compliance_checks`, groupe 8).
- **`constitution_articles`** — texte de la Constitution Ignitux, document public identique pour tout le monde.
- **`financing_evaluation_edits`** — traces internes de la revue d'une évaluation de financement par un administrateur : elles décrivent son travail sur le rapport, pas une donnée fournie par la personne.
- **`space_members`, `space_invitations`** — réservées, inutilisées : créées en production le 14/10/2026 pour une version de l'équipe abandonnée le jour même. Aucun code ne les lit ni ne les écrit ; elles restent déclarées pour qu'un `db push` ne les supprime pas, et seront retirées par une migration décidée.
- **`shopify_connections`** — jeton d'accès Shopify, chiffré au repos. Même motif que `auth_tokens` : le remettre chiffré n'apprendrait rien, et une fuite de l'export ne doit pas faire circuler du matériel de sécurité. Le domaine de la boutique et le forfait déclaré restent visibles depuis l'écran Boutique en ligne.

## Ce que ce registre n'est pas

Il ne remplace ni n'annonce :
- **un bandeau de consentement aux cookies** — Ignitux ne pose qu'un cookie, `NEXT_LOCALE`, quand la personne change de langue (`selecteur-langue.tsx`, un an) ; aucun cookie de suivi. Ce que Turnstile enregistre sur `/signup` relève de Cloudflare (traitement 19). Voir la note « Cookies et stockage local » sur `/account` et `/confidentialite` ;
- **la page de confidentialité publique** — elle est publiée sur `/confidentialite`, et doit être tenue à jour en même temps que ce registre ;
- **un avis juridique** — c'est un document d'audit interne, pas un texte à faire signer.

## Tenue à jour

Ce registre suit `user-data-scope.ts` pour la liste des tables et leur
groupe : toute nouvelle table doit d'abord y être classée (les tests l'exigent).
La base légale et la durée de conservation de chaque groupe, en revanche, sont
à revoir à la main si le comportement de `user-data.service.ts` change —
notamment `deleteAccount`, seule source de vérité sur ce qui est réellement
supprimé, détaché ou anonymisé.
