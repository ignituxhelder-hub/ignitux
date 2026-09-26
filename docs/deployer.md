# Déployer Ignitux — la procédure

26 septembre 2026. Le *où* est dans [`hebergement.md`](hebergement.md). Ce
document est le *comment* : la suite d'étapes, dans l'ordre, chacune
vérifiable avant la suivante.

> **Ce document remplace la section « Étapes de déploiement » de
> [`mise-en-production.md`](mise-en-production.md)**, écrite le 20 septembre.
> Ses trois premières étapes sont faites depuis : `trust proxy` est lu depuis
> l'environnement, Swagger ne se monte que sur `ENABLE_API_DOCS=true`, le
> filtre d'exception global existe, les deux `Dockerfile` existent et se
> construisent en CI, et `ignitux_prod` est migrée. Le reste de ce
> document-là — l'audit — garde sa valeur.

---

## Avant de commencer : ce qui est déjà prêt

Tu n'as rien à préparer côté code. **[mesuré]** aujourd'hui :

| | État |
|---|---|
| Image du serveur | existe, se construit en CI, **démarre pour de vrai** (test de fumée) |
| Image de l'interface | existe, se construit en CI |
| Port dynamique | les deux lisent `PORT` — corrigé le 26/09 côté interface, voir plus bas |
| Arrêt propre | `enableShutdownHooks()` : la connexion Postgres est libérée sur `SIGTERM` |
| Sonde de santé | `GET /health` interroge vraiment la base (`SELECT 1`) |
| Aucun état en mémoire | JWT sans session serveur, rien écrit sur disque — réplicable tel quel |
| Base de production | `ignitux_prod` migrée, 50/50 tables |

### Le piège que j'ai trouvé en écrivant ce document

L'interface écoutait **le port 3001 en dur**, alors que le serveur lisait déjà
`PORT`. Toutes les plateformes de conteneurs injectent `PORT` et routent le
trafic dessus : l'interface n'aurait rien reçu, le contrôle de santé aurait
échoué, la plateforme aurait redémarré en boucle — et le journal n'aurait
montré qu'un démarrage réussi. C'est la panne la plus déroutante d'un premier
déploiement.

Corrigé, et éprouvé : `PORT=3005` est bien respecté, et sans `PORT` le repli
reste 3001. **[mesuré]**

---

## Étape 1 — Le domaine *(15 minutes, puis quelques heures d'attente)*

Prends-le **en premier** : la propagation DNS prend du temps, et deux étapes
en dépendent.

1. `ignitux.fr` ou `ignitux.com` chez OVH, Gandi ou Cloudflare — 10 à 15 €/an.
2. Prévois deux sous-domaines :
   - `app.ignitux.fr` → l'interface
   - `api.ignitux.fr` → le serveur

**Pourquoi deux et pas un** : l'interface et le serveur sont deux conteneurs.
Les mettre derrière un seul nom demanderait un reverse proxy à configurer
et à maintenir — c'est exactement le travail qu'on évite en prenant une PaaS.

---

## Étape 2 — Créer les deux applications *(30 minutes)*

Sur la plateforme retenue, **deux applications séparées**, toutes deux
construites depuis le dépôt Git :

| Application | Dossier | Image |
|---|---|---|
| `ignitux-api` | `backend/` | `backend/Dockerfile` |
| `ignitux-app` | `frontend/` | `frontend/Dockerfile` |

**L'interface a un argument de build obligatoire** :

```
NEXT_PUBLIC_API_URL=https://api.ignitux.fr
```

Ce n'est pas une variable d'environnement ordinaire : elle est **gravée dans
le paquet au moment du build**. Changer d'adresse d'API veut dire
reconstruire. Si tu l'oublies, l'interface se déploiera sans erreur et
appellera `127.0.0.1` — c'est-à-dire le navigateur de chaque visiteur.

---

## Étape 3 — Les variables d'environnement du serveur *(20 minutes)*

À poser sur `ignitux-api`. **Le serveur refuse de démarrer si l'une des
obligatoires manque** — c'est voulu : une panne bruyante au lancement coûte
cinq minutes, une panne silencieuse coûte un incident.

### Obligatoires

| Variable | Valeur | Ce qu'elle protège |
|---|---|---|
| `NODE_ENV` | `production` | active le préflight |
| `DATABASE_URL` | la chaîne du **pooler de session** vers `ignitux_prod` | jamais la base de développement |
| `JWT_SECRET` | 32 caractères aléatoires, **générés pour l'occasion** | une valeur d'exemple laissée ici est une faille : n'importe qui forge un jeton |
| `JWT_EXPIRES_IN` | `1d` | |
| `FRONTEND_URL` | `https://app.ignitux.fr` | c'est l'origine autorisée par CORS. **En `http`, le préflight refuse de démarrer** |
| `TRUST_PROXY` | `1` | sans lui, le limiteur voit l'adresse du proxy et met tout le monde dans le même seau : une personne peut verrouiller tous les comptes |
| `MAIL_TRANSPORT` | `smtp` ou `log` | **doit être écrit** : par omission, un mot de passe oublié échoue en silence |

### Identité légale — obligatoires aussi

Un service ouvert au public doit publier qui l'édite, et une facture sans
raison sociale n'est pas une facture incomplète : c'est un document sans
valeur.

`IGNITUX_RAISON_SOCIALE`, `IGNITUX_ADRESSE`, `IGNITUX_EMAIL` — les trois sont
déjà renseignées dans `backend/.env.production`, à recopier.

