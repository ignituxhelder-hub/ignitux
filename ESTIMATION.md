# Estimation IGNITUX — avancement & effort de développement

**Date** : 19/09/2026
**Nature de ce document** : estimation technique interne, pour suivre l'avancement du projet.
**Ce que ce document N'EST PAS** : une valorisation d'entreprise, un chiffre à présenter à des
investisseurs, ou une évaluation de la valeur de marché du concept IGNITUX. Aucune de ces choses
ne peut être estimée sérieusement à ce stade — voir la section 3 pour le détail.

Méthode : les pourcentages et heures ci-dessous viennent d'un audit du code réel (tests exécutés,
routes comptées, modules lus), pas d'une extrapolation de la roadmap. Quand un chiffre est une
estimation d'ordre de grandeur plutôt qu'un fait vérifiable, c'est dit explicitement.

Faits vérifiés au moment de l'audit :
- Backend : 208 tests automatisés (29 fichiers), 44 routes HTTP, 14 modèles Prisma, 10 contrôleurs.
- Frontend : 57 tests automatisés (14 fichiers), 13 routes Next.js, build de production réussi.
- Les tests backend/frontend ci-dessus tournent contre des dépendances **mockées** (Prisma, fetch).
  Une partie du parcours a aussi été vérifiée **en conditions réelles** avec deux comptes réels sur
  la base Supabase de dev (signup → vérification email → connexion, reset de mot de passe,
  changement de mot de passe connecté, invitation d'un collaborateur, accès lecture seule aux 4
  moteurs transverses). Les 5 générateurs IA n'ont, eux, **jamais tourné avec succès** de bout en
  bout : `ANTHROPIC_API_KEY` est absente de `backend/.env` depuis le début du suivi — voir
  `docs/status.md`.

---

## 1. Avancement par phase (roadmap en 8 phases)

Roadmap de référence : Fondations → Knowledge → Workflow → IGINI → Automation → Compliance →
Marketplace → Public.

Pour chaque phase : **% code écrit** (la logique existe et compile) vs **% testé en conditions
réelles** (vérifié soit par un test automatisé contre une vraie base/API, soit manuellement avec de
vraies données — pas seulement des mocks).

