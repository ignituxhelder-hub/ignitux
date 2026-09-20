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

## Constitution : corpus de 12 articles, pas les « 24 articles de la V1 »

**Quoi** — le moteur constitutionnel est semé avec 12 articles sous la version
`principes-fondateurs`, et non `v1`. Le corpus transcrit fidèlement les douze énoncés réellement
fournis (mission, devise, méthode, neuf principes), sans ajout.
**Pourquoi** — le cahier des charges annonçait une « Constitution IGNITUX V1 complète avec les 24
articles » mais l'emplacement prévu portait littéralement la mention « (Insérer ici…) » : le texte
n'a jamais été transmis. Inventer vingt-quatre articles et les présenter comme le texte officiel
aurait violé le premier principe que ce moteur est censé faire respecter. Le champ `version` permet
au texte officiel, le jour où il arrivera, de se semer à côté sans se confondre avec celui-ci.
**Où** — `backend/src/constitution/constitution-articles.ts` (avertissement en tête de fichier),
test de garde dans `constitution.service.spec.ts` qui échoue si quelqu'un renomme la version en `v1`.

## Constitution : `enforced` vs `declared`, et aucun score global de conformité

**Quoi** — chaque article porte son mode d'application : `enforced` (une règle du moteur le vérifie
réellement) ou `declared` (énoncé de valeur non vérifiable par un programme). L'audit ne calcule
aucun pourcentage global de « conformité constitutionnelle ».
**Pourquoi** — marquer « appliqué » un article que rien ne vérifie serait exactement le mensonge que
le texte interdit. Et agréger des articles hétérogènes en un « 87 % constitutionnel » serait le score
inventé que l'article 10 proscrit. Un test vérifie que tout article `enforced` est couvert par au
moins une règle, pour que la promesse ne se périme pas en silence.
**Où** — `constitution-articles.ts`, `constitution-rules.ts`, `constitution.service.ts` (`audit()`).

## Constitution : console d'audit en lecture seule, pas d'éditeur d'articles

**Quoi** — l'écran `/constitution` affiche les articles, les règles exécutables, l'état mesuré et le
journal des violations. Il ne permet pas de modifier le texte ; la Constitution vit dans le code,
versionnée et relue avec lui.
**Pourquoi** — le brief demandait une « interface d'administration ». Un éditeur d'articles à chaud
ferait du texte fondateur une donnée mutable sans trace de qui l'a changé ni quand — précisément ce
qu'un texte fondateur ne doit pas être.
**Où** — `backend/src/constitution/constitution.controller.ts`, `frontend/src/app/constitution/page.tsx`.

## Provenance obligatoire sur tout contenu produit par un modèle

**Quoi** — les cinq tables générées par l'IA portent `generated_by` et `generated_model`. Le moteur
constitutionnel bloque l'enregistrement d'un contenu de modèle attribué à un humain.
**Pourquoi** — audit de départ : rien en base ne distinguait un contenu produit par Claude d'une
saisie humaine. C'est la forme la plus grave de donnée inventée, parce qu'elle est indétectable en
aval. Les lignes antérieures ont `generated_model = null`, ce qui se lit « modèle inconnu » et non
« rédigé par un humain ».
**Où** — `backend/prisma/schema.prisma`, `projects.service.ts` (`generatedProvenance`).

## Score `confiance` : `null` au lieu de `0` quand rien n'a démarré

**Quoi** — le champ `confiance` de la fiche de score vaut `null` tant qu'aucune étape n'existe.
**Pourquoi** — défaut trouvé par le moteur constitutionnel lui-même dès son branchement : un `0`
affiché se lit « fiabilité nulle », alors que la réalité est « rien à mesurer encore ». Deux
affirmations très différentes.
**Où** — `backend/src/igini/scoring/scoring.service.ts`.

## Mémoire : rappel déterministe, jamais d'embedding ni de pertinence « magique »

**Quoi** — `recall()` classe les souvenirs par priorité de catégorie (décision > apprentissage >
fait > préférence) puis par récence, et plafonne à 12 entrées injectées dans le contexte des
générateurs. Aucun appel IA, aucun calcul de similarité.
**Pourquoi** — un tri explicable se débogue et se discute ; une pertinence vectorielle ne se
justifie pas auprès de l'utilisateur, et coûterait des appels supplémentaires sur un budget déjà
plafonné. La mémoire est aussi placée AVANT les étapes précédentes dans le contexte : ce que la
personne a décidé prime sur ce que le système a déduit.
**Où** — `backend/src/igini/memory/memory.service.ts`, `projects.service.ts` (`memoryContext`).

## Workflow : conditions en liste fermée, pas de mini-langage d'expressions

**Quoi** — une condition de transition est un couple (type, valeur) pris parmi quatre types
(`always`, `stage_exists`, `tasks_done`, `manual`), et chaque type sait s'expliquer en français.
Une condition non évaluable BLOQUE l'exécution au lieu de la laisser passer.
**Pourquoi** — un moteur d'expressions serait plus expressif et beaucoup moins vérifiable. Une
transition qu'on ne sait pas expliquer à la personne qui la subit transformerait l'autonomie
supervisée en boîte noire. Et franchir une étape dont on ne sait pas vérifier la condition
reviendrait à inventer un fait.
**Où** — `backend/src/igini/workflow/workflow-conditions.ts`.

## Workflow : aucun processus imposé par défaut

