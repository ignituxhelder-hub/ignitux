# Équipe et rôles — conception (livraison 1)

**Date** : 11/10/2026
**Statut** : rôles et tableau des droits validés par Helder le 11/10/2026 (« c'est bon, continue
jusqu'à appliquer »).

## 1. Objectif

Remplacer le collaborateur unique en lecture seule par des **rôles** sur un projet :
« inviter des associés et des salariés, chacun avec ce qu'il doit voir » (application « Équipe »
du bureau).

## 2. Décisions

1. **Par projet.** On invite quelqu'un sur un projet, avec un rôle. La table existante
   `project_collaborators` gagne une colonne `role`.
2. **Quatre rôles + le propriétaire** : `associe`, `salarie`, `comptable`, `observateur`. Les
   collaborateurs existants deviennent `observateur` (voit tout, ne modifie rien) : personne ne
   perd son accès.
3. **Ce qui engage l'entreprise reste au propriétaire seul** : actes juridiques, équipe,
   suppression du projet.
4. **Un associé qui lance IGINI consomme le quota du propriétaire** : l'appel est attribué au
   propriétaire (offre, quota, coût).

## 3. Tableau des droits

| Capacité | Propriétaire | Associé | Salarié | Comptable | Observateur |
|---|---|---|---|---|---|
| `voir_projet` (idée, analyse, plans, scores) | ✅ | ✅ | ✅ | ❌ | ✅ |
| `voir_plan_financement` | ✅ | ✅ | ❌ | ✅ | ✅ |
| `modifier_projet` (idée, secteur, forme, visibilité, plans) | ✅ | ✅ | ❌ | ❌ | ❌ |
| `voir_taches` | ✅ | ✅ | ✅ | ❌ | ✅ |
| `modifier_taches` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `voir_conformite_memoire` (conformité, mémoire, connaissances) | ✅ | ✅ | ✅ | ❌ | ✅ |
| `modifier_conformite_memoire` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `lancer_ia` (générateurs, automatisation, exécution de tâches) | ✅ | ✅ | ❌ | ❌ | ❌ |
| `demander_evaluation` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `voir_evaluation` (rapport validé seulement) | ✅ | ✅ | ❌ | ✅ | ✅ |
| `voir_financement` (tours, investisseurs, participation, audit financier) | ✅ | ✅ | ❌ | ✅ | ✅ |
| `modifier_financement` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `voir_documents_juridiques` (statuts, dossier de création, immatriculation) | ✅ | ✅ | ❌ | ✅ | ✅ |
| `actes_juridiques` (modifier/retenir les statuts, dossier, immatriculation, mandats) | ✅ | ❌ | ❌ | ❌ | ❌ |
| `gerer_equipe` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `supprimer_projet` | ✅ | ❌ | ❌ | ❌ | ❌ |

Le tableau validé disait « Financement : propriétaire modifie, associé voit » : `modifier_financement`
reste au propriétaire. L'Observateur reprend exactement l'accès des collaborateurs actuels.

Tout membre, quel que soit son rôle (comptable compris), voit le **titre et la description** du
projet et la liste de l'équipe : c'est ce qui lui dit sur quel projet il travaille. Le reste suit
le tableau.

Les membres qui ont `voir_documents_juridiques` lisent les statuts, le dossier de création et
l'immatriculation dans l'outil « Documents juridiques » (lecture seule, PDF téléchargeables). Le
propriétaire garde les sections complètes dans l'étape « Forme juridique ».

## 4. Ce qui n'est PAS dans cette livraison

- **Le comptable dans la comptabilité, la facturation et la banque du propriétaire** (livraison 2).
  Ces modules sont rangés par personne (`owner_id`), pas par projet ; y travailler « pour le compte
  de » quelqu'un est un chantier en soi. D'ici là, le comptable voit le financement, l'évaluation
  validée et les documents juridiques du projet.
- Inviter quelqu'un qui n'a pas encore de compte (aujourd'hui : refus « aucun compte ne correspond »,
  inchangé).
- Plusieurs propriétaires, transfert de propriété.

## 5. Architecture

### 5.1 Le cœur : `backend/src/equipe/`

- `droits-equipe.ts` (pur) : `ROLES_EQUIPE`, `CAPACITES`, `capacitesDe(role)`, `peutFaire(role, cap)`.
- `acces-projet.ts` : `accesProjet(prisma, userId, projectId)` → `{ role, ownerId }`, 404 si aucun
  accès ; `exigerCapacite(prisma, userId, projectId, cap)` → `{ role, ownerId }`, 404 sans accès,
  **403** avec une phrase lisible si le rôle ne permet pas.
- Route `GET /projects/:id/mon-acces` → `{ role, capacites }` pour l'interface.

### 5.2 Remplacement des contrôles existants

Partout où un service appelle `assertOwnsProject`, `assertHasProjectAccess`, `findOneForOwner` ou
`findOneForViewer` pour un **projet**, le contrôle devient `exigerCapacite(…, <capacité>)` selon le
tableau. Les filtres `owner_id: userId` sur des **comptes** (compta, banque, CRM, agenda,
immobilier, stocks) ne changent pas dans cette livraison.

Quand une action de l'associé appelle IGINI, l'attribution (`usage.userId`) et le contrôle d'offre
utilisent `ownerId`.

### 5.3 L'équipe

- `GET /projects/:id/collaborators` : liste avec rôle (accès `voir_projet` ou plus).
- `POST /projects/:id/collaborators { email, role }` (`gerer_equipe`) ; rôle par défaut `observateur`.
- `PATCH /projects/:id/collaborators/:userId { role }` (`gerer_equipe`).
- `DELETE` inchangé (`gerer_equipe`).
- À l'ajout, un email prévient la personne : projet, rôle, lien vers ignitux.com. Un email qui ne
  part pas n'annule pas l'ajout.

### 5.4 Interface

- La fiche projet lit `mon-acces` et n'affiche que les étapes et les boutons permis (les
  vérifications réelles restent côté serveur).
- La section « Collaborateurs » devient « Équipe » : rôle choisi à l'invitation, modifiable,
  explication courte de chaque rôle.

## 6. Données

Migration additive : `ALTER TABLE project_collaborators ADD COLUMN role TEXT NOT NULL DEFAULT
'observateur'`. Les lignes existantes prennent `observateur`.

## 7. Erreurs

| Cas | Réponse |
|---|---|
| Aucun accès au projet | 404 (on ne révèle pas son existence) |
| Accès, mais rôle insuffisant | 403, phrase qui nomme ce que le rôle ne permet pas |
| Rôle inconnu à l'invitation | 400 |
| Inviter le propriétaire / déjà membre | 400 (inchangé) |

## 8. Tests

- Tableau des droits : chaque rôle × chaque capacité, tel que le §3.
- `exigerCapacite` : 404 sans accès, 403 avec rôle insuffisant, propriétaire toujours autorisé.
- Pour chaque module touché : un salarié coche une tâche (OK) mais ne modifie pas le projet (403) ;
  un associé lance un générateur, attribué au propriétaire ; un comptable lit le financement mais
  pas les tâches ; un observateur ne modifie rien.
- Interface : sections masquées selon le rôle ; invitation avec rôle ; changement de rôle.
- Démarrage réel du serveur (`node dist/main`).

## 9. Mise en production

1. Migration sur `ignitux_prod` (vérifier → sauvegarder → appliquer).
2. Push sur `main`.
3. Vérifier `/ready`, puis inviter un compte de test sur ignitux.com avec chaque rôle.
