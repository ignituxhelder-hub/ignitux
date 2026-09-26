# Le modèle économique d'Ignitux — audit, ce qui est fait, ce qui reste

Écrit le 23 septembre 2026, après avoir construit la première moitié.

Ce document répond aux livrables demandés : audit de l'existant, plan de migration, fichiers
touchés, modifications backend/frontend/base, plan de déploiement, risques, charge. Il dit
aussi ce que je n'ai **pas** fait, et pourquoi.

---

## 0. Ce qui bloque aujourd'hui

**La base Supabase du projet ne résout plus.** `db.vrgsrisgoocyjqbhefsg.supabase.co` renvoie
`ENOTFOUND` alors que le DNS répond normalement pour tout le reste — le projet est en pause ou
supprimé côté Supabase.

Conséquences immédiates :

| Ce qui marche | Ce qui est bloqué |
|---|---|
| 998 tests serveur (Prisma simulé) | La suite de bout en bout (251 tests) |
| 355 tests interface (fetch simulé) | Toute vérification au navigateur |
| Compilation, typage, lint, build | `prisma db push` — la table `subscriptions` n'existe pas encore en base |

**Première action, avant tout le reste :** rouvrir le projet dans la console Supabase. Un projet
gratuit se met en pause après une période d'inactivité et se restaure d'un clic. Tant qu'il dort,
rien de ce qui suit ne peut être essayé pour de vrai.

---

## 1. Audit : où en était le produit

J'ai vérifié chaque priorité de ta liste contre le code, pas contre ma mémoire.

| Priorité | État réel |
|---|---|
| 16 — Mémoire « erreur » | **Déjà faite.** `memory-category.ts` la connaît, et la rappelle avant « learning ». |
| 17 — Orchestration automatique | **Déjà faite.** `runAfterChange` relance après chaque action manuelle, sans créer de chantiers non demandés. |
| 18 — Tableau de bord | **À moitié.** Les repères sont en haut de la fiche. L'évolution dans le temps est impossible : aucun historique de score n'est stocké, tout est calculé à la lecture. |
| 15 — Connaissance de la personne | **Non faite.** Le profil existe et se remplit ; IGINI ne le lit jamais. Zéro référence à `user_profiles` dans tout `src/igini/`. |
| 19 — Modèle économique | **Non faite.** Aucune notion d'offre, de quota par personne, de droit. |
| Identité légale et paiements | **Non faite.** Rien en configuration. |

Ce qui existait déjà et servait de socle : un plafond de consommation IA **pur et testé**
(`ai-quota.ts`), et un point de passage **unique** pour les cinq générateurs
(`claude.service.ts`). Sans ces deux-là, brancher un modèle d'offres aurait demandé de toucher
cinq services.

---

## 2. Ce qui est construit

### 2.1 L'identité légale (commit `d5c3330`)

Raison sociale, adresse, email, IBAN, BIC, et le fournisseur de paiement : tout vient de
l'environnement. Le dépôt ne contient que des emplacements vides.

Trois règles, tenues par des tests :

- **Rien n'est inventé.** Une valeur absente rend `null`. Une adresse plausible sur une facture
  est une facture fausse.
- **L'IBAN ne sort jamais entier d'une réponse HTTP.** Masqué partout sauf pays + quatre
  derniers caractères. Le numéro complet n'est accessible que par `ibanComplet()`, isolé pour
  qu'un `grep` suffise à énumérer tous ses usages — et aucune route ne l'appelle.
- **Les secrets de paiement ne transitent pas par ce module.** Une clé Stripe reste dans
  l'environnement, lue au plus près de l'appel qui s'en sert.

La production refuse désormais de démarrer sans raison sociale, adresse et email : un service
ouvert au public doit publier qui l'édite. Ni le SIREN ni la TVA ne bloquent — une activité peut
démarrer avant son immatriculation.

### 2.2 Le modèle économique (commits `b9e9e85`, `4f2390b`)

**La ligne de partage n'est pas « basique contre avancé ».** C'est : *ce qui ne coûte rien à
faire tourner est gratuit, ce qui coûte à chaque clic est payant.*

