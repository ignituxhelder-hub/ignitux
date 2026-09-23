# Déblocage : le chemin le plus court vers une bêta privée

Analyse du 23 septembre 2026. **Aucune modification de code n'a été faite** — ce document est un
diagnostic et un plan.

> **La conclusion d'abord.** Les paiements ne sont **pas** sur le chemin de la bêta. Ils sont sur
> le chemin du chiffre d'affaires. Ce qui bloque réellement l'ouverture à de vraies personnes,
> c'est une base de données injoignable, un hébergement inexistant et trois variables de
> production manquantes. Compté honnêtement : **environ 18 à 26 heures de travail**, dont 3 à 5
> qui te reviennent.

---

## Blocage 1 — Supabase

### Ce que le code doit réellement à Supabase : rien

C'est le résultat le plus important de cette analyse.

```
Paquets @supabase installés ................. aucun
Références à Supabase dans backend/src/ ..... 2, dans une chaîne de test
Supabase Auth / Storage / Realtime utilisés . aucun
```

Ignitux utilise Supabase **uniquement comme hébergeur Postgres**, à travers `DATABASE_URL`.
L'authentification est maison (JWT), les fichiers ne sont pas stockés, le temps réel n'existe
pas. Conséquence directe : **changer d'hébergeur Postgres est un changement de chaîne de
connexion, pas une migration de code.** Cela retire tout caractère existentiel au blocage.

### Diagnostic réseau

| Hôte | Résultat |
|---|---|
| `db.vrgsrisgoocyjqbhefsg.supabase.co` (base directe) | **ne résout pas** — ENOTFOUND |
| `vrgsrisgoocyjqbhefsg.supabase.co` (API du projet) | résout, et **répond** : HTTP 401 `{"message":"No API key found in request"}` |
| `aws-0-eu-west-3.pooler.supabase.com` | résout |
| DNS en général (github, npm, supabase.com) | normal |

### Ce que cela établit, et ce que cela n'établit pas

**Établi : le projet n'est ni supprimé ni renommé.** Une erreur PostgREST bien formée revient de
son API — un projet supprimé ne répondrait pas cela, et la référence `vrgsrisgoocyjqbhefsg` est
inchangée.

**Non établi : laquelle des deux causes.** Elles produisent exactement la même signature vue de
l'extérieur.

- **Cause A — projet en pause.** Un projet gratuit se met en veille après une période
  d'inactivité ; l'instance Postgres dédiée est déprovisionnée, son enregistrement DNS `db.*`
  disparaît, la passerelle API reste debout.
- **Cause B — connexion directe retirée.** Supabase a fait migrer des projets de l'hôte direct
  `db.*` vers le **pooler** (`aws-0-<région>.pooler.supabase.com`), avec un nom d'utilisateur
  différent (`postgres.<ref>`).

Je ne peux pas trancher depuis l'extérieur, et je ne vais pas deviner la région pour essayer des
connexions au hasard. **Les deux causes ont la même première action.**

### Actions à effectuer côté Supabase — par Helder

1. Ouvrir <https://supabase.com/dashboard>, se connecter, sélectionner le projet
   `vrgsrisgoocyjqbhefsg`.
2. **Lire l'état affiché en haut du projet.** S'il indique *Paused* → « Restore project », puis
   attendre 2 à 5 minutes.
3. Ouvrir **Connect** (bouton en haut) et **copier la chaîne de connexion telle qu'affichée**.
   Ne pas la reconstruire à la main : si Supabase propose désormais le pooler, l'hôte, le port
   (5432 en mode Session, 6543 en Transaction) **et le nom d'utilisateur** changent tous les
   trois.
4. Vérifier que les trois bases existent toujours : `postgres`, `ignitux_test`, `ignitux_prod`.
   Une restauration les ramène ; une recréation de projet, non.

### Variables concernées

Une seule variable, dans trois fichiers — tous ignorés par git :

| Fichier | Base visée | Rôle |
|---|---|---|
| `backend/.env` | `postgres` | développement |
| `backend/.env.test` | `ignitux_test` | suite de bout en bout |
| `backend/.env.production` | `ignitux_prod` | production |

**Les trois pointent sur la même instance.** C'est le vrai risque structurel : une seule panne
emporte le développement, les tests et la production ensemble. C'est exactement ce qui se passe
aujourd'hui.

### Commandes de vérification, une fois la chaîne mise à jour

