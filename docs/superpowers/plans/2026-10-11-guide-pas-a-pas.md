# Guide pas à pas et visite guidée — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sur la page d'un projet, remplacer « Prochaine étape » par un guide « Ton parcours » avec « Y aller » qui mène au bon bouton, et ajouter une visite guidée à la première ouverture.

**Architecture:** Le serveur calcule la liste des étapes et leur état (`journeyView().guide`). L'écran l'affiche (`GuideParcours`) et traduit une étape en « ce qu'on ouvre et ce qui pulse » (`lib/guide-projet.ts`). La visite est un composant générique (`VisiteGuidee`) qui vise des éléments marqués `data-visite`.

**Tech Stack:** NestJS + Jest (backend), Next.js 15 / React 19 + Vitest + Testing Library (frontend).

**Spec:** `docs/superpowers/specs/2026-10-11-guide-pas-a-pas-design.md`

## Global Constraints

- Tout le texte d'interface en français, tutoiement, comme le reste de l'app.
- Aucune migration, aucune dépendance nouvelle.
- Guide et visite : porteur du projet seulement (`isOwner`).
- Toute animation coupée sous `@media (prefers-reduced-motion: reduce)`.
- Clé de stockage : `ignitux.visite-projet`, accès sous try/catch.
- Commits à chemins explicites (`git commit -- <fichiers>`) : plusieurs sessions partagent le dépôt.

## Review Focus

- Générateurs IA éteints → pas de bouton de génération : « Y aller » doit défiler jusqu'à la section sans planter ni pulser dans le vide (test Task 4).
- Stockage refusé (navigation privée) : la page s'affiche, la visite ne se lance pas d'elle-même, « ? Visite » marche (test Task 3).
- Arrêt de visite dont l'élément n'existe pas (ex. pas de repères) : sauté, compteur juste (test Task 3).
- Collaborateur : ni guide, ni visite, ni bouton « ? Visite » (test Task 4).
- `nextStep === null` : « Tu as fait le tour », toutes les étapes ✅, pas de « Y aller » (test Task 2).

---

### Task 1: Le serveur calcule le guide

**Files:**
- Modify: `backend/src/journey/journey-model.ts` (après `nextStep`, et `JourneyView`/`journeyView`)
- Test: `backend/src/journey/journey-model.spec.ts`
- Modify: `frontend/src/lib/api.ts` (`JourneyView`, ~l. 2005)

**Interfaces:**
- Produces: `export type EtatEtape = 'fait' | 'en-cours' | 'a-venir'`; `export interface EtapeGuide { id: string; label: string; etat: EtatEtape }`; `export function guideSteps(f: ProjectFacts): EtapeGuide[]`; `JourneyView.guide: EtapeGuide[]` (mêmes types recopiés dans `frontend/src/lib/api.ts` sous les noms `JourneyEtatEtape`, `JourneyEtapeGuide`).

- [ ] **Step 1: Tests qui échouent** — `describe('le guide pas à pas', …)` avec `vierge()` :
  - projet vierge → ids `['decrire','analyser','construire','premieres-taches','avancer-taches','developper','transmettre']`, `decrire` en `en-cours`, les autres `a-venir`.
  - `{hasDescription:true}` → `decrire` `fait`, `analyser` `en-cours`.
  - `{hasDescription:true, analyses:1, etincelle: SEUIL_ETINCELLE - 10}` → `ameliorer` présent juste après `analyser`, en `en-cours` ; `analyser` `fait`.
  - `{hasDescription:true, analyses:1, etincelle:80}` → pas d'`ameliorer`, `construire` `en-cours`.
  - `complianceChecks:2` → `conformite` présent entre `premieres-taches` et `avancer-taches` ; absent si `complianceChecks:0`.
  - `{hasDescription:true, analyses:1, etincelle:80, buildPlans:1, tasks:3, openTasks:2}` → `avancer-taches` `en-cours`, `premieres-taches` `fait`.
  - tout rempli (`transmissionPlans:1, developmentPlans:1, tasks:2, openTasks:0`, etc.) → `nextStep` null et chaque `etat === 'fait'`.
  - `journeyView(vierge()).guide` égal à `guideSteps(vierge())`.
  - Labels exacts : `Décrire ton idée`, `Analyser ton idée`, `Reprendre ton idée`, `Établir ton plan`, `Poser tes premières tâches`, `Regarder tes démarches`, `Avancer tes tâches`, `Préparer le développement`, `Penser la transmission`.

