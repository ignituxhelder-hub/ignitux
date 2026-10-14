# Équipe — livraison 2 : la comptabilité « pour le compte de »

Validé avec Helder le 2026-10-14. Suite de `2026-10-11-equipe-roles-design.md` (rôles par
projet, en ligne). Ce lot ouvre au **comptable** et à l'**associé** les modules d'argent du
propriétaire, qui sont rangés par personne (`owner_id`) et non par projet.

## Règle

Une personne a accès à l'**espace argent** d'un propriétaire X si elle est, sur **au moins un
projet dont X est propriétaire**, collaboratrice avec le rôle `comptable` ou `associe`
(`project_collaborators.role`) **et** que X y a consenti (voir « Accès consenti au geste du
propriétaire » ci-dessous). Accès en **lecture et écriture** pour les deux rôles. Les autres
rôles (`salarie`, `observateur`) n'y ont pas accès. Retirée de tous les projets de X (ou passée à un
autre rôle partout), la personne perd l'accès **à la requête suivante** (relu à chaque requête,
sans cache), même si X le lui avait activé.

### Accès consenti au geste du propriétaire — décision du 2026-10-14, après revue

Le principe validé par Helder le 2026-10-14 (« un peu des deux ») ne change pas : une personne
invitée comme comptable ou associée **sous les nouveaux textes** a l'accès automatiquement, et le
propriétaire peut le couper ; une personne invitée **sous les anciens textes**, qui ne parlaient
pas d'accès à l'argent du propriétaire, ne l'a pas sans un geste du propriétaire.

Ce qui change après la revue du même jour : la première version reposait sur une **date limite**
(le 15/10/2026 à 00:00, comparée à `project_collaborators.created_at`). **Elle est supprimée.** La
revue a montré qu'avec une mise en ligne après cette date, les personnes invitées entre-temps par
l'ancien code, donc sous les anciens textes, auraient eu l'accès automatiquement. Le consentement
n'est plus déduit d'une date : il est **enregistré au moment du geste** du propriétaire, par le
nouveau code.

Soit C, collaborateur `comptable` ou `associe` sur au moins un projet de X. C a accès à l'argent de
X si et seulement si :

- C est **encore** comptable ou associé sur au moins un projet de X ; **et**
- la ligne `space_members` (owner_id = X, member_id = C) a le rôle :
  - `'argent'` : X le lui a **activé** explicitement (`PUT`, ci-dessous) ; **ou**
  - `'argent_auto'` : accès accordé **par le nouveau code** au moment où X l'a invité comme
    comptable ou associé, ou lui a donné l'un de ces rôles (ci-dessous).

`'refuse'` (X l'a **coupé**) → pas d'accès. **Aucune ligne** → pas d'accès (« À activer »).

Consentement pris au geste (`backend/src/equipe/equipe.service.ts`, `inviter` et `changerRole`) :

- Quand X **ajoute** un collaborateur avec le rôle `comptable` ou `associe`
  (`POST /projects/:id/collaborators`), ou **change** le rôle d'un collaborateur en `comptable` ou
  `associe` (`PATCH /projects/:id/collaborators/:userId`, y compris de l'un à l'autre), le code crée
  la ligne (X, C) avec `'argent_auto'` **seulement si aucune ligne n'existe** (`createMany` avec
  `skipDuplicates`, soit `INSERT … ON CONFLICT DO NOTHING` : atomique, sans course). Un choix
  explicite `'argent'` ou `'refuse'` n'est **jamais écrasé** : un accès coupé reste coupé quand la
  personne est repassée comptable ou associée, ou retirée puis réinvitée. Les rôles `salarie` et
  `observateur` n'écrivent rien.
- Ces deux actions n'ont pas de transaction : la ligne est écrite **juste après** l'ajout ou le
  changement de rôle (et avant l'e-mail d'invitation). Si cette écriture échoue, l'invitation ou le
  changement de rôle **réussit quand même** (erreur seulement journalisée) : la personne reste
  « À activer », côté prudent, et X peut l'activer.
