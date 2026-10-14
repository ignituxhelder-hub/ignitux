# Équipe — livraison 2 : la comptabilité « pour le compte de »

Validé avec Helder le 2026-10-14. Suite de `2026-10-11-equipe-roles-design.md` (rôles par
projet, en ligne). Ce lot ouvre au **comptable** et à l'**associé** les modules d'argent du
propriétaire, qui sont rangés par personne (`owner_id`) et non par projet.

## Règle

Une personne a accès à l'**espace argent** d'un propriétaire X si elle est, sur **au moins un
projet dont X est propriétaire**, collaboratrice avec le rôle `comptable` ou `associe`
(`project_collaborators.role`) **et** que cet accès est en vigueur (voir « Accès automatique ou
activé » ci-dessous). Accès en **lecture et écriture** pour les deux rôles. Les autres
rôles (`salarie`, `observateur`) n'y ont pas accès. Retirée de tous les projets de X (ou passée à un
autre rôle partout), la personne perd l'accès **à la requête suivante** (relu à chaque requête,
sans cache), même si X le lui avait activé.

### Accès automatique ou activé — décision du 2026-10-14 (Helder : « un peu des deux »)

Les personnes invitées avant ce lot l'ont été sous les anciens textes, qui ne parlaient pas d'accès
à l'argent du propriétaire. On ne leur ouvre donc pas cet accès sans un geste du propriétaire. Les
personnes invitées après le changement l'ont automatiquement, et le propriétaire peut le couper.

Soit C, collaborateur `comptable` ou `associe` sur au moins un projet de X. C a accès à l'argent de
X si et seulement si :

- **(a)** X le lui a **activé** : ligne `space_members` (owner_id = X, member_id = C) avec
  `role = 'argent'` ; **ou**
- **(b)** X ne le lui a **pas coupé** (pas de ligne `space_members` (X, C) avec `role = 'refuse'`)
  **et** C a été ajouté comme comptable ou associé sur un projet de X **à partir de**
  `ACCES_ARGENT_AUTOMATIQUE_DEPUIS` = `2026-10-15T00:00:00+02:00` (constante,
  `backend/src/equipe/acces-argent.ts`).

Et dans tous les cas, C doit **être encore** comptable ou associé sur au moins un projet de X.

Précisions :

- La date qui compte est `project_collaborators.created_at` d'une ligne (projet de X, C) **dont le
  rôle actuel** est `comptable` ou `associe`. Il n'existe aucune date de changement de rôle : un
  ancien collaborateur (ligne créée avant la date) **promu** comptable ou associé après la date
  garde sa date de création, donc il lui faut une activation explicite — c'est le côté prudent. À
  l'inverse, une ligne créée après la date (même comme observateur, puis promue) compte comme une
  invitation sous les nouveaux textes. Une ligne sans date (`created_at` nul) compte comme ancienne.
- `space_members.role` ne prend que deux valeurs dans ce lot : `'argent'` (activé par le
  propriétaire) et `'refuse'` (coupé par le propriétaire). Toute autre valeur (reste éventuel de la
  version abandonnée) vaut « aucun choix ». Une ligne par couple (X, C), quel que soit le nombre de
  projets partagés : le choix vaut pour tout l'argent de X. `created_at` y porte la date du choix
  **en vigueur** (remise à jour à chaque changement : la table n'a pas de colonne de mise à jour).
- Une ligne `space_members` n'ouvre rien seule : retiré de tous les projets de X (ou passé
  salarié / observateur partout), C perd l'accès ; s'il redevient comptable ou associé plus tard,
  le choix enregistré s'applique de nouveau (activé : accès ; coupé : pas d'accès).
- Raisons affichées au propriétaire : `active_par_toi` (« Activé par toi »), `automatique`
  (« Automatique (invité à partir du 15/10/2026) »), `coupe_par_toi` (« Coupé par toi »),
  `a_activer` (« À activer — invité avant le changement »).

API du propriétaire (sur ses propres données uniquement, **sans** `@Espace` ni `@HorsEspace` :
refusée en 403 avec l'espace d'un autre, comme `GET /espaces/activite`) :

- `GET /espaces/acces-argent` → ses collaborateurs comptables / associés, une entrée par personne
  (dédoublonnée sur ses projets) : `{ memberId, nom, email, roles, acces, raison }`. `nom` = nom
  affiché, sinon l'e-mail (le propriétaire voit déjà les e-mails de son équipe).
- `PUT /espaces/acces-argent/:memberId` `{ acces: boolean }` → enregistre `'argent'` ou
  `'refuse'` (upsert sur (X, C)) et renvoie la liste relue. 404 si la personne n'est pas comptable
  ou associée sur un projet de X : un membre qui l'appelle pour l'espace d'un autre agit donc chez
  lui et reçoit 404 (ou 403 avec l'en-tête `X-Espace`).

Interface : dans la section Équipe d'un projet (propriétaire seulement), bloc « Accès à mon argent
(facturation, compta, banque, caisse) » : une case à cocher par personne, avec sa raison ;
confirmation avant d'activer (« X pourra voir et modifier ta facturation, ta compta, ta banque et
ta caisse. ») ; l'état affiché est toujours la réponse du serveur (pas d'affichage anticipé). Les
textes des rôles et l'e-mail d'invitation disent que l'accès est automatique et que le
propriétaire peut le couper.

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
les choix d'accès à l'argent (décision ci-dessus), exportée dans le groupe `compte` ;
`space_invitations` reste **réservée, inutilisée**, classée « excluded » dans `user-data-scope.ts`
avec ce motif, à retirer plus tard par une migration décidée explicitement.

## Tests

Comptable sur un projet de X → accède aux 4 modules de X ; associé → idem ; salarié / observateur →
404 ; retiré → 404 immédiat ; aucun accès aux modules non-argent de X avec `X-Espace` (403 fermé par
défaut) ; propriétaire chez lui inchangé ; journal écrit pour un POST d'un membre ; cache cloisonné.

Accès automatique ou activé : ligne `'argent'` → accès ; comptable ajouté après la date → accès ;
ajouté avant → 404 tant que le propriétaire ne l'a pas activé ; ligne `'refuse'` → 404 même
après la date ; retiré des projets → 404 même avec une ligne `'argent'` ; `GET /espaces` du membre
suit la règle ; les routes du propriétaire refusent un `X-Espace` étranger (403) ; un membre ne peut
pas choisir pour l'espace d'un autre ; interface : case, confirmation, raisons.
