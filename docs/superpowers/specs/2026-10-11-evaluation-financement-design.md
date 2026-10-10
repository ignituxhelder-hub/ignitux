# Évaluation de financement — conception

**Date** : 11/10/2026
**Statut** : conception validée par Helder, partie par partie, le 11/10/2026.
**Contexte** : depuis le 10/10/2026, l'évaluation de financement n'est plus vendue à part
(99 €). Elle est comprise dans l'offre Entrepreneur (20 €/mois) et affichée « bientôt
disponible » sur la page des offres. Ce document décrit le parcours qui rend cette promesse vraie.

## 1. Objectif

Permettre à un entrepreneur d'obtenir un **avis argumenté sur la finançabilité de son projet**, et
un **dossier PDF** qu'il envoie lui-même à une banque ou à des investisseurs.

Trois décisions fondatrices :

1. **IGINI rédige, un humain valide.** Le rapport est généré par IGINI puis relu par un
   administrateur Ignitux (aujourd'hui : Helder). Rien n'atteint l'entrepreneur sans validation.
2. **Ignitux ne touche pas à la relation avec le financeur.** Pas de mise en relation, pas d'envoi
   aux investisseurs inscrits, pas de commission. L'entrepreneur reçoit un dossier et en fait ce
   qu'il veut. C'est ce qui tient le parcours hors du champ réglementé de l'intermédiation.
3. **Le jugement est séparé du plan.** Le générateur « Financer » dit *comment* financer ;
   l'évaluation dit *si c'est finançable*. Ce sont deux documents distincts.

## 2. Ce qui n'est PAS dans ce périmètre

- La mise en relation avec des investisseurs ou des banques.
- L'envoi d'emails (aucun transport ne fonctionne en production ; voir la tâche « emails »).
- Le paiement : l'évaluation est comprise dans Entrepreneur, aucun encaissement.
- La modification du générateur « Financer ».

## 3. Le rapport

### 3.1 Le verdict — trois niveaux, un seul choisi

| Valeur | Libellé |
|---|---|
| `financable` | Finançable en l'état |
| `financable_apres_corrections` | Finançable après corrections |
| `pas_financable_en_l_etat` | Pas finançable en l'état |

« Pas finançable en l'état » est un résultat, pas un échec du service : le rapport dit pourquoi et
ce qui changerait la réponse.

### 3.2 Les sections

| Section | Contenu | Dans le PDF ? |
|---|---|---|
| Résumé | verdict, montant recherché, usage des fonds — 5 lignes | oui |
| Audit | ce qu'Ignitux sait du projet, et surtout ce qui manque | **non** — écran seulement |
| Faisabilité | marché, modèle économique, besoin face à la capacité de remboursement ou de rentabilité | oui (sous « Présentation ») |
| Dossier | pièces qu'un financeur demandera : prête dans Ignitux / manquante | oui |
| Risques | 3 à 6 risques, gravité faible / moyenne / forte, comment les réduire | oui |
| Pistes de financement | types adaptés (prêt bancaire, prêt d'honneur, Bpifrance, subventions, apport, investisseurs), à titre d'information, sans recommandation personnalisée | oui |
| Prochaines étapes | 3 à 5 actions concrètes, ordonnées | oui |

### 3.3 Règle d'honnêteté

- Le rapport ne s'appuie **que** sur les données du projet en base, et nomme d'où vient chaque
  chiffre (analyse, plan de construction, plan de financement, contrôle de cohérence, conformité,
  comptabilité).
- Une information absente est écrite **comme un manque**, jamais comblée par une invention.
- Un projet presque vide produit un rapport court dont la section Audit est longue. C'est le
  comportement attendu.

Ces règles sont portées par la consigne (prompt) et par le schéma de sortie (champs obligatoires
`source` sur les chiffres, liste explicite `manques` dans l'Audit).

## 4. Les états d'une évaluation

```
demande ─► en_preparation ─► en_revue ─┬─► validee
                 │                     ├─► a_refaire ─► en_preparation (avec consigne)
                 ▼                     └─► refusee
               echec
```

| État | Vu par l'entrepreneur | Vu par l'administrateur |
|---|---|---|
| `en_preparation` | « En préparation… » | — |
| `echec` | « L'évaluation n'a pas pu être préparée » + bouton Réessayer | — |
| `en_revue` | « En cours de revue par Ignitux » — **pas le contenu** | dans la file |
| `a_refaire` | « En cours de revue par Ignitux » | transitoire : repart en préparation |
| `validee` | rapport complet + PDF | historique |
| `refusee` | motif de refus + possibilité de redemander | historique |

Règles :

- **Une seule évaluation active par projet** (`en_preparation`, `en_revue`, `a_refaire`). Une
  seconde demande est refusée en 409 avec une phrase lisible.
- **Instantané daté.** Le rapport validé porte « établi le JJ/MM/AAAA à partir des données du
  projet à cette date ». Redemander crée une nouvelle évaluation ; les anciennes restent dans
  l'historique.
- **Génération en arrière-plan.** La requête de demande crée la ligne `en_preparation` et rend la
  main immédiatement ; l'appel à IGINI (environ une minute) se termine hors requête et fait passer
  la ligne en `en_revue` ou `echec`. L'interface interroge l'état toutes les quelques secondes.
  Une ligne restée `en_preparation` plus de 10 minutes (redémarrage du serveur pendant l'appel) est
  considérée comme `echec` à la lecture.
- **Droit et coût.** La demande exige la capacité `evaluationFinancement` de l'offre
  (`OffresService.exiger`) ; refusée en Découverte en nommant Entrepreneur. Chaque génération
  (première ou « à refaire ») passe par `ClaudeService.generateStructuredOutput` sous un nouveau
  nom de générateur `evaluer`, hors des six générateurs de méthode (comme `executer`), et compte
  donc **une génération** dans le quota mensuel et dans `ai_usage_events`.

## 5. Revue par l'administrateur

Écran `/evaluations/revue`, rôle `administrateur` (`@RequireRole('administrateur')`), sur le modèle
de `/identite/revue`.

- **File** : évaluations `en_revue`, la plus ancienne d'abord — projet, entrepreneur, verdict
  proposé, temps d'attente.
- **Détail** : verdict modifiable (liste), chaque section modifiable, note d'Ignitux optionnelle
  (visible par l'entrepreneur, signée « Ignitux »).
- **Actions** :
  - **Valider et envoyer** → `validee`, horodatée, avec l'identifiant de l'administrateur ;
  - **Faire refaire** → consigne obligatoire, transmise à IGINI pour la génération suivante ;
  - **Refuser** → motif obligatoire, lu par l'entrepreneur.
- **Traçabilité** : chaque modification d'une section ou du verdict est enregistrée (qui, quand,
  quelle section, valeur avant / après). On distingue toujours ce qui vient d'IGINI de ce qui vient
  d'un humain.
- **Point d'entrée** : il n'existe aujourd'hui aucune entrée administrateur dans l'interface (la
  revue d'identité ne s'atteint que par son URL). On ajoute sur le bureau une tuile
  « Administration », visible du seul rôle `administrateur`, menant aux deux files de revue, avec le
  nombre d'évaluations en attente.

## 6. Côté entrepreneur

Nouvelle section « Évaluation de financement » dans la fiche projet :

- avant toute demande : explication + bouton « Demander une évaluation » (en Découverte :
  « Comprise dans l'offre Entrepreneur ») ;
- pendant : l'état (tableau du §4) ;
- validée : rapport à l'écran (verdict en évidence, note d'Ignitux, date), boutons
  « Télécharger le dossier (PDF) » et « Demander une nouvelle évaluation » ;
- refusée : le motif ;
- historique des évaluations précédentes (date, verdict).

Sur la page des offres, la mention « (bientôt disponible) » disparaît quand ce parcours est livré.

## 7. Le dossier PDF

Généré à la demande par `pdfkit`, comme `dossier-creation/dossier-pdf.ts`, uniquement pour une
évaluation `validee`, et uniquement pour le propriétaire du projet.

1. Page de garde : nom du projet, « Dossier de financement », date, « Évaluation établie par
   Ignitux ».
2. Résumé et verdict.
3. Présentation du projet : activité, marché, modèle économique, équipe (données du projet) et
   section Faisabilité.
4. Besoin de financement : montant, usage des fonds, pistes.
5. Risques et leur maîtrise.
6. Liste des pièces (prêtes / à fournir).
7. Pied de chaque page : « Évaluation indicative établie à partir des informations déclarées par
   le porteur. Elle ne constitue ni une offre ni une garantie de financement. »

La section Audit n'y figure pas.

## 8. Données

Nouvelle table `financing_evaluations` (migration additive, aucune table existante modifiée) :

- `id`, `project_id` (FK, suppression en cascade), `requested_by` (FK users)
- `status` (les états du §4), `verdict` (nullable tant que non généré)
- `report` (JSON : les sections, au format du schéma de sortie)
- `ai_draft` (JSON : la version d'IGINI telle que générée, jamais modifiée — base de la traçabilité)
- `admin_note`, `refusal_reason`, `redo_instruction` (texte, nullable)
- `reviewed_by`, `reviewed_at`, `failure_reason`
- `created_at`, `updated_at`

Nouvelle table `financing_evaluation_edits` : `evaluation_id`, `editor_id`, `section`, `before`,
`after`, `created_at`.

L'export RGPD (`user-data.service.ts`) et la suppression de compte doivent couvrir ces deux tables :
le test d'export (`constitution.e2e-spec.ts`) liste les clés attendues.

## 9. Gestion des erreurs

| Cas | Comportement |
|---|---|
| Offre Découverte | 403 portant `offreQuiOuvre: 'entrepreneur'` |
| Quota mensuel épuisé | refus existant de `ClaudeService` (« le compteur repart le 1er ») |
| Générateurs éteints (`IGINI_AI_ENABLED=false`) | 503 existant, aucune ligne créée |
| Évaluation déjà active | 409, phrase lisible |
| Réponse IGINI invalide / panne | ligne en `echec` avec `failure_reason`, bouton Réessayer |
| Projet d'un autre | 404 (on ne révèle pas l'existence) |
| PDF d'une évaluation non validée | 404 |
| Action admin sur une évaluation pas `en_revue` | 409 |

## 10. Tests

- **Schéma de sortie** : verdict borné aux trois valeurs, 3 à 6 risques, 3 à 5 étapes, sections
  obligatoires présentes.
- **Service** : transitions d'états autorisées et refusées ; une seule active par projet ; échec
  → `echec` ; `a_refaire` transmet la consigne ; édition enregistrée dans les traces ; contenu
  masqué tant que non validé.
- **Droits** : Découverte refusée en nommant Entrepreneur ; routes de revue réservées à
  `administrateur` ; projet d'un autre → 404.
- **PDF** : produit pour une évaluation validée, contient le pied de page et le verdict, **ne
  contient pas** la section Audit.
- **Interface** : section projet dans chaque état ; écran de revue (valider, refaire, refuser avec
  motif obligatoire) ; tuile Administration visible du seul administrateur ; « bientôt disponible »
  retiré de la page des offres.
- **Démarrage** : l'application démarre réellement (`node dist/main`) avec le nouveau module — les
  tests unitaires remplacent les gardes et ne voient pas une erreur d'injection (incident du
  10/10/2026).

## 11. Mise en production

Dans cet ordre (leçon du 10/10/2026) :

1. Helder applique la migration sur `ignitux_prod` : `verifier-base` (doit répondre ADDITIF),
   `sauvegarde`, `migrer-prod --appliquer`.
2. Ensuite seulement, le code est poussé sur `main` ; Vercel et Render se reconstruisent.
3. Vérification : `/ready` (schéma ok), une évaluation demandée sur un projet de test, revue,
   validation, PDF téléchargé.
