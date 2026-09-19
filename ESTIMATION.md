# Audit IGNITUX — état réel et chemin vers « prêt »

**Date** : 19/09/2026, fin de session.
**Nature** : audit technique interne, pour décider quoi faire ensuite.
**Ce que ce document n'est pas** : une valorisation d'entreprise, ni un chiffre destiné à des
investisseurs.

**Méthode** : tout ce qui suit vient d'un comptage sur le code réel ou d'une exécution réelle.
Quand un chiffre relève du jugement et non de la mesure, c'est écrit noir sur blanc.

---

## 1. Ce qui est mesuré (faits, pas impressions)

| | Mesure |
|---|---|
| Tests backend | **605** (55 fichiers) |
| Tests frontend | **169** (26 fichiers) |
| **Total** | **774 tests verts** |
| Routes HTTP | **120** sur 12 contrôleurs |
| Modèles de données | **36** tables Prisma |
| Pages frontend | **15** |
| Constitution | **24 articles** (V1), dont **10 appliqués** et 14 énoncés |
| Règles exécutables | **13**, branchées sur des points d'écriture réels |
| Démarches réglementaires | **12**, toutes sourcées, **1 pays** (France) |
| Intégration continue | présente : lint, types, tests, build des deux côtés |
| Appels à l'API Claude cette session | **0** |

**Vérifié en base réelle** (pas seulement en test simulé) : 51 contrôles sur le parcours complet,
27 sur l'export et la suppression RGPD, 32 sur le rachat progressif. Tous verts.

**Suite stable** : trois exécutions complètes consécutives à 605/605 après correction d'une
instabilité (voir section 5).

---

## 2. État par module

L'échelle est un jugement, pas une mesure. Elle répond à une question précise : **une personne
réelle peut-elle s'en servir de bout en bout sans se cogner à un mur, et le module ment-il sur ce
qu'il fait ?**

| Module | État | Ce qui manque pour le déclarer fini |
|---|---|---|
| Comptes et authentification | Solide | L'email n'est jamais envoyé (3.2) |
| Projets | Solide | — |
| Constitution | Solide | 2 articles restent « énoncés », à raison (3.4, 3.5) |
| Mémoire | Solide | — |
| Connaissance (graphe) | Solide | — |
| Score | Solide | Aucune mesure d'audit possible pour l'article 10 |
| Tâches et Workflow | Solide | — |
| Automatisation | Solide | — |
| CRM | Solide | Point RGPD ouvert côté document (3.1) |
| Facturation | Solide côté code | Mentions légales à valider par un comptable |
| Financement et rachat | Solide | Pas de contrat généré (3.7) |
| Conformité | France seulement | Suisse et Portugal bloqués (3.6) |
| Marketplace | Solide | — |
| Communauté | Solide | — |
| Données personnelles (RGPD) | Solide | Liste CGU à corriger dans les `.docx` (3.1) |
| Les 5 générateurs IGINI | Codés, éteints | Décision de budget (3.3) |
| Offline First | **Partiel** | Pas de service worker (3.4) |
| Les Gardiens | **Absent** | Décision produit (3.5) |

---

## 3. Ce qui reste, et pourquoi

### 3.1 Corriger les `.docx` — RGPD (décision, 30 min)

Neuf corrections sont rédigées et prêtes à coller, dans PROGRESS.md section 11.1. La plus
importante : la liste des données collectées des CGU **omet les contacts CRM de tiers**, leurs
notes libres et les résumés d'échanges. Tant que ce n'est pas corrigé, l'avertissement donné aux
testeurs — ne pas saisir de vrais contacts — est la seule protection.

**Aucun `.docx` n'a été modifié**, conformément à ta consigne.

### 3.2 Brancher un vrai envoi d'email (technique, ~2 h)

`MailService` **journalise** l'email au lieu de l'envoyer. Conséquence concrète : la
réinitialisation de mot de passe et la vérification d'email **ne peuvent pas atteindre un
utilisateur réel**. C'est le blocage le plus concret pour une mise en ligne publique.

Le code est prêt : seule cette classe change, les deux services appelants n'y touchent pas. Il
faut choisir un fournisseur (Resend, SES, autre) — c'est une décision, pas un chantier.

Décision liée, toujours ouverte : **faut-il rendre la vérification d'email obligatoire ?**
Aujourd'hui un compte non vérifié peut tout utiliser.

### 3.3 Décider du budget IA (décision)

Les 5 générateurs sont codés et testés, mais volontairement éteints par `IGINI_AI_ENABLED=false`,
avec un verrou côté serveur qui rend la dépense **impossible** et non seulement découragée. Les
rallumer est une variable d'environnement — donc une décision de budget, pas un développement.

### 3.4 Offline First — article 16 (technique, ~4 h + vérification navigateur)