`IGNITUX_IDENTIFIANT` (SIREN) et `IGNITUX_TVA` restent vides tant que
l'immatriculation n'existe pas : c'est prévu.

### Si `MAIL_TRANSPORT=smtp`

`MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`.
Les quatre premières sont déjà dans `.env.production` ; seul le mot de passe
manque. **Le préflight refuse un `MAIL_FROM` dont le domaine ne peut pas
exister** — `.test`, `.invalid`, `exemple.` : il attrape la valeur du fichier
modèle laissée en place.

### À laisser telles quelles

| Variable | Valeur | Pourquoi |
|---|---|---|
| `ENABLE_API_DOCS` | absente ou `false` | sinon la carte complète de l'API est publique |
| `IGINI_AI_ENABLED` | `true` | les générateurs |
| `ANTHROPIC_API_KEY` | ta clé | |

---

## Étape 4 — Les variables de l'interface *(5 minutes)*

Une seule compte, et c'est **l'argument de build** de l'étape 2 :
`NEXT_PUBLIC_API_URL=https://api.ignitux.fr`.

L'interface ne lit aucun secret. C'est normal : tout ce qu'elle reçoit part
dans le navigateur de chaque visiteur.

---

## Étape 5 — Le contrôle avant de déployer *(2 minutes)*

**Avant** de lancer le déploiement, sur ta machine :

```
node backend/scripts/verifier-production.mjs backend/.env.production
```

Il doit rendre **0 bloquant**. Il vérifie ce que le serveur vérifiera de
toute façon au démarrage — mais il le dit ici, où corriger coûte une minute,
plutôt que là-bas, où il faut relire des journaux.

À ce jour il rend **1 bloquant** : `FRONTEND_URL` est encore en `http`, sur
l'adresse du réseau local. Il disparaîtra dès que le domaine sera en place.

---

## Étape 6 — Déployer, dans cet ordre *(30 minutes)*

**Le serveur d'abord, l'interface ensuite.** L'interface grave l'adresse de
l'API à la construction : si l'API n'existe pas encore, tu construiras contre
une adresse qui ne répond pas, et il faudra reconstruire.

1. Déployer `ignitux-api`. Attendre que la plateforme le déclare sain.
2. Vérifier depuis l'extérieur :
   ```
   curl https://api.ignitux.fr/health   → 200
   curl https://api.ignitux.fr/ready    → l'état détaillé, service par service
   curl https://api.ignitux.fr/docs     → 404
   ```
   Le troisième compte autant que les deux premiers : un 200 sur `/docs`
   voudrait dire que `ENABLE_API_DOCS` traîne.
3. Déployer `ignitux-app` avec son argument de build.
4. Ouvrir `https://app.ignitux.fr` et **créer un compte**. Si l'inscription
   passe, CORS, la base et le serveur se parlent tous les trois.

---

## Étape 7 — Ce qu'il faut brancher le jour même *(2 heures)*

Pas « bientôt » : **le jour même**.

1. **Un collecteur d'erreurs.** Les `Logger.error` existent, chacun avec sa
   référence. Sans collecteur, personne ne les lit, et le premier bogue se
   découvrira par un message d'utilisateur.
2. **Une sonde externe sur `/health`**, qui t'écrit quand ça ne répond plus.
3. **La sauvegarde planifiée** : `backend/scripts/sauvegarde.mjs` en tâche
   quotidienne, puis `verifier-sauvegarde.mjs` sur le résultat. Une sauvegarde
   qu'on doit penser à faire n'existe pas le jour où on en a besoin.

---

## Étape 8 — Vérifier que rien ne s'est perdu en route *(15 minutes)*

Les harnais tournent contre n'importe quelle adresse :

```
node scripts/traversee-ecrans.mjs --web https://app.ignitux.fr --api https://api.ignitux.fr
node scripts/parcours-premier-utilisateur.mjs --web https://app.ignitux.fr --api https://api.ignitux.fr
node scripts/hors-ligne.mjs --web https://app.ignitux.fr --api https://api.ignitux.fr
```

Le troisième vaut le détour : en `https`, le service worker s'installe enfin
pour de vrai. **En réseau local il ne peut pas** — un service worker exige un
contexte sécurisé, et seul `localhost` échappe à la règle. Le démarrage hors
ligne ne fonctionnera donc *qu'une fois le domaine en place*, et cette
commande est ce qui le confirmera.

---

## Ce que je ne ferai pas à ta place

**Déployer.** Le premier déploiement expose le produit à Internet, et c'est ta
décision. Je peux préparer, vérifier, corriger et relancer les contrôles — dis
le mot et je le fais.

---

## Si quelque chose ne va pas

| Symptôme | Cause la plus probable |
|---|---|
| Le serveur ne démarre pas, journal explicite | une variable obligatoire manque — le message la nomme |
| L'interface s'affiche, rien ne charge | `NEXT_PUBLIC_API_URL` oubliée au build, ou `FRONTEND_URL` qui ne correspond pas exactement au domaine de l'interface |
| Tout le monde est déconnecté en même temps | `JWT_SECRET` a changé entre deux déploiements |
| Une personne bloque les connexions de tous | `TRUST_PROXY` absent |
| La plateforme redémarre en boucle, journal sain | le port — normalement réglé depuis le 26/09, mais c'est là qu'il faut regarder |
| `/ready` dit « dégradé » | normal si `MAIL_TRANSPORT=log` : il le dit et l'explique |