**Quoi** — deux modèles sont proposés à la création (« Méthode Ignitux en 5 étapes », « Lancement
opérationnel »), aucun n'est instancié automatiquement sur un nouveau projet.
**Pourquoi** — imposer un workflow reviendrait à décider de la méthode à la place du porteur, ce que
« conseillère, jamais maîtresse » interdit.
**Où** — `backend/src/igini/workflow/workflow-templates.ts`.

## Knowledge Graph : liens parcourus dans les deux sens, `null` quand aucun chemin n'existe

**Quoi** — la traversée considère les liens comme bidirectionnels, plafonne la profondeur à 3 sauts,
et `findShortestPath` renvoie `null` quand rien ne relie deux concepts.
**Pourquoi** — un lien relie deux idées dans l'esprit de la personne quel que soit le sens de saisie ;
un voisinage qui ignorerait la moitié des liens donnerait une image fausse. Au-delà de 3 sauts, le
« voisinage » est le graphe entier. Et fabriquer un chemin approximatif ferait croire à un lien de
pensée jamais posé.
**Où** — `backend/src/igini/knowledge/concept-graph.ts`.

## Offline First : jamais de succès optimiste, jamais de cache présenté comme frais

**Quoi** — une écriture hors ligne lève `OfflineQueuedError` (pas un succès) et le bandeau écrit
que l'action n'est pas encore enregistrée côté serveur. Une lecture servie depuis le cache lève
`OfflineReadError` et porte sa date de capture. Une écriture refusée au rejeu (4xx) passe en
« refusée » avec le motif du serveur, jamais supprimée en silence ; un 5xx est retenté.
**Pourquoi** — c'est le mensonge le plus coûteux qu'une application hors ligne puisse faire :
afficher un succès puis découvrir trois heures plus tard que le serveur a refusé. Servir une donnée
d'hier comme fraîche, c'est l'article 12 appliqué au client.
**Où** — `frontend/src/lib/offline-queue.ts`, `offline-cache.ts`, `components/offline-banner.tsx`.

## CRM : carnet strictement personnel, et aucune prévision de chiffre d'affaires

**Quoi** — contacts, entreprises et interactions sont portés par `owner_id` et ne sont jamais
partagés avec les collaborateurs d'un projet. Le pipeline affiche des comptages par étape, sans
probabilité de conversion ni chiffre d'affaires prévisionnel pondéré.
**Pourquoi** — donner accès au carnet commercial parce qu'on partage un projet serait une fuite, pas
une fonctionnalité. Et une probabilité par étape supposerait un historique de conversion qu'Ignitux
n'a pas : l'afficher donnerait à une supposition l'autorité d'une mesure.
**Où** — `backend/src/crm/crm-pipeline.ts` (avertissement en tête), `crm.service.ts`.

## Facturation : trois règles appliquées, la conformité explicitement non garantie

**Quoi** — le code applique la numérotation séquentielle sans trou (par type et par année, avec
contrainte unique en base), l'impossibilité de modifier ou supprimer un document émis, et la
correction uniquement par avoir référençant le document d'origine. L'avertissement « ce n'est pas un
logiciel de facturation certifié » accompagne chaque liste de documents.
**Pourquoi** — écrire un module de facturation sans dire ses limites serait la forme la plus
dangereuse de donnée inventée : l'utilisateur en déduirait qu'il est en règle. Les montants sont en
centimes entiers (en flottant, 0.1 + 0.2 = 0.30000000000000004 — sur une facture, un litige) et
aucun taux de TVA n'est codé en dur.
**Où** — `backend/src/billing/billing-legal.ts`, `billing-rules.ts`.

## Financement : suivi de ce qui a eu lieu, aucun modèle chiffré inventé

