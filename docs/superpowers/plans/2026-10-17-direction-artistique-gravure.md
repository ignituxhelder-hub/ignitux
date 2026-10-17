# Direction artistique « Gravure » — plan de mise en œuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à tout le site Ignitux le style « Gravure » validé par Helder : nuit, or gravé, feu, boussole photo et frise « L'histoire » sur l'accueil.

**Architecture:** Le style vit dans un seul fichier, `frontend/src/app/globals.css`, sous forme de jetons et de classes partagées : on les change, sans réécrire les pages. Deux composants décoratifs s'ajoutent (`Braises` pour les étincelles, `Histoire` pour la frise). L'accueil public reçoit une nouvelle scène. Les images sont des JPEG pré-compressés, servis par `next/image`.

**Tech Stack:** Next.js 15 (App Router), React 19, next-intl 4, `next/font/google`, Vitest 5 + Testing Library (jsdom), Playwright (captures via `scripts/traversee-ecrans.mjs`), sharp (déjà dans `node_modules`, pour recompresser les images).

**Spec:** `docs/superpowers/specs/2026-10-17-direction-artistique-gravure-design.md`

## Global Constraints

- Travail dans `.worktrees/da-cinema`, branche `feat/da-cinema`. Commits à **chemins explicites** (`git commit -- <fichiers>`), message terminé par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Aucun push** : c'est Helder qui pousse sur `main`.
- Police de titre : **Cinzel**, graisses `500`, `600`, `700`, sous-ensembles `latin` et `latin-ext`, variable CSS `--font-display`. **Sora est retirée.** IBM Plex Sans et IBM Plex Mono sont inchangées.
- Jetons ajoutés dans `:root`, valeurs exactes : `--or-clair: #fff1cf`, `--or: #f2c46d`, `--or-sombre: #b9782a`, `--or-texte: #c9a46a`, `--or-liseré: #3a3326`, `--grad-or: linear-gradient(180deg, #fff6df 0%, #f6d58e 38%, #d39a45 62%, #8a5420 100%)`. Les jetons existants ne changent pas.
- Règle : le **feu** est réservé à ce que la personne déclenche (boutons, actions). Le **métal** (or et acier) est pour ce que l'appli constate (scores, jauges, titres, liserés).
- Contraste : 4.5:1 minimum pour du texte, 3:1 pour un contour d'interface (`contraste.spec.ts`).
- Chaque page porte **exactement un `<h1>`** (`accessibilite.spec.ts`).
- Tout nouveau texte va dans `messages/fr.json`, `en.json` et `pt.json`, avec des clés identiques (`messages.spec.ts`). Le site tutoie (le portugais est européen : « acompanha-te », « o teu projeto »).
- Images : dans `frontend/public/images/accueil/`, `alt=""` (décor), via `next/image`.
- `prefers-reduced-motion: reduce` : aucune animation. Les étincelles disparaissent, la lueur fixe reste.
- Le style n'ajoute **jamais de hauteur** aux listes, et les groupes repliés le restent.
- Aucune nouvelle dépendance npm.
- Build de vérification : `NEXT_DIST_DIR=.next-verif npm run build`, puis `git checkout frontend/tsconfig.json`, parce que Next reformate ce fichier.

## Review Focus

- **Mots longs en Cinzel sur téléphone (390 px)**, en portugais ou en anglais (« Transmitir », titres de modules longs) : aucune page ne doit déborder sur le côté. Testé par la Tâche 8 (`traversee-ecrans --telephone`, `deborde` à 0 partout).
- **Navigateur sans `background-clip: text`** : IGNITUX et la marque doivent rester visibles, en or plein, au lieu de devenir du texte transparent. Testé dans la Tâche 4 (couleur pleine hors `@supports`).
- **« Moins d'animations » activé** : aucune étincelle ne clignote une fois puis disparaît. Elles sont absentes. Testé dans la Tâche 3.
- **Image de la boussole lente ou absente** (réseau faible, hors ligne) : le titre, la devise et les boutons restent lisibles, parce qu'aucun texte n'est dans l'image. Testé dans la Tâche 4 (le texte est en vrai texte, et l'image a `alt=""`).
- **Calques décoratifs fixes sur l'appli installée** (iPhone, barre des tâches fixe en bas) : ni les étincelles ni la boussole atténuée ne doivent capter un toucher ou passer devant le contenu. Testé dans les Tâches 3 et 6 (`pointer-events: none`, sous le contenu).

---

## Préparation (avant la Tâche 1)

- [ ] **P1 : Installer les dépendances du worktree**

Run: `cd .worktrees/da-cinema/frontend && npm ci`
Expected: fin sans erreur. Puis `npm test`, qui doit être vert : c'est l'état de départ.

- [ ] **P2 : Captures « avant » pour la Tâche 8**

Lancer l'API locale (`backend/`, `npm run start:dev`, voir `README.md` § démarrage local) et le front de **ce worktree non modifié** : `npm run build && npm run start`, sur le port 3001. Ensuite, depuis la racine du worktree :

