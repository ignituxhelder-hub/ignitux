# Guide pas à pas et visite guidée d'un projet

Date : 2026-10-11 — validé en conversation avec Helder, partie par partie.

## Pourquoi

Une première utilisatrice (hors équipe) a trouvé la création d'un projet
« compliquée à suivre ». Constat dans le code : la carte « Prochaine étape »
dit quoi faire mais n'a pas de bouton pour y aller — `ProchaineEtape` accepte
`onAller`, la page projet ne le passe pas. La personne lit la consigne puis
cherche seule la bonne icône parmi « Les étapes » et les outils.

## Ce qu'on construit

Deux choses, sur l'écran d'un projet (`/projects/[id]`), pour le **porteur**
seulement (un collaborateur garde l'écran actuel) :

1. **Le guide « Ton parcours »**, qui remplace la carte « Prochaine étape ».
2. **La visite guidée**, à la première ouverture d'un projet.

### 1. Le guide « Ton parcours »

- Liste numérotée des étapes du parcours, chacune avec un état :
  `fait` (✅), `en-cours` (▶), `a-venir` (○).
- Sous l'étape en cours : son titre et son « pourquoi » (ceux de
  `nextStep`, inchangés) et un bouton **« Y aller »**.
- **« Y aller »** : ouvre l'étape (`etapeOuverte`), passe en vue avancée si
  la section n'est pas visible dans la vue simple, fait défiler jusqu'à
  l'élément à toucher, et le fait pulser ~3 s (classe CSS
  `guide-cible`, animation coupée sous `prefers-reduced-motion`).
- Sur téléphone (< 640 px) : l'étape en cours et les deux suivantes, plus
  « Voir tout » ; les étapes faites se replient en « ✅ N étapes faites ».
- `nextStep === null` : la carte dit « Tu as fait le tour » (texte actuel),
  toutes les étapes en ✅.

**Source des étapes : le serveur.** `journeyView()` ajoute un champ
`guide: Array<{ id; label; etat }>`, calculé dans `journey-model.ts` à partir
des `ProjectFacts` et de `nextStep()`. L'écran n'a aucune règle propre.

| id | label | présente si | faite si |
|---|---|---|---|
| `decrire` | Décrire ton idée | toujours | `hasDescription` |
| `analyser` | Analyser ton idée | toujours | `analyses > 0` |
| `ameliorer` | Reprendre ton idée | seulement si `nextStep.id === 'ameliorer'` | — |
| `construire` | Établir ton plan | toujours | `buildPlans > 0` |
| `premieres-taches` | Poser tes premières tâches | toujours | `tasks > 0` |
| `conformite` | Regarder tes démarches | si `complianceChecks > 0` | `completedComplianceChecks > 0` |
| `avancer-taches` | Avancer tes tâches | toujours | `tasks > 0 && openTasks === 0` |
| `developper` | Préparer le développement | toujours | `developmentPlans > 0` |
| `transmettre` | Penser la transmission | toujours | `transmissionPlans > 0` |

État : `en-cours` si `id === nextStep.id`, sinon `fait` si le prédicat est
vrai, sinon `a-venir`. Une étape faite après l'étape en cours reste ✅
(c'est vrai). Aucune migration, aucune nouvelle table.

**Où mène « Y aller »** (table côté écran, `lib/guide-projet.ts`) :

| étape | ouvre | cible qui pulse |
|---|---|---|
| `decrire`, `ameliorer` | `infos` | le champ `#description` (focus) |
| `analyser` | `analyse` | le bouton « Analyser ce projet » |
| `construire` | `construction` | le bouton de génération du plan |
| `premieres-taches`, `avancer-taches` | `taches` | la section `#taches` |
| `conformite` | `conformite` | la section conformité |
| `developper` | `developpement` | le bouton de génération |
| `transmettre` | `transmission` | le bouton de génération |

La cible est marquée `data-guide-cible` dans le DOM. `GenerationSection`
porte l'attribut sur son bouton de génération. Défilement et pulsation se
font une fois l'élément monté (même mécanique en deux temps que
`allerAuxTaches`). Sans cible trouvée, on défile jusqu'à la section, sans
pulsation.

### 2. La visite guidée

- Se lance automatiquement à la **première** ouverture d'un projet par son
  porteur, une fois le parcours chargé. Retenu dans le navigateur
  (`localStorage`, clé `ignitux.visite-projet`), lecture/écriture sous
  try/catch : sans stockage, la visite ne se lance pas d'elle-même (pas de
  boucle à chaque visite).
- Bouton **« ? Visite »** à côté de « Vue avancée » pour la relancer.
- 5 arrêts, chacun visant un élément marqué `data-visite="…"` :
  1. `reperes` — les chiffres du haut ;
  2. `progression` — les trois phases ;
  3. `guide` — « Ton parcours », et « Y aller » ;
  4. `etapes` — la grille « Les étapes » ;
  5. `vue-avancee` — le bouton « Vue avancée ».
  Un arrêt dont l'élément est absent est sauté.
- Rendu : voile sombre, découpe lumineuse autour de l'élément (position
  calculée avec `getBoundingClientRect`, recalculée au redimensionnement et
  au défilement), bulle avec texte, compteur « n/N », **Précédent**,
  **Suivant** (« Terminer » au dernier arrêt), **Passer la visite**.
- Accessibilité : `role="dialog"`, `aria-modal`, titre annoncé, focus placé
  sur la bulle et piégé dedans ; **Échap** ferme ; **← / →** naviguent.
  Animations coupées sous `prefers-reduced-motion`.
- Composant maison `components/visite-guidee.tsx`, générique (reçoit une
  liste d'arrêts), sans dépendance externe.

## Fichiers

- `backend/src/journey/journey-model.ts` — `guideSteps()` + champ `guide`.
- `backend/src/journey/journey-model.spec.ts` — tests du guide.
- `frontend/src/lib/api.ts` — type `JourneyView.guide`.
- `frontend/src/lib/guide-projet.ts` — table « Y aller ».
- `frontend/src/components/parcours.tsx` — composant `GuideParcours`
  (remplace l'usage de `ProchaineEtape` sur la page projet).
- `frontend/src/components/visite-guidee.tsx` — la visite.
- `frontend/src/app/projects/[id]/page.tsx` — branchement, attributs
  `data-visite` / `data-guide-cible`, bouton « ? Visite ».
- `frontend/src/app/globals.css` — guide, pulsation, voile, bulle.
- Tests : `parcours.spec.tsx`, `visite-guidee.spec.tsx`, page projet.

## Hors périmètre

- Visite d'autres écrans (Bureau, applications).
- Mémoriser la visite sur le compte (serveur).
- Changer l'ordre ou le texte des étapes du serveur.

## Tests

- Serveur : états du guide pour chaque situation (projet vide, décrit,
  analysé, analyse faible → `ameliorer`, avec/sans conformité, tâches
  ouvertes, tout fait → tout ✅).
- Écran : rendu des états ; « Y aller » ouvre la bonne étape, passe en vue
  avancée si nécessaire, pose la pulsation ; collaborateur sans guide.
- Visite : lancement au premier passage seulement ; « ? Visite » relance ;
  Suivant/Précédent/Passer/Échap/flèches ; arrêt absent sauté ; stockage
  indisponible sans plantage.
- Essai réel en local avant tout envoi.