**Quoi** — le module enregistre les apports reçus, la répartition des parts (en événements datés et
motivés) et les dividendes réellement versés. Il ne calcule aucune valorisation, aucun dividende
prévisionnel, aucune part « cible ». Un écart à 100 % est signalé, jamais normalisé.
**Pourquoi** — le cahier des charges donne une direction (l'entrepreneur reste propriétaire
principal, évolution progressive vers l'autonomie) mais aucun barème : ni taux d'entrée, ni règle de
dilution, ni formule de rachat. Produire ces chiffres sans le modèle reviendrait à engager le projet
de l'utilisateur sur des montants inventés. Les parts sont stockées en événements et non en état
courant, parce que c'est précisément l'évolution qu'un champ « part actuelle » écraserait.
**Où** — `backend/src/financing/financing-model.ts` (avertissement de périmètre en tête).

## Modules Pays : la liste des pays couverts est exposée, pas devinée

**Quoi** — un endpoint renvoie les pays pour lesquels une liste de démarches existe réellement en
base (aujourd'hui : la France seule).
**Pourquoi** — « One Brain, Multiple Regulations » signifie que le raisonnement est unique mais que
les règles dépendent du pays. Laisser l'utilisateur découvrir une liste vide pour un autre pays
présenterait une lacune de couverture comme une absence d'obligations. Un second pays reste bloqué
sur la même raison qu'à la session précédente : aucune source officielle fiable identifiée, et
fabriquer du contenu réglementaire serait dangereux.
**Où** — `backend/src/compliance/compliance.service.ts` (`listCoveredCountries`).

## Direction artistique : le feu pour agir, l'acier pour constater

**Quoi** — deux registres visuels séparés par une règle stricte. Le feu (dégradés chauds, lueur)
n'habille que ce que la personne déclenche : boutons d'action, marque, indicateur de chargement.
L'acier (filets, anneaux, pastilles, encarts neutres) habille tout ce que le produit constate :
scores, mesures, états, avertissements.
**Pourquoi** — un score affiché en dégradé orange a l'air d'une affirmation. Or Ignitux rapporte,
il n'affirme pas : les articles 9 et 10 interdisent la donnée inventée et le score sans source, et
l'interface doit le dire par sa forme avant de le dire par son texte. Sans cette règle, la
direction artistique aurait contredit la Constitution en la décorant.
**Où** — `frontend/src/app/globals.css` (en-tête du fichier), classes `.notice` et `.pill`.

## La marque : le Nord de la boussole est la flamme

**Quoi** — un anneau gradué avec quatre points cardinaux, dont le Nord est une flamme ; les trois
autres restent en acier.
**Pourquoi** — la boussole dit la devise (« la vérité avant tout ») : elle indique sans décider.
La flamme dit l'article 3 (protection de l'Étincelle). Les placer l'un dans l'autre était le seul
moyen d'énoncer visuellement ce qu'Ignitux affirme : ce qui oriente, c'est l'Étincelle de la
personne, pas l'outil. Une boussole seule aurait dit « nous savons où aller » ; une flamme seule
n'aurait rien dit de la direction.
**Où** — `frontend/src/components/ignitux-mark.tsx`, `frontend/src/app/icon.svg`.

## Couper l'IA par un interrupteur, pas en retirant la clé

**Quoi** — `IGINI_AI_ENABLED="false"` bloque les 5 générateurs dans `ClaudeService`, en amont de
tout appel réseau. Un endpoint public `/igini/status` permet à l'interface d'afficher
« indisponible » au lieu d'un bouton qui échouerait.
**Pourquoi** — retirer la clé aurait produit une erreur, et une erreur dit « c'est cassé ». Ce
n'est pas cassé : c'est volontairement éteint, et les deux messages ne doivent pas se ressembler.
Le verrou est côté serveur parce qu'une interface qui grise un bouton laisse l'API atteignable
pour qui la connaît : l'objectif était que la dépense soit impossible, pas découragée. Un test
vérifie que l'appel réseau n'est jamais émis — c'est cette assertion, et non le message, qui
garantit le budget.
**Où** — `backend/src/igini/claude/generators-availability.ts`, `claude.service.ts`,
`igini-status.controller.ts`.

## Une valeur mal orthographiée n'éteint rien

**Quoi** — seule la chaîne exacte `"false"` coupe les générateurs. `False`, `0`, `non`, une chaîne
vide : le produit reste complet.
**Pourquoi** — le sens par défaut d'Ignitux est « toutes les fonctionnalités marchent ». Une
faute de frappe dans une variable d'environnement ne doit pas pouvoir éteindre silencieusement
une partie du produit, puis laisser chercher pendant une heure pourquoi les boutons ont disparu.
Éteindre est une décision : elle s'écrit exactement.
**Où** — `backend/src/igini/claude/generators-availability.ts`.

## Dans le doute, l'interface propose

**Quoi** — côté frontend, les boutons de génération ne disparaissent que sur une réponse explicite
du serveur disant `generatorsEnabled: false`. Statut non encore reçu, requête échouée ou réponse
malformée : les boutons restent.
**Pourquoi** — les deux erreurs possibles ne coûtent pas la même chose. Afficher un bouton qui
sera refusé fait perdre un clic et donne un message clair. Cacher un bouton qui marche prive
quelqu'un d'une fonctionnalité sans qu'il sache qu'elle existe. Le second cas est le plus grave,
donc l'incertitude penche du côté de proposer.
**Où** — `frontend/src/app/projects/[id]/page.tsx` (`useIginiStatus`, `GenerationSection`).

## Test à deux personnes : réseau local plutôt qu'hébergement public

**Quoi** — Ignitux est servi depuis le poste du porteur sur `http://192.168.1.12:3001`, accessible
aux appareils du même WiFi. Aucun hébergeur tiers, aucune URL publique.
**Pourquoi** — les testeurs sont sur le même réseau : une URL publique n'apportait aucun accès
supplémentaire, mais aurait exposé l'API — et derrière elle la base Supabase, qui est la même
qu'en développement — sur Internet pour un test d'une heure. La solution la plus simple était
aussi la moins risquée, ce qui est rare et méritait d'être saisi.
**Où** — `PROGRESS.md` §12.3, procédure d'arrêt incluse.

## Un test qui lit le schéma pour que l'export ne puisse pas se périmer

**Quoi** — `user-data-scope.ts` classe chaque table du schéma : exportée dans un groupe, ou exclue
avec un motif écrit. Un test lit `prisma/schema.prisma` et échoue si un modèle n'est classé nulle
part, ou si une table classée n'existe plus.
**Pourquoi** — les CGU énumèrent dix catégories de données collectées. Un export qui en oublierait
une rendrait ce document faux, et un document faux sur les données personnelles est pire que pas
de document : il donne une assurance qui n'existe pas. Aucune relecture humaine ne tiendra sur la
durée ; une migration qui ajoute une table doit casser le build. Même mécanique que « chaque
article `enforced` est couvert par une règle », et pour la même raison.
**Où** — `backend/src/users/user-data-scope.ts` et son spec.

## L'export dit ce qu'il ne contient pas

**Quoi** — le fichier exporté contient un bloc `non_inclus` qui nomme chaque exclusion et la
motive : jetons d'authentification, démarches de référence, texte de la Constitution.
**Pourquoi** — un fichier qui se présente comme « toutes tes données » sans lister ses exclusions
ment par omission. Dire « voici tout » quand ce n'est pas tout est exactement le genre
d'affirmation non fondée que l'article 9 interdit.
**Où** — `backend/src/users/user-data.service.ts`.

## L'objet exporté est recomposé, jamais recopié depuis la base

**Quoi** — le service ne renvoie pas la ligne `users` telle que Prisma la rend ; il construit
explicitement un objet à quatre champs.
**Pourquoi** — le `select` de Prisma excluait déjà `password_hash`, et ça marchait. Mais il aurait
suffi qu'on élargisse ce `select` un jour, pour ajouter un champ, pour que le hash du mot de passe
parte dans un fichier destiné à circuler par email. Sur le champ le plus dangereux du projet, deux
protections valent mieux qu'une. Un test l'a révélé en refusant de faire confiance au mock.
**Où** — `backend/src/users/user-data.service.ts` (`exportUserData`).

## La suppression montre d'abord ce qu'elle détruit

**Quoi** — `GET /users/me/deletion-preview` renvoie le décompte et des avertissements ciblés avant
toute suppression ; l'écran affiche cet aperçu avant de proposer le champ mot de passe.
**Pourquoi** — l'article 8 interdit d'engager une action irréversible sans validation humaine, et
une validation suppose de savoir ce qu'on valide. Trois conséquences ne sont pas devinables :
l'obligation de conserver dix ans une facture émise incombe à la personne et non à Ignitux ; les
messages envoyés disparaissent aussi chez leurs destinataires ; les projets d'autrui survivent,
seul l'accès est perdu. Un compte vide ne reçoit aucun avertissement — six alertes sur des données
inexistantes rendraient les vraies invisibles.
**Où** — `backend/src/users/user-data.service.ts` (`previewDeletion`),
`frontend/src/app/account/page.tsx`.

## Le journal constitutionnel est anonymisé, pas effacé

**Quoi** — à la suppression d'un compte, les lignes de `constitution_violations` le concernant
voient leur `user_id` passé à `null`, dans la même transaction que la suppression.
**Pourquoi** — c'est la seule table qui référence `users` sans clé étrangère : rien n'y cascade, et
l'identifiant d'un compte supprimé y survivrait tel quel. Supprimer les lignes serait l'autre
excès : le journal est ce qui rend l'article 8 vérifiable, et l'amputer à chaque départ le rendrait
inutile. On garde le fait, on retire la personne. Dans la même transaction, parce que séparées, un
échec entre les deux laisserait soit un journal nominatif sans compte, soit un compte à moitié
supprimé.
**Où** — `backend/src/users/user-data.service.ts` (`deleteAccount`).

## Les données personnelles ne vont jamais dans le cache hors ligne

**Quoi** — `request()` accepte `skipOfflineCache`, appliqué à l'export et à l'aperçu de
suppression.
**Pourquoi** — toute réponse GET réussie est recopiée dans le stockage du navigateur pour le mode
hors ligne. C'est utile pour une liste de projets ; c'est inacceptable pour un export qui contient
l'intégralité du CRM, donc des coordonnées et des notes libres sur des tiers, et qui serait resté
en clair dans le navigateur longtemps après la fermeture de l'onglet — sans que personne l'ait
demandé. Un test vérifie aussi qu'une lecture ordinaire reste mise en cache, sinon le premier
passerait pour une mauvaise raison.
**Où** — `frontend/src/lib/api.ts`.

## `NEXT_DIST_DIR` : vérifier un build sans casser ce qui tourne

**Quoi** — `next.config.ts` lit `distDir` depuis `NEXT_DIST_DIR`, par défaut `.next`.
**Pourquoi** — lancer `next build` pendant qu'un `next dev` ou `next start` sert le même `.next`
corrompt le répertoire en cours de lecture et fait répondre 500, y compris à quelqu'un en train
d'utiliser le site. Le piège a déjà coûté une panne sur ce projet. Une variable d'environnement
d'une ligne suffit à rendre l'erreur impossible pendant une session de test ou une démonstration.
**Où** — `frontend/next.config.ts`.

## Le rachat : le porteur écrit la règle, Ignitux ne fait que compter

**Quoi** — les trois conditions de rachat (rentabilité, autonomie, stabilité) sont des textes
libres saisis par le porteur, et c'est lui qui déclare chacune atteinte. Ignitux conserve, date et
compte ; il ne dérive rien d'aucune donnée.
**Pourquoi** — le modèle économique nomme ces trois objectifs sans les chiffrer. Fabriquer des
seuils reviendrait à décider à la place du porteur du moment où il peut racheter ses parts, sur
des chiffres inventés (article 10). Déplacer la définition vers l'humain n'est pas un pis-aller :
une condition écrite avant d'être atteinte est beaucoup plus difficile à réinterpréter après coup,
par le porteur comme par Ignitux — et c'est exactement ce qu'un modèle 51/49 avec rachat
progressif a besoin de rendre solide.
**Où** — `backend/src/financing/buyback-progress.ts`.

## Une condition non définie ne peut pas être déclarée atteinte

**Quoi** — `declareBuybackObjective` refuse en 400 si la condition n'a pas de définition ; et côté
calcul, une définition vide force `reachedAt` à `null`.
**Pourquoi** — sans cette règle on pourrait cocher « rentabilité atteinte » sans avoir jamais dit
ce que « rentable » veut dire pour ce projet. La condition redeviendrait réinterprétable après
coup, ce qui annulerait tout l'intérêt du dispositif. Deux endroits plutôt qu'un : le serveur
refuse l'action, et le calcul pur ne se laisse pas tromper par une ligne incohérente déjà en base.
**Où** — `backend/src/financing/financing.service.ts`, `buyback-progress.ts`.

## Réécrire une condition annule la déclaration qui la concernait

**Quoi** — l'`upsert` d'une définition remet `reached_at` et `evidence` à `null`.
**Pourquoi** — une déclaration ne peut pas survivre au changement de ce qu'elle déclarait. Garder
« atteinte le 1er mars » à côté d'une définition réécrite en juin produirait une affirmation que
personne n'a faite. L'écran prévient avant, plutôt que de le faire en silence.
**Où** — `backend/src/financing/financing.service.ts` (`setBuybackObjective`).

## On ne se prononce pas sur une progression incomplète

**Quoi** — `allReached` vaut `null` tant que les trois conditions ne sont pas écrites, et jamais
`false`.
**Pourquoi** — répondre « non, le rachat n'est pas possible » sur des conditions que personne n'a
encore définies serait une affirmation infondée : on ne sait pas, puisque la règle n'existe pas
encore. Même raisonnement que `founderHasMajority`, qui reste `null` sur une répartition qui ne
boucle pas à 100 %.
**Où** — `backend/src/financing/buyback-progress.ts`.

## Lire le SQL avant de pousser sur la base de production

**Quoi** — avant tout `prisma db push`, inspecter le diff avec
`prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`.
**Pourquoi** — la base Supabase est la même en développement et pour les sessions de test : il n'y
a pas de filet. Le diff de `buyback_objectives` était purement additif (CREATE TABLE, deux index,
une clé étrangère), donc sans risque ; c'est parce qu'on l'a lu qu'on le sait. Un diff contenant
un DROP ou un ALTER sur une table existante doit arrêter l'opération.
**Où** — `PROGRESS.md` §14.4.

## Séparer la base de développement de celle des vraies personnes

**Quoi** — deux bases distinctes sur l'instance Postgres : `postgres` reste le développement,
`ignitux_prod` reçoit les sessions avec de vraies personnes. Deux fichiers d'environnement,
`.env` et `.env.production`, avec des `JWT_SECRET` différents.

**Pourquoi** — jusqu'ici une seule base servait au développement, aux tests automatisés lancés
contre la vraie base, et aux sessions avec des personnes réelles. Aucun filet : une migration
malheureuse, un script de nettoyage trop large ou un test qui oublie de supprimer son compte
touchaient les données de tout le monde. Le compte `testeur1` et son projet cohabitaient avec les
comptes jetables de mes propres vérifications.

Les secrets JWT sont volontairement différents : un jeton signé en développement ne doit pas
ouvrir une session sur la base des vraies personnes.

**Ce que cette séparation apporte, et ce qu'elle n'apporte pas** — il faut être précis, parce
qu'une fausse impression de sécurité est pire que pas de séparation du tout.

- Elle garantit : aucune ligne de développement ne peut apparaître côté production, et
  inversement. Les catalogues Postgres sont distincts, vérifié par comptage : 36 tables, 0 ligne
  de personne à la création.
- Elle ne garantit pas : l'isolation d'infrastructure. Même instance, mêmes identifiants, même
  projet Supabase. Une panne de l'instance, une saturation disque ou une suppression du projet
  emporte les deux. **Une vraie séparation demande un second projet Supabase**, ce qui relève de
  ton compte et de ta facturation — je n'avais ni CLI ni jeton de gestion, et de toute façon
  créer une ressource sur ton compte n'est pas une décision technique.

**Procédure de bascule**

Le serveur lit `.env` par défaut. Pour viser la production, on passe les variables explicitement
sur la ligne de commande — elles ont priorité sur dotenv, qui n'écrase jamais une variable déjà
posée :

    # Développement (comportement par défaut, rien à faire)
    npm run start:dev

    # Production : charger .env.production plutôt que .env
    node --env-file=.env.production dist/main.js

Pour une opération Prisma ciblant la production, même principe :

    DATABASE_URL="<url de .env.production>" npx prisma db push

**Vérifier qu'on vise la bonne base avant d'écrire** : Prisma affiche la base visée à chaque
commande (`Datasource "db": PostgreSQL database "ignitux_prod"`). Cette ligne se lit avant de
valider, au même titre que le SQL du diff.

**Où** — `backend/.env.example` (le modèle explique les deux fichiers), `backend/.gitignore`
(durci : `.env.*` est ignoré, seul `.env.example` reste versionné), `PROGRESS.md` §15.1.

## Le `.gitignore` ne couvrait pas `.env.production`

**Quoi** — `.gitignore` listait `.env`, `.env.local` et trois variantes `*.local`, mais pas
`.env.production`. Il couvre désormais `.env.*` avec une exception explicite pour `.env.example`.

**Pourquoi** — le motif `.env` ne correspond qu'au fichier exactement nommé `.env`. Un fichier
`.env.production` créé au moment de séparer les bases serait donc parti sur GitHub à la première
commande `git add -A`, avec la chaîne de connexion et le mot de passe de la base des vraies
personnes. Le trou n'existait que parce que personne n'avait encore eu besoin de ce fichier :
c'est en le créant qu'il devenait exploitable, et c'est à ce moment-là qu'il fallait le boucher.
**Où** — `backend/.gitignore`.

## Une troisième base, pour que les tests ne détruisent rien

**Quoi** — `ignitux_test`, distincte de `postgres` (développement) et d'`ignitux_prod` (vraies
personnes). Les tests de bout en bout y créent des comptes, des projets, des contacts, puis les
suppriment. `backend/test/setup-e2e.ts` **refuse de démarrer** si la base visée n'est pas
`ignitux_test`.