```bash
mkdir -p ../../.superpowers/captures-da
node scripts/traversee-ecrans.mjs --web http://127.0.0.1:3001 --captures
mv captures ../../.superpowers/captures-da/avant-ordi
node scripts/traversee-ecrans.mjs --web http://127.0.0.1:3001 --captures --telephone
mv captures ../../.superpowers/captures-da/avant-telephone
```

Expected : deux dossiers de PNG, plus la sortie texte du script, enregistrée à côté sous le nom `rapport.txt`. Aucune modification versionnée.

---

## Partie 1 — Les fondations

### Tâche 1 : Or et gravure — jetons, police, titres, marque, étiquettes

**Files:**
- Modify: `frontend/src/app/layout.tsx` (import `Sora` → `Cinzel`)
- Modify: `frontend/src/app/globals.css` : en-tête (l. 1-17), `:root` (l. 19-120), `h1, h2, h3` (l. 152-174), `.brand*` (l. 255-289), `.section-title` (l. 1601-1627), `.hero-eyebrow` (l. 1566-1583)
- Create: `frontend/src/app/direction-artistique.spec.ts`
- Modify: `frontend/src/app/contraste.spec.ts`

**Interfaces:**
- Produces: les jetons `--or-clair`, `--or`, `--or-sombre`, `--or-texte`, `--or-liseré`, `--grad-or`, utilisés par toutes les tâches suivantes, et le fichier `direction-artistique.spec.ts`, que les Tâches 2, 3, 4 et 6 complètent. Ce fichier lit `globals.css` et les sources `.tsx` comme texte, à la manière de `accessibilite.spec.ts`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `contraste.spec.ts`, ajouter au `it.each` « texte courant — 4.5:1 exigé » :
```ts
['étiquette dorée sur le fond', 'or-texte', 'bg'],
['étiquette dorée sur une carte', 'or-texte', 'surface'],
['étiquette dorée sur surface-2', 'or-texte', 'surface-2'],
['chiffre doré sur le fond', 'or', 'bg'],
['chiffre doré sur une carte', 'or', 'surface'],
['titre or clair sur le fond', 'or-clair', 'bg'],
```
Attention : `readTokens()` lit `--([a-z0-9-]+)`, donc `--or-liseré` (avec « é ») n'est pas lu. C'est voulu : ce jeton est une bordure décorative, pas un contour d'interface.

Créer `direction-artistique.spec.ts` (`describe('direction artistique « Gravure »')`), avec :
```ts
it('charge Cinzel pour les titres, avec le latin étendu', () => {
  expect(layout).toMatch(/Cinzel\(\{[^}]*subsets:\s*\['latin',\s*'latin-ext'\]/);
  expect(layout).toMatch(/Cinzel\(\{[^}]*variable:\s*'--font-display'/);
});
it("n'emporte plus Sora", () => { expect(layout).not.toContain('Sora'); });
it("déclare le dégradé d'or", () => { expect(css).toContain('--grad-or: linear-gradient(180deg, #fff6df 0%, #f6d58e 38%, #d39a45 62%, #8a5420 100%)'); });
it("la marque garde une couleur pleine hors de @supports", () => {
  // Sans repli, un navigateur sans background-clip: text afficherait une marque transparente.
  expect(/\.brand-word\s*\{\s*color:\s*var\(--or\)/.test(css)).toBe(true);
});
```
(`layout` = `readFileSync(join(APP, 'layout.tsx'), 'utf8')`, `css` = `globals.css`.)

- [ ] **Step 2 : Lancer les tests et vérifier l'échec**

Run: `cd frontend && npx vitest run src/app/contraste.spec.ts src/app/direction-artistique.spec.ts`
Expected : FAIL, avec « Jeton --or-texte introuvable » et `Sora` encore présent.

- [ ] **Step 3 : Implémenter**

- `layout.tsx` : remplacer `Sora` par `Cinzel` (`weight: ['500', '600', '700']`, `subsets: ['latin', 'latin-ext']`, `variable: '--font-display'`). Mettre à jour le commentaire, qui dit maintenant : Cinzel = gravure des titres, de la marque et des chiffres.
- `globals.css` :
  - En-tête : réécrire « La règle qui les sépare » selon Global Constraints : le métal de la boussole est l'or et l'acier, et un score en or reste du métal constaté.
  - `:root` : les 6 jetons, dans un bloc « — L'OR, le métal gravé de la boussole — » placé après `--steel-soft`.
  - `h1, h2, h3` : `letter-spacing: 0.04em`. `font-weight: 600`, parce que Cinzel 700 est trop lourd en petit.
  - `.brand` : `letter-spacing: 0.16em`. `.brand-mark` : `color: var(--or)`, pour un anneau doré. `.brand-word` : `color: var(--or)` hors `@supports`, puis `background: var(--grad-or)` dans le bloc `@supports` existant.
  - `.section-title` : `font-family: var(--font-display)…`, `letter-spacing: 0.3em`, `color: var(--or-texte)`. Le losange `::before` reste en feu, le trait `::after` passe en `linear-gradient(90deg, var(--or-sombre), transparent)`.
  - `.hero-eyebrow` : mêmes police, espacement et couleur que `.section-title`. Cette classe disparaîtra à la Tâche 4.

