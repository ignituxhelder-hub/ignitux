# Direction artistique « Gravure » — la boussole et le feu, en version cinéma

Validé avec Helder le 2026-10-17, choix faits sur maquettes dans le compagnon visuel. Suite de
la direction « la boussole et le feu » décrite en tête de `frontend/src/app/globals.css`.

## Intention

**Ce que Helder a dit :** « pour faire plus joli », sur **tout le site**, en suivant la DA de
deux images qu'il a fournies : nuit, boussole dorée avec une flamme au centre, braises, rochers,
grandes capitales gravées espacées (« IGNITUX — Des idées au monde réel », « Découvrir ·
Construire · Transmettre », « Nous servir — La vérité avant tout »), et une histoire en 6
vignettes (l'étincelle, le doute, la rencontre, la construction, la réussite, un avenir plus
grand). Les images sont une **référence de style** ; il n'est pas obligatoire de les utiliser
telles quelles.

**Choix validés sur maquettes :**

| Question | Choix |
|---|---|
| Dosage pour tout le site | **A — Gravure** : capitales gravées, or et feu, cartes en métal sombre, lueur de braise, étincelles lentes. Pas de bleu (l'option « feu et eau » est écartée). |
| Boussole de la grande scène | **Photo** : découpe de la 1re image, en attendant une version HD sans texte. |
| Section « L'histoire » | **B — Frise reliée** : 6 cartes séparées, reliées par un fil de feu qui passe par les numéros, texte sous l'image. |
| Ordre de travail | **1 → 2 → 3**, chaque étape vérifiable seule, en local d'abord. |

**Hypothèses (non dites par Helder, à corriger s'il le faut) :**
- Le texte des images n'est **jamais** repris tel quel : il serait figé en français (le site
  existe en fr/en/pt), illisible sur téléphone, et l'image 1 contient des fautes (« obstcale »,
  « possiblités », « rélité »). Tout texte devient du vrai texte, traduit.
- Le site tutoie : « Et si vous n'étiez plus seul ? » devient « Et si tu n'étais plus seul ? ».
- « IGNITUX analyse, guide et accompagne » devient « Igini analyse… » : c'est Igini qui parle
  au visiteur partout ailleurs sur la page d'accueil.