Un appel aux générateurs coûte de l'argent réel à chaque fois. Une tâche cochée, un concept
relié, un score calculé, une démarche de conformité lue n'ont **aucun coût marginal**. Les
enfermer derrière un péage ferait payer pour de l'électricité qu'on ne consomme pas — et
priverait quelqu'un sans budget d'un produit qui marche très bien sans IA, ce qui est
exactement la promesse du parcours.

| | Découverte | Entrepreneur | Construction |
|---|---|---|---|
| Prix par défaut | gratuit | 9,90 € | 59,00 € |
| Projets | 1 | sans limite | sans limite |
| Générateurs | Analyser | les cinq | les cinq |
| Générations/mois | 3 | 30 | 35 |
| Comptabilité, facturation, banque | — | — | oui |
| Financement, investisseurs | — | — | oui |
| Collaborateurs | — | — | sans limite |

Trois analyses en gratuit, pas une : une seule rendrait impossible de retravailler son idée et
de la relancer, ce qui est précisément le geste à encourager.

**Construction est passée de 150 à 35 générations le 26 septembre 2026**, et ce n'est pas une
dévaluation : c'est la fin d'une promesse que le produit ne pouvait pas tenir. Le plafond de coût
par utilisateur vaut 2 €/mois, et 55 appels réels donnent 0,0511 € de moyenne — le plafond coupait
donc vers la 39ᵉ, bien avant la 150ᵉ. Le produit ne mentait pas à l'usage (il nomme le plafond qui
mord), mais il vendait un chiffre qu'il ne pouvait pas honorer, et la personne qui l'apprenait
était celle qui venait de payer.

35 et non 30 parce qu'une offre plus chère ne doit jamais donner moins que la précédente — un test
du catalogue l'exige, et Entrepreneur en promet 30. Un second test attache désormais le quota au
plafond : relever l'un sans l'autre fait échouer la suite.

**Ce que Construction vend n'a jamais été des analyses** : c'est la comptabilité, la facturation,
la banque, les investisseurs et les collaborateurs. Les trois lignes du tableau qui la
distinguent sont toujours là.

**L'évaluation de financement (99 €) n'est pas un abonnement,** et le code refuse de la ranger
comme tel. Un test vérifie que son montant ne s'affiche jamais sans la phrase qui dit ce qu'il
n'achète pas. C'est la seule chose qui distingue une évaluation payante d'une promesse vendue.

**Les prix sont réglables sans redéployer** (`OFFRE_<ID>_PRIX_CENTIMES`). Tu parlais d'un
paramètre en base ; l'environnement fait le même travail sans migration ni cache, et la base
deviendra le bon endroit le jour où les prix varieront par pays ou par devise. C'est aussi la
seule option disponible tant que la base dort.

### 2.3 Deux refus, et pourquoi ils ne se confondent pas

- **« Ton offre ne le permet pas »** — une offre lève la limite, on la nomme dans la phrase.
- **« Tu as épuisé ce mois-ci »** — monter peut aider, attendre aussi. Sur la dernière offre,
  attendre est la seule réponse : proposer une montée serait une vente forcée vers le vide.

Un test vérifie que **tout refus offre une suite** : une offre, ou une échéance. Un refus sans
suite laisse quelqu'un devant un bouton mort sans savoir si c'est une panne.

### 2.4 On ne peut pas s'offrir une offre payante

Tant qu'aucun fournisseur n'encaisse, changer vers une offre payante est refusé. Une route qui
accorde Construction sans rien encaisser est une route qui donne le produit, et elle finirait
par être trouvée. On peut toujours redescendre : personne ne doit rester enfermé faute de bouton.

---

## 3. Deux défauts attrapés en construisant

**Une variable vide rendait une offre gratuite.** `Number('')` vaut `0`, donc une ligne
`OFFRE_ENTREPRENEUR_PRIX_CENTIMES=` laissée en place passait le contrôle « entier positif ».
Mon propre test l'a attrapé.

**Il y avait deux vocabulaires pour les cinq générateurs** — `analyse` d'un côté, `analyser` de
l'autre. Rien n'échouait, et c'est le problème : un droit se serait appliqué à un nom que
personne n'émet, et le refus ne serait jamais venu. Une seule liste désormais
(`generator-names.ts`), qui est aussi la valeur écrite en base.

---

## 4. Fichiers touchés

