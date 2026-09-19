# Décisions et contraintes assumées

Ce document existe pour qu'une décision prise une fois n'ait pas besoin d'être redécouverte ou
redébattue plus tard. Chaque entrée : quoi, pourquoi, où c'est appliqué dans le code.

## Piège opérationnel : `npm run build` casse le serveur de dev Next.js en cours

**Quoi** — lancer `npm run build` (build de production) dans `frontend/` pendant qu'un
`npm run dev` tourne écrase le dossier `.next` partagé par les deux. Le serveur de dev continue de
répondre mais sert un cache incohérent : toutes les pages renvoient une erreur 500
(`Cannot find module './XXX.js'`). Rencontré deux fois le 19/09/2026.
**Pourquoi le noter** — le symptôme (« tout le site est cassé ») ne ressemble pas du tout à la
cause (« j'ai lancé un build de vérification »), et la réaction naturelle est de chercher un bug
dans le code applicatif, qui n'existe pas.
**Quoi faire** — soit vérifier le build quand aucun serveur de dev ne tourne, soit, après un build,
redémarrer le dev proprement : arrêter le process, `rm -rf .next`, relancer `npm run dev`.
**Où** — rien à corriger dans le code, c'est le comportement normal de Next.js avec un `.next`
partagé.

## Règle : jamais de test manuel sur un projet réel — toujours un projet dédié, jetable

**Quoi** — le 19/09/2026, une pollution de données a été trouvée : 3 enregistrements générés
(plans de financement, développement, transmission) citaient littéralement un titre/description
absurdes (« sdvxdv » / « xvxvxzvzxcbxc »), utilisés comme entrée de test directement sur un projet
qui a ensuite été renommé et réutilisé. Investigation : ce n'était **pas** dans le vrai projet du
compte principal (`heldersimoes.ge@gmail.com`, resté vide et intact), mais dans un projet créé sous
un compte de test à email jetable — vraisemblablement un test manuel fait directement dans le
navigateur, pas par un script automatisé (vérifié : aucun script de test de cette session n'a
utilisé ces chaînes). Les 3 entrées ont été supprimées après identification précise par leur
contenu (recherche de la chaîne exacte dans toutes les tables), sans toucher à aucune autre donnée.
**Pourquoi ça n'a pas été nettoyé "comme annoncé"** — l'engagement de nettoyage systématique tenu
dans ce projet (voir `PROGRESS.md`, section "Rien de destructif" de chaque session) couvre les
comptes/projets **créés par les scripts de vérification automatisée** de l'assistant, toujours
supprimés juste après usage et vérifiables dans l'historique de la session. Il ne peut pas couvrir
un test fait manuellement dans le navigateur, en dehors de toute session assistée — cette pollution-
là n'a donc jamais été "annoncée comme nettoyée" par erreur, elle n'a simplement jamais été vue.
**Règle pour la suite, humains et automatisé confondus** — tout test volontairement absurde ou
exploratoire (titres/descriptions incohérents, données jetables) doit se faire sur un projet créé
spécifiquement pour ça, jamais sur un projet qui porte déjà un nom qui ressemble à un vrai projet
(même approximatif). Si un test doit vérifier un comportement précis (ex : comment IGINI réagit à
une entrée vide), le titre du projet de test doit le dire explicitement (ex : `[TEST] entrée vide —
à supprimer`), pour rester identifiable et supprimable sans ambiguïté même des mois plus tard.
**Trou de nettoyage trouvé et corrigé le même jour** — l'audit fait dans la foulée a montré que les
*projets* de test étaient bien supprimés à chaque fois, mais pas les *comptes* de test : 9 comptes
`@example.com` créés par des scripts de vérification traînaient encore (tous sans aucun projet).
Ils ont été supprimés, avec un double garde-fou dans le script : domaine `@example.com` (réservé
aux tests par la RFC 2606, donc jamais un vrai compte) **et** zéro projet rattaché. Cause du trou :
il n'existe pas d'endpoint de suppression de compte dans l'API, donc le nettoyage par appels HTTP
ne pouvait pas les enlever — il faut passer par la base. À refaire à la fin de toute session qui
crée des comptes de test, tant que cet endpoint n'existe pas.
**Où** — aucun endroit unique dans le code (c'est une règle de process, pas un mécanisme
technique) ; documenté ici et rappelé dans `PROGRESS.md` à chaque session qui crée des données de
test.

## MailService journalise au lieu d'envoyer

**Quoi** — `MailService.send` ne fait qu'écrire l'email dans les logs (niveau `warn`) : aucun
fournisseur réel (Resend, SES, SMTP…) n'est branché.
**Pourquoi** — aucune décision produit sur le fournisseur n'a été prise, et bloquer la
réinitialisation de mot de passe / vérification d'email indéfiniment en attendant ce choix aurait
laissé l'auth incomplète. En isolant l'envoi dans cette seule classe, brancher un vrai fournisseur
plus tard ne touche à rien d'autre (`PasswordResetService`, `EmailVerificationService` ne changent
pas).
**Où** — `backend/src/mail/mail.service.ts`.