- **Retirer** un collaborateur ne supprime **pas** la ligne : l'accès dépend déjà du rôle actuel
  (retiré de tous les projets de X, ou passé salarié / observateur partout, C perd l'accès à la
  requête suivante). S'il redevient comptable ou associé, la ligne enregistrée s'applique de
  nouveau (`'argent'` ou `'argent_auto'` : accès ; `'refuse'` : pas d'accès).
- Les comptables et associés ajoutés **avant** ce lot n'ont aucune ligne : « À activer » tant que X
  ne les active pas. Aucune date n'intervient plus : `project_collaborators.created_at` ne compte
  pas pour l'accès.

Précisions :

- `space_members.role` prend trois valeurs dans ce lot : `'argent'` (activé par le propriétaire),
  `'argent_auto'` (accordé à l'invitation ou au passage comptable / associé) et `'refuse'` (coupé
  par le propriétaire). Toute autre valeur (reste éventuel de la version abandonnée) vaut « aucune
  ligne » : « À activer ». Comme la ligne existe déjà, une invitation ne la remplace pas ; seul un
  choix explicite de X (`PUT`) la remplace.
- Une ligne par couple (X, C), quel que soit le nombre de projets partagés : le choix vaut pour
  tout l'argent de X. `created_at` y porte la date du choix **en vigueur** : celle de l'invitation
  ou du changement de rôle pour `'argent_auto'`, remise à jour à chaque `PUT` (la table n'a pas de
  colonne de mise à jour).
- Raisons affichées au propriétaire : `active_par_toi` (`'argent'`, « Activé par toi »),
  `automatique` (`'argent_auto'`, « Activé à l'invitation »), `coupe_par_toi` (`'refuse'`,
  « Coupé par toi »), `a_activer` (aucune ligne, « À activer »).

API du propriétaire (sur ses propres données uniquement, **sans** `@Espace` ni `@HorsEspace` :
refusée en 403 avec l'espace d'un autre, comme `GET /espaces/activite`) :

- `GET /espaces/acces-argent` → ses collaborateurs comptables / associés, une entrée par personne
  (dédoublonnée sur ses projets) : `{ memberId, nom, email, roles, acces, raison }`. `nom` = nom
  affiché, sinon l'e-mail (le propriétaire voit déjà les e-mails de son équipe).
- `PUT /espaces/acces-argent/:memberId` `{ acces: boolean }` → `{ acces: true }` enregistre
  `'argent'`, `{ acces: false }` enregistre `'refuse'` (upsert sur (X, C), qui remplace aussi une
  ligne `'argent_auto'`) et renvoie la liste relue. 404 si la personne n'est pas comptable ou
  associée sur un projet de X : un membre qui l'appelle pour l'espace d'un autre agit donc chez lui
  et reçoit 404 (ou 403 avec l'en-tête `X-Espace`).

Interface : dans la section Équipe d'un projet (propriétaire seulement), bloc « Accès à mon argent
(facturation, compta, banque, caisse) » : une case à cocher par personne, avec sa raison ;
confirmation avant d'activer (« X pourra voir et modifier ta facturation, ta compta, ta banque et
ta caisse. ») ; l'état affiché est toujours la réponse du serveur (pas d'affichage anticipé). Une
lecture plus ancienne n'écrase jamais un état plus récent : chaque requête du bloc porte un numéro
et seule la réponse de la dernière lancée s'affiche (un choix dépassé par une lecture lancée
pendant son envoi provoque une nouvelle lecture) ; les cases sont désactivées pendant une lecture ;
la liste est relue après un échec d'enregistrement. Aucun texte ne cite de date. Les textes des
rôles (« accès automatique, que tu peux couper à tout moment ») et l'e-mail d'invitation (« accès
automatique, que le propriétaire peut couper à tout moment ») disent que l'accès est automatique
et que le propriétaire peut le couper.

`GET /espaces` (côté membre) ne liste que les espaces où l'accès est **en vigueur**.

Modules de l'espace argent : facturation (`billing`), comptabilité (`ledger`), banque (`banking`),
caisse (`caisse`). Rien d'autre (CRM, agenda, stocks, véhicules, immobilier, publicité restent au
propriétaire seul ; tout le domaine personnel aussi : identité, compte, export, abonnement, profil,
chat, etc.).