- [ ] **Step 2:** `cd backend && npx jest src/journey` → FAIL (`guideSteps` non exporté).
- [ ] **Step 3: Implémenter `guideSteps`** selon la table du spec : liste ordonnée `{id, label, presente(f, next), faite(f)}` ; état = `en-cours` si `id === nextStep(f)?.id`, sinon `fait` si `faite(f)`, sinon `a-venir`. Ajouter `guide: guideSteps(f)` dans `journeyView`. Ajouter les types dans `api.ts`.
- [ ] **Step 4:** `npx jest src/journey` → PASS ; `npx tsc --noEmit -p .` (backend) → aucune erreur.
- [ ] **Step 5: Commit** `feat(parcours): le serveur decrit les etapes du guide pas a pas`.

### Task 2: Le composant « Ton parcours »

**Files:**
- Create: `frontend/src/lib/guide-projet.ts`
- Modify: `frontend/src/components/parcours.tsx` (nouveau `GuideParcours`, à côté de `ProchaineEtape`, qui reste exporté)
- Modify: `frontend/src/app/globals.css`
- Test: `frontend/src/components/parcours.spec.tsx`, `frontend/src/lib/guide-projet.spec.ts`

**Interfaces:**
- Consumes: `JourneyView.guide`, `JourneyView.nextStep` (Task 1).
- Produces:
  - `export interface DestinationGuide { ouvre: string; avancee: boolean; cible: string | null }` et `export function destinationDe(etapeId: string): DestinationGuide | null` dans `lib/guide-projet.ts`. Table : `decrire`/`ameliorer` → `{ouvre:'infos', avancee:false, cible:'#description'}` ; `analyser` → `{ouvre:'analyse', avancee:false, cible:'[data-guide-cible="analyse"]'}` ; `construire` → `construction` ; `developper` → `developpement` ; `transmettre` → `transmission` (même forme de cible, `avancee:false`) ; `premieres-taches`/`avancer-taches` → `{ouvre:'taches', avancee:true, cible:'#taches'}` ; `conformite` → `{ouvre:'conformite', avancee:true, cible:'[data-guide-cible="conformite"]'}` ; inconnu → `null`.
  - `export function GuideParcours(props: { parcours: JourneyView; iaDisponible?: boolean; onAller: (etapeId: string) => void }): JSX.Element` — racine `<section className="card guide-parcours" data-visite="guide" aria-labelledby=…>`, titre `Ton parcours`.
  - Classe CSS `guide-cible` (pulsation ~3 s, `@keyframes guide-pulse`).

- [ ] **Step 1: Tests qui échouent**
  - `destinationDe('analyser').ouvre === 'analyse'`, `destinationDe('avancer-taches').avancee === true`, `destinationDe('zzz') === null`.
  - `GuideParcours` : liste `role="list"` dont les items portent `aria-current="step"` sur l'étape en cours ; texte de l'étape faite préfixé de « ✅ » (via `aria-label` `"<label>, faite"`), à venir `"<label>, à venir"` ; titre + `pourquoi` de `nextStep` affichés ; clic sur `Y aller` → `onAller('analyser')`.
  - `nextStep: null` → titre `Tu as fait le tour`, aucun bouton `Y aller`.
  - Message IA éteinte repris de `ProchaineEtape` quand `iaDisponible=false` et étape `analyser`.
  - Bouton `Voir tout` présent quand plus de 3 étapes à venir ; au clic, toutes visibles (`aria-expanded`). (Masquage par CSS sur téléphone : la liste complète reste dans le DOM pour ordinateur ; `Voir tout` bascule la classe `guide-parcours--tout`.)