```bash
cd backend

# 1. La base répond-elle ?
npx prisma db execute --stdin <<< "SELECT 1;"

# 2. Les trois bases sont-elles là ?
#    (le script existant ne modifie rien)
node scripts/sauvegarde.mjs --verifier   # si l'option existe ; sinon voir §Blocage 2
```

### Risques

| Risque | Gravité | Ce qui le limite |
|---|---|---|
| Le projet a été **supprimé** et non mis en pause | élevée | Les sauvegardes logiques (`backend/scripts/sauvegarde.mjs`) existent et une restauration a déjà été testée : 185 lignes, zéro écart |
| La chaîne du pooler est recopiée à la main et le nom d'utilisateur est oublié | moyenne | Copier depuis le dialogue Connect, jamais reconstruire |
| Une seule instance porte les trois environnements | **structurelle** | Rien aujourd'hui — voir recommandation ci-dessous |

### Recommandation

Après remise en route, **sortir `ignitux_test` de cette instance**. La CI que j'ai ajoutée le fait
déjà : elle crée un conteneur Postgres jetable par exécution. Faire de même en local retirerait
la suite de tests du chemin critique de la production.

---

## Blocage 2 — Migrations

### Mode de migration : `db push`, pas `migrate`

Il n'existe **aucun dossier `prisma/migrations`**. Le projet synchronise le schéma avec
`prisma db push`. C'est un choix qui a une conséquence à connaître : **il n'y a pas de fichier de
migration à rejouer ni à annuler.** Le rollback ne peut venir que d'une sauvegarde.

### Ce qui est en attente

Schéma : **50 tables déclarées**. Écart par base, mesuré le 20 septembre en lecture seule, plus ce
qui a été ajouté depuis :

| Base | Tables manquantes | Colonnes manquantes |
|---|---|---|
| `postgres` (dév) | `subscriptions`, `score_snapshots` | aucune |
| `ignitux_test` | `subscriptions`, `score_snapshots` | aucune |
| `ignitux_prod` | `user_profiles`, `subscriptions`, `score_snapshots` | `analyses.score_rationale`, `compliance_requirements.sectors`, `compliance_requirements.verified_on`, `projects.sector` |

`analyses.score_rationale` manquait **avant** toutes ces sessions : la production dérivait déjà
sans que rien ne le signale. C'est ce que la sonde `/ready` attrape désormais.

### Compatibilité et risque de perte de données

**Vérifié colonne par colonne : la migration est strictement additive.**

- Les deux nouvelles tables sont des créations pures.
- Les quatre colonnes ajoutées à des tables existantes sont **toutes nullables ou pourvues d'un
  défaut** : `score_rationale String?`, `sector String?`, `sectors String[] @default([])`,
  `verified_on DateTime?`.
- Aucune colonne supprimée, aucune renommée, aucun type changé, aucune contrainte NOT NULL
  ajoutée à une table qui contient déjà des lignes.

**Conclusion : risque de perte de données nul.** `prisma db push` n'émettra que des
`CREATE TABLE` et des `ADD COLUMN`. Il ne demandera pas `--accept-data-loss` — et s'il le
demandait, ce serait le signal qu'une hypothèse de cette analyse est fausse : **il faudrait alors
s'arrêter net**, pas passer le drapeau.

### Ordre exact d'exécution

```bash
cd backend

# ── 0. Sauvegarder d'abord, toujours ────────────────────────────────────
node scripts/sauvegarde.mjs --env .env.production
node scripts/sauvegarde.mjs --env .env            # dev : vraies données de test

# ── 1. Développement, où l'on peut se tromper ───────────────────────────
npx prisma db push
npx prisma generate

# ── 2. Base de test ─────────────────────────────────────────────────────
DATABASE_URL="<chaîne de .env.test>" npx prisma db push

# ── 3. La suite de bout en bout, qui n'a pas tourné depuis 3 jours ──────
npm run test:e2e

# ── 4. Production, seulement si l'étape 3 est verte ─────────────────────
DATABASE_URL="<chaîne de .env.production>" npx prisma db push
```

### Rollback

| Étape | Retour arrière |
|---|---|
| Tables ajoutées | `DROP TABLE subscriptions, score_snapshots;` — elles sont vides et rien d'autre n'en dépend |
| Colonnes ajoutées | `ALTER TABLE ... DROP COLUMN ...` — nullables, aucune donnée existante ne s'y trouve |
| Catastrophe | `node scripts/restauration.mjs --depuis <sauvegarde>` — testé, 185 lignes, zéro écart |