**Pourquoi le refus plutôt qu'un avertissement** — ces tests écrivent puis effacent. Lancés par
accident sur la base de développement, ils détruiraient du travail réel ; sur celle des vraies
personnes, ils y créeraient des comptes que personne n'a demandés. Les trois façons d'y arriver
sont banales : `.env.test` absent, une variable qui traîne dans l'environnement, une ligne copiée
depuis le mauvais fichier. Une suite de tests capable de détruire des données de production est
un danger, pas un filet — celle-ci s'arrête net. Le refus a été vérifié en pointant volontairement
`.env.test` sur la base de développement : la suite ne démarre pas et dit pourquoi.

**Où** — `backend/test/setup-e2e.ts`, `backend/vitest.config.e2e.ts`, `backend/.env.test` (non
versionné).

## Les tests de bout en bout nettoient par la route du produit, pas en base

**Quoi** — `deleteAccount` appelle `DELETE /users/me` plutôt que de supprimer des lignes
directement.

**Pourquoi** — un nettoyage qui court-circuite le produit masquerait ses fuites. Si la suppression
de compte cesse un jour de tout emporter, les tests suivants trouveront des restes — et c'est
exactement le signal qu'on veut recevoir. Vérifié après une exécution complète : toutes les tables
de données de personnes reviennent à zéro, et la seule ligne restante est une violation
constitutionnelle **anonymisée** (`user_id` nul), ce qui prouve l'anonymisation de bout en bout
contre une vraie base.

