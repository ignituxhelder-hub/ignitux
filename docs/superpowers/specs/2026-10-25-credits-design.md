# Crédits IGINI — payer les analyses à l'usage

Validé avec Helder le 2026-10-25. Le site est en ligne (ignitux.com) ; toute nouvelle table
passe en production AVANT le push (scripts `verifier-base` → `sauvegarde` → `migrer-prod`,
depuis un checkout contenant le dernier `origin/main`).

## Décisions

1. **L'abonnement Entrepreneur (20 €/mois) disparaît.** Il n'y a plus d'offre payante : tous
   les outils (projets, compta, facturation, banque, caisse, stocks, agenda, CRM, équipe,
   financement, documents juridiques) sont **gratuits pour tous**.
2. **Seules les actions IGINI (appels à l'IA) se paient, en crédits.** 1 crédit = 0,10 € TTC.
   Recharges proposées : 10 € (100 crédits), 20 € (200), 50 € (500). Minimum 10 €.
3. **Prix fixe par action, affiché avant de lancer.** Prix = coût IA réel moyen de l'action
   × 5, converti en crédits et **arrondi au crédit supérieur**, minimum 1 crédit. La marge
   couvre la TVA, les frais de paiement, l'hébergement, les échecs et la marge. Les frais de
   paiement ne sont **jamais ajoutés** au moment de payer (surfacturation interdite pour les
   particuliers) : ils sont compris dans la valeur des crédits.
4. **Débit seulement en cas de succès.** Une génération qui échoue ne coûte rien.
5. **Cadeau de bienvenue : 30 crédits** à la création du compte (et une seule fois par compte ;
   les comptes existants reçoivent aussi 30 crédits une fois, au déploiement).
6. **Équipe** : quand un membre lance une action IGINI dans le projet d'un propriétaire, ce sont
   les crédits **du propriétaire** qui sont débités (même règle que l'attribution actuelle de
   l'usage IA au propriétaire). Le journal garde l'acteur.
7. **Paiement en deux temps.**
   - Lot 1 (ce lot, gratuit) : tout le système de crédits fonctionne ; **un administrateur**
     (rôle `administrateur` existant) peut **ajouter ou retirer des crédits** à un compte, avec
     un motif obligatoire (« test », « geste commercial »…). Le bouton « Recharger » de
     l'utilisateur affiche « Bientôt disponible — le paiement par carte arrive dès que
     l'entreprise Ignitux sera immatriculée. »
   - Lot 2 (plus tard) : paiement par carte (Stripe) — hors de ce lot.

## Barème initial (à recalculer)

Le barème est une table en code (une seule source, lue par le serveur et exposée au frontend),
avec pour chaque générateur : prix en crédits et coût moyen de référence (micro-euros) d'où il
est tiré. Valeurs initiales = calculées à partir des coûts mesurés dans `ai_usage_events`
(si l'implémenteur ne peut pas lire la prod : depuis PRICING.md et les estimations du code,
documentées) selon la règle du point 3. Générateurs : `analyser`, `former`, `construire`,
`financer`, `developper`, `transmettre`, `executer`, `evaluer`, `questionner`, `discuter`
(par message), plus les autres appels IA éventuels (statuts, conformité, etc. — tout appel qui
passe par `ClaudeService` avec un `generator` doit avoir un prix ; un test l'impose).
Un script (`backend/scripts/bareme-credits.mjs`) recalcule le barème proposé à partir de
`ai_usage_events` (lecture seule, base choisie par `--env`) et affiche l'écart avec la table en
code, pour que Helder décide d'un ajustement.

## Données (additif)

- `credit_entries` — journal **append-only** : `id`, `owner_id` (compte dont le solde bouge),
  `actor_id` (qui a agi, nullable), `kind` : `'bienvenue' | 'recharge' | 'ajustement_admin' |
  'debit' | 'remboursement'`, `credits` (entier signé : + crédit, − débit), `generator`
  (nullable), `project_id` (nullable, SetNull), `ai_usage_event_id` (nullable), `motif`
  (texte, obligatoire pour ajustement), `created_at`. Index (owner_id, created_at).
  Aucune mise à jour ni suppression applicative ; le solde = somme des `credits`.
- Le solde n'est jamais stocké séparément (pas de divergence possible) ; il est calculé par
  agrégat, avec un verrou ou une écriture conditionnelle pour qu'un débit ne rende jamais le
  solde négatif sous concurrence (deux générations simultanées).
- RGPD : `credit_entries` exportée (groupe `facturation` ou `compte`), conservée avec le compte.

## Parcours

- Avant chaque action IGINI : le frontend montre le prix et le solde (« Cette analyse coûte
  3 crédits — il t'en reste 27 ») ; si le solde est insuffisant, le bouton est remplacé par
  « Recharger » et la génération n'est pas lancée. Le serveur **revérifie** (402 ou 409 avec un
  message clair « Crédits insuffisants : il te faut 3 crédits, tu en as 1. »).
- Réservation : le serveur vérifie le solde avant l'appel IA, appelle l'IA, puis débite
  (conditionnellement) ; si le solde a été consommé entre-temps par une autre génération, le
  débit peut amener le solde à 0 au plus — jamais en négatif (choisir : réserver avant l'appel
  et rembourser en cas d'échec, c'est la solution recommandée).
- Page « Mes crédits » (dans Mon compte ou application dédiée) : solde, historique (date,
  action, projet, crédits ±), bouton Recharger (bientôt), barème.
- Page Offres : remplacée par « Crédits » (barème + explication) ; la page d'accueil
  « Combien ça coûte ? » est mise à jour (gratuit pour les outils ; analyses IGINI en crédits ;
  30 crédits offerts ; recharges 10/20/50 €, « paiement bientôt disponible »).
- Administration : liste des comptes avec solde ; ajouter/retirer des crédits avec motif.

## Ce qui est retiré ou remplacé

- Le catalogue d'offres payantes, les droits liés à l'offre (`offres/droits.ts`,
  `offres.exiger`) et les quotas mensuels d'appels (`ai-quota`) ne bloquent plus rien : le solde
  de crédits devient la seule limite. `subscriptions` reste en base (historique) mais n'est plus
  utilisée pour décider d'un accès.
- Le **plafond de coût IA par personne** (variable Render, 5 €/mois) : conservé comme garde-fou
  anti-abus côté serveur mais **relevé** ou appliqué seulement aux crédits offerts ? —
  Décision : il reste un garde-fou global (kill-switch IGINI existant + plafond mensuel par
  compte réglable), et le message d'erreur dit clairement de quoi il s'agit ; par défaut il ne
  doit jamais bloquer quelqu'un qui a payé ses crédits (valeur par défaut haute, documentée).

## Hors lot

Paiement par carte, factures de recharge, TVA détaillée, remboursement d'un solde (questions
pour le comptable), expiration des crédits (aucune expiration dans ce lot).

## Tests (cas limites)

Solde insuffisant → refus avant tout appel IA ; échec de génération → aucun débit (ou
remboursement) ; deux générations simultanées → jamais de solde négatif ; bienvenue une seule
fois ; ajustement admin réservé au rôle administrateur, motif obligatoire ; membre d'équipe →
débit sur le propriétaire ; chaque générateur a un prix (test de couverture) ; export RGPD ;
page d'accueil et page Crédits affichent le barème du serveur.

## Ajouts après revue (2026-10-26)

- **Débits orphelins.** Un serveur arrêté pendant un appel IA ne passe par aucun `catch`. Le
  rattrapage (`CreditsService.rattraperDebitsOrphelins`, au démarrage puis toutes les 10 min)
  rend tout débit de plus de 15 min sans ligne `ai_usage_events` ni remboursement (fenêtre de
  30 jours), sous le même verrou et la même unicité que `rembourser`. Il reprend aussi un
  remboursement qui avait échoué.
- **Résultat non gardé = rien à payer.** `ClaudeService` donne la réservation à l'appelant
  (`surReservation`) ; statuts (retenus entre-temps, P2002, Constitution), évaluation (arrivée
  trop tard, écriture impossible, préparation interrompue) et exécution (tâche/exigence) rendent
  les crédits d'un résultat qu'ils ne peuvent pas enregistrer.
- **Une exécution à la fois.** Tâches et conformité prennent la ligne « en_cours » par une
  écriture conditionnelle avant tout débit (409 « Déjà en cours. » sinon) ; les statuts
  réservent en `exclusif` (le débit sans réponse ni remboursement de moins de 15 min fait
  office de marque « en cours »). Aucune colonne ajoutée.
- **Chat : prix confirmé avant d'être dépensé.** Un outil payant appelé depuis le chat ne lance
  rien au premier appel : il rend le prix, et la réponse d'IGINI porte un marqueur écrit par le
  serveur, `[[confirmer: <outil> <projet> <crédits>]]` (bouton « Confirmer — N crédits »). Il ne
  s'exécute qu'au message suivant si ce message est un oui et que le message d'IGINI qui le
  précède immédiatement porte ce marqueur au prix actuel du barème. Les marqueurs écrits par le
  modèle sont retirés (`igini/chat/chat-confirmation.ts`).
- **Surface REST.** `verifier-base.mjs` vérifie que `anon`/`authenticated` n'ont aucun droit
  effectif sur `credit_entries` (ni ailleurs) ; à lancer juste après `migrer-prod.mjs`.