### Temps

**15 à 20 minutes** pour les étapes 0, 1, 2 et 4. L'étape 3 (bout en bout) prend environ 3 minutes
par exécution ; prévoir **1 à 2 heures** au total si des tests tombent, ce qui est probable : la
suite n'a pas tourné depuis que le modèle d'offres a été branché sur la création de projet.

---

## Blocage 3 — Vérification réelle

### Ce qui n'a jamais touché une vraie base

Mesuré en croisant les routes réelles avec la couverture de la suite de bout en bout.

| Fonctionnalité | Tests unitaires | Bout en bout | Navigateur |
|---|---|---|---|
| Offres, droits, limites | oui | **jamais** | **jamais** |
| Historique des scores | oui | **jamais** | **jamais** |
| `/mentions-legales`, identité légale | oui | **jamais** | **jamais** |
| IGINI lit le profil de la personne | oui | **jamais** | **jamais** |
| Banque, comptabilité, rapprochement | oui | partiel | oui (20/09) |
| Conformité par pays et secteur | oui | oui | oui (20/09) |
| Parcours, tâches, scores, mémoire | oui | oui | oui |
| Communauté | oui | **jamais** | oui (20/09) |

Les quatre premières lignes sont les livraisons des trois derniers jours. **Rien de ce qui a été
construit depuis le 20 septembre n'a tourné contre une vraie base.**

### Checklist de validation réelle

À dérouler dans cet ordre, sur la base de développement, après migration. Chaque ligne est un fait
vérifiable, pas une impression.

**Socle — le compte**

1. Inscription avec une adresse neuve → arrivée sur le choix de rôle.
2. Déconnexion, reconnexion → on retombe sur ses projets.
3. Mot de passe oublié → **un email part réellement**. C'est le seul point où `MAIL_TRANSPORT=log`
   se traduit par « la personne reste dehors ».
4. `/mentions-legales` sans être connecté → raison sociale, adresse, email ; **IBAN masqué**, et
   `grep` du corps de la réponse pour le numéro complet : zéro occurrence.

**Les offres — jamais éprouvées**

5. Compte neuf → offre Découverte, un projet autorisé.
6. Créer un **deuxième** projet → refus, message nommant Entrepreneur.
7. Générateur Analyser → passe. Générateur Construire → refus nommant Entrepreneur.
8. Quatre analyses dans le mois → la quatrième est refusée avec « le compteur repart le 1er ».
9. `POST /offres/changer` vers `construction` → refus « aucun moyen de paiement ».
10. La page `/offres` n'affiche **aucun bouton Choisir**.

**Le parcours — déjà éprouvé, à re-éprouver après migration**

11. Créer un projet, le décrire → le tableau de bord affiche des tirets, pas des zéros.
12. Analyser → Étincelle chiffrée, prochaine étape mise à jour.
13. Ajouter une tâche à la main → **une seule** tâche apparaît, pas six.
14. Cocher la tâche → le score Construction bouge sans rechargement.
15. Recharger le lendemain → `/scores/historique` rend **deux** points, non interpolés.

**La conformité**

16. Déclarer le pays au profil → la section dit « Démarches pour : France ».
17. Déclarer le secteur du projet → les démarches se regroupent, et **le compte total ne change
    pas**.
18. Ouvrir trois liens de source au hasard → aucun 404.

**IGINI connaît la personne**

19. Remplir secteurs et parcours, puis analyser → l'analyse mentionne le métier déclaré.
20. Vider le profil, analyser un autre projet → aucune phrase du type « aucune information
    disponible ».

**Ce qui doit rester vrai sous stress**

21. Couper `IGINI_AI_ENABLED` → le produit reste entièrement utilisable à la main.
22. `/ready` → `schema: ok` sur les 50 tables et leurs colonnes, `referentiel: ok` sur les 12
    démarches.

---

## Blocage 4 — Paiements

### Où l'intégration est prévue

Trois points, déjà écrits et testés à vide :

| Point | Fichier | Ce qui manque |
|---|---|---|
| Choix du fournisseur | `PAIEMENT_FOURNISSEUR` (env) | vaut `aucun` |
| Confirmation d'encaissement | `OffresService.changer(userId, offre, { fournisseur, reference })` | l'appelant : une route de notification |
| Affichage | `catalogue().souscriptionPossible` | rien — il bascule tout seul |

Le refus des offres payantes sans référence d'encaissement est **volontaire et testé**. Ce n'est
pas un trou à combler mais un garde-fou à conserver.