**Où** — `backend/test/e2e-app.ts`.

## Un mot de passe différent par compte de test

**Quoi** — `createAccount` génère un mot de passe unique au lieu d'une constante partagée.

**Pourquoi** — trouvé en écrivant le test « on ne supprime pas un compte avec le mot de passe d'un
autre » : il échouait, non pas parce que le code était faux, mais parce que les deux comptes
avaient le même mot de passe. C'était donc le bon, et le test n'aurait rien vérifié une fois
« corrigé ». Une fixture partagée peut rendre muet un test de sécurité tout en le laissant vert.

**Où** — `backend/test/e2e-app.ts`.

## Les tests de bout en bout ne tournent pas en intégration continue

**Quoi** — la CI lance lint, types, tests unitaires et build. Pas `test:e2e`.

**Pourquoi** — ces tests ont besoin d'une vraie base Postgres et de ses identifiants. Les mettre
en CI demanderait de déposer la chaîne de connexion de l'instance Supabase dans les secrets
GitHub, donc d'exposer un accès à la même instance que la production. Le jour où une base de test
vivra ailleurs que sur cette instance, la question se reposera — d'ici là, ils se lancent à la
main avec `npm run test:e2e` depuis `backend/`.

**Où** — `.github/workflows/ci.yml`, `backend/package.json`.