- [ ] **Step 4 : Lancer les tests**

Run: `cd frontend && npx vitest run src/app/contraste.spec.ts src/app/direction-artistique.spec.ts`
Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
git add frontend/src/app/layout.tsx frontend/src/app/globals.css frontend/src/app/contraste.spec.ts frontend/src/app/direction-artistique.spec.ts
git commit -m "feat(da): l'or grave - Cinzel, jetons d'or, marque et etiquettes" -- frontend/src/app/layout.tsx frontend/src/app/globals.css frontend/src/app/contraste.spec.ts frontend/src/app/direction-artistique.spec.ts
```

### Tâche 2 : Matières — cartes, boutons, chiffres, jauge

**Files:**
- Modify: `frontend/src/app/globals.css` : `.card` et `.card::before` (l. 295-318), `button.primary` (l. 425-455), `.step-num` (l. 1651), `.project-item` (l. 1487-1530), `.pill--fire` (l. 711)
- Modify: `frontend/src/app/projects/[id]/questionnaire/page.tsx:245`, la seule jauge du site (barre de progression du questionnaire)
- Modify: `frontend/src/app/direction-artistique.spec.ts`

**Interfaces:**
- Consumes: les jetons de la Tâche 1.

- [ ] **Step 1 : Test qui échoue**, dans `direction-artistique.spec.ts`

```ts
it('les cartes portent le liseré doré', () => {
  const carte = /\n\.card\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  expect(carte).toContain('var(--or-liseré)');
});
it('le bouton principal garde le feu porteur de texte', () => {
  const bouton = /button\.primary\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  expect(bouton).toContain('var(--grad-fire-solid)');
});
it('la jauge du questionnaire est en or (une mesure, pas une action)', () => {
  const questionnaire = readFileSync(join(APP, 'projects', '[id]', 'questionnaire', 'page.tsx'), 'utf8');
  expect(questionnaire).toContain("background: 'linear-gradient(90deg, var(--or-sombre), var(--or))'");
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd frontend && npx vitest run src/app/direction-artistique.spec.ts`
Expected : FAIL sur « liseré doré ».

- [ ] **Step 3 : Implémenter**

- `.card` : `background: linear-gradient(180deg, #16171c 0%, #101115 100%)` et `border: 1px solid var(--or-liseré)`. `.card::before` : le filet blanc à 10 % devient de l'or, `rgb(242 196 109 / 18%)`.
- `button.primary` : le fond `var(--grad-fire-solid)` ne change pas. Ajouter devant `--glow-fire` dans `box-shadow` : `inset 0 1px 0 rgb(255 220 160 / 45%), 0 0 0 1px #6e3a14`.
- Questionnaire, l. 245 : `background: 'var(--accent)'` devient `background: 'linear-gradient(90deg, var(--or-sombre), var(--or))'`.
- `.step-num` et le chiffre de score de `.project-item`, s'il y en a un : `font-family: var(--font-display)…`, `color: var(--or)`.
- Revoir tout `rgb(255 255 255 / …)` utilisé comme reflet de surface dans `.project-item` et `.pill--fire` : le passer en or (`rgb(242 196 109 / …)`) quand c'est un reflet, et le laisser tel quel quand c'est du texte.

- [ ] **Step 4 : Tests + coup d'œil**

Run: `cd frontend && npx vitest run src/app/direction-artistique.spec.ts src/app/contraste.spec.ts`
Expected : PASS. Puis lancer `npm run dev` et regarder `/`, `/login` et `/accueil`. Les cartes doivent avoir un liseré doré, et les boutons leur reflet.

- [ ] **Step 5 : Commit** de `globals.css`, `questionnaire/page.tsx` et `direction-artistique.spec.ts` (chemins explicites), message `feat(da): cartes en metal sombre, boutons au reflet dore, jauge en or`.

### Tâche 3 : Fond et braises

**Files:**
- Create: `frontend/src/components/braises.tsx`
- Create: `frontend/src/components/braises.spec.tsx`
- Modify: `frontend/src/app/layout.tsx` (poser `<Braises />` dans `<body>`, avant les enfants)
- Modify: `frontend/src/app/globals.css` : `body::before` (l. 133-145), et un nouveau bloc « Les braises » à la suite, avec le bloc global `prefers-reduced-motion` (l. 1745-1757, celui qui contient `* { animation-duration: 0.01ms … }`)
- Modify: `frontend/src/app/direction-artistique.spec.ts`

**Interfaces:**
- Produces: `export function Braises(): JSX.Element`. Il rend `<div className="braises" aria-hidden="true">` avec 5 `<span className="braise">` positionnés par `style={{ left: '<x>%', animationDelay: '<d>s' }}`. `x` vaut `[12, 31, 50, 68, 86]` et `d` vaut `[0, 3.1, 6.2, 1.6, 4.7]`.

- [ ] **Step 1 : Tests qui échouent**

`braises.spec.tsx` :
```tsx
it('pose cinq braises, invisibles aux lecteurs d\'écran', () => {
  const { container } = render(<Braises />);
  const calque = container.querySelector('.braises');
  expect(calque).toHaveAttribute('aria-hidden', 'true');
  expect(container.querySelectorAll('.braise')).toHaveLength(5);
});
```
`direction-artistique.spec.ts` :
```ts
it('le calque de braises est posé une fois pour tout le site', () => {
  expect(layout.match(/<Braises \/>/g)).toHaveLength(1);
});
it('les braises ne captent aucun toucher et passent sous le contenu', () => {
  const calque = /\.braises\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  expect(calque).toMatch(/pointer-events:\s*none/);
  expect(calque).toMatch(/z-index:\s*-1/);
  expect(calque).toMatch(/position:\s*fixed/);
});
it('« moins d\'animations » retire les braises au lieu de les faire clignoter', () => {
  // Le fichier a plusieurs blocs prefers-reduced-motion : l'un d'eux doit retirer le calque.
  const blocs = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]);
  expect(blocs.some((bloc) => /\.braises\s*\{\s*display:\s*none/.test(bloc))).toBe(true);
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd frontend && npx vitest run src/components/braises.spec.tsx src/app/direction-artistique.spec.ts`
Expected : FAIL (module `./braises` introuvable).

- [ ] **Step 3 : Implémenter**

- `braises.tsx` : composant sans état. Ajouter un commentaire d'en-tête dans le style du projet (pourquoi les braises, pourquoi `aria-hidden`).
- `globals.css` :
  - `body::before` : garder la braise basse et la passer à ~20 % (`rgb(255 110 40 / 20%)`), centrée en bas (`at 50% 112%`). Remplacer la lueur froide du haut par un halo chaud discret (`rgb(255 190 110 / 7%)`). Ajouter un vignettage : `radial-gradient(ellipse at center, transparent 55%, rgb(0 0 0 / 55%) 100%)`.
  - `.braises` : `position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden`.
  - `.braise` : 3 px, `background: var(--spark)`, `box-shadow: 0 0 6px 2px var(--flame)`, en bas de l'écran, `opacity: 0`, `animation: braise-monte 9s linear infinite`. Keyframes : de `translate(0, 0)` à `translate(-30px, -100vh)`, opacité 0 → 0.9 (à 12 %) → 0.
  - Dans le bloc global `prefers-reduced-motion` (l. 1745) : `.braises { display: none; }`. Sinon, la règle `animation-iteration-count: 1` les ferait clignoter une fois.

- [ ] **Step 4 : Tests**

Run: `cd frontend && npx vitest run src/components/braises.spec.tsx src/app/direction-artistique.spec.ts src/app/accessibilite.spec.ts`
Expected : PASS.

- [ ] **Step 5 : Commit** des 5 fichiers (chemins explicites), message `feat(da): lueur de braise et etincelles lentes sur tout le site`.

### Point d'arrêt — Partie 1

- [ ] `cd frontend && npm test && npm run lint`, puis `NEXT_DIST_DIR=.next-verif npm run build` et `git checkout frontend/tsconfig.json`. Tout doit être vert.
- [ ] Helder regarde **en local**, sur PC et sur téléphone. Pour le téléphone, `NEXT_PUBLIC_API_URL` doit être fixé **avant** `next build`, et le pare-feu Windows ouvert depuis un PowerShell élevé. **Attendre son accord** avant la Partie 2. S'il veut mettre en ligne, lui donner les lignes à coller une par une : il pousse lui-même.

---

## Partie 2 — La vitrine publique

### Tâche 4 : La grande scène de l'accueil

**Files:**
- Create: `frontend/public/images/accueil/boussole.jpg`
- Modify: `frontend/src/app/page.tsx` (l. 56-74 : le bloc `.hero` est remplacé)
- Modify: `frontend/src/app/globals.css` : supprimer `.hero`, `.hero h1`, `.hero > *:not(.hero-rose)` et `.hero-eyebrow` (l. 1538-1583). **Garder** `.hero-rose` et `.hero-actions` : la Tâche 7 réutilise le premier, et `error.tsx` et `not-found.tsx` utilisent le second. Ajouter le bloc « La scène ».
- Modify: `frontend/messages/fr.json`, `en.json`, `pt.json`
- Modify: `frontend/src/app/page.spec.tsx`, `frontend/src/app/direction-artistique.spec.ts`

**Interfaces:**
- Produces: les clés `accueil.scene.{decouvrir, construire, transmettre, nousServir, verite, devise}`. Les clés `accueil.eyebrow` et `accueil.titre` sont **supprimées** des trois fichiers : seul `page.tsx` les lisait.

- [ ] **Step 1 : Image**

Recompresser la découpe validée sur maquette :
```bash
cd frontend && node -e "require('sharp')('../../../.superpowers/brainstorm/343-1792250072/content/boussole-photo.jpg').jpeg({quality:82,progressive:true,mozjpeg:true}).toFile('public/images/accueil/boussole.jpg').then(i=>console.log(i.width,i.height,i.size))"
```
Expected : `810 440`, avec une taille ≤ 110 000 octets.

- [ ] **Step 2 : Tests qui échouent**

`page.spec.tsx`, test « présente la méthode… ». « Transmettre » s'affiche désormais deux fois (colonne de la scène + étape de la méthode). Remplacer donc `expect(screen.getByText('Transmettre'))…` par `expect(screen.getAllByText('Transmettre')).toHaveLength(2)`, avec un commentaire qui dit pourquoi. Remplacer ensuite l'attente `'Transformer une idée en réalité'` par :
```tsx
expect(screen.getByRole('heading', { level: 1, name: 'Ignitux' })).toBeInTheDocument();
expect(screen.getByText('Des idées au monde réel')).toBeInTheDocument();
expect(screen.getByText('Nous servir')).toBeInTheDocument();
expect(screen.getByText('La vérité avant tout')).toBeInTheDocument();
expect(screen.getByText('Découvrir')).toBeInTheDocument();
expect(screen.queryByText('Transformer une idée en réalité')).not.toBeInTheDocument();
// La boussole est un décor : tout le sens est dans le texte voisin.
expect(document.querySelector('img.scene__boussole')).toHaveAttribute('alt', '');
```
`direction-artistique.spec.ts` :
```ts
it('IGNITUX reste en or plein sans background-clip: text', () => {
  expect(/\.scene__nom\s*\{[^}]*color:\s*var\(--or\)/.test(css)).toBe(true);
  expect(/@supports[^{]*background-clip: text[^{]*\{\s*\.scene__nom/.test(css)).toBe(true);
});
```

- [ ] **Step 3 : Vérifier l'échec**

Run: `cd frontend && npx vitest run src/app/page.spec.tsx src/app/direction-artistique.spec.ts src/i18n/messages.spec.ts`
Expected : FAIL (pas de titre « Ignitux »).

- [ ] **Step 4 : Textes** (copie exacte)

| clé `accueil.…` | fr | en | pt |
|---|---|---|---|
| `scene.decouvrir` | Découvrir | Discover | Descobrir |
| `scene.construire` | Construire | Build | Construir |
| `scene.transmettre` | Transmettre | Pass on | Transmitir |
| `scene.nousServir` | Nous servir | Serving us all | Servir-nos |
| `scene.verite` | La vérité avant tout | Truth above all | A verdade acima de tudo |
| `scene.devise` | Des idées au monde réel | From ideas to the real world | Das ideias ao mundo real |

`iginiMention` perd sa dernière phrase, qui serait sinon affichée deux fois sur le même écran (c'est ainsi sur la maquette validée) :
- fr : « t'accompagne pour analyser, construire, financer, développer et transmettre ton projet — depuis un seul endroit. »
- en : « helps you analyse, build, fund, grow and pass on your project — all from one place. »
- pt : « acompanha-te para analisar, construir, financiar, desenvolver e transmitir o teu projeto — a partir de um só lugar. »

Supprimer `eyebrow` et `titre` dans les trois fichiers.

- [ ] **Step 5 : Implémenter la scène dans `page.tsx`**

Remplacer `<div className="hero">…</div>` par une `<div className="scene">` qui contient, dans cet ordre :
- `<p className="scene__cote scene__cote--gauche">`, avec trois `<span>` (`scene.decouvrir`, `scene.construire`, `scene.transmettre`) ;
- `<Image className="scene__boussole" src="/images/accueil/boussole.jpg" width={810} height={440} alt="" priority />` (`next/image`) ;
- `<p className="scene__cote scene__cote--droite">` : `<span>{nousServir}</span><span className="scene__trait" aria-hidden="true" /><span>{verite}</span>` ;
- `<h1 className="scene__nom">Ignitux</h1>` (le nom propre n'est pas traduit) ;
- `<span className="scene__ligne" aria-hidden="true" />` puis `<p className="scene__devise">{devise}</p>` ;
- l'`<IginiMention>` et la `<div className="hero-actions">` existantes, inchangées.

Retirer l'import d'`IgnituxMark`, qui ne sert plus (`Brand` reste).

Si `next/image` ne se rend pas dans jsdom, ajouter dans `page.spec.tsx` : `vi.mock('next/image', () => ({ default: (p: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => { const { priority: _, ...rest } = p; return <img {...rest} />; } }))`.

- [ ] **Step 6 : Styles « La scène »** dans `globals.css`

- `.scene` : `display: grid`, `grid-template-columns: 1fr auto 1fr`, avec `grid-template-areas: "gauche boussole droite" "nom nom nom" "ligne ligne ligne" "devise devise devise" "igini igini igini" "actions actions actions"`. Le texte est centré. `margin-top: 0.5rem`.
- `.scene__boussole` : `width: min(520px, 100%)`, `height: auto`, avec un masque `radial-gradient(closest-side, #000 70%, transparent 100%)` (`mask-image` et `-webkit-mask-image`).
- `.scene__cote` : Cinzel, capitales, `letter-spacing: 0.32em`, `color: #e8d6b4`, taille 0.875rem, `line-height: 2.1`, les `span` en `display: block`. `.scene__trait` : 90 px × 1 px, `linear-gradient(90deg, transparent, var(--or), transparent)`. Le 3e `span` du côté droit est en `--or-texte`, à 0.7rem.
- `.scene__nom` : Cinzel 700, `font-size: clamp(2.6rem, 9vw, 4.6rem)`, `letter-spacing: 0.1em`, `text-transform: uppercase`, `margin: -1rem 0 0`, `color: var(--or)` hors `@supports`. Dans `@supports ((-webkit-background-clip: text) or (background-clip: text))` : `background: var(--grad-or)`, `-webkit-background-clip: text`, `background-clip: text`, `color: transparent`, et `filter: drop-shadow(0 0 18px rgb(255 150 60 / 35%))`.
- `.scene__ligne` : `width: min(360px, 80%)`, 1 px, centrée, `linear-gradient(90deg, transparent, var(--spark), transparent)`, `box-shadow: 0 0 8px var(--flame)`.
- `.scene__devise` : Cinzel, `letter-spacing: 0.5em`, `color: #e8d6b4`, 0.95rem.
- `@media (max-width: 640px)` : une seule colonne, avec les zones `"boussole" "nom" "ligne" "devise" "gauche" "droite" "igini" "actions"`. Les deux `.scene__cote` passent en 0.75rem, `line-height: 1.8`.

- [ ] **Step 7 : Tests**

Run: `cd frontend && npx vitest run src/app/page.spec.tsx src/app/direction-artistique.spec.ts src/i18n/messages.spec.ts src/app/accessibilite.spec.ts`
Expected : PASS. `page.tsx` porte toujours exactement un `<h1>`.

- [ ] **Step 8 : Commit** de l'image, de `page.tsx`, `globals.css`, des 3 fichiers de messages et des 2 specs (chemins explicites), message `feat(accueil): la grande scene - boussole photo, IGNITUX en or, devise`.

### Tâche 5 : L'histoire — la frise reliée

**Files:**
- Create: `frontend/public/images/accueil/histoire-1.jpg` … `histoire-6.jpg`
- Create: `frontend/src/components/histoire.tsx`
- Create: `frontend/src/components/histoire.spec.tsx`
- Modify: `frontend/src/app/page.tsx` (`<Histoire />` juste après la scène, avant la section « méthode »)
- Modify: `frontend/src/app/globals.css` (bloc « L'histoire »)
- Modify: `frontend/messages/fr.json`, `en.json`, `pt.json`

**Interfaces:**
- Produces: `export function Histoire(): JSX.Element`. Il lit `useTranslations('accueil.histoire')` et rend `<section className="section">` avec `<p className="section-title">{titre}</p>` et `<ol className="frise">`. Chaque `<li className="frise__etape">` contient `<span className="frise__num" aria-hidden="true">{n}</span>`, `<Image className="frise__image" src="/images/accueil/histoire-{n}.jpg" width={188} height={235} alt="" />`, `<h3 className="frise__nom">` et `<p className="frise__texte">`. L'ordre des clés d'étapes est `['etincelle', 'doute', 'rencontre', 'construction', 'reussite', 'avenir']`.

- [ ] **Step 1 : Images**

Pour n de 1 à 6 : recompresser `../../../.superpowers/brainstorm/343-1792250072/content/histoire-{n}.jpg` vers `public/images/accueil/histoire-{n}.jpg`, avec les mêmes options sharp que la Tâche 4.
Expected : 188×235 chacune, ≤ 20 000 octets chacune.

- [ ] **Step 2 : Test qui échoue**, `histoire.spec.tsx`

```tsx
it('raconte les six étapes dans l\'ordre, en vrai texte', () => {
  render(<Histoire />);
  const etapes = screen.getAllByRole('listitem');
  expect(etapes).toHaveLength(6);
  expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
    "L'étincelle", 'Le doute', 'La rencontre', 'La construction', 'La réussite', 'Un avenir plus grand',
  ]);
  expect(screen.getByText("Et si tu n'étais plus seul ?")).toBeInTheDocument();
  expect(screen.getByText('Mais entre une idée et la réalité, il y a souvent un obstacle.')).toBeInTheDocument();
  for (const img of document.querySelectorAll('img.frise__image')) expect(img).toHaveAttribute('alt', '');
});
```
(Même repli `vi.mock('next/image', …)` que la Tâche 4, si nécessaire.)

- [ ] **Step 3 : Vérifier l'échec**

Run: `cd frontend && npx vitest run src/components/histoire.spec.tsx`
Expected : FAIL (module introuvable).

- [ ] **Step 4 : Textes** (`accueil.histoire.titre` et `accueil.histoire.etapes.<clé>.{nom,texte}`, copie exacte)

| clé | fr | en | pt |
|---|---|---|---|
| `titre` | L'histoire | The story | A história |
| `etincelle` | L'étincelle — Tout commence par une idée. | The spark — Everything starts with an idea. | A centelha — Tudo começa com uma ideia. |
| `doute` | Le doute — Mais entre une idée et la réalité, il y a souvent un obstacle. | The doubt — But between an idea and reality, there is often an obstacle. | A dúvida — Mas entre uma ideia e a realidade, há muitas vezes um obstáculo. |
| `rencontre` | La rencontre — Et si tu n'étais plus seul ? | The encounter — What if you were no longer alone? | O encontro — E se já não estivesses sozinho? |
| `construction` | La construction — Igini analyse, guide et accompagne chaque étape. | Building — Igini analyses, guides and supports every step. | A construção — O Igini analisa, orienta e acompanha cada etapa. |
| `reussite` | La réussite — Une idée devient un projet. Un projet devient une réalité. | Success — An idea becomes a project. A project becomes reality. | O sucesso — Uma ideia torna-se um projeto. Um projeto torna-se realidade. |
| `avenir` | Un avenir plus grand — Chaque étincelle compte. Pour un monde de possibilités. | A bigger future — Every spark counts. For a world of possibilities. | Um futuro maior — Cada centelha conta. Por um mundo de possibilidades. |

Dans chaque cellule, le texte avant « — » va dans `nom`, et le texte après dans `texte`.

- [ ] **Step 5 : Implémenter `histoire.tsx`**, puis l'insérer dans `page.tsx`

- [ ] **Step 6 : Styles « L'histoire »**

- `.frise` : `list-style: none`, `padding: 2.1rem 0 0`, `margin: 0`, `display: grid`, `grid-template-columns: repeat(6, minmax(0, 1fr))`, `gap: 0.9rem`.
- `.frise__etape` : `position: relative`, texte centré. Le fil de feu est **un segment par étape** : `.frise__etape:not(:first-child)::before`, placé à `top: -1.05rem`, de `left: calc(-50% - 0.45rem)` à `right: 50%`, avec une hauteur de 2 px, `linear-gradient(90deg, var(--spark), var(--flame))` et `box-shadow: 0 0 10px var(--flame)`. Un seul trait pour tout `ol` ne suivrait pas le défilement horizontal sur téléphone.
- `.frise__num` : disque de 30 px, centré au-dessus, à `top: -2.1rem`, `background: #0d0d10`, `border: 2px solid var(--or-texte)`, `box-shadow: 0 0 12px rgb(255 140 60 / 50%)`, Cinzel 600, `color: var(--or)`, `z-index: 1`.
- `.frise__image` : `width: 100%`, `height: auto`, `aspect-ratio: 4 / 5`, `object-fit: cover`, `border-radius: var(--radius-sm)`, `border: 1px solid var(--or-liseré)`, ombre `--shadow-md`.
- `.frise__nom` : Cinzel 600, capitales, `font-size: 0.8rem`, `margin: 0.6rem 0 0.25rem`. `.frise__texte` : `font-size: var(--texte-etiquette)`, `color: var(--text-muted)`, `margin: 0`.
- `@media (max-width: 760px)` : `.frise` passe en `display: flex`, `overflow-x: auto`, `scroll-snap-type: x mandatory`, `scrollbar-width: none`. Chaque `.frise__etape` passe en `flex: 0 0 42%` et `scroll-snap-align: start`.

- [ ] **Step 7 : Tests**

Run: `cd frontend && npx vitest run src/components/histoire.spec.tsx src/app/page.spec.tsx src/i18n/messages.spec.ts src/app/accessibilite.spec.ts`
Expected : PASS.

- [ ] **Step 8 : Commit** des 6 images, des 2 nouveaux fichiers, de `page.tsx`, `globals.css` et des 3 fichiers de messages (chemins explicites), message `feat(accueil): l'histoire en six etapes, frise reliee par un fil de feu`.

### Tâche 6 : Pages de compte — la boussole derrière le formulaire

**Files:**
- Modify: `frontend/src/app/login/page.tsx`, `signup/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`, `verify-email/page.tsx` (`<main className="page">` devient `<main className="page page--scene">`)
- Modify: `frontend/src/app/globals.css` (bloc « Pages de compte »)
- Modify: `frontend/src/app/direction-artistique.spec.ts`

- [ ] **Step 1 : Tests qui échouent**

```ts
it.each(['login', 'signup', 'forgot-password', 'reset-password', 'verify-email'])(
  '%s pose la boussole derrière le formulaire',
  (page) => { expect(readFileSync(join(APP, page, 'page.tsx'), 'utf8')).toContain('className="page page--scene"'); },
);
it('la boussole des pages de compte ne capte aucun toucher', () => {
  const decor = /\.page--scene::before\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  expect(decor).toMatch(/pointer-events:\s*none/);
  expect(decor).toMatch(/z-index:\s*-1/);
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd frontend && npx vitest run src/app/direction-artistique.spec.ts`
Expected : FAIL × 6.

- [ ] **Step 3 : Implémenter**

- Les 5 pages : modifier seulement `className`.
- `.page--scene` : `position: relative`, `isolation: isolate`.
- `.page--scene::before` : `content: ''`, `position: absolute`, `top: -1rem`, `left: 50%`, `width: min(720px, 150%)`, `aspect-ratio: 810 / 440`, `transform: translateX(-50%)`, `background: url('/images/accueil/boussole.jpg') center / contain no-repeat`, `opacity: 0.16`, le même masque radial que `.scene__boussole`, `z-index: -1` et `pointer-events: none`.

- [ ] **Step 4 : Tests**

Run: `cd frontend && npx vitest run src/app/direction-artistique.spec.ts src/app/login src/app/signup src/app/forgot-password src/app/reset-password src/app/verify-email`
Expected : PASS.

- [ ] **Step 5 : Commit** des 7 fichiers (chemins explicites), message `feat(da): la boussole attenuee derriere les pages de compte`.

### Point d'arrêt — Partie 2

- [ ] Même vérification qu'à la Partie 1 : tests, lint, build de vérification, puis `git checkout frontend/tsconfig.json`.
- [ ] Captures de `/` et `/login` à 390 px et à 1280 px, que Helder regarde en local. **Attendre son accord.**

---

## Partie 3 — L'intérieur de l'appli

### Tâche 7 : Titres en or et boussole en filigrane sur le bureau

**Files:**
- Modify: `frontend/src/app/globals.css` (`h1`, et `.ecran-accueil` reçoit `position: relative`)
- Modify: `frontend/src/app/accueil/page.tsx` (vers la l. 471)
- Modify: `frontend/src/app/direction-artistique.spec.ts`

- [ ] **Step 1 : Tests qui échouent**

```ts
it('les titres de page sont en or clair', () => {
  expect(/\nh1\s*\{[^}]*color:\s*var\(--or-clair\)/.test(css)).toBe(true);
});
it('le bureau porte la boussole en filigrane', () => {
  const bureau = readFileSync(join(APP, 'accueil', 'page.tsx'), 'utf8');
  expect(bureau).toMatch(/<IgnituxMark[^>]*className="hero-rose"/);
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd frontend && npx vitest run src/app/direction-artistique.spec.ts`

- [ ] **Step 3 : Implémenter**

- `h1 { color: var(--or-clair) }` : le contraste est déjà couvert par la Tâche 1.
- Dans `accueil/page.tsx`, ajouter juste après `<main className="page page--home ecran-accueil">` : `<IgnituxMark size={260} className="hero-rose" />`, et importer `IgnituxMark` à côté de `Brand`. `.hero-rose` est déjà masqué sous 480 px.
- `.ecran-accueil` : `position: relative`, pour que `.hero-rose` (absolu) se cale sur le bureau.

- [ ] **Step 4 : Tests**

Run: `cd frontend && npx vitest run src/app/direction-artistique.spec.ts src/app/accueil`
Expected : PASS.

- [ ] **Step 5 : Commit** des 3 fichiers (chemins explicites), message `feat(da): titres en or clair, boussole en filigrane sur le bureau`.

### Tâche 8 : Revue module par module

**Files:**
- Modify: `frontend/src/app/globals.css`, et au cas par cas les pages qui cassent (inventaire à l'étape 2)
- Create: `docs/da-gravure-revue.md` (le compte rendu)

- [ ] **Step 1 : Captures « après »**

Mêmes commandes que P2, sur le build du worktree à jour, vers `../../.superpowers/captures-da/apres-ordi` et `apres-telephone`, chacune avec son `rapport.txt`.

- [ ] **Step 2 : Inventaire.** Une ligne par page est un constat si l'une de ces conditions est vraie :
  - (a) `déborde +Npx` dans le rapport « après », alors qu'il n'y était pas avant ;
  - (b) un texte de moins de 12 px qui n'existait pas avant ;
  - (c) la hauteur de la capture « après » dépasse celle d'« avant » de **plus de 3 %** (comparer les hauteurs PNG avec sharp `metadata()`) ;
  - (d) au coup d'œil, comparé à « avant » : un titre coupé, un badge illisible, un tableau serré.
- [ ] **Step 3 : Corriger chaque constat**, de préférence dans `globals.css` (une règle qui vaut pour toutes les pages), sinon dans la page concernée. Pour un titre trop large, utiliser `overflow-wrap: anywhere` et une taille `clamp()` avant de réduire l'espacement. Pour une hauteur ajoutée, revenir aux marges et rembourrages d'avant sur ce composant.
- [ ] **Step 4 : Refaire les captures « après » et l'inventaire.**
Expected : zéro constat (a), (b) ou (c). Pour (d), chaque constat restant est listé avec la raison pour laquelle il est accepté.
- [ ] **Step 5 : Écrire `docs/da-gravure-revue.md`** : les pages revues, les constats, les corrections, et ce qui reste éventuellement, pour Helder. Pas de captures dans le dépôt : elles restent dans `.superpowers/`.
- [ ] **Step 6 : Suite complète.**
Run: `cd frontend && npm test && npm run lint`
Expected : vert.
- [ ] **Step 7 : Commit** des fichiers corrigés et du compte rendu (chemins explicites), message `fix(da): revue de l'interieur - debordements et hauteurs`.

### Point d'arrêt — Partie 3

- [ ] Build de vérification, puis `git checkout frontend/tsconfig.json`. Helder regarde en local, sur PC et sur téléphone. **Attendre son accord**, puis lui donner les lignes de mise en ligne une par une. Aucune migration de base n'est en jeu.