### Le critère qui décide, et ce n'est pas la commission

Ignitux vendrait un **service numérique par abonnement à des particuliers dans l'UE**. Cela
déclenche la TVA du pays de l'acheteur, donc une inscription au guichet **OSS** et une déclaration
trimestrielle. Sur trente abonnés à 9,90 €, l'écart de commission entre deux fournisseurs se
compte en euros par mois ; l'obligation déclarative, elle, se compte en heures et en risque.

D'où la vraie ligne de partage : **simple prestataire de paiement** (tu es le vendeur, tu déclares)
contre **marchand de référence — MoR** (le fournisseur est le vendeur légal, il collecte et
reverse la TVA à ta place).

### Comparaison

| | Type | Commission (carte UE) | Difficulté | TVA UE | Intégration |
|---|---|---|---|---|---|
| **Stripe** | PSP | ~1,5 % | moyenne | **à ta charge** (Stripe Tax en option, payante) | 3 à 5 j |
| **Mollie** | PSP | ~1,8 % + 0,25 € | moyenne | **à ta charge** | 3 à 5 j |
| **LemonSqueezy** | **MoR** | plus cher (~5 % + frais) | **faible** | **prise en charge** | 1 à 2 j |
| **Paddle** | **MoR** | ~5 % | faible | **prise en charge** | 1 à 2 j |
| **Revolut Business** | compte pro | — | — | à ta charge | **inadapté** |

**Revolut Business n'est pas un candidat**, et il faut le dire clairement : c'est un compte
professionnel avec facturation et API de virements, pas une plateforme d'abonnement. Ni page de
paiement en libre-service, ni relances d'échec, ni proratisation, ni notifications d'abonnement.
Tu as déjà un compte N26 pour recevoir l'argent ; ce n'est pas le même problème.

Note : **LemonSqueezy a été racheté par Stripe**, ce qui rassure sur sa pérennité et rend un
passage ultérieur vers Stripe moins brutal.

### Recommandation pour la bêta

**Aucun fournisseur. Pas maintenant.**

Trois raisons, dans l'ordre d'importance :

1. **Aucun fournisseur ne t'ouvrira un compte sans SIRET.** Stripe, Mollie et les MoR exigent un
   justificatif d'immatriculation. Le délai d'obtention est de **15 à 30 jours**. C'est un chemin
   long qui ne bloque rien d'autre — donc à lancer en parallèle, pas devant.
2. **Une bêta privée n'a rien à vendre.** L'offre Découverte est complète : un projet entier,
   les tâches, la mémoire, la connaissance, les scores, la conformité, trois analyses. C'est
   exactement ce qu'on veut faire essayer, et le code refuse déjà proprement le reste.
3. **Facturer pendant une bêta demande de rembourser après.** Des premiers utilisateurs qui
   paient un produit en rodage créent une obligation de service que tu ne peux pas encore tenir.

**Quand tu factureras : LemonSqueezy ou Paddle.** Payer ~3,5 points de commission de plus pour ne
jamais déclarer de TVA dans vingt-sept pays est un bon échange pour un solo. Le jour où le volume
rend l'écart douloureux — au-delà de quelques milliers d'euros par mois — Stripe devient rentable,
et la bascule sera un changement de fournisseur, pas de modèle : `changer()` prend déjà une
référence.

---

## Blocage 5 — Préparation bêta

### Prêt

- Le produit lui-même : 15 écrans, 0 anomalie à la traversée du 20 septembre.
- 1 019 tests serveur, 355 tests interface, lint et typage propres.
- Sauvegarde et restauration **testées** : 185 lignes, zéro écart.
- Sonde `/ready` à trois états, dérive de schéma détectée jusqu'aux colonnes.
- Filtre d'erreurs avec référence à huit caractères.
- Le produit fonctionne **générateurs éteints** — vérifié.
- Modèle d'offres, droits, refus : écrits et testés.

### Pas prêt