## Deux dégradés de feu : un pour l'œil, un pour le texte

**Quoi** — `--grad-fire` reste vif (étincelle → flamme → braise) et n'habille que du décoratif :
la marque découpée, le point de chargement, le liseré d'une carte. Les boutons prennent
`--grad-fire-solid`, une bande plus profonde dont l'arrêt le plus clair tient 4.5:1 avec du blanc.

**Pourquoi** — le bouton principal portait du texte blanc sur `#ffb347`, soit **1.78:1**.
Illisible, en haut de chaque bouton d'action du produit, et invisible à la relecture du CSS :
seul un calcul le révèle. Assombrir `--grad-fire` aurait réglé le bouton en ternissant la marque
et l'étincelle de chargement, qui ne portent aucun texte et n'avaient pas le problème. D'où la
séparation. Le feu vif n'est pas perdu pour les boutons : il passe dans le halo
(`--glow-fire`), qui entoure sans jamais passer sous les lettres.
**Où** — `frontend/src/app/globals.css`.

## Le contraste est vérifié par un test, pas par l'œil

**Quoi** — `frontend/src/app/contraste.spec.ts` lit `globals.css`, calcule les ratios WCAG et
échoue sous 4.5:1 pour du texte, 3:1 pour un contour d'élément d'interface.

**Pourquoi** — rien de ce qui a été construit dans les dernières sessions n'a été regardé sur un
écran réel, et cette limite ne va pas disparaître. La lisibilité, elle, ne dépend pas d'un
navigateur : elle se déduit des couleurs. Autant la vérifier à chaque exécution de la suite. Le
test a trouvé trois défauts dès sa première exécution — le dégradé des boutons, le surtitre du
héros à 4.12:1, et les contours d'interface à 1.80:1 — tous introduits par la refonte graphique,
tous invisibles à la relecture.
**Où** — `frontend/src/app/contraste.spec.ts`.

## L'accessibilité vérifiable sans navigateur l'est par un test

**Quoi** — `frontend/src/app/accessibilite.spec.ts` lit les sources et vérifie : exactement un
`<h1>` par page, une étiquette exploitable pour chaque champ de formulaire, aucun `onClick` sur un
élément non interactif, un `alt` sur chaque image, la langue déclarée, la marque décorative
masquée aux lecteurs d'écran.

**Pourquoi** — aucun navigateur n'est disponible dans ces sessions, et cette limite ne va pas
disparaître. Une partie de l'accessibilité n'en a pourtant pas besoin : elle se lit dans la
structure du balisage. Ces contrôles ne remplacent pas un essai au lecteur d'écran — ils
empêchent les fautes qu'on peut trouver sans en avoir un.