## Vérification d'email non obligatoire

**Quoi** — un compte peut se connecter et utiliser l'app normalement sans avoir vérifié son email.
`users.email_verified_at` est renseigné dès que la vérification a lieu, mais rien ne bloque l'accès
tant qu'il est `null`.
**Pourquoi** — décider si/où l'exiger (bloquer la connexion ? seulement certaines actions ?) est un
choix produit, pas technique — l'imposer unilatéralement aurait pu verrouiller des comptes de façon
non désirée. Le token existe et fonctionne ; ajouter un garde-fou plus tard est un changement
localisé (un guard sur les routes concernées).
**Où** — `backend/src/auth-tokens/email-verification.service.ts`, colonne `users.email_verified_at`.

## Pas de score fabriqué

**Quoi** — `ScoringService.getScoreCard` renvoie `null` pour un indicateur quand aucune donnée
réelle n'existe (aucune analyse, aucun plan, aucune tâche), plutôt qu'un chiffre par défaut.
**Pourquoi** — un score inventé donnerait une fausse impression d'intelligence ou de fiabilité,
contraire à la devise « la vérité avant tout ». Un `null` honnête est plus utile qu'un chiffre faux.
**Où** — `backend/src/igini/scoring/scoring.service.ts`.

## Automation existe désormais, mais n'appelle jamais Claude elle-même (décision révisée le 19/09/2026)

