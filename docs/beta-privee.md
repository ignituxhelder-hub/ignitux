# Préparation à la bêta privée

Construit et mesuré le 20 septembre 2026. Aucun module métier ajouté.

Ce document décrit ce qui a été fait, ce qui a été **vérifié en le faisant**, et ce qui
reste entre tes mains.

---

## Ce qui est fait et mesuré

| Point | État | Preuve |
|---|---|---|
| `trust proxy` | fait | réglage explicite, refus de démarrer sans lui en production |
| Configuration de production | fait | 5 fautes silencieuses détectées à l'essai, démarrage refusé |
| Migration complète de la base | **fait** | `ignitux_prod` : 36 → **47 tables sur 47** |
| Système email | fait | SMTP réel, 11 tests |
| Sauvegarde et restauration | **testée** | 185 lignes restaurées, **aucun écart** |
| Surveillance et erreurs | fait | `/ready` à trois états, filtre d'erreur avec référence |

828 tests côté serveur, tous verts.

---

## 1. Le principe qui tient toute cette session

**Une panne bruyante au lancement coûte cinq minutes. La même faute, silencieuse, coûte la
confiance des personnes qui utilisaient le produit.**

Chacun des réglages ci-dessous, mal posé, ne provoque *aucune erreur visible* : le serveur
démarre, répond, et se comporte mal. C'est précisément pour cela qu'ils méritent un refus
de démarrer.

Essai réel, en lançant le serveur en production avec la configuration de développement :

```
Refus de démarrer en production — 5 réglage(s) à corriger :
  - JWT_SECRET : porte encore une valeur d'exemple du dépôt. Elle est publique…
  - FRONTEND_URL : vaut « http://localhost:3001 », une adresse locale…
  - DATABASE_URL : pointe sur la base `postgres`, celle du développement…
  - TRUST_PROXY : doit être posée explicitement…
  - MAIL_TRANSPORT : doit valoir « smtp » ou « log »…
```

Les cinq fautes sont rendues **ensemble**, pas une par redémarrage : corriger pour
découvrir la suivante ferait perdre un aller-retour par faute.

---

## 2. `trust proxy`

Derrière un reverse proxy, `req.ip` vaut l'adresse du proxy. Le limiteur de débit clé sur
`req.ip`.

- **Non déclaré derrière un proxy** : toutes les personnes partagent un seul seau. La
  première qui s'agite verrouille les autres — et c'est aussi la porte d'entrée d'un déni
  de service trivial contre tous les comptes à la fois.
- **`true` sans discernement** : un client écrit lui-même son `X-Forwarded-For` et disparaît
  du comptage. Le limiteur devient décoratif.

D'où un **nombre de sauts explicite**, ou `false`. Ne pas trancher est la seule réponse
refusée : le mauvais défaut est silencieux dans les deux sens.

---

## 3. Configuration de production

Nouvelles variables, toutes documentées dans `backend/.env.example` : `NODE_ENV`,
`TRUST_PROXY`, `MAIL_TRANSPORT`, `MAIL_FROM`, `SMTP_*`, `ENABLE_API_DOCS`.

Une décision qui mérite d'être dite : **`/docs` est éteinte en production** sauf demande
explicite. Elle décrit toute la surface de l'API. La sécurité ne tient pas au secret des
routes — mais rien n'oblige à fournir le plan.

---

## 4. Migration de la base de production

**Mesuré avant** : `ignitux_prod` contenait 36 tables sur les 47 du schéma. Onze manquaient,
dont les quatre derniers modules entiers :

```
ai_usage_events, ledger_accounts, ledger_entries, ledger_lines,
bank_accounts, bank_transactions, investors, financed_projects,
participations, investor_movements, user_roles
```

La production comptait **0 utilisateur** : la migration était donc purement additive, sans
aucun risque de perte.

**Mesuré après** : 47 tables sur 47, aucune manquante, chaque nouvelle table interrogée avec
succès.

