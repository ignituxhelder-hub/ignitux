# Ignitux sur Windows, Android, iPhone et iPad

Ignitux est **une seule application web installable** (PWA). Le même code
s'installe sur les trois plateformes, sans boutique, dès qu'il est hébergé en
HTTPS. Les boutiques viennent ensuite, comme un emballage autour de ce même
code.

> Les prix et conditions des boutiques ci-dessous sont **à vérifier** au
> moment de s'inscrire : ils changent, et ils ne sont pas vérifiés ici.

---

## 1. Ce qui est prêt dans le code

| Plateforme | Ce qui est en place |
|---|---|
| **Windows** (Edge, Chrome) | Manifeste complet, icônes 192/512, captures « ordinateur » et « téléphone », raccourcis (clic droit dans la barre des tâches), une seule fenêtre rouverte au lieu d'en empiler (`launch_handler`). Bouton « Installer » dans le lanceur. |
| **Android** (Chrome) | Même manifeste, plus une icône masquable (le logo tient dans le cercle ou la goutte d'Android). Bouton « Installer » dans le lanceur. `/.well-known/assetlinks.json` prêt pour Google Play. |
| **iPhone / iPad** (Safari) | Icône 180 × 180 à fond plein, titre « Ignitux », ouverture sans barre Safari, 19 écrans de démarrage aux dimensions exactes des iPhone SE à 16 Pro Max et des iPad, contenu qui passe sous l'encoche (`viewport-fit=cover` et marges `safe-area`). Safari n'a pas de bouton d'installation : le lanceur explique le chemin **Partager → Sur l'écran d'accueil**. |

L'invitation à installer ne s'affiche jamais quand Ignitux est déjà ouverte
comme application. « Plus tard » la masque sur cet appareil.

Fichiers :

- `frontend/src/app/manifest.ts` : le manifeste.
- `frontend/src/app/layout.tsx` : les balises Apple.
- `frontend/src/lib/installation.ts` et
  `frontend/src/components/invitation-installation.tsx` : le bouton, et le
  chemin iOS.
- `frontend/src/app/.well-known/assetlinks.json/route.ts` : le lien Android.
- `frontend/src/lib/ecrans-demarrage.json` : la liste des appareils iOS.

---

## 2. Vérifier en une commande

```bash
cd frontend
npm run build && npx next start -p 3055   # dans un terminal
node ../scripts/installable.mjs --web http://127.0.0.1:3055
```

La commande vérifie :

- le manifeste ;
- la taille réelle de chaque image (lue dans le PNG) ;
- le service worker ;
- le **verdict de Chromium lui-même** (`Page.getInstallabilityErrors`) ;
- les balises Apple ;
- chaque écran de démarrage iOS, au pixel près ;
- `assetlinks.json`.

Elle tourne aussi en intégration continue, juste après la vérification hors
ligne.

Résultat au 26/09/2026 : **12 OK, 0 échec**. On a aussi vérifié qu'elle sait
échouer : pointée sur une page sans manifeste, Chromium répond `no-manifest`.

Ce qu'elle ne peut pas faire, c'est appuyer sur « Installer » : aucun
navigateur ne le permet à un script. Il faut donc la liste de la section 7
sur de vrais appareils.

---

## 3. Tester sur un téléphone réel, en local (avant l'hébergement)

Deux serveurs tournent sur le PC, et le téléphone les joint par le Wi-Fi
local — sans domaine ni HTTPS. Trois pièges, dans l'ordre où ils se
présentent :

1. **Le pare-feu Windows.** Sur un réseau Wi-Fi classé « Public » (le cas par
   défaut), Windows bloque par défaut ce qui arrive de l'extérieur. Une seule
   fois, dans un PowerShell **ouvert en administrateur** (pas un terminal déjà
   ouvert — il faut une vraie fenêtre élevée, `Get-NetFirewallRule` permet de
   vérifier sans droits admin que la règle existe) :

   ```powershell
   New-NetFirewallRule -DisplayName "Ignitux test telephone" -Direction Inbound `
     -Protocol TCP -LocalPort 3055,3056 -Action Allow -RemoteAddress 192.168.1.0/24
   ```

   Adapter `192.168.1.0/24` et les ports au réseau et aux ports réels.

2. **`NEXT_PUBLIC_API_URL` doit être posée avant `next build`, pas seulement
   avant `next start`.** Next.js grave les variables `NEXT_PUBLIC_*` dans le
   JavaScript envoyé au navigateur au moment de la *construction*. Sans elle,
   la valeur par défaut (`http://localhost:3000`) part dans le paquet, et
   « localhost » sur le téléphone désigne le téléphone lui-même : la page
   s'ouvre, mais chaque appel au serveur échoue avec « pas de réseau », qui
   ressemble à une panne réseau alors que l'adresse est simplement fausse.

   ```powershell
   $env:NEXT_PUBLIC_API_URL = 'http://<IP-du-PC>:<port-backend>'
   $env:NEXT_DIST_DIR = '.next-verif'
   npx next build
   npx next start -H 0.0.0.0 -p <port-frontend>
   ```

   Vérifier que l'adresse a bien été gravée avant de rouvrir le téléphone :
   `grep -r "IP-du-PC:port-backend" .next-verif/static/chunks` doit trouver
   quelque chose.

3. Le backend doit connaître l'origine du frontend pour le CORS —
   `FRONTEND_URL=http://<IP-du-PC>:<port-frontend>` à son démarrage.

`git checkout tsconfig.json` après le build : `next build` le modifie sans
qu'on l'ait demandé.

---

## 4. Régénérer les images

Après une retouche du logo (`frontend/src/app/icon.svg`) ou de la liste
d'appareils iOS :

```bash
cd frontend
node scripts/generer-images-app.mjs
```

Cette commande produit les icônes, l'icône Apple et les 19 écrans de démarrage.

Après une retouche visible du lanceur, refaire les captures du manifeste.
Elles demandent une instance `next start` qui tourne, mais pas de serveur API :
les réponses sont simulées, avec un compte fictif.

```bash
node scripts/generer-images-app.mjs --captures http://localhost:3055
```

---

## 5. Installer aujourd'hui, sans boutique *(dès que c'est hébergé)*

- **Windows** : ouvrir Ignitux dans Edge ou Chrome, puis cliquer sur
  « Installer » dans le lanceur (ou sur l'icône d'installation dans la barre
  d'adresse). Ignitux rejoint le menu Démarrer et la barre des tâches.
- **Android** : ouvrir Ignitux dans Chrome, puis appuyer sur « Installer »
  dans le lanceur (ou choisir *Menu ⋮ → Installer l'application*).
- **iPhone / iPad** : ouvrir Ignitux dans **Safari**, puis appuyer sur
  *Partager*, puis sur *Sur l'écran d'accueil*. Chrome sur iOS ne propose pas
  toujours ce chemin : c'est pourquoi l'invitation ne s'affiche que dans
  Safari.

---

## 6. Les boutiques *(chacune demande le domaine en HTTPS)*

### Microsoft Store (Windows)

1. Aller sur [pwabuilder.com](https://www.pwabuilder.com), saisir l'URL de
   production, puis choisir **Windows**. PWABuilder produit un paquet MSIX à
   partir du manifeste. Les captures et les icônes qu'il exige sont déjà là.
2. Créer un compte développeur sur Microsoft Partner Center *(frais
   d'inscription : à vérifier)*. Réserver le nom « Ignitux ».
3. Reporter dans PWABuilder l'identité du paquet que donne Partner Center
   (*Package ID*, *Publisher*), puis déposer le MSIX.

Rien à changer dans le code.

### Google Play (Android)

1. Générer l'application Android avec PWABuilder (choisir **Android**) ou
   avec Bubblewrap (`npx @bubblewrap/cli init --manifest
   https://<domaine>/manifest.webmanifest`). Le résultat est une *Trusted Web
   Activity* : Ignitux en plein écran, sans barre Chrome.
2. Choisir un nom de paquet, par exemple `fr.ignitux.app`, et garder
   précieusement la clé de signature. **Elle ne va jamais dans le dépôt.**
3. Poser deux variables dans l'environnement de production du frontend :

   ```
   ANDROID_PACKAGE_NAME=fr.ignitux.app
   ANDROID_SHA256_CERT_FINGERPRINTS=AB:CD:…   # empreinte SHA-256, 32 octets
   ```

   Il peut y avoir plusieurs empreintes, séparées par des virgules. Avec
   Play App Signing, il faut aussi celle que donne la Play Console.

   `/.well-known/assetlinks.json` les publie alors. Sans elles, il répond `[]`,
   et Android affiche une barre d'adresse au-dessus de l'application. C'est le
   signe que le lien n'est pas fait.
4. Créer le compte Google Play Console *(frais : à vérifier ; les comptes
   personnels récents doivent aussi faire tester l'application par un groupe
   de testeurs pendant une période avant la publication, à vérifier au moment
   de l'inscription)*.
5. Relancer `scripts/installable.mjs` contre la production. La ligne
   `assetlinks.json` doit passer de NOTE à OK.

### App Store (iPhone, iPad)

Soyons francs : Apple refuse en général une application qui n'est qu'un site
dans une coque (règle 4.2 des *App Review Guidelines*, « fonctionnalité
minimale »). Le chemin réaliste est donc en deux temps.

1. **Maintenant** : la PWA via Safari. Elle est prête. C'est gratuit, sans
   validation Apple, et les mises à jour sont immédiates.
2. **Plus tard**, quand il y a une vraie raison native, une coque Capacitor
   autour du même frontend, avec au moins un apport natif :
   - notifications push natives ;
   - Face ID pour rouvrir la session ;
   - scan de justificatifs à l'appareil photo pour la comptabilité ;
   - partage vers Ignitux depuis d'autres apps.

   Il faut alors un compte Apple Developer *(abonnement annuel : à vérifier)*
   et un Mac, ou un service de build macOS, pour signer.

Capacitor produirait au passage une version Android native, si Google Play
demandait un jour plus qu'une TWA.

---

## 7. À vérifier sur de vrais appareils, une fois hébergé

À faire une fois, puis après chaque changement du manifeste ou des icônes.

**Windows (Edge)**

- [ ] Le bouton « Installer » apparaît dans le lanceur, et la fenêtre
      d'installation montre les captures.
- [ ] L'icône est nette dans le menu Démarrer et la barre des tâches.
- [ ] Clic droit sur l'icône : les raccourcis Mes projets, Facturation et
      Relations s'affichent.
- [ ] Rouvrir l'icône ramène la fenêtre existante.
- [ ] Hors ligne, l'application s'ouvre sur la page de secours.

**Android (Chrome)**

- [ ] Le bouton « Installer » apparaît, et la fenêtre montre la capture
      téléphone.
- [ ] L'icône n'est pas rognée, quelle que soit sa forme (cercle, goutte).
- [ ] L'écran de démarrage est sombre, sans flash blanc.
- [ ] Appui long sur l'icône : les raccourcis s'affichent.
- [ ] Le bouton retour d'Android revient à la page précédente et ne ferme
      pas l'application d'emblée.

**iPhone et iPad (Safari)**

- [ ] L'invitation montre le chemin Partager → Sur l'écran d'accueil.
- [ ] L'icône sur l'écran d'accueil est nette, sans bord noir, et nommée
      « Ignitux ».
- [ ] Au lancement, l'écran de démarrage apparaît (logo et mot IGNITUX), puis
      le lanceur, sans flash blanc.
- [ ] Rien n'est caché sous l'encoche ni sous la barre d'accueil en bas.
- [ ] La session reste ouverte après avoir fermé puis rouvert l'app.
      *Attention* : l'app installée a son propre stockage, séparé de Safari.
      Il faut se connecter une fois dedans.
- [ ] iPad : tester en portrait et en paysage. En paysage, il n'y a pas
      d'écran de démarrage dédié ; iOS affiche un fond sombre, ce qui est
      voulu.