Le contrôle des titres a servi immédiatement : Communauté, Marketplace et la liste des projets
n'avaient **aucun `<h1>`**. Quelqu'un qui navigue de titre en titre arrivait sur une page dont le
premier titre était un `<h2>` perdu au milieu d'un formulaire. Les 55 champs de formulaire du
produit, eux, étaient déjà tous correctement étiquetés — le test le fige.
**Où** — `frontend/src/app/accessibilite.spec.ts`.

## L'argent d'IGNITUX et celui d'une personne ne partagent jamais une écriture

**Quoi** — toute ligne financière porte `owner_type` et `owner_id`, tous deux NOT NULL. Une
écriture comptable appartient à un propriétaire et à un seul ; une écriture dont une ligne touche
le compte d'un autre est refusée en 422 par la règle constitutionnelle `caisses-separees`, et la
tentative est journalisée. Un mouvement entre IGNITUX et une personne produit **deux** écritures,
une dans chaque comptabilité, qui se désignent l'une l'autre.

**Pourquoi** — avant ces tables, tout ce que le produit suivait financièrement appartenait aux
utilisateurs : `billing_documents` sont les factures que l'entrepreneur envoie à SES clients,
`equity_holders` la table de capitalisation de SON projet. IGNITUX n'avait aucun livre. Or
`financing_rounds.source` accepte déjà la valeur `'ignitux'` — de l'argent d'IGNITUX versé dans le
projet de quelqu'un, enregistré uniquement du côté du bénéficiaire. Personne, en lisant la base,
n'aurait pu dire ce qu'IGNITUX avait dépensé.

Le danger d'une écriture à cheval est qu'elle est **parfaitement équilibrée** : elle ferait passer
de l'argent d'une comptabilité à l'autre sans qu'aucun contrôle comptable ne bronche. C'est pour
ça que le refus est constitutionnel et pas seulement une validation de saisie — une tentative
laisse une trace.

**Où** — `backend/src/ledger/`, règles `caisses-separees` et `rapprochement-dans-la-meme-caisse`
(article 22), `backend/test/comptabilite.e2e-spec.ts`.

## IGNITUX porte un identifiant sentinelle, pas un `null`

**Quoi** — `IGNITUX_OWNER_ID = '00000000-0000-0000-0000-000000000000'`, avec `owner_type` valant
`'ignitux'`. IGNITUX n'est pas une ligne de `users`.

**Pourquoi pas une vraie ligne `users`** — elle apparaîtrait dans les exports RGPD, les listes de
collaborateurs, les recherches de contacts. IGNITUX n'est pas une personne.

**Pourquoi pas `null`** — deux raisons, et la seconde est la vraie. En Postgres, deux `null` sont
distincts dans un index unique : `@@unique([owner_type, owner_id, code])` aurait laissé créer deux
comptes IGNITUX portant le même code. Et surtout, un `null` aurait rendu « sans propriétaire »
représentable, alors que tout ce module existe pour que ça ne le soit pas. Avec deux colonnes NOT
NULL, la règle « aucune transaction sans propriétaire » est tenue par le schéma, pas par du code
qu'on peut oublier d'appeler.

**Où** — `backend/src/ledger/ledger-owner.ts`.

## La comptabilité d'une personne est supprimée ; le journal des coûts IA, seulement anonymisé

**Quoi** — à la suppression d'un compte, `ledger_accounts`, `ledger_entries`, `ledger_lines`,
`bank_accounts` et `bank_transactions` de cette personne **partent**. `ai_usage_events` et
`constitution_violations`, eux, restent et perdent leur `user_id`.

**Pourquoi la différence** — le journal des coûts IA enregistre une dépense **d'IGNITUX**, déjà
facturée par Anthropic. L'effacer ferait changer rétroactivement le total d'un mois déjà clos, et
deux relevés du même mois ne diraient plus la même chose. La comptabilité d'une personne, elle,
lui appartient entièrement : IGNITUX n'a aucune raison de garder les livres de quelqu'un qui s'en
va, et conserver des données sans nécessité est précisément ce que l'article 13 refuse.

Les écritures d'IGNITUX qui désignaient une écriture supprimée perdent ce lien plutôt que de
pointer dans le vide. Le fait reste dans les livres d'IGNITUX, l'identité part — le même principe
qu'ailleurs, appliqué à un pointeur.

**Où** — `backend/src/ledger/ledger-deletion.ts`, `backend/src/users/user-data.service.ts`.

## Aucun IBAN complet n'est détenu tant qu'aucun virement n'est émis

**Quoi** — `bank_accounts.iban_last4` ne stocke que quatre caractères, et la validation du DTO
**refuse** un IBAN entier au lieu de le tronquer en silence.

**Pourquoi** — quatre caractères suffisent à reconnaître un compte dans une liste. L'IBAN entier
ne sert qu'à émettre un virement, ce que le produit ne fait pas et ne fera pas tant qu'aucun
fournisseur bancaire n'aura été choisi. Détenir une coordonnée bancaire complète sans pouvoir s'en
servir, c'est prendre un risque de fuite sans contrepartie.

**Pourquoi refuser plutôt que tronquer** — tronquer donnerait raison à l'appelant qui a envoyé
trop : il croirait l'IBAN enregistré et construirait dessus. Un refus explicite dit que le produit
ne veut pas de cette donnée.

**Où** — `backend/src/banking/dto/banking.dto.ts`, `backend/src/banking/banking.service.ts`.

## Un investisseur traverse les projets, son argent jamais

