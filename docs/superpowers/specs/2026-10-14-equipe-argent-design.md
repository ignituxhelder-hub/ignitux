# Équipe — livraison 2 : la comptabilité « pour le compte de »

Validé avec Helder le 2026-10-14. Suite de `2026-10-11-equipe-roles-design.md` (rôles par
projet, en ligne). Ce lot ouvre au **comptable** et à l'**associé** les modules d'argent du
propriétaire, qui sont rangés par personne (`owner_id`) et non par projet.

## Règle

Une personne a accès à l'**espace argent** d'un propriétaire X si elle est, sur **au moins un
projet dont X est propriétaire**, collaboratrice avec le rôle `comptable` ou `associe`
(`project_collaborators.role`). Accès en **lecture et écriture** pour les deux rôles. Les autres
rôles (`salarie`, `observateur`) n'y ont pas accès. Retirée de tous les projets de X (ou passée à un
autre rôle partout), la personne perd l'accès **à la requête suivante** (relu à chaque requête,
sans cache).

Modules de l'espace argent : facturation (`billing`), comptabilité (`ledger`), banque (`banking`),
caisse (`caisse`). Rien d'autre (CRM, agenda, stocks, véhicules, immobilier, publicité restent au
propriétaire seul ; tout le domaine personnel aussi : identité, compte, export, abonnement, profil,
chat, etc.).

## Mécanisme (repris de la branche `feat/equipe`, revue de sécurité passée)

- En-tête `X-Espace: <ownerId>` envoyé par le frontend **uniquement** vers les routes des 4 modules
  argent quand l'utilisateur a choisi l'espace d'un autre.
- Décorateur `@Espace('argent')` dans ces contrôleurs → `ownerId` effectif ; sinon 404
  « Espace introuvable. » (non-membre, en-tête invalide) — ne pas révéler l'existence de l'espace.
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

**Aucune nouvelle table.** Les tables `space_members`, `space_invitations` et `space_activity`
existent déjà en production (créées le 2026-10-14 pour une version abandonnée). Elles **doivent
rester déclarées dans `schema.prisma`** (sinon le prochain `db push` les supprimerait) :
`space_activity` est utilisée ; `space_members` et `space_invitations` sont **réservées,
inutilisées**, classées « excluded » dans `user-data-scope.ts` avec ce motif, à retirer plus tard
par une migration décidée explicitement.

## Tests

Comptable sur un projet de X → accède aux 4 modules de X ; associé → idem ; salarié / observateur →
404 ; retiré → 404 immédiat ; aucun accès aux modules non-argent de X avec `X-Espace` (403 fermé par
défaut) ; propriétaire chez lui inchangé ; journal écrit pour un POST d'un membre ; cache cloisonné.