Ce qui rendait cet écart dangereux n'est pas l'écart lui-même, c'est son mode de
défaillance : **l'application démarre normalement** et échoue à la première écriture dans un
module récent — c'est-à-dire des jours plus tard, chez quelqu'un, sur une action qu'il ne
refera pas. Le démarrage réussi donne une fausse confiance.

C'est précisément ce que la sonde du §6 retire.

---

## 5. Système email

`MailService` parle maintenant réellement, par SMTP.

**SMTP et non une API propriétaire**, délibérément : c'est le plus petit dénominateur commun,
il fonctionne avec SES, Postmark, Resend, Brevo ou un serveur maison, et il évite d'enfermer
le produit dans un fournisseur **avant que tu ne l'aies choisi**. Le jour où tu tranches, il
n'y a qu'un `.env` à remplir.

Trois décisions à l'intérieur :

- **Aucune relance, aucune file.** Un email de réinitialisation qui part trois minutes trop
  tard ne sert plus à rien : la personne a déjà redemandé un lien. Une file donnerait
  l'illusion de la robustesse en ajoutant surtout des états à déboguer.
- **Un échec ne lève pas, mais ne se cache pas.** Il ne doit pas faire échouer l'inscription
  qui l'a déclenché ; il est journalisé en erreur, avec l'adresse concernée, et rendu à
  l'appelant. Un envoi raté avalé en silence produit exactement la panne qu'on ne peut pas
  diagnostiquer.
- **`log` reste une réponse valide, mais elle s'écrit.** Tourner sans email est une décision
  acceptable. L'obtenir par omission ne l'est pas — c'est la différence entre choisir de ne
  pas avoir de récupération de mot de passe, et l'apprendre le jour où quelqu'un est enfermé
  dehors.

---

## 6. Surveillance et gestion des erreurs

### `/ready` — trois états, pas deux

`/health` répond « le process est vivant » et sert à un répartiteur de charge. `/ready`
répond à l'autre question : **est-il en état de travailler ?**

Réponse réelle du serveur de développement :

```json
{ "etat": "degrade",
  "verifications": {
    "base":   { "etat": "ok",      "detail": "La base répond." },
    "schema": { "etat": "ok",      "detail": "Les 47 tables du schéma sont présentes." },
    "email":  { "etat": "degrade", "detail": "Transport « log » : aucun email ne part…" },
    "ia":     { "etat": "degrade", "detail": "Générateurs éteints volontairement…" } } }
```

**Trois états et non deux.** « Dégradé » couvre ce qui fonctionne mais amputé : confondre
cela avec une panne ferait redémarrer en boucle un serveur qui va très bien. Le code HTTP
suit : 200 en `ok` et en `degrade`, 503 en `panne` — ce qui retire le serveur de la rotation
sans qu'un superviseur ait à lire le corps.

**La vérification de schéma est la plus importante et la moins spectaculaire.** Elle compare
les tables présentes à celles que le client Prisma connaît — liste *dérivée du code*, jamais
recopiée : une liste écrite à la main finirait par diverger, et c'est alors la sonde qui
mentirait. Elle aurait signalé l'écart du §4 dès le premier appel.

### Le filtre d'erreur

Deux règles qui tirent en sens opposé et doivent tenir ensemble :

1. **Le client n'apprend rien de l'intérieur.** Un message Prisma nomme des tables ; une pile
   nomme des chemins de fichiers. Ce sont des renseignements offerts à qui cherche par où
   entrer, et ils n'aident en rien la personne qui voulait enregistrer son projet.
2. **On ne perd rien.** Tout ce qui est retiré de la réponse est écrit au journal, rattaché à
   une **référence de huit caractères** que la réponse porte. La personne cite six
   caractères au téléphone, on retrouve la pile exacte.

Les refus *prévus* — 401, 403, 404, 422 constitutionnelle, 402 de plafond — traversent sans
être touchés : leurs messages sont écrits pour être lus, et les remplacer par « erreur
interne » supprimerait tout le travail fait pour qu'un refus s'explique.