**Quoi** — cette entrée disait auparavant qu'IGINI n'exécutait jamais rien tout seul (le module
Workflow ne faisait que transformer des suggestions en tâches, validées par l'humain). Sur demande
explicite, un 5ᵉ moteur (`AutomationService`) a été ajouté : il crée/ferme des tâches d'étape et
relie des concepts **sans confirmation humaine préalable**, après chaque génération IA ou
manuellement. Deux garde-fous volontaires accompagnent ce changement : (1) il n'appelle **jamais**
l'API Claude de son propre chef — tout ce qu'il fait est déterministe et gratuit (lecture/écriture
en base), pour qu'un automatisme sans supervision ne puisse jamais faire déraper le budget IA de
50€/mois sans qu'un humain le voie venir ; (2) chaque exécution est journalisée
(`automation_runs`, visible dans l'UI) — la transparence après coup remplace la validation avant
coup. Le module Workflow lui-même n'a pas changé : ses tâches "humaines" restent toujours validées
par un clic.
**Pourquoi** — l'ancienne position ("IGINI conseille, l'humain décide") était un choix par défaut
documenté comme tel, pas un principe intouchable ; une fois la demande explicite faite, la revenir
en arrière franchement (avec des garde-fous adaptés au risque réel — le budget IA) est plus honnête
que de garder une doc qui ne correspond plus au code.
**Où** — `backend/src/igini/automation/automation.service.ts` (commentaire de classe détaillé).

## Mémoire commune bornée aux étapes précédentes

**Quoi** — chaque étape (Construire, Financer, Développer, Transmettre) ne reçoit dans son prompt
que le résumé des étapes qui la précèdent dans le pipeline, jamais celles qui la suivent — même si
elles existent déjà en base suite à une régénération d'une étape antérieure.
**Pourquoi** — un bug initial remontait sans distinction tout ce qui existait en base, ce qui aurait
fait fuir des informations "du futur" vers une étape antérieure régénérée après coup. Corrigé et
couvert par des tests de régression.
**Où** — `backend/src/projects/projects.service.ts` (une méthode `latestXContext` par étape,
composées explicitement à chaque appel).

## Collaborateur : lecture étendue aux moteurs, écriture toujours réservée au propriétaire

**Quoi** — un collaborateur invité sur un projet peut le consulter, voir l'historique des 5
générateurs, et lire (pas écrire) la mémoire/connaissance/workflow/score, la checklist de
conformité et l'historique d'automatisation de ce projet. Il ne peut ni modifier le projet, ni
générer de nouveaux plans, ni déclencher une automatisation manuelle, ni gérer les collaborateurs.
**Pourquoi** — la restriction initiale (lecture seule limitée aux 5 générateurs) était un périmètre
volontairement restreint en attendant une demande explicite d'aller plus loin ; une fois cette
demande faite, étendre la lecture (jamais l'écriture) aux moteurs restants suit le même modèle de
permission déjà éprouvé, sans introduire de nouveau mécanisme.
**Où** — `assertHasProjectAccess` (propriétaire OU collaborateur, lecture) vs `assertOwnsProject`
(propriétaire seul, toute écriture) — voir `backend/src/prisma/`.

## ANTHROPIC_API_KEY optionnelle au niveau de la config

**Quoi** — `env.ts` déclare `ANTHROPIC_API_KEY` comme optionnelle : son absence ne bloque pas le
démarrage du serveur, seulement les endpoints qui en ont besoin (erreur 500 explicite, voir
ci-dessous).
**Pourquoi** — bloquer tout le serveur pour une clé qui ne sert qu'à 5 endpoints sur 39 aurait été
disproportionné, et aurait empêché de développer/tester le reste du produit sans payer l'API.
**Où** — `backend/src/config/env.ts`.

## Messages d'erreur Claude différenciés, jamais le détail brut

**Quoi** — `ClaudeService.toSafeMessage` distingue trois cas (identifiants manquants/invalides,
rate limit, panne réseau) avec un message actionnable pour chacun, mais ne renvoie jamais le message
d'erreur brut du SDK au client.
**Pourquoi** — un message générique unique ("réessaie plus tard") ne permet pas de diagnostiquer un
vrai problème de configuration ; renvoyer le détail brut pourrait exposer des informations internes.
**Où** — `backend/src/igini/claude/claude.service.ts`.

## Pas de refonte de marque/fondations, mais polish visuel oui

**Quoi** — deux niveaux distincts, à ne pas confondre : (1) la marque/identité de base (palette
fond sombre `#0b0c10` + accent orange `#ff5a1f`) reste inchangée, ce chantier-là attend une
validation par de vrais utilisateurs avant d'être rouvert ; (2) le **polish visuel** sur cette base
(typographie réelle — Sora pour les titres, IBM Plex Sans pour le texte, IBM Plex Mono pour les
données/scores —, échelle de titres, états de survol/chargement soignés) a été fait le 18/09/2026,
sans changer la palette ni la structure des pages.
**Pourquoi** — une identité complètement nouvelle avant validation utilisateurs serait un
investissement risqué ; affiner ce qui existe déjà (accessibilité, hiérarchie, cohérence) est sans
risque et améliore le produit immédiatement.
**Où** — `frontend/src/app/globals.css`, `frontend/src/app/layout.tsx` (polices via `next/font/google`).

## Compliance : France uniquement, contenu générique et sourcé, pas un avis juridique

**Quoi** — la liste de référence (`compliance_requirements`) ne couvre que la France, avec 12
points génériques (statut juridique, immatriculation, fiscalité, social, activités réglementées…),
chacun sourcé (`source_name`/`source_url` vers un site officiel). Aucun chiffre précis qui périme
vite (seuils de TVA, plafonds de chiffre d'affaires) n'est écrit en dur — le texte renvoie vers la
source qui les tient à jour plutôt que de risquer d'afficher un montant faux. Un disclaimer explicite
("ne remplace pas un avis d'expert-comptable, d'avocat…") est renvoyé par l'API et affiché dans l'UI.
**Pourquoi** — fabriquer du contenu réglementaire précis sans être juriste, ou le présenter comme
fiable sans le sourcer, serait dangereux si quelqu'un s'y fiait pour une vraie démarche — contraire à
la devise du projet. Rester générique, sourcé et daté (implicitement, via les sources externes) est
le seul choix honnête sans expertise juridique ni partenaire identifié.
**Où** — `backend/src/compliance/compliance-requirements.ts`, `compliance.service.ts` (constante
`COMPLIANCE_DISCLAIMER`).

## Marketplace : annuaire et messages uniquement, aucune circulation d'argent

**Quoi** — le module Marketplace (profils mentors/investisseurs, annuaire, mise en relation par
message) ne gère aucun paiement ni prise de participation. Un profil, un message — rien de plus.
**Pourquoi** — dès qu'un mentorat payant ou une prise de participation entre en jeu, des obligations
légales réelles apparaissent (KYC, DSP2, droit des sociétés…) qui nécessitent un cadrage produit et
juridique explicite, jamais fait à ce jour. Construire un simple annuaire est une base utile et sans
risque ; y ajouter de l'argent sans ce cadrage serait irresponsable.
**Où** — `backend/src/marketplace/marketplace.service.ts` (commentaire de classe).