**Quoi** — quatre tables : `investors` (l'identité), `financed_projects` (un projet ouvert au
financement), `participations` (ce qu'une personne a mis dans UN projet) et `investor_movements`
(le journal de tout ce qui bouge). Chaque mouvement porte son projet **et** son investisseur, tous
deux NOT NULL.

**Pourquoi** — le produit savait suivre le capital d'UN projet, mais un détenteur n'y était qu'un
**nom** : « Marie Dubois » sur le projet A et « Marie Dubois » sur le projet B étaient deux lignes
sans le moindre lien. Impossible de dire ce qu'une personne avait investi en tout, ni ce qui lui
était revenu. L'axe manquant n'était pas l'argent, c'était la personne.

La séparation est tenue à trois niveaux : le schéma (deux colonnes NOT NULL, donc « mouvement
flottant » n'est pas représentable), la règle constitutionnelle `investissements-non-melanges`
(article 22), et `separationAudit()` qui relit tout le registre en SQL après coup.

**Où** — `backend/src/investors/`, `backend/test/investisseurs.e2e-spec.ts`.

## Répartir au centime exact, par la méthode du plus fort reste

**Quoi** — `allocatePro()` attribue à chacun sa part entière du prorata, puis distribue les
centimes restants aux plus forts restes. La somme des allocations égale **toujours** le montant
réparti.

**Pourquoi** — répartir 1 000 € entre trois investisseurs est trivial ; le faire sans perdre ni
inventer un centime ne l'est pas. Trois parts de 100 000 centimes donnent 33 333 chacune, soit
99 999 : un centime s'évapore. Arrondir au supérieur en crée un.

Un centime par versement, sur des milliers de projets et des années, n'est pas une coquetterie :
c'est un écart permanent entre ce que le projet a versé et ce que les investisseurs ont reçu, qui
grossit tout seul et que personne ne sait expliquer. La propriété est vérifiée sur **20 000
tirages** aléatoires.

Les ex æquo sont départagés par l'ordre d'origine. C'est arbitraire mais **déterministe** : un
partage qu'on sait rejouer se contrôle, là où un partage aléatoire ne s'explique jamais.

**Où** — `backend/src/investors/distribution.ts`.

## Le registre d'un projet survit à la suppression du projet et de son porteur

**Quoi** — `financed_projects.project_id` est nullable, en `SET NULL`, et le titre du projet est
**recopié** à l'ouverture (`project_title`). À la suppression d'un compte porteur,
`entrepreneur_user_id` passe à null ; le registre reste.

**Pourquoi** — deux raisons, et la première est un défaut trouvé en concevant : `participations`
refuse de partir (`Restrict`), donc une cascade depuis `projects` aurait fait **échouer la
suppression de compte** sur une violation de clé étrangère. La seconde est de fond : si la
suppression du projet emportait le registre, un entrepreneur pourrait faire disparaître la trace
de l'argent que d'autres ont mis chez lui.

Le titre recopié suit le précédent de `billing_documents.client_name` : ce qui est écrit à
l'instant T ne bouge plus.

**Où** — `backend/prisma/schema.prisma`, `backend/src/investors/investors.service.ts`.

## Un investisseur qui s'en va est détaché, pas effacé

**Quoi** — à la suppression du compte, la ligne `investors` reste : `user_id` passe à null et
`display_name` devient « Investisseur retiré ». Aucune participation, aucun mouvement n'est
supprimé.

**Pourquoi** — l'argent est réellement entré dans les projets **d'autres personnes** et devra en
ressortir. Effacer ses participations falsifierait leurs registres ; laisser son nom conserverait
une donnée personnelle après une demande d'effacement. Le fait reste, l'identité part — le porteur
continue de voir qu'il doit 1 000 € à quelqu'un, il ne voit plus qui.

C'est le traitement inverse de la comptabilité personnelle (`ledger_*`), qui est **supprimée** :
celle-là n'appartient qu'à la personne, celle-ci engage un tiers.

**Où** — `backend/src/investors/investors-deletion.ts`.

## Rien ne s'efface dans le journal d'investissement

**Quoi** — aucune méthode de suppression dans `InvestorsService`, aucune route pour en appeler
une. Une erreur se corrige par un mouvement de `correction` qui désigne celui qu'il rectifie, avec
un motif obligatoire.

**Pourquoi** — même principe qu'un avoir en facturation, et pour la même raison : un historique
qu'on peut réécrire ne prouve rien, et c'est précisément ce qu'on demande à un registre
d'investissement. Le motif est obligatoire parce qu'une correction sans raison consignée est une
réécriture déguisée — six mois plus tard, personne ne saura pourquoi le montant a changé.

Dans les totaux, une correction se rattache au **poste du mouvement qu'elle vise**, pas à une
catégorie « corrections ». Sinon le montant erroné resterait visible dans son poste d'origine et
le total cesserait de décrire la réalité.

**Où** — `backend/src/investors/investors.service.ts`, `distribution.ts` (`portfolioTotals`).

## La part perpétuelle de 5 % se dit, elle ne se devine pas

**Quoi** — `POST /projets-finances/:id/dividendes` exige `applyPerpetualShare` explicitement.
Aucun défaut.

**Pourquoi** — tous les projets financés ne sont pas entrés au capital selon le modèle 51/49.
Prélever 5 % par défaut reviendrait à décider à la place du porteur ; ne rien prélever par défaut
ferait perdre à Ignitux ce que le modèle lui accorde. Dans les deux cas le produit trancherait une
question qui ne lui appartient pas.

Le calcul réutilise `perpetualShareCents` du modèle économique plutôt que de refaire la règle :
une seconde implémentation de la même règle finit toujours par diverger de la première.

**Où** — `backend/src/investors/distribution.ts` (`splitDividend`).