## Mécanisme (repris de la branche `feat/equipe`, revue de sécurité passée)

- En-tête `X-Espace: <ownerId>` envoyé par le frontend **uniquement** vers les routes des 4 modules
  argent quand l'utilisateur a choisi l'espace d'un autre.
- Décorateur `@Espace('argent')` dans ces contrôleurs → `ownerId` effectif ; sinon 404
  « Espace introuvable. » (non-membre, accès coupé ou à activer, en-tête invalide) — ne pas révéler
  l'existence de l'espace.
- Intercepteur global **fermé par défaut** : une requête authentifiée portant un `X-Espace` étranger
  vers une route non marquée `@Espace('argent')` / `@HorsEspace()` → 403. Test de couverture qui
  vérifie le marquage de toutes les routes et l'alignement avec la table front.
- Ledger : `userOwner(ownerId)` résolu ; moteur constitutionnel et séparation des caisses inchangés.
- Journal `space_activity` (table déjà créée en production le 2026-10-14) : chaque requête non-GET
  faite dans l'espace d'un autre (méthode, chemin sans requête, statut) ; rétention 12 mois.
- Frontend : sélecteur « Mon espace / Espace de X » (affiché seulement si la personne a au moins un
  espace argent) ; bandeau permanent dans l'espace d'un autre ; dans cet espace, le bureau ne montre
  que Facturation, Comptabilité, Banque, Caisse ; cache hors ligne et file cloisonnés par
  utilisateur + espace ; perte d'accès vérifiée par relecture de `GET /espaces` avant de ramener
  chez soi.
- `GET /espaces` → `[{ ownerId, nom, roles: [...] }]` (« Mon espace » d'abord).

## Base de données

**Aucune nouvelle table, aucune migration.** Les tables `space_members`, `space_invitations` et
`space_activity` existent déjà en production (créées le 2026-10-14 pour une version abandonnée).
Elles **doivent rester déclarées dans `schema.prisma`** (sinon le prochain `db push` les
supprimerait) : `space_activity` est utilisée (journal) ; `space_members` est **réutilisée** pour
les choix d'accès à l'argent (`'argent'`, `'argent_auto'`, `'refuse'` : décision ci-dessus ; le
commentaire `///` du modèle le dit, sans changement de structure), exportée dans le groupe `compte` ;
`space_invitations` reste **réservée, inutilisée**, classée « excluded » dans `user-data-scope.ts`
avec ce motif, à retirer plus tard par une migration décidée explicitement.

## Tests

Comptable sur un projet de X → accède aux 4 modules de X ; associé → idem ; salarié / observateur →
404 ; retiré → 404 immédiat ; aucun accès aux modules non-argent de X avec `X-Espace` (403 fermé par
défaut) ; propriétaire chez lui inchangé ; journal écrit pour un POST d'un membre ; cache cloisonné.

Accès consenti au geste : invité comme comptable ou associé → ligne `'argent_auto'` → accès ;
salarié / observateur invité → aucune ligne ; observateur promu associé → ligne créée → accès ; un
`'refuse'` explicite est gardé quand la personne est repromue ou réinvitée (jamais écrasé) ;
l'échec de l'écriture de la ligne n'annule ni l'invitation ni le changement de rôle (journalisé) ;
collaborateur d'avant (aucune ligne) → 404 tant que le propriétaire ne l'a pas activé ; ligne
`'argent'` → accès ; ligne `'refuse'` → 404 ; retiré des projets → 404 même avec une ligne (qui
n'est pas supprimée) ; `GET /espaces` du membre suit la règle ; les routes du propriétaire refusent
un `X-Espace` étranger (403) ; un membre ne peut pas choisir pour l'espace d'un autre ; plus aucune
référence à une date limite dans le code ; interface : case, confirmation, raisons sans date, une
lecture plus ancienne n'écrase pas un état plus récent, cases désactivées pendant une lecture,
liste relue après un échec d'enregistrement.
