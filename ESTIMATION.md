# Estimation IGNITUX — avancement & effort de développement

**Date** : 19/09/2026 (mise à jour — version initiale le même jour, avant l'ajout
d'Automation/Compliance/Marketplace et la vérification complète des 5 générateurs IA).
**Nature de ce document** : estimation technique interne, pour suivre l'avancement du projet.
**Ce que ce document N'EST PAS** : une valorisation d'entreprise, un chiffre à présenter à des
investisseurs, ou une évaluation de la valeur de marché du concept IGNITUX. Aucune de ces choses
ne peut être estimée sérieusement à ce stade — voir la section 3 pour le détail.

Méthode : les pourcentages et heures ci-dessous viennent d'un audit du code réel (tests exécutés,
routes comptées, modules lus), pas d'une extrapolation de la roadmap. Quand un chiffre est une
estimation d'ordre de grandeur plutôt qu'un fait vérifiable, c'est dit explicitement.

Faits vérifiés au moment de l'audit :
- Backend : 261 tests automatisés (34 fichiers), 56 routes HTTP, 19 modèles Prisma, 12 contrôleurs.
- Frontend : 67 tests automatisés (18 fichiers), 14 routes Next.js, build de production réussi.
- Les tests backend/frontend ci-dessus tournent contre des dépendances **mockées** (Prisma, fetch).
  Une partie du parcours a aussi été vérifiée **en conditions réelles** avec des comptes de test sur
  la base Supabase de dev (signup → vérification email → connexion, reset de mot de passe,
  changement de mot de passe connecté, invitation d'un collaborateur, accès lecture seule aux 4
  moteurs transverses, checklist de conformité, profil marketplace). **Les 5 générateurs IA ont
  désormais tourné avec succès, les 5, en pipeline complet** (Analyser → Construire → Financer →
  Développer → Transmettre sur un même projet de test, chacun exploitant correctement le contexte
  des étapes précédentes) — voir `docs/status.md` et `PROGRESS.md` pour le détail. C'était le
  principal changement par rapport à la version précédente de ce document, où cette ligne était à
  0%.

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
| 2. Knowledge (mémoire/concepts) | ~65% | ~50% | CRUD + graphe SVG fonctionnels, accès collaborateur en lecture ajouté et testé. Alimentation **manuelle uniquement** — pas d'extraction automatique de concepts depuis les plans générés (Automation relie des concepts existants entre eux, mais n'en crée pas depuis le contenu généré), pas de recherche sémantique. |
| 3. Workflow (tâches) | ~70% | ~65% | CRUD tâches, changement de statut, création depuis les générateurs (champ `source`), et désormais des tâches créées/fermées automatiquement par Automation. Vérifié en conditions réelles sur un pipeline complet. |
| 4. IGINI (5 générateurs + persona) | ~85% | **~70%** | Schémas Zod, prompts, persistance — **les 5 générateurs ont tourné avec succès en conditions réelles**, en pipeline complet, avec mémoire commune vérifiée fonctionnelle (pas seulement en tests mockés). Pas à 100% : un seul cas de test couvert (pas de variété de projets), pas de test de charge, modèle `claude-opus-5` coûteux non remis en question. |
| 5. Automation (5ᵉ moteur, tâches + liens de concepts sans confirmation) | ~65% | ~55% | Créé cette session : crée/ferme des tâches d'étape et relie des concepts par mot-clé, sans confirmation humaine, sans jamais appeler Claude elle-même. Vérifié en conditions réelles (tâches créées/fermées sur un pipeline complet) ; l'auto-liaison de concepts est bien testée unitairement mais moins vérifiée en conditions réelles. Pas d'exécution planifiée (pas de cron) — se déclenche sur événement (génération) ou manuellement. |
| 6. Compliance (modules pays, réglementation) | ~45% | ~50% | Créé cette session, **France uniquement** : 12 démarches sourcées (pas de contenu inventé), suivi par projet, disclaimer explicite. Structure prête pour d'autres pays (champ `country`) mais aucun autre contenu écrit — nécessite une source réglementaire fiable par pays, non trouvée à ce jour. |
| 7. Marketplace | ~40% | ~50% | Créé cette session : annuaire mentors/investisseurs, profil, mise en relation par message. **Aucune transaction financière** (choix assumé) — pas de paiement, pas de gestion de participation, pas de notifications, pas de recherche avancée. |
| 8. Public (lancement, utilisateurs réels) | ~5% | ~5% | Inchangé : le mécanisme public/privé existe et fonctionne (interne à l'app), mais pas de déploiement production connu, pas d'utilisateurs réels, identité visuelle volontairement provisoire tant que le produit n'est pas validé. |

**Pas de moyenne globale unique fournie volontairement** : les 8 phases n'ont ni la même taille ni
le même poids stratégique. Changement principal depuis la version précédente : les phases 4 à 7,
qui étaient soit à 0% vérifié (IGINI) soit à 0% tout court (Automation/Compliance/Marketplace), ont
maintenant du code réel, testé, et vérifié en conditions réelles. Restent à 0% ou presque : la
phase 8 (lancement public réel) et tout ce qui dépend de décisions produit non prises (modèle
économique, choix d'un deuxième pays pour Compliance).

---

## 2. Estimation coût / effort de développement

Portée : ce qui est **fonctionnel et vérifié en conditions réelles** au sens de la section 1 —
fondations, projets, collaboration, 4 moteurs transverses, communauté, les 5 générateurs IA (donc
plus de distinction "code seul non vérifié", contrairement à la version précédente), Automation,
Compliance, Marketplace. Hypothèse de travail inchangée : un·e développeur·se freelance sénior
autonome (full-stack NestJS/Next.js/Prisma), pas une équipe junior, ni une agence avec du temps de
gestion de projet en plus.

| Périmètre | Effort estimé | Jours-homme (8h/j) |
|---|---|---|
| **(A) Version précédente** — fondations, projets, collaboration, 4 moteurs transverses, communauté, 5 générateurs IA (code + désormais vérifiés), frontend correspondant, infra de tests | 340–500 h | ~42–63 j |
| **(B) + Automation, Compliance, Marketplace** (nouveau cette session, code + tests + vérification en conditions réelles pour les 3) | +140–200 h | +~18–25 j |
| **Total actuel (A + B)** | 480–700 h | ~60–88 j |

Fourchette de coût, tarifs de marché européens (2026, ordre de grandeur, pas un devis) :

| Scénario | Taux horaire | Total actuel (480–700 h) |
|---|---|---|
| Freelance indépendant | 40–70 €/h | 19 200 – 49 000 € |
| Agence | 90–150 €/h | 43 200 – 105 000 € |

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

## Changements depuis la première version (même jour)

- Phase 4 (IGINI) : testé en conditions réelles ~0% → ~70% (clé API débloquée, pipeline complet des
  5 générateurs vérifié).
- Phases 5–7 (Automation, Compliance, Marketplace) : 0%/0% → code et vérification réels sur les
  trois, suite à une demande explicite avec trois clarifications de périmètre avant de coder
  (automatisation sans confirmation mais sans appel Claude propre, France uniquement pour
  Compliance, aucun argent pour Marketplace).
- Coût total estimé du travail fonctionnel et testé : 340–500 h → 480–700 h.
- Ce qui n'a pas changé : phase 8 (lancement public), et tout ce qui dépend d'une décision produit
  non prise (modèle économique, deuxième pays pour Compliance, fournisseur d'email réel).

## Pour suivre l'évolution de ces chiffres

Les leviers qui feraient le plus bouger la section 1 à partir de maintenant : (1) une décision de
modèle économique avant de développer davantage Financement, (2) une source réglementaire fiable
pour étendre Compliance à un deuxième pays, (3) un vrai déploiement production pour faire bouger la
phase 8. Voir `docs/status.md` et `PROGRESS.md` pour le détail des blocages actuels.