**Critères de réussite :**
- Ouvrir ignitux.com donne l'ambiance des images de référence (nuit, or, feu, boussole).
- L'intérieur de l'appli a le même style sans perdre en lisibilité ni en compacité
  (préférence « listes compactes » : le style n'ajoute jamais de hauteur).
- Les tests de contraste, d'accessibilité et de la page d'accueil restent verts.
- Le poids ajouté reste faible (pas d'image lourde, pas de bibliothèque d'animation).

## Approche

Tout le site tire son style d'un seul fichier, `frontend/src/app/globals.css`, à base de jetons
(`--bg`, `--surface`, `--steel`…) et de classes partagées (`.card`, `.primary`, `.section`,
`.hero`, `h1-h3`). On change ces jetons et ces classes, et la police de titre dans
`layout.tsx`. Les pages ne sont pas réécrites une à une.

Écarté : ajouter un système de style (Tailwind, CSS modules par page). Même résultat, beaucoup
plus de fichiers touchés, et deux façons d'écrire le style dans le même projet.

## Partie 1 — Les fondations (tout le site)

### La règle, mise à jour

L'en-tête de `globals.css` sépare aujourd'hui le **feu** (ce que la personne déclenche) de
l'**acier** (ce que le produit constate). La règle reste. On précise seulement que le métal de
la boussole est **l'or et l'acier** : les scores, jauges, titres et liserés passent en or
gravé, ce qui reste du métal constaté et non une flamme. Le feu reste réservé aux boutons et
actions. L'en-tête du fichier est réécrit dans ce sens.

### Police

- Nouvelle police de titre **Cinzel** (Google Fonts via `next/font`, graisses 500/600/700,
  sous-ensembles `latin` et `latin-ext` pour le portugais), sous la variable `--font-display`
  existante. **Sora est retirée** : `--font-display` ne sert qu'aux titres, à la marque et aux
  chiffres, que Cinzel reprend tous.
- `h1`, `h2`, `h3`, `.brand-word` et les gros chiffres (scores) passent en Cinzel, avec un
  espacement positif (`letter-spacing` autour de 0.04–0.08em au lieu de −0.015em).
- Les étiquettes de section (`.section-title`, `.hero-eyebrow`) passent en Cinzel capitales
  très espacées (~0.3em), en or texte.
- Texte courant, boutons, champs : **IBM Plex Sans inchangé**. Données précises : Plex Mono
  inchangé.

### Couleurs (nouveaux jetons dans `:root`)

| Jeton | Valeur | Usage |
|---|---|---|
| `--or-clair` | `#fff1cf` | reflet haut des dégradés d'or |
| `--or` | `#f2c46d` | chiffres, jauges, pointes |
| `--or-sombre` | `#b9782a` | bas des dégradés, liserés forts |
| `--or-texte` | `#c9a46a` | étiquettes et petits textes en or (≈ 8.5:1 sur `--bg`) |
| `--or-liseré` | `#3a3326` | bordure des cartes |
| `--grad-or` | `linear-gradient(180deg, #fff6df, #f6d58e 38%, #d39a45 62%, #8a5420)` | IGNITUX, grands titres de vitrine (texte découpé dans le dégradé) |

Les couleurs existantes (`--bg`, `--flame`, `--spark`, `--steel`, dégradés des boutons) ne
changent pas.

### Matières

- **Cartes** (`.card` et équivalents) : fond en léger dégradé vertical (`#16171c` → `#101115`),
  bordure `--or-liseré`, reflet doré de 1 px en haut (`inset 0 1px 0` or à ~18 %), ombre
  portée sombre.
- **Boutons principaux** : le dégradé de feu actuel est gardé (il passe le test de contraste),
  avec un reflet doré en haut et un contour sombre.
- **Jauges** : dégradé or sombre → or.
- **Marque** : l'anneau de la boussole de `IgnituxMark` passe en or ; le mot « Ignitux » s'affiche
  en capitales Cinzel (le texte ne change pas), dans `--grad-or`.

### Fond et étincelles

- **Lueur** : un calque fixe derrière toutes les pages (pseudo-élément de `body`, sans
  `background-attachment: fixed`, que Safari iOS gère mal) : braise en bas de l'écran
  (dégradé radial orange à ~20 %), léger halo chaud en haut, vignettage.
- **Étincelles** : un composant `Braises` posé une fois dans `layout.tsx` : 5 points lumineux
  qui montent lentement (CSS seul, `transform` et `opacity`, sans JavaScript), `aria-hidden`,
  `pointer-events: none`, sous le contenu.
- **Moins d'animations** : la règle `prefers-reduced-motion` existante coupe déjà toute
  animation. Les étincelles disparaissent alors, et la lueur fixe reste.

### Tests

- `contraste.spec.ts` : ajout des paires or texte / fond, or texte / carte, or / fond. Toutes
  au-dessus de 4.5:1 pour du texte.
- `accessibilite.spec.ts` : `Braises` est masqué aux lecteurs d'écran.

## Partie 2 — La vitrine publique

### Page d'accueil (`frontend/src/app/page.tsx`)

De haut en bas :

1. **Barre** : IGNITUX en or, langue, Se connecter, Créer un compte (inchangés hors style).
2. **Grande scène** (remplace le héros actuel et sa boussole en filigrane) :
   - au centre, la **boussole photo**, bords fondus dans la nuit (masque radial) ;
   - à gauche, « Découvrir / Construire / Transmettre » en capitales gravées ;
   - à droite, « Nous servir », un trait doré, puis « La vérité avant tout » ;
   - dessous, **IGNITUX** très grand (`h1`, `--grad-or`, légère lueur), une ligne de feu,
     puis « Des idées au monde réel » en capitales très espacées ;
   - puis la phrase Igini actuelle et les boutons Commencer / J'ai déjà un compte.
   - Le titre actuel « Transformer une idée en réalité » est **retiré** (il redit la devise).
     L'ancien surtitre « Découvrir · Construire · Transmettre » devient la colonne de gauche.
   - **Téléphone** : la boussole prend toute la largeur ; les deux colonnes passent sous la
     devise, en petit, l'une sous l'autre.
3. **L'histoire** (nouvelle section) : la frise reliée, 6 cartes image + numéro en pastille
   dorée + titre gravé + phrase. Un fil de feu horizontal relie les pastilles. **Téléphone** :
   la frise défile horizontalement au doigt (`scroll-snap`), sans rallonger la page.
4. **La méthode**, **Garde en tête**, l'encadré final : contenu inchangé, nouveau style
   par la partie 1.

**Textes de l'histoire (fr)** : 1 L'étincelle — « Tout commence par une idée. » · 2 Le doute —
« Mais entre une idée et la réalité, il y a souvent un obstacle. » · 3 La rencontre — « Et si
tu n'étais plus seul ? » · 4 La construction — « Igini analyse, guide et accompagne chaque
étape. » · 5 La réussite — « Une idée devient un projet. Un projet devient une réalité. » · 6
Un avenir plus grand — « Chaque étincelle compte. Pour un monde de possibilités. »

Tous les nouveaux textes (scène et histoire) vont dans `messages/fr.json`, `en.json`,
`pt.json`, sous `accueil`.

### Connexion, inscription et pages de compte

`login`, `signup`, `forgot-password`, `reset-password`, `verify-email` : même fond nuit, la
boussole photo en grand et très atténuée derrière le formulaire (décor, sous le contenu),
IGNITUX en or au-dessus. Ni frise ni texte ajouté. Une classe partagée (ex. `page--scene`),
pas de mise en page propre à chaque page.

### Images

Rangées dans `frontend/public/images/accueil/`, servies par `next/image`, `alt=""` (décor :
tout le sens est dans le texte voisin).

| Fichier | Source (image de référence 1, 1536×1024) | Poids visé |
|---|---|---|
| `boussole.jpg` | découpe x 360, y 357, 810×440 | ~100 Ko |
| `histoire-1.jpg` … `histoire-6.jpg` | découpes 188×235 sous le texte de chaque vignette (y 118 ; x = 30, 264, 487, 1075, 1320 ; la 4e : x 779, y 126, 154×192, agrandie en 188×235 pour exclure les étiquettes) | ~15 Ko chacune |

Les originaux restent hors dépôt, dans `.superpowers/brainstorm/343-1792250072/reference-*.png`.

**Limites connues :**
- Basse définition : un peu flou sur grand écran ou écran Retina. Quand Helder fournira des
  versions **grandes (≥ 2000 px) et sans texte**, il suffira de remplacer les fichiers, sans
  toucher au code.
- Les lettres **O** et **E** gravées sur la boussole photo restent en français.

### Tests

- `page.spec.tsx` : remplace l'attente « Transformer une idée en réalité » par IGNITUX / la
  devise, et vérifie la présence des 6 étapes de l'histoire.
- `accessibilite.spec.ts` couvre déjà « toute image porte un texte de remplacement ».

## Partie 3 — L'intérieur de l'appli

Le style vient de la partie 1. Cette étape est une **revue module par module** (tableau de
bord `/accueil`, projets, CRM, facturation, comptabilité, banque, caisse, stocks, agenda,
équipe, rôles, administration, etc.) :

- capture de chaque page en largeur téléphone (390 px) et ordinateur (1280 px), avant et
  après ;
- correction de ce qui casse : titres longs trop larges en Cinzel, tableaux serrés, pastilles
  ou badges devenus illisibles ;
- touches limitées : titre de module en or gravé ; sur `/accueil`, la boussole en filigrane
  derrière le message d'accueil (comme l'ancien `hero-rose`) ;
- règle ferme : **aucune hauteur ajoutée** aux listes, groupes repliés conservés.

## Livraison

- Travail dans le worktree `.worktrees/da-cinema`, branche `feat/da-cinema`, partie de
  `origin/main` (3be50f2). Commits à chemins explicites.
- Après chaque partie : suite de tests verte, build de vérification (`NEXT_DIST_DIR`),
  captures avant/après, puis Helder regarde **en local** (PC et téléphone).
- Mise en ligne seulement avec l'accord de Helder, partie par partie. **Helder pousse
  lui-même** sur `main` ; aucune migration de base n'est en jeu.

## Hors périmètre

- Image de partage (Open Graph), vidéo, sons.
- Option « feu et eau » (bleu), écartée sur maquette.
- Refonte de la structure des pages ou des textes existants (hors héros de l'accueil).
- Thème clair : le site reste en nuit (`color-scheme: dark`).
