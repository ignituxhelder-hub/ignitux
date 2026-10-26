# Publications Instagram et TikTok

L'application **Réseaux sociaux** connecte un compte professionnel Instagram ou un compte TikTok, prépare un brouillon (IGINI peut proposer la légende, la personne la relit) et le publie **après confirmation**. Rien n'est programmé ni envoyé automatiquement.

Première version écrite par ChatGPT le 25/10/2026, relue et corrigée le 26/10/2026 (voir « Ce qui a été corrigé » en bas).

## Qui peut s'en servir

Tant qu'Instagram (revue Meta) et TikTok (audit) n'ont pas validé l'application Ignitux, seuls les comptes déclarés dans leurs consoles développeur peuvent s'y connecter. L'application est donc **réservée aux opérateurs d'Ignitux** (`IGNITUX_OPERATEURS`) :

- pour eux, elle est dans la boutique d'applications et fonctionne ;
- pour les autres, le lanceur la range parmi les applications **prévues** (« Ouvrira à tous quand Instagram et TikTok auront validé l'application Ignitux ») et la page le dit ; le serveur refuse connexion, brouillon, publication et suggestion IGINI.

`RESEAUX_SOCIAUX_POUR_TOUS=true` l'ouvre à tous, le jour où les deux plateformes l'ont validée.

## Configuration du serveur (Render)

| Variable | Valeur |
| --- | --- |
| `INSTAGRAM_CLIENT_ID` | Identifiant de l'application Meta (produit « Instagram API with Instagram Login ») |
| `INSTAGRAM_CLIENT_SECRET` | Secret de cette application |
| `INSTAGRAM_REDIRECT_URI` | `https://ignitux-backend.onrender.com/reseaux-sociaux/oauth/instagram/callback` |
| `INSTAGRAM_GRAPH_VERSION` | Version de l'API Graph déclarée dans l'application Meta (défaut : `v26.0`) |
| `TIKTOK_CLIENT_KEY` | Clé de l'application TikTok (produits « Login Kit » et « Content Posting API ») |
| `TIKTOK_CLIENT_SECRET` | Secret de cette application |
| `TIKTOK_REDIRECT_URI` | `https://ignitux-backend.onrender.com/reseaux-sociaux/oauth/tiktok/callback` |
| `SECRETS_ENCRYPTION_KEY` | 64 caractères hexadécimaux (`openssl rand -hex 32`) — déjà utilisée par la boutique Shopify si elle est configurée : **ne pas la changer**, sinon les jetons existants deviennent illisibles |
| `IGNITUX_OPERATEURS` | Les adresses email des opérateurs (déjà en place pour la participation) |
| `RESEAUX_SOCIAUX_POUR_TOUS` | Vide tant que les plateformes n'ont pas validé ; `true` ensuite |

Les URI de redirection doivent être **identiques**, caractère pour caractère, à celles déclarées dans les consoles Meta et TikTok. Sans ces variables, le serveur démarre normalement et l'écran indique « pas encore configuré » pour le réseau concerné.

IGINI doit être active pour proposer des légendes ; la suggestion est limitée à cinq demandes par minute et compte dans le plafond de coût IA habituel.

## Ce que chaque plateforme demande

**Instagram**
- Compte **professionnel** (entreprise ou créateur).
- Images et **vidéos (Reels)**. Une vidéo demande à Meta d'une à quelques minutes de préparation : après « Publier maintenant », toucher **« Vérifier le statut »** ; le Reel part dès qu'il est prêt. Une vidéo préparée et non publiée expire au bout de 24 h.
- La connexion dure 60 jours et se prolonge toute seule quand on publie ; passé ce délai sans activité, il faut reconnecter le compte.

**TikTok**
- Images et vidéos. L'écran affiche le compte, la visibilité choisie par la personne (jamais présélectionnée), les interactions (désactivées par défaut), la déclaration de contenu commercial et l'accord sur les règles musicales, comme TikTok l'exige.
- Tant que l'application n'est pas auditée : publications **privées seulement** (« Moi uniquement ») et cinq utilisateurs actifs par jour au plus. TikTok refuse aussi d'auditer un outil réservé à un usage interne.
- La connexion se renouvelle toute seule pendant un an (jeton de renouvellement) ; au-delà, reconnecter.
- Le domaine qui héberge les médias doit être **vérifié** dans la console TikTok.

**Les deux**
- Le média doit déjà être **en ligne, à une adresse HTTPS publique** : ce sont Instagram et TikTok qui vont le chercher. Ignitux n'héberge pas encore les fichiers (pas d'espace de stockage public) : c'est la prochaine étape si l'application doit servir à tous.

## Utilisation

1. Ouvrir **Réseaux sociaux** et connecter Instagram ou TikTok.
2. Choisir le réseau et le type de média, coller l'adresse publique du média, écrire la légende — ou la faire proposer par IGINI, puis la relire.
3. Enregistrer le brouillon.
4. **Publier maintenant**, puis confirmer. Pour un Reel Instagram ou une publication TikTok, **Vérifier le statut** jusqu'à « Publié ».

La fonctionnalité ne republie jamais d'elle-même un envoi échoué. En cas de doute sur un statut, vérifier dans l'application du réseau avant de recommencer.

**Déconnecter** efface les jetons stockés par Ignitux et révoque l'autorisation chez TikTok. Chez Instagram, retirer aussi Ignitux dans *Paramètres → Applications et sites web*.

## Données personnelles

- Les publications préparées sont dans l'export RGPD (`communaute_et_marketplace.publications_reseaux_sociaux`).
- Les comptes connectés n'y sont pas : ce sont des jetons chiffrés (même règle que la boutique Shopify). Voir `docs/registre-de-traitements.md`, entrée 21.

## Ce qui a été corrigé le 26/10/2026

- Les deux nouvelles tables n'étaient pas classées pour l'export RGPD et la suppression de compte : le test `user-data-scope.spec.ts` échouait (la CI serait passée au rouge).
- La connexion TikTok expirait au bout de 24 h faute de jeton de renouvellement ; la connexion Instagram n'était jamais prolongée.
- Les vidéos Instagram (Reels) étaient refusées.
- Déconnecter laissait les jetons chiffrés en base.
- TikTok répond parfois « 200 » avec l'erreur dans le corps : elle passait inaperçue.
- Les échecs de connexion n'étaient pas journalisés.
- L'application était proposée par IGINI à tous les entrepreneurs, alors qu'elle ne peut fonctionner que pour les comptes déclarés chez Meta et TikTok.
- L'écran vouvoyait ; Ignitux tutoie. Les champs n'avaient pas le style `.field` des autres formulaires.