**Créés** — `backend/src/config/identite-ignitux.ts`, `backend/src/offres/` (catalogue, droits,
service, contrôleur, module), `backend/src/igini/usage/generator-names.ts`,
`frontend/src/app/offres/page.tsx`, et leurs tests.

**Modifiés** — `production-preflight.ts` (identité exigée en production), `app.controller.ts`
(`/mentions-legales`), `claude.service.ts` (droits avant le plafond), `projects.service.ts`
(limite de projets), `ai-usage.service.ts` (compteur mensuel), `user-data-scope.ts`
(`subscriptions` classée), `prisma/schema.prisma`, `.env.example`, `frontend/src/lib/api.ts`.

---

## 5. Plan de déploiement

1. **Rouvrir le projet Supabase.** Rien d'autre n'est possible avant.
2. `npx prisma db push` sur la base de développement, puis relancer la suite de bout en bout.
3. Vérifier au navigateur : la page des offres, la limite d'un projet en gratuit, le refus du
   deuxième générateur.
4. Poser `IGNITUX_RAISON_SOCIALE`, `IGNITUX_ADRESSE`, `IGNITUX_EMAIL` en production — sinon le
   serveur refusera de démarrer, volontairement.
5. Migrer `ignitux_prod`, qui accuse aussi le retard de la session précédente
   (`user_profiles`, quatre colonnes) en plus de `subscriptions`.

---

## 6. Risques

| Risque | Ce qui le limite déjà | Ce qui reste à faire |
|---|---|---|
| Quelqu'un s'accorde une offre payante | Le service refuse sans référence d'encaissement | Vérifier la signature du fournisseur à l'arrivée de la notification |
| Une offre expirée reste ouverte | `ends_on` dépassé retombe sur la gratuite | Rien |
| La base tombe et prive tout le monde de son offre | Le repli est la gratuite, journalisé | Rien : priver un payant est mieux que d'ouvrir à tous |
| Un compteur d'appels faux | Le journal s'écrit en « meilleur effort » | Le rendre bloquant **le jour où l'on facture à l'usage** — aujourd'hui c'est un plafond haut, pas une caisse |
| Le prix affiché diffère du prix encaissé | — | **Non traité.** Le fournisseur devra être l'autorité sur le montant, pas le catalogue |

Le dernier mérite attention : tant que rien n'encaisse il est théorique, mais le jour où Stripe
entre en jeu, c'est **lui** qui doit dire ce qui a été payé.

---

## 7. Charge restante

Estimations en journées de travail concentré, pour ce qui reste du modèle économique.

| Chantier | Charge | Dépend de |
|---|---|---|
| Migration + vérification navigateur du modèle d'offres | 0,5 | Supabase rouvert |
| Encaissement réel (Stripe : session, notification, signature, reprise) | 3 à 5 | Compte Stripe, SIREN |
| Facture d'abonnement émise par Ignitux (numérotation, PDF, TVA) | 2 à 3 | Identité légale complète |
| Historique des scores et évolution dans le temps (priorité 18) | 1 à 1,5 | Supabase rouvert |
| IGINI connaît la personne (priorité 15) | 1,5 à 2 | Rien |
| Parcours d'évaluation de financement (99 €) | 2 à 3 | Encaissement |

La TVA n'est pas dans ces chiffres : le régime dépend de ton immatriculation, et ce n'est pas une
décision de code.

---

## 8. Ce que je n'ai pas fait, et pourquoi

**Aucune intégration de paiement.** Elle demande un compte fournisseur, des clés, et des
décisions qui t'appartiennent — notamment si Ignitux facture avant ou après immatriculation.
L'architecture l'attend : `changer()` prend déjà une référence d'encaissement.

**Aucune logique juridique de participation au capital des projets financés.** Tu as dit de
préparer l'architecture sans l'implémenter, et c'est ce qui a été fait : les tables existent
depuis les sessions précédentes.

**Rien n'a été vérifié au navigateur** dans cette session. Les tests unitaires et d'interface
passent ; ils simulent la base et le réseau. Ce n'est pas la même preuve, et je préfère l'écrire
que le laisser supposer.

**Ton mot de passe de messagerie a circulé en clair dans notre conversation.** Il n'est écrit
nulle part dans le dépôt, ni dans ma mémoire. Change-le.
