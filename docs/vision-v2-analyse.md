# IGNITUX Vision 2.0 — audit et proposition d'architecture

26 septembre 2026. Réponse à la demande d'audit reçue le même jour : « ne
développe rien immédiatement », dix livrables précis. Ce document répond
aux dix, dans l'ordre demandé. Aucune ligne de code n'a été modifiée pour
l'écrire — tout vient de la lecture du schéma Prisma (50 tables), des 35
modules du serveur, et des ~25 pages de l'interface.

---

## 1. Audit complet de l'architecture actuelle

### Le serveur (NestJS 12) — 35 modules

| Famille | Modules | Rôle |
|---|---|---|
| **Identité** | `auth`, `auth-tokens`, `users`, `roles`, `profile` | Compte, session JWT sans état serveur, profil déclaratif |
| **Cœur produit** | `projects` | Le projet, unité centrale actuelle |
| **IGINI** (12 sous-modules) | `igini/analysis`, `planning`, `financing`, `development`, `transmission` (5 générateurs), `scoring`, `automation`, `memory`, `usage`, `workflow`, `knowledge`, `claude` | Le moteur d'IA : 5 générateurs séquentiels, chacun appelant Claude une fois, plus des moteurs de support (score, tâches automatiques, mémoire, workflow) |
| **Gouvernance** | `constitution`, `compliance` | 24 articles constitutionnels (12 `enforced`, 12 `declared`), obligations légales françaises |
| **Social** | `community`, `marketplace` | Vitrine publique de projets, annuaire mentors/investisseurs |
| **Business** | `crm`, `billing`, `ledger`, `banking`, `financing`, `investors`, `finance-audit` | CRM, facturation légale, comptabilité en partie double, comptes bancaires déclarés, tours de financement, investisseurs multi-projets |
| **Système** | `offres`, `observability`, `journey`, `mail` | Catalogue d'abonnements, santé/erreurs, parcours d'accueil, email |

### La base (PostgreSQL 17, Supabase `eu-west-1`) — 50 tables

Le schéma est déjà organisé en familles cohérentes, pas en un tas de
tables :

- **Identité** : `users`, `auth_tokens`, `user_roles`, `user_profiles`.
- **Projet & IA** : `projects`, `analyses`, `build_plans`, `financing_plans`,
  `development_plans`, `transmission_plans`, `memories`, `concepts`,
  `concept_links`, `tasks`, `score_snapshots`.
- **Automatisation** : `automation_runs`, `workflow_definitions`,
  `workflow_steps`, `workflow_runs`, `workflow_events`.
- **Social** : `community_comments`, `project_collaborators`,
  `marketplace_profiles`, `marketplace_contacts`.
- **Conformité** : `compliance_requirements`, `project_compliance_checks`.
- **Gouvernance** : `constitution_articles`, `constitution_violations`.
- **Argent du porteur** : `billing_documents/lines/payments`,
  `crm_companies/contacts/interactions`, `financing_rounds`,
  `equity_holders`, `equity_events`, `dividend_distributions`,
  `buyback_objectives`.
- **Argent d'Ignitux** : `ledger_accounts/entries/lines`,
  `bank_accounts/transactions` — caisses séparées, vérifiées par un audit
  dédié.
- **Investisseurs** : `investors`, `financed_projects`, `participations`,
  `investor_movements` — un investisseur traverse les projets, l'argent
  jamais (déjà conforme au principe que la vision demande de garder).