L'article dit « Ignitux doit continuer à fonctionner sans connexion ». Aujourd'hui : les données
déjà chargées restent consultables et les écritures sont mises en file d'attente, **mais
l'application ne démarre pas hors ligne** — il n'y a pas de service worker. L'article reste donc
marqué « énoncé » et non « appliqué », ce qui est honnête.

**Pourquoi ce n'est pas fait dans cette session** : un service worker mal réglé peut servir du
code périmé indéfiniment et casser l'application pour tout le monde. Je n'ai pas de navigateur ici
pour le vérifier, et l'application était en cours de test par deux personnes. La règle « ne jamais
casser l'existant » l'emporte sur la règle « avancer ». À faire avec une vérification navigateur
réelle, en stratégie réseau d'abord : le cache ne sert que hors ligne, jamais en priorité.

### 3.5 Les Gardiens — article 17 (décision)

Aucun rôle « Gardien » n'existe dans le produit. Le marquer « appliqué » annoncerait un dispositif
inexistant. La hiérarchie de gouvernance (Constitution, IGINI, Gardiens, Modules Pays, Modules
Métier, Utilisateurs, Projets) n'est pas modélisée non plus.

**Ce n'est pas un chantier technique tant que la question produit n'est pas tranchée** : qui est
Gardien, que peut-il faire, que peut-il empêcher ? Inventer cette réponse reviendrait à décider à
ta place de qui a du pouvoir sur la Constitution.

### 3.6 Suisse et Portugal (bloqué : sources)

Le module Conformité couvre la France avec 12 démarches, **toutes sourcées officiellement**. Les
deux autres pays restent vides pour la même raison qu'aux sessions précédentes : aucune source
officielle fiable identifiée. Fabriquer du contenu réglementaire suisse ou portugais serait
dangereux — quelqu'un pourrait s'en servir pour créer une entreprise.

**Débloquer demande une source, pas du code.**

### 3.7 Les contrats (décision + juriste)

C'est le seul item de ta liste des six transformations du modèle économique qui reste ouvert : les
cinq autres sont faites. Générer un contrat de participation 51/49 est juridiquement sensible —
ce n'est pas une fonctionnalité à écrire seul.

### 3.8 Séparer les bases dev et production (technique, ~1 h)

Aujourd'hui **une seule base Supabase** sert au développement, aux tests et aux sessions avec des
personnes réelles. Il n'y a aucun filet : une migration malheureuse touche tout. C'est pour ça que
chaque changement de schéma passe maintenant par une lecture du SQL avant application.

---

## 4. Le seul vrai angle mort

**Rien de ce qui a été construit dans les dernières sessions n'a été regardé dans un navigateur.**

Les 774 tests tournent en jsdom et contre des dépendances simulées ; les vérifications « réelles »
passent par HTTP, pas par un œil humain. Cela couvre la logique, les routes, les refus, les
cascades — cela ne couvre **ni la mise en page, ni la lisibilité, ni les comportements
d'interface** sur un vrai écran, encore moins sur un téléphone.

C'est exactement ce à quoi sert la session avec tes deux testeurs. **Leur retour vaut plus que
n'importe quel chantier de cette liste.**

---

## 5. Corrigé pendant cette session, pour mémoire

- **Direction artistique** « la boussole et le feu », avec une règle de fond : le feu n'habille
  que ce que la personne déclenche, l'acier tout ce que le produit constate.
- **Verrou IA** côté serveur, en amont de tout appel réseau, avec un test qui vérifie que l'appel
  n'est jamais émis.
- **Droit d'accès et droit à l'effacement**, avec un garde-fou qui lit `schema.prisma` et casse le
  build si une table n'est pas classée. Il a servi dès le lot suivant.
- **Deux fuites évitées** : le hash du mot de passe partait dans l'export ; l'export entier
  atterrissait dans le `localStorage` du navigateur.
- **Rachat progressif** : le porteur écrit lui-même ses conditions, Ignitux ne fabrique aucun
  seuil et ne calcule aucun prix.
- **Audit constitutionnel** étendu de 3 à 9 articles mesurés.
- **Suite de tests stabilisée** : deux fichiers intermittents, cause mesurée (bcrypt à coût 10
  coûte 71 ms par hash et par comparaison), fixtures passées à coût 4.

---

## 6. Ce qui ne peut pas être estimé

- **La valeur du produit.** Aucun utilisateur réel ne s'en est encore servi durablement.
- **Le coût d'exploitation.** Il dépend du volume d'appels IA, qui dépend d'usages inconnus.
- **Le temps jusqu'à « fini ».** Plusieurs points ci-dessus attendent une décision de ta part, pas
  une journée de travail — et une décision n'a pas de durée prévisible.
