# Publications Instagram et TikTok

L’application **Réseaux sociaux** permet de connecter un compte professionnel Instagram ou un compte TikTok, de préparer un brouillon et de le publier après confirmation. IGINI peut proposer une légende; la personne peut la modifier. Aucun calendrier ni envoi automatique n’est activé.

## Configuration du serveur

Ajouter ces paramètres au fichier d’environnement utilisé par l’API (ou au `.env` Docker). Les identifiants client ne vont jamais dans le navigateur.

| Variable | Valeur |
| --- | --- |
| `INSTAGRAM_CLIENT_ID` | Identifiant de l’application Meta |
| `INSTAGRAM_CLIENT_SECRET` | Secret de l’application Meta |
| `INSTAGRAM_REDIRECT_URI` | URL publique `https://<api>/reseaux-sociaux/oauth/instagram/callback` |
| `INSTAGRAM_GRAPH_VERSION` | Version Graph utilisée par l’application (valeur par défaut : `v26.0`) |
| `TIKTOK_CLIENT_KEY` | Clé de l’application TikTok |
| `TIKTOK_CLIENT_SECRET` | Secret de l’application TikTok |
| `TIKTOK_REDIRECT_URI` | URL publique `https://<api>/reseaux-sociaux/oauth/tiktok/callback` |
| `SECRETS_ENCRYPTION_KEY` | Clé aléatoire de 32 octets codée en 64 caractères hexadécimaux |
| `FRONTEND_URL` | Adresse publique du site Ignitux, pour le retour après OAuth |

Les URL de rappel doivent correspondre exactement à celles déclarées dans les consoles Meta et TikTok. En local avec Docker, les valeurs d’exemple utilisent `http://localhost:3000` pour les rappels API et `http://localhost:3001` pour le frontend. Pour un environnement public, utiliser HTTPS.

`SECRETS_ENCRYPTION_KEY` protège les jetons d’accès enregistrés en base. Générer une clé indépendante pour chaque environnement, la conserver dans le gestionnaire de secrets du déploiement et la sauvegarder en sécurité. La perdre rend les jetons déjà stockés inutilisables; la changer nécessite de reconnecter les comptes. Ne jamais versionner la vraie clé.

IGINI doit être activée (`IGINI_AI_ENABLED=true`) pour générer les légendes. La route de suggestion est limitée à cinq demandes par minute et les appels passent par le contrôle global de coût déjà utilisé par IGINI.

## Prérequis médias et plateformes

- Instagram est limité aux publications avec image dans cette première version; le compte doit être de type professionnel et autoriser la publication via l’application Meta.
- TikTok accepte image et vidéo. La plateforme demande les options du créateur avant la publication, et l’écran impose une confirmation explicite sur les droits d’utilisation de la musique.
- TikTok limite les applications non auditées aux publications privées (`SELF_ONLY`) et à cinq utilisateurs actifs sur 24 heures. L’audit est requis pour lever ces limites; TikTok n’autorise pas non plus les outils de publication réservés à un usage interne ou à une équipe. Vérifier que l’application Ignitux répond aux règles d’usage prévues avant la mise en service.
- Si la publication promeut une autre marque, la visibilité `SELF_ONLY` est interdite. L’écran exige un choix commercial et indique les étiquettes de contenu associées.
- Le média doit être accessible publiquement par HTTPS depuis les serveurs de la plateforme. Un média local ou derrière une authentification ne fonctionnera pas.
- Les autorisations, la vérification de domaine, les validations et le statut d’audit exigés par Meta/TikTok dépendent de la configuration réelle de chaque application.

## Utilisation

1. Ouvrir **Réseaux sociaux** dans Ignitux et connecter Instagram ou TikTok.
2. Saisir l’URL publique du média et rédiger une légende, ou demander une suggestion à IGINI puis la relire/modifier.
3. Enregistrer le brouillon. Pour TikTok, choisir les options disponibles et confirmer les droits musicaux.
4. Cliquer sur **Publier maintenant** et confirmer. Les publications TikTok peuvent rester en cours; utiliser **Vérifier le statut** pour actualiser leur résultat.

La fonctionnalité ne republie pas automatiquement les échecs et ne programme pas de posts. En cas d’incertitude de statut, vérifier aussi dans l’application sociale avant toute nouvelle tentative.