- [ ] **Step 2:** `cd frontend && npx vitest run src/components/parcours.spec.tsx src/lib/guide-projet.spec.ts` → FAIL.
- [ ] **Step 3: Implémenter** `guide-projet.ts`, `GuideParcours` (réutilise `ETAPES_QUI_EXIGENT_L_IA` existant) et le CSS (`.guide-parcours`, états, repli < 640 px des étapes au-delà de en-cours+2 sauf `--tout`, `.guide-cible`, reduced-motion).
- [ ] **Step 4:** mêmes tests → PASS.
- [ ] **Step 5: Commit** `feat(parcours): carte Ton parcours avec Y aller`.

### Task 3: La visite guidée

**Files:**
- Create: `frontend/src/components/visite-guidee.tsx`
- Modify: `frontend/src/app/globals.css`
- Test: `frontend/src/components/visite-guidee.spec.tsx`

**Interfaces:**
- Produces:
  - `export interface ArretVisite { cible: string /* valeur de data-visite */; titre: string; texte: string }`
  - `export function VisiteGuidee(props: { arrets: readonly ArretVisite[]; ouverte: boolean; onFermer: () => void }): JSX.Element | null` — ne garde que les arrêts dont `document.querySelector('[data-visite="<cible>"]')` existe à l'ouverture.
  - `export const CLE_VISITE_PROJET = 'ignitux.visite-projet'`; `export function visiteDejaVue(): boolean` (true si stockage illisible) ; `export function marquerVisiteVue(): void` (silencieux en cas d'erreur).

- [ ] **Step 1: Tests qui échouent** (rendre 3 `div data-visite` a/b/c, arrêts a, b, absent, c) :
  - `ouverte` → `role="dialog"` avec titre du 1er arrêt et `1/3` (l'absent est sauté).
  - `Suivant` → 2ᵉ arrêt, `2/3` ; `Précédent` revient ; `→`/`←` idem.
  - Dernier arrêt : bouton `Terminer` → `onFermer` appelé.
  - `Passer la visite` et `Escape` → `onFermer`.
  - Le focus est dans la bulle à l'ouverture.
  - `ouverte=false` → rien rendu ; aucun arrêt trouvé → rien rendu et `onFermer` appelé.
  - `visiteDejaVue()` false puis true après `marquerVisiteVue()` ; avec `localStorage.getItem` qui lève → `true`, `marquerVisiteVue` ne lève pas.
- [ ] **Step 2:** `npx vitest run src/components/visite-guidee.spec.tsx` → FAIL.
- [ ] **Step 3: Implémenter.** Découpe : un `div.visite__voile` fixe et un `div.visite__trou` positionné sur `getBoundingClientRect()` de la cible (+8 px de marge) avec `box-shadow: 0 0 0 9999px rgba(0,0,0,.6)` ; recalcul sur `resize` et `scroll` (listeners nettoyés) ; `scrollIntoView({block:'center'})` de la cible à chaque arrêt. Bulle placée sous la cible, au-dessus si elle déborde du bas ; pleine largeur moins 16 px sur téléphone. Piège du focus : Tab/Shift+Tab bouclent dans la bulle. Transition de `.visite__trou` (top/left/width/height 250 ms) coupée sous reduced-motion.
- [ ] **Step 4:** tests → PASS.
- [ ] **Step 5: Commit** `feat(visite): visite guidee generique sans dependance`.

### Task 4: Brancher sur la page projet

**Files:**
- Modify: `frontend/src/app/projects/[id]/page.tsx`
- Test: `frontend/src/app/projects/[id]/page.spec.tsx`

**Interfaces:**
- Consumes: `GuideParcours`, `destinationDe` (Task 2) ; `VisiteGuidee`, `visiteDejaVue`, `marquerVisiteVue` (Task 3) ; `JourneyView.guide` (Task 1).

- [ ] **Step 1: Tests qui échouent** (étendre les fixtures de parcours avec `guide`) :
  - Porteur : carte `Ton parcours` affichée, plus de `PROCHAINE ÉTAPE`.
  - `Y aller` sur `analyser` → section Analyse ouverte, le bouton `Analyser ce projet` a la classe `guide-cible`.
  - `Y aller` sur `premieres-taches` → bouton `Revenir au parcours` présent (vue avancée), `#taches` dans le DOM.
  - Générateurs éteints (`iginiStatus.generatorsEnabled=false`) + `Y aller` sur `analyser` → section ouverte, aucun élément `.guide-cible`, pas d'erreur.
  - Première ouverture (stockage vide) → `role="dialog"` de la visite ; `Passer la visite` → fermée et `localStorage['ignitux.visite-projet']` posé ; nouveau rendu → pas de visite ; bouton `? Visite` → visite rouverte.
  - Collaborateur (`isOwner` faux) → ni `Ton parcours`, ni visite, ni `? Visite`.
- [ ] **Step 2:** `npx vitest run "src/app/projects/[id]/page.spec.tsx"` → FAIL.
- [ ] **Step 3: Implémenter.**
  - Remplacer `<ProchaineEtape …/>` par `<GuideParcours parcours iaDisponible onAller={allerA} />`.
  - `allerA(etapeId)` : `const d = destinationDe(etapeId)`; si `d.avancee` ou section non visible → `setVueAvancee(true)` ; `setEtapeOuverte(d.ouvre)` ; `setCibleGuide(d.cible ?? null)`. Un `useEffect` sur `[cibleGuide, etapeOuverte, vueAvancee]` (même modèle que `allerAuxTaches`) cherche la cible ; trouvée → `scrollIntoView` (auto sous reduced-motion), ajoute `guide-cible`, la retire après 3000 ms (timer nettoyé), `focus()` si c'est `#description` ; sinon défile jusqu'à `#section-<ouvre>` s'il existe. Puis `setCibleGuide(null)`.
  - `GenerationSection` : nouvelle prop optionnelle `guideCible?: string` posée en `data-guide-cible` sur le bouton de génération ; la passer pour analyse (`'analyse'`), construction, developpement, transmission. Poser `data-guide-cible="conformite"` sur la racine de `ComplianceSection` via un wrapper `<div>` dans la page.
  - Attributs de visite : wrapper `<div data-visite="reperes">` autour de `TableauDeBord`, `<div data-visite="progression">` autour de `Progression`, `data-visite="etapes"` sur la carte « Les étapes », `data-visite="vue-avancee"` sur le bouton Vue avancée.
  - Bouton `? Visite` (`className="secondary"`, `aria-label="Revoir la visite"`) à côté de Vue avancée, porteur seulement.
  - Visite auto : `useEffect` quand `project && parcours && isOwner && !visiteDejaVue()` → `setVisiteOuverte(true)`. `onFermer` → `marquerVisiteVue(); setVisiteOuverte(false)`.
  - Les 5 arrêts (textes exacts) :
    1. `reperes` — « L'état de ton projet » / « Ici, l'état de ton projet en un coup d'œil. »
    2. `progression` — « Les trois phases » / « Ton projet passe par trois phases : découvrir, construire, transmettre. La tienne est mise en avant. »
    3. `guide` — « Ton parcours » / « Chaque fois que tu reviens, regarde ici : Ignitux te dit quoi faire ensuite. Touche Y aller et il t'y emmène. »
    4. `etapes` — « Les étapes » / « Le travail fait avec IGINI est rangé ici, une étape par icône. »
    5. `vue-avancee` — « Vue avancée » / « Les outils plus poussés (tâches, score, conformité…) sont ici, quand tu en auras besoin. »
- [ ] **Step 4:** test de la page → PASS ; puis `npx vitest run` (toute la suite) → 0 échec ; `npx tsc --noEmit -p .` et `npx eslint src` → propres.
- [ ] **Step 5: Commit** `feat(projet): guide pas a pas et visite guidee sur la page projet`.

### Task 5: Essai réel et envoi

- [ ] **Step 1:** Lancer backend + frontend en local (projet existant ou nouveau compte), vérifier à l'œil : visite au premier passage, `Y aller` sur chaque étape atteignable, téléphone (largeur 375 px), reduced-motion.
- [ ] **Step 2:** `git fetch` ; rebaser sur `origin/main` si `main` a bougé, relancer les suites backend `journey` et frontend.
- [ ] **Step 3:** Pousser la branche, donner à Helder la ligne `git push origin origin/feat/guide-pas-a-pas:main`, puis vérifier le déploiement sur ignitux.com.