- **Produit** : `subscriptions` (catalogue d'offres), `ai_usage_events`
  (télémétrie IA, sans montant figé).

### L'interface (Next.js 15, App Router) — ~25 routes

Navigation actuelle, strictement page-par-page :
`/`, `/login…verify-email` (5 pages d'auth), `/projects`,
`/projects/[id]` (avec sections : analyse, financement, automatisation,
workflow, conformité, collaborateurs, finances), `/crm`, `/facturation`,
`/facturation/[id]`, `/comptabilite`, `/banque`, `/investisseur`,
`/community`, `/community/[id]`, `/marketplace`, `/constitution`, `/roles`,
`/profil`, `/account`, `/offres`, `/consommation-ia`.

Chaque module métier a sa page fixe, listée dans un menu. C'est la
structure que la vision demande de faire disparaître de l'expérience —
pas de la base de code.

### Ce qui existe déjà et que la vision demande, sans le savoir

Trois éléments de la vision sont **déjà construits** :

1. **Multi-rôle** (`user_roles`) : un compte peut déjà être
   `entrepreneur` + `investisseur` + `mentor` simultanément. Le rôle est
   une vue, jamais un conteneur — exactement le principe demandé au
   point 3.
2. **Séparation des investissements** (`investors`, `participations`,
   `financed_projects`, `investor_movements`) : un investisseur suit déjà
   séparément chaque projet, sans mélange d'argent. C'est le principe
   constitutionnel `investissements-non-melanges` cité au point 4 — il
   est `enforced`, pas seulement déclaré.
3. **Moteur constitutionnel** : la vision veut « masquer les outils
   inutiles » sans jamais tromper l'utilisateur. Les 24 articles, en
   particulier ceux sur la transparence et l'autonomie supervisée, sont
   le cadre naturel pour décider ce qu'IGINI peut faire sans demander.

---

## 2. Comparaison avec la nouvelle vision

| Dimension | Aujourd'hui | Vision 2.0 |
|---|---|---|
| Point d'entrée | Le projet | IGINI |
| Navigation | Menu fixe, tout visible | Applications débloquées progressivement |
| IGINI | 5 générateurs, appelés à la demande, aucun état conversationnel | Assistant permanent, proactif, qui garde le contexte |
| Mémoire | `memories.category` : 5 valeurs (`decision`, `preference`, `learning`, `fact`, `error`) — l'interface n'en propose que 4, `error` manque au sélecteur. Consultée seulement quand on l'ouvre | 6 types demandés : il ne manque que `objectif`. Relue activement par IGINI avant d'agir |
| Modules métier | Fixes, toujours listés (CRM, facturation…) | Activables/masquables selon rôle, secteur, pays, progression |
| Secteurs couverts | Génériques (tout entrepreneur) | + Immobilier, Véhicules, Publicité |
| Plateformes | Web seul (Next.js) | Web + Android + iOS + Windows |
| Modèle économique | Catégorie A seule (parcours entrepreneurial) | Catégorie A + Catégorie B (abonnement SaaS pour entreprise déjà existante) |
| Rôles | Déjà multi-rôle | Conforme — à garder tel quel |
| Séparation investisseur | Déjà faite, `enforced` | Conforme — à garder et à rendre plus visible dans l'interface |

Le décalage n'est donc **pas dans les données ni dans les règles** — il
est dans **la couche d'expérience** : comment l'utilisateur découvre et
atteint ce qui existe déjà en base.

---

## 3. Ce qui peut être conservé

- **Le schéma Prisma en entier**, les 50 tables. Aucune n'entre en
  contradiction avec la vision ; plusieurs l'anticipent déjà (rôles,
  investisseurs).
- **Le moteur constitutionnel**, 24 articles. La vision en a besoin pour
  cadrer ce qu'IGINI peut décider seul.
- **Le système de rôles** (`user_roles`) tel quel.
- **La séparation investisseur** telle quelle.
- **Les 5 générateurs IGINI** — leur logique et leurs prompts ne
  changent pas ; ils deviennent des *capacités* qu'IGINI mobilise, plutôt
  que des pages qu'on ouvre une par une.
- **`crm`, `billing`, `ledger`, `banking`** — deviennent des
  « applications » au sens App Store interne (point 5). Le code métier ne
  change pas ; seul le point d'accès change.
- **L'API NestJS**, REST, déjà découplée du frontend — prête à servir un
  second client (mobile) sans réécriture.
- **L'authentification JWT sans état serveur** — portable vers mobile
  sans changement.
- **Docker Compose, les deux images** — l'infrastructure ne bouge pas.

## 4. Ce qui doit être déplacé

- **La logique de navigation** : aujourd'hui des routes Next.js en dur
  (`/crm`, `/comptabilite`…) → doit devenir pilotée par des données (un
  catalogue d'applications + des règles d'activation), pas par des liens
  fixes dans un menu.
- **L'onboarding** : aujourd'hui `/signup` puis directement un projet →
  doit devenir le flux en 5 étapes du point 3 de la vision (qui es-tu /
  contexte / analyse IGINI / parcours / déblocage progressif).
- **L'accès aux modules métier** : `/crm`, `/facturation`,
  `/comptabilite`, `/banque` restent des pages, mais leur visibilité se
  déplace de « toujours affiché » vers « affiché seulement si
  l'application est activée pour ce compte ».

## 5. Ce qui doit être supprimé

Rien dans le modèle de données. C'est la conclusion la plus importante de
cet audit : **le travail déjà fait sur les données et les règles reste
valable en entier**. La seule chose obsolète est un principe d'expérience, pas une
table ni un module :

- **Le parcours strictement linéaire** Découvrir → Construire → Financer
  → Développer → Transmettre comme unique chemin pour tout le monde. Il
  reste pertinent pour la Catégorie A (créateurs de projet), mais ne doit
  plus être le seul chemin possible — un restaurateur qui a déjà son
  activité n'a pas besoin de « Découvrir », il a besoin de Caisse, Stocks,
  Comptabilité, CRM immédiatement.

## 6. Ce qui doit être créé

| # | Élément | Nature |
|---|---|---|
| a | Table `applications` | Catalogue : slug, nom, catégorie, icône, conditions d'activation (rôle/secteur/pays/étape) |
| b | Table `user_applications` (ou extension de `user_roles`) | Trace ce qui est activé/masqué par compte |
| c | Service `applications.service.ts` | Décide les apps visibles à partir du profil + rôle + activité + projets |
| d | Route `GET /me/applications` | Remplace la navigation en dur côté API |
| e | « App launcher » frontend | Écran d'accueil façon smartphone, remplace le menu fixe |
| f | Nouvel onboarding multi-étapes | Le flux en 5 étapes du point 3, avant ou en complément de `/journey` actuel |
| g | IGINI conversationnel | Nouveau module : table de conversation/messages, moteur de contexte qui agrège projets + profil + historique + mémoire |
| h | Mémoire long terme étendue | Ajouter `objectif` aux 5 catégories existantes (une ligne dans `memory-category.ts`), et surtout lui donner un rôle actif : IGINI la relit avant d'agir, pas seulement quand on la consulte |
| i | Module **Immobilier** — architecture seule | Table de besoins (type de bien, budget, localisation, statut), aucune intégration tierce pour l'instant |
| j | Module **Véhicules** — architecture seule | Même logique (type, usage, budget) |
| k | Module **Publicité** — architecture seule | Campagnes, contenu, suivi — sans connexion aux réseaux sociaux pour l'instant |
| l | Offre Catégorie B | Nouvelle valeur dans `subscriptions.offre`, accès direct au bouquet professionnel sans parcours entrepreneurial |
| m | Versionnement de l'API (`/v1/...`) | Pour ne pas casser le web en faisant évoluer l'API pour un futur client mobile |
| n | Application mobile | Nouveau projet séparé (voir point 12) |

---

## 7. Roadmap V2

| Phase | Contenu | Casse l'existant ? |
|---|---|---|
| **0 — Fondations** | Catalogue d'applications, service de droits, `GET /me/applications`, versionnement API | Non — additif |
| **1 — App launcher web** | Nouvel écran d'accueil, navigation par applications, nouvel onboarding | Change l'expérience, pas les données |
| **2 — IGINI permanent** | Conversation, mémoire enrichie, proactivité encadrée par la constitution | Additif |
| **3 — Catégorie B** | Nouvelle offre SaaS, accès direct aux apps professionnelles | Additif |
| **4 — Architecture des 3 modules** | Immobilier, Véhicules, Publicité — modèles de données + écrans basiques, sans intégration tierce | Additif |
| **5 — Mobile** | PWA installable d'abord ; application des stores (React Native) seulement si nécessaire | PWA : non. Stores : nouveau projet |

L'ordre est déterminé par la dépendance : le launcher (Phase 1) a besoin
du catalogue (Phase 0) ; IGINI permanent (Phase 2) est plus utile une fois
qu'il a des applications à orchestrer.

## 8. Estimation du travail

Hypothèse : un développeur à temps plein, avec le niveau d'exigence déjà
tenu sur ce projet (tests unitaires et e2e pour chaque règle qui protège
de l'argent ou des données).

| Phase | Durée estimée |
|---|---:|
| 0 — Fondations | 2-3 semaines |
| 1 — App launcher web | 4-6 semaines |
| 2 — IGINI permanent | 4-5 semaines |
| 3 — Catégorie B | 2-3 semaines |
| 4 — Architecture des 3 modules | 2 semaines (≈ 3-4 jours chacun) |
| **Sous-total, sans mobile** | **14-19 semaines (3,5-4,5 mois)** |
| 5a — PWA installable | +1 semaine |
| 5b — Application des stores (React Native), si nécessaire | +12-16 semaines |
| **Total avec PWA** | **≈ 4-5 mois** |
| **Total avec application des stores** | **≈ 7-9 mois** |

Ce sont des ordres de grandeur, pas des engagements — chaque phase peut
se découper davantage si besoin de jalons plus courts.

## 9. Risques techniques

1. **Une application native, quelle qu'elle soit, double les écrans à
   maintenir.** Avec Flutter, rien du React actuel ne se réutilise ; avec
   React Native, la logique se partage mais pas les écrans. Risque
   concret : deux interfaces qui divergent. C'est la raison de commencer
   par la PWA.
2. **Le coût d'IGINI change de nature.** Cinq appels par génération
   deviennent un flux conversationnel potentiellement continu. Le budget
   IA actuel (50 €/mois, mesuré à 360 utilisateurs gratuits environ) doit
   être recalculé avant d'activer un assistant permanent pour tout le
   monde — sinon le plafond de coût explose sans prévenir.
3. **Le système d'activation d'applications est une nouvelle surface
   d'autorisation.** Une erreur ici n'est pas cosmétique : c'est le risque
   qu'un compte voie ou atteigne des données d'un module auquel il ne
   devrait pas avoir accès. Demande une couverture de tests dédiée,
   symétrique à celle déjà faite pour `investissements-non-melanges`.
4. **La combinatoire de test grossit.** Rôle × activité × pays ×
   progression multiplie les scénarios. Tester chaque combinaison est
   impossible ; il faudra tester la règle d'activation elle-même, comme
   une fonction pure, plutôt que chaque écran.
5. **La proactivité d'IGINI touche directement l'article constitutionnel
   sur la transparence.** L'automatisation actuelle agit déjà sans
   confirmation dans un périmètre étroit et documenté
   (`automation_runs`). Étendre ce pouvoir à un assistant façon Jarvis
   mérite une revue constitutionnelle explicite avant activation, pas une
   extension silencieuse du périmètre existant.
6. **Les modules Immobilier et Véhicules impliquent, à terme, des
   intégrations tierces** (annonces immobilières, plateformes de
   véhicules). Risque juridique et de coût si mal négocié — scraping non
   autorisé contre API officielle payante. Hors du périmètre de cette
   phase (architecture seule), mais à anticiper.
7. **Deux marchés dans un seul produit.** Catégorie A (créateur de
   projet, accompagnement) et Catégorie B (PME établie, SaaS) ont des
   attentes très différentes en fiabilité, support et tarification. Les
   confondre dans une seule tarification ou un seul discours produit
   affaiblirait les deux.

## Multi-plateforme (point 12 de la demande)

**Une correction d'abord** : la demande décrit la pile comme
« FastAPI + PostgreSQL + React ». Ce n'est pas le cas — aucun fichier
Python dans le dépôt. La pile réelle est **NestJS (TypeScript) +
PostgreSQL + Next.js (React)**. Ça change la réponse, et plutôt en bien :
tout le produit est dans un seul langage.

**L'API est déjà prête pour plusieurs clients** : REST, JWT sans session
serveur, aucun état en mémoire. Une application mobile peut l'appeler
demain sans modification. Ce qui manque, c'est le versionnement (`/v1`),
pour pouvoir faire évoluer l'API sans casser un client déjà installé sur
un téléphone qu'on ne peut pas mettre à jour de force.

**Les trois trajectoires possibles** :

| Option | Réutilise le code actuel | Android + iOS | Windows | Coût |
|---|---|---|---|---|
| **PWA** (application web installable) | 100 % — le service worker hors ligne existe déjà | Oui, installable depuis le navigateur | Oui | Quelques jours |
| **React Native / Expo** | Logique, types, appels API (même langage) ; les écrans sont à refaire | Oui, sur les stores | Partiel | 3-4 mois |
| **Flutter** | Rien — langage Dart, tout est à réécrire | Oui, sur les stores | Oui | 4-5 mois |

**Recommandation : PWA d'abord, React Native ensuite si les stores
deviennent nécessaires. Pas Flutter.**

- La PWA donne « l'impression d'une application » (icône sur l'écran
  d'accueil, plein écran, hors ligne) presque gratuitement, parce que le
  travail hors ligne est déjà fait. C'est la réponse la plus rapide à la
  vision « smartphone professionnel ».
- Flutter est un excellent outil, mais ici il impose un second langage et
  une seconde base de code d'écrans, sans rien réutiliser. Pour une
  équipe d'une personne, c'est doubler la maintenance.
- React Native garde tout en TypeScript : les types de l'API, la
  validation, la logique de la file hors ligne se partagent.

Ce qui ne change pas quel que soit le choix : le serveur, la base, la
constitution. Rien de l'existant n'est cassé.

## 10. Proposition d'architecture cible — IGNITUX 2030

```
                        ┌─────────────────────────────┐
                        │      IGINI (transverse)      │
                        │ assistant permanent, mémoire  │
                        │ long terme, proactivité       │
                        │ encadrée par la constitution  │
                        └──────────────┬────────────────┘
                                       │
                 ┌─────────────────────┼─────────────────────┐
                 │                     │                     │
        ┌────────▼────────┐   ┌────────▼────────┐   ┌────────▼────────┐
        │   Client Web     │   │  PWA installable │   │  App des stores  │
        │   (Next.js,      │   │  (même code,     │   │  (React Native,  │
        │   conservé)      │   │  Android/iOS/Win)│   │  si nécessaire)  │
        └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
                 │                     │                     │
                 └─────────────────────┼─────────────────────┘
                                       │
                          ┌────────────▼────────────┐
                          │   API NestJS versionnée   │
                          │   (/v1/...)                │
                          │  + app-registry (nouveau)  │
                          │  + igini-assistant (nouveau)│
                          └────────────┬────────────┘
                                       │
                          ┌────────────▼────────────┐
                          │  35 modules existants,    │
                          │  inchangés dans leur       │
                          │  logique métier            │
                          │  (crm, billing, ledger,    │
                          │  banking, investors, …)     │
                          └────────────┬────────────┘
                                       │
                          ┌────────────▼────────────┐
                          │  PostgreSQL 17 (Supabase)  │
                          │  50 tables existantes +    │
                          │  applications,              │
                          │  user_applications,         │
                          │  igini_conversations,       │
                          │  real_estate_needs,         │
                          │  vehicle_needs,              │
                          │  marketing_campaigns         │
                          └─────────────────────────┘
```

**Le principe directeur** : aucune des 35 briques métier actuelles ne
change de place dans cette pyramide — elles descendent d'un rang
seulement, de « page qu'on visite » à « application qu'IGINI active ».
Ce qui monte d'un rang, c'est IGINI : il cesse d'être un onglet parmi
d'autres pour devenir la couche qui décide quoi montrer, quand, et sur
quel client.

**Ce que ça veut dire concrètement pour l'utilisateur** :

- Il ouvre IGNITUX (web ou mobile, indifféremment — même compte, mêmes
  données).
- Il voit IGINI, pas un menu.
- IGINI lui montre 3 à 6 applications pertinentes pour son rôle, son
  secteur et son avancement — pas 25 pages.
- Chaque application ouverte est un module déjà existant et déjà
  éprouvé (CRM, facturation, comptabilité…), simplement présenté au bon
  moment plutôt que tout le temps.

**Ce que ça veut dire pour le code** : une nouvelle couche d'orchestration
(catalogue + droits + assistant conversationnel) au-dessus d'un système
qui, sur le fond, a déjà la bonne forme.