| Phase | Code écrit | Testé en conditions réelles | Commentaire |
|---|---|---|---|
| 1. Fondations (backend, DB, auth) | ~90% | ~85% | Auth complète (JWT, bcrypt, rate-limit, reset/vérification email, changement de mdp connecté), CRUD projets, visibilité publique/privée, collaboration. Vérifié avec de vrais comptes. Reste : email envoyé en vrai (actuellement journalisé seulement, aucun fournisseur choisi), déploiement production non fait. |
| 2. Knowledge (mémoire/concepts) | ~65% | ~50% | CRUD + graphe SVG fonctionnels, accès collaborateur en lecture ajouté et testé. Alimentation **manuelle uniquement** — pas d'extraction automatique de concepts depuis les plans générés, pas de recherche sémantique. |
| 3. Workflow (tâches) | ~65% | ~55% | CRUD tâches, changement de statut, création semi-automatique depuis les générateurs (champ `source`). Testé avec mocks + vérifié en conditions réelles pour l'accès collaborateur. Pas d'automatisation d'exécution. |
| 4. IGINI (5 générateurs + persona) | ~85% | **~0%** | Schémas Zod, prompts, persistance, tests unitaires avec Claude **mocké** — le code est écrit et cohérent, mais **aucun appel réel à l'API Claude n'a jamais réussi** (clé API absente). C'est la phase la plus avancée en volume de code et la moins vérifiée en pratique : ne pas confondre "code prêt" et "fonctionnalité qui marche". |
| 5. Automation (exécution autonome de tâches) | ~0% | 0% | Explicitement hors scope pour l'instant (choix assumé, documenté dans `docs/status.md`) — aucun code. |
| 6. Compliance (modules pays, réglementation) | ~0% | 0% | Rien n'existe. Nécessite une source réglementaire fiable par pays ; inventer du contenu légal serait dangereux. |
| 7. Marketplace | ~0% | 0% | Aucune spec, aucun code. La "Communauté" existante (projets publics + encouragements) n'est pas une marketplace (pas de paiement, pas de mise en relation mentors/investisseurs). |
| 8. Public (lancement, utilisateurs réels) | ~5% | ~5% | Le mécanisme public/privé existe et fonctionne (interne à l'app), mais pas de déploiement production connu, pas d'utilisateurs réels, identité visuelle volontairement provisoire tant que le produit n'est pas validé. |

**Pas de moyenne globale unique fournie volontairement** : les 8 phases n'ont ni la même taille ni
le même poids stratégique (Compliance et Marketplace sont des phases massives à 0%, ce qui
écraserait un chiffre moyen sans le rendre plus informatif). Si un seul repère est utile : le
produit a une base technique solide (phases 1–3) mais son cœur de valeur perçue — la génération IA
(phase 4) — n'a jamais tourné en conditions réelles, et les phases 5 à 8 n'ont pas commencé.

---

## 2. Estimation coût / effort de développement

Portée : uniquement ce qui est **fonctionnel et testé** au sens de la section 1 (grosso modo les
phases 1 à 3, plus la partie "Communauté"), avec un chiffre séparé qui inclut aussi le code des 5
générateurs IA écrit mais non vérifié. Hypothèse de travail : un·e développeur·se freelance
sénior autonome (full-stack NestJS/Next.js/Prisma), pas une équipe junior qui aurait besoin de plus
de temps, ni une agence avec du temps de gestion de projet en plus.

| Périmètre | Effort estimé | Jours-homme (8h/j) |
|---|---|---|
| **(A) Fonctionnel ET testé** — fondations, projets, collaboration, 4 moteurs transverses, communauté, frontend correspondant, infra de tests | 280–410 h | ~35–51 j |
| **(B) A + code des 5 générateurs IA** (écrit, testé unitairement avec mocks, jamais vérifié avec la vraie API) | 340–500 h | ~42–63 j |

Fourchette de coût, tarifs de marché européens (2026, ordre de grandeur, pas un devis) :

| Scénario | Taux horaire | (A) Fonctionnel et testé | (B) Y compris générateurs IA (code seul) |
|---|---|---|---|
| Freelance indépendant | 40–70 €/h | 11 200 – 28 700 € | 13 600 – 35 000 € |
| Agence | 90–150 €/h | 25 200 – 61 500 € | 30 600 – 75 000 € |

Ces chiffres sont des **ordres de grandeur** issus d'une estimation de la complexité du code
existant (nombre de modules, de tests, de routes, de tables), pas d'un chronométrage réel du temps
qui a été passé dessus — je n'ai pas cette donnée. Ne pas les traiter comme un décompte d'heures
facturées.

---

## 3. Trois valeurs à ne pas confondre

1. **Valeur du travail déjà fait** (coût de reconstruction) — c'est le chiffre de la section 2 :
   ce qu'il en coûterait de refaire ce qui existe et fonctionne, au tarif du marché. C'est une
   estimation défendable parce qu'elle se base sur du code observable.

2. **Valeur potentielle du projet une fois terminé** — **je ne fournis pas de chiffre**, et ce
   n'est pas de la prudence excessive : ce chiffre dépendrait d'un modèle économique qui n'existe
   pas encore (aucune logique d'abonnement/paiement n'est codée, "Financement" reste un texte
   généré sans backend transactionnel), d'une validation par de vrais utilisateurs qui n'a pas eu
   lieu, et de l'exécution des phases 5 à 8 qui n'ont pas commencé. Toute estimation ici serait une
   pure spéculation habillée en chiffre.

3. **Valeur de l'idée/du concept IGNITUX en tant que tel** — **je ne fournis pas de chiffre** non
   plus. C'est un principe général en création d'entreprise (une idée seule vaut très peu tant
   qu'elle n'est pas exécutée et validée par le marché), pas une évaluation défavorable
   spécifique à ce projet. Il n'existe pas de méthode sérieuse pour mettre un montant en euros sur
   un concept non validé, et en inventer un serait trompeur.

---

## Pour suivre l'évolution de ces chiffres

Ce document est une photo au 19/09/2026. Les deux leviers qui feraient le plus bouger la section 1
sont, dans l'ordre : (1) obtenir une clé `ANTHROPIC_API_KEY` fonctionnelle pour enfin vérifier la
phase 4 en conditions réelles, et (2) une décision produit sur le modèle économique avant de
commencer sérieusement "Financement"/Marketplace. Voir `docs/status.md` et `PROGRESS.md` pour le
détail des blocages actuels.