Une promesse rejetée sans traitement est journalisée avant que le processus ne tombe :
redémarrer sans savoir pourquoi est la pire des deux issues.

---

## 7. Sauvegarde et restauration — réellement exercées

### Ce que ces scripts sont, et ne sont pas

`backend/scripts/sauvegarde.mjs` et `restauration.mjs`.

Ce **n'est pas** le plan de reprise principal. Sur Supabase, la sauvegarde de référence est
celle de l'hébergeur : automatique, physique, restaurable à un instant donné. Aucun script
maison ne fait mieux, et prétendre le contraire serait dangereux.

Ces scripts répondent à la question que la sauvegarde de l'hébergeur ne couvre pas : **et si
le problème vient de l'hébergeur ?** Compte suspendu, erreur de facturation, région
indisponible, décision commerciale. Une copie indépendante, lisible sans outil propriétaire,
restaurable ailleurs, est la seule réponse à ce cas-là.

Limite assumée : un export logique par le client ignore vues, fonctions, politiques RLS et
séquences. Il contient les **données**, qui sont l'irremplaçable — le schéma se recrée depuis
le code par `prisma db push`.

### La restauration a été faite, pas seulement écrite

> Une sauvegarde qu'on n'a jamais restaurée n'est pas une sauvegarde : c'est un fichier dont
> on espère qu'il contient quelque chose.

Exercice complet, de bout en bout :

1. Sauvegarde de la base de développement → **47 tables, 185 lignes**
2. Création d'une base vierge `ignitux_restore_check`
3. `prisma db push` dessus → 47 tables
4. Restauration → **185 lignes en 3 tours, aucun écart**
5. Base d'essai **supprimée** — elle contenait un double de données personnelles réelles,
   dont le projet d'un vrai testeur, et garder une copie redondante est un risque plus grand
   que la perdre. Le script la recrée en une commande.

L'ordre d'insertion se résout **par tours** plutôt que par un tri topologique : à chaque
tour on insère ce qui passe, on retente le reste. C'est plus lent, et c'est assumé — une
restauration se fait rarement, sous tension, et la propriété qui compte alors est de ne pas
dépendre d'une liste que quelqu'un aurait oublié de mettre à jour.

Garde-fou : le script **refuse** d'écrire dans une base non vide sans `--ecraser` explicite.
Restaurer par-dessus de vraies données est la façon la plus efficace de transformer un
incident en catastrophe.

Les sauvegardes sont ignorées par git — elles contiennent de vraies données personnelles.

### Ce qui n'a pas pu être exercé ici

Ni `pg_dump`, ni `psql`, ni Docker ne sont installés sur cette machine. La voie du **dump
physique** est donc documentée mais **non éprouvée** de ma main. Sur un serveur de
production, `pg_dump` reste la bonne méthode pour une copie complète — schéma compris — et
ce point mérite d'être exercé une fois avant l'ouverture de la bêta.

---

## 8. Ce qui reste, et qui t'appartient

| Décision | Ce qui la bloque | Conséquence tant qu'elle n'est pas prise |
|---|---|---|
| **Fournisseur d'email** | ton choix | `MAIL_TRANSPORT=log` : aucune récupération de mot de passe |
| **Hébergement** | ton choix | rien n'est déployé ; tout est prêt à l'être |
| **Clé et budget IA** | ton choix | générateurs éteints, plafonds prêts et désormais visibles |
| **Sauvegardes Supabase** | à vérifier dans ton tableau de bord | je ne peux pas savoir si elles sont actives |

Et un point à faire une fois, sur le serveur, avant l'ouverture : **un `pg_dump` puis un
`pg_restore` réels**, pour que la voie physique soit exercée elle aussi.

**Rien n'a été déployé.** Tout ce qui précède prépare la mise en production ; la mise en
production elle-même attend ton accord explicite.