| Élément | Classement | Pourquoi |
|---|---|---|
| Base de données injoignable | **Critique** | Rien n'est possible avant |
| Aucun hébergement : pas de `Dockerfile`, pas de configuration de déploiement | **Critique** | Il n'existe aucun moyen de mettre Ignitux en ligne |
| `FRONTEND_URL`, `TRUST_PROXY`, `MAIL_TRANSPORT` absents de `.env.production` | **Critique** | **Vérifié : le serveur refuse de démarrer.** Le préflight fait son travail |
| Aucun envoi d'email réel | **Critique** | Sans lui, un mot de passe oublié enferme la personne dehors |
| Nom de domaine | **Critique** | Pas d'adresse à donner aux testeurs |
| `ANTHROPIC_API_KEY` vide en production | **Important** | Les générateurs refuseront chaque appel |
| Bout en bout jamais exécuté sur le nouveau code | **Important** | Trois échecs dormants avaient déjà été trouvés ainsi |
| Offres et historique jamais vus dans un navigateur | **Important** | Le tableau de bord ne lit pas encore l'historique |
| Le job CI de bout en bout n'a jamais tourné | **Important** | Écrit et valide, jamais exécuté — pas de Docker ici |
| Les trois environnements sur une seule instance | **Important** | Une panne les emporte ensemble |
| Paiements | **Amélioration** | Hors du chemin de la bêta |
| Écran d'évolution des scores | **Amélioration** | L'API existe, l'écran non |
| Référentiel de conformité : 2 démarches sectorielles sur 12 | **Amélioration** | Le tri marche, il a peu à trier |
| Écho visuel tableau de bord / bande de phases | **Amélioration** | Cosmétique |

---

## Le chemin le plus court

### Ce que Helder doit faire

| # | Action | Durée | Bloque |
|---|---|---|---|
| 1 | Console Supabase : restaurer, **copier la chaîne Connect** | 15 min | **tout** |
| 2 | Créer un compte d'envoi d'email (Brevo, Resend ou Postmark — gratuit à ce volume) et fournir les identifiants SMTP | 30 min | le lancement |
| 3 | Acheter un nom de domaine | 20 min | le lancement |
| 4 | Choisir l'hébergeur (Railway, Render, Fly.io ou un VPS) et ouvrir le compte | 30 min | le déploiement |
| 5 | Lancer l'immatriculation (SIRET) | 45 min + 15 à 30 j d'attente | **les paiements seulement** |
| 6 | Décider : la bêta est-elle entièrement gratuite ? | 5 min | le cadrage |

**Total : environ 2 h 20 de travail, plus une attente administrative qui ne bloque pas la bêta.**

### Ce que Claude Code doit faire

| # | Action | Durée |
|---|---|---|
| 1 | Migrer les trois bases, régénérer le client | 0,5 h |
| 2 | Exécuter la suite de bout en bout, corriger ce qui tombe | 1 à 2 h |
| 3 | Dérouler la checklist de validation réelle au navigateur (22 points) | 2 à 3 h |
| 4 | Compléter `.env.production` et vérifier que le préflight passe | 0,5 h |
| 5 | Écrire le `Dockerfile`, la configuration de déploiement et les variables | 3 à 5 h |
| 6 | Premier déploiement, vérification de `/ready` en ligne | 2 à 3 h |
| 7 | Brancher le vrai SMTP, vérifier un mot de passe oublié de bout en bout | 1 h |
| 8 | Sortir `ignitux_test` de l'instance de production | 1 h |
| 9 | Traversée complète sur l'environnement en ligne | 2 h |
| 10 | Écran d'évolution des scores (l'API existe) | 1,5 h |

**Total : 14,5 à 20 heures.**

### Estimation réaliste avant les premiers utilisateurs

| Scénario | Heures Claude | Heures Helder | Délai |
|---|---|---|---|
| **Bêta minimale** — restauration, migration, validation, déploiement, email | 14,5 à 20 | 2 h 20 | **3 à 5 jours** de travail sérieux |
| + écran d'évolution et durcissement | +3 à 5 | — | une semaine |
| + paiements réels | +8 à 12 | +2 h | **conditionné au SIRET**, 15 à 30 jours |

**Le chemin le plus court passe par l'étape 1 de Helder.** Tant que la base dort, les dix-huit
heures de travail restantes ne peuvent pas commencer — et je ne peux rien vérifier de ce qui a été
construit depuis trois jours.

---

## Trois choses que je ne recommande pas

**Ne pas contourner Supabase dans l'urgence.** Une base locale ferait repartir les tests
aujourd'hui, mais elle ne dirait rien de la production et coûterait une demi-journée. Le
diagnostic tient en quinze minutes de console.

**Ne pas facturer pendant la bêta.** Voir Blocage 4.

**Ne pas migrer la production avant que le bout en bout soit vert sur la base de test.** L'ordre
des quatre commandes n'est pas décoratif : la production est la dernière, et seulement si l'étape
précédente a réussi.
