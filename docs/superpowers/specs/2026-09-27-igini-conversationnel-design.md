# IGINI conversationnel — orchestrateur à outils

27 septembre 2026. Design validé avec Helder en session de brainstorming.
Prochaine étape : plan d'implémentation (writing-plans).

**Ce document remplace la portée de
[`2026-09-27-chat-igini-design.md`](2026-09-27-chat-igini-design.md).**
La table `chat_messages`, les endpoints `POST/GET /chat/messages`,
l'emplacement frontend (icône flottante dans `Systeme`, panneau, pas de
nouvelle route) et la décision « le chat reste hors du système d'offres »
sont repris tels quels — rien à refaire de ce côté. Ce qui change : le
chat n'est plus un simple aller-retour texte libre, c'est un orchestrateur
qui peut appeler les outils existants d'Ignitux.

## Pourquoi

Aujourd'hui, IGINI est cinq boutons séparés (Analyser/Construire/
Financer/Développer/Transmettre), chacun figé sur un schéma de sortie. Le
spec du chat simple réglait le problème « poser une question libre » mais
pas celui-ci : la personne devait encore cliquer le bon bouton pour agir.
Ce document décrit comment un seul fil de conversation peut, en plus de
répondre, déclencher les générateurs existants et relire la mémoire —
sans construire un nouveau système de droits, un nouveau moteur
d'autonomie ni un nouveau registre d'applications.

## Décisions actées en amont (cadrage)

1. **Fusion, pas coexistence** : un seul chemin de chat, l'orchestrateur
   à outils, dès la v1. Pas de version texte-seul livrée d'abord.
2. **Périmètre d'outils étroit** : les 5 générateurs existants + lecture
   de la mémoire. Pas de CRM, facturation, comptabilité, banque en v1 —
   ce sera un chantier séparé, sur le même patron, une fois celui-ci
   éprouvé.
3. **Chat global**, un fil par personne, dans le bureau — pas par projet.
   Conséquence directe : IGINI doit pouvoir résoudre « mon projet
   boulangerie » en `project_id` avant d'appeler un générateur, d'où
   l'outil `lister_projets` (section suivante).

## Portée v1

Un fil de conversation continu par utilisateur (inchangé du spec chat).
IGINI peut, dans ce fil : répondre en texte libre, lister les projets de
la personne, relire ses souvenirs, et déclencher un des cinq générateurs
sur un projet précis — avec les mêmes quotas et refus que les boutons
actuels. Il ne peut jamais écrire une mémoire seul.

## Architecture générale

```
Personne ──► POST /chat/messages
                 │
                 ▼
      ClaudeService.converseWithTools()
                 │
     ┌───────────┴───────────┐
     │  boucle, 3 tours max   │
     │                        │
     │  1. appel Claude       │  modèle rapide/économique,
     │     (tools: [...])     │  distinct du modèle des
     │                        │  générateurs
     │  2. si tool_use :      │
     │     exécuter l'outil   │  ── appelle le service NestJS
     │     (voir section      │      existant, inchangé
     │     Outils)            │
     │  3. renvoyer le        │
     │     résultat à Claude  │
     │     (tool_result)      │
     │                        │
     │  jusqu'à réponse texte │
     │  ou 3 tours atteints   │
     └───────────┬───────────┘
                 ▼
      persistance : 1 message user, 1 message igini
      (chat_messages — le détail des appels d'outils
      n'est PAS stocké, voir section Persistance)
```

## Les outils (7)

Tous sont des enveloppes fines autour de code déjà testé. Aucun n'invente
de nouvelle logique métier.

| Outil | Entrée | Exécute | Coût IA propre |
|---|---|---|---|
| `lister_projets` | — | requête sur `projects` (propriétaire = l'utilisateur courant), renvoie `id`, `titre`, `secteur` | aucun (lecture DB directe) |
| `rappeler_souvenirs` | `project_id?`, `categorie?` | `MemoryService.recall()` | aucun |
| `analyser` | `project_id` | `AnalysisService`/`ProjectsService.analyzeForOwner()` existant | oui — inchangé (`claude-opus-5`, quota Découverte 3/mois) |
| `construire` | `project_id` | `PlanningService.createBuildPlan()` via `createBuildPlanForOwner()` existant | oui — inchangé |
| `financer` | `project_id` | `FinancingService.createFinancingPlan()` existant | oui — inchangé |
| `developper` | `project_id` | `DevelopmentService.createDevelopmentPlan()` existant | oui — inchangé |
| `transmettre` | `project_id` | `TransmissionService.createTransmissionPlan()` existant | oui — inchangé |

Chaque outil générateur appelle **littéralement** la méthode de service
que le bouton actuel appelle déjà — même chemin, même vérification
`offres.exiger()`, même `assertWithinQuota()`, même journalisation dans
`ai_usage_events` sous le générateur existant (`analyser`, `construire`,
etc.). L'orchestrateur n'ajoute aucune garde : il réutilise celles qui
existent.

**Refus d'offre transformé en réponse conversationnelle.** Si
`offres.exiger()` lève (ex. Découverte a épuisé ses 3 analyses), le
gestionnaire d'outil capture l'exception et la renvoie comme
`tool_result` (texte du message de refus, inchangé). Claude la
reformule dans sa réponse plutôt que l'appelant ne voie une erreur brute.
Aucune nouvelle politique de refus à écrire : celle qui existe pour les
boutons est réutilisée mot pour mot.

## Aucune nouvelle mécanique d'autorisation

`droits.ts` reste binaire et inchangé. Il n'y a pas, en v1, de concept
nommé « niveaux d'autonomie » dans le code. La seule garantie que
l'orchestrateur ne déclenche pas un générateur payant de sa propre
initiative est **une instruction dans le prompt système** :

> N'appelle un outil générateur que si la personne l'a explicitement
> demandé dans son dernier message, ou a confirmé une proposition que tu
> viens de lui faire. Ne le fais jamais de façon spéculative.

C'est une instruction, pas un verrou — voir la section Tests pour ce que
ça implique en termes de preuve.

## Mémoire : proposer, jamais écrire seul

`rappeler_souvenirs` est le seul outil mémoire exposé au modèle.
**Aucun outil d'écriture n'est exposé.** Si IGINI juge qu'un élément de
la conversation mérite d'être retenu, il le dit dans sa réponse texte
(« Je retiens que le local fait 80 m² — je l'enregistre ? ») et le
frontend affiche un bouton « Enregistrer ce souvenir » sous ce message,
qui ouvre le formulaire mémoire **existant** (`POST /memory`), pré-rempli
avec le contenu suggéré et une catégorie par défaut (`fact`) que la
personne peut changer avant de valider. Zéro nouvelle route, zéro nouveau
champ `status`/`scope` sur `memories` — cohérent avec le principe déjà
posé dans `ignitux-os.md` (« IGINI propose, la personne confirme ») sans
construire la mécanique complète qui y est décrite pour plus tard.

## Backend

### `ClaudeService.converseWithTools()`

Remplace le `generateChatReply()` prévu dans le spec précédent, dans
`backend/src/igini/claude/claude.service.ts` :

- Utilise le **tool-use natif** du SDK Anthropic (`tools: [...]` sur
  `messages.create`) — première utilisation dans le code, qui n'appelait
  jusqu'ici que `zodOutputFormat` pour des sorties structurées.
- **Deux modèles** : un modèle rapide/économique pour l'orchestration
  (nouvelle constante, ex. `CLAUDE_ORCHESTRATOR_MODEL`, à choisir dans le
  plan), le modèle existant `claude-opus-5` reste réservé aux cinq
  générateurs, inchangé.
- Boucle bornée à **3 tours** (appel → tool_use → tool_result → appel
  suivant). Un plafond atteint sans réponse texte finale renvoie un
  message d'échec explicite (« je n'ai pas pu terminer, peux-tu
  préciser ? »), jamais une réponse tronquée silencieuse.
- Système : `buildSystemPrompt(...)` avec `IGINI_IDENTITY` + instruction
  d'orchestration (ton conversationnel + la règle de confirmation
  ci-dessus + description des outils disponibles).
- Contexte : les ~20 derniers messages du fil, comme prévu dans le spec
  précédent — inchangé.
- Réutilise `availability()` et `assertWithinQuota()` ; **n'appelle
  jamais `offres.exiger()` pour le tour de conversation lui-même** (seuls
  les outils générateurs le font, via le code existant qu'ils invoquent).
- Journalisation : le(s) tour(s) d'orchestration sont journalisés sous le
  générateur `'discuter'` (ajouté à `GENERATOR_NAMES`, comme prévu dans le
  spec précédent) avec le modèle d'orchestration ; chaque outil
  générateur déclenché journalise sous son propre nom existant, sans rien
  changer à `AiUsageService`.

### Nouveau fichier : `backend/src/igini/chat/igini-tools.ts`

Déclare les 7 outils : nom, description, schéma d'entrée JSON (pour le
paramètre `tools` du SDK), et un exécuteur `Record<string, (input, ctx)
=> Promise<ToolResult>>` qui fait le pont vers les services NestJS
existants. Testé isolément (mock des services sous-jacents), sans jamais
appeler Claude.

### `backend/src/igini/chat/` (inchangé en structure du spec précédent)

`chat.controller.ts` (`POST/GET /chat/messages`, inchangés),
`chat.service.ts` (appelle désormais `converseWithTools()` au lieu de
`generateChatReply()`), `chat.module.ts`.

### Persistance : seul l'échange final est stocké

`chat_messages` ne gagne aucune colonne. Le détail des tours
d'orchestration (quel outil a été appelé, avec quel résultat) n'est
**pas** persisté ligne par ligne — seuls le message de la personne et la
réponse texte finale d'IGINI le sont, exactement comme dans le spec
précédent. La réponse finale résume déjà en langage naturel ce qui a été
fait (« j'ai lancé l'analyse : faisabilité 7/10... »), ce qui suffit comme
contexte pour les tours suivants. Ce choix évite toute migration de schéma
et garde l'historique lisible si jamais il est exporté (RGPD).

### `GenerationAttribution.projectId`

Passe à `string | null`, comme déjà prévu dans le spec précédent (le tour
de conversation lui-même n'a pas de projet ; chaque outil générateur, lui,
fournit toujours un `project_id` non nul résolu par le modèle).

## Frontend

Repris du spec précédent (icône flottante dans `Systeme`, panneau,
`chat-igini.tsx`, `chatHistory()`/`envoyerMessageChat()` dans `api.ts`,
hors file d'attente hors-ligne). Deux ajouts :

- **Bouton « Enregistrer ce souvenir »** sous un message IGINI qui
  propose un souvenir (détection côté frontend : la réponse contient un
  marqueur simple, à définir dans le plan — ex. un motif de texte
  reconnaissable, pas un nouveau format structuré côté IA pour rester
  YAGNI) — ouvre le formulaire mémoire existant pré-rempli.
- **Lien vers le projet** quand un générateur a été déclenché depuis le
  chat, plutôt que de dupliquer l'affichage complet d'une analyse ou d'un
  plan dans une bulle de conversation — la fiche projet existante reste
  la vue de référence pour le détail.

## Sécurité et constitution

Aucun nouvel article, aucune nouvelle règle. La garantie « pas d'action
payante sans demande explicite ou confirmation » vit dans le prompt, pas
dans le moteur constitutionnel — parce qu'elle porte sur un jugement de
langage naturel (« la personne a-t-elle demandé ceci ? »), pas sur un fait
vérifiable en code comme l'article 8 (journalisation d'une action « sans
confirmation humaine »). Ici, il y a toujours une confirmation humaine :
le message qui déclenche l'outil. L'article 8 ne s'applique donc pas.
L'article 11 (transparence) est déjà satisfait par construction : la
réponse d'IGINI énonce ce qu'il a fait, en langage naturel, à chaque
tour.

## Hors périmètre (explicitement exclu de cette v1)

- Outils sur CRM, facturation, comptabilité, banque — chantier séparé,
  sur le même patron, une fois celui-ci éprouvé en usage réel.
- Écriture autonome de mémoire, ou tout mécanisme `status`/`scope` sur
  `memories`.
- Niveaux d'autonomie comme concept nommé dans le code.
- Journal d'événements et ordonnanceur (proactivité) — sous-projet
  séparé, à cadrer après celui-ci.
- Plusieurs fils de conversation, streaming, accès anonyme, quota
  différencié par offre pour le tour de conversation — inchangés du spec
  précédent.
- Confirmation via bouton dédié avant d'appeler un générateur — la
  confirmation reste conversationnelle (texte), pas un composant UI
  séparé.

## Tests à prévoir

- `igini-tools.spec.ts` — chaque exécuteur d'outil, avec les services
  sous-jacents mockés : `lister_projets` ne renvoie que les projets du
  bon propriétaire, `analyser`/`construire`/etc. transmettent bien
  `ForbiddenException` en `tool_result` d'erreur plutôt que de laisser
  planter l'appel, aucun outil n'appelle Claude directement.
- `claude.service.spec.ts` — `converseWithTools()` : plafond de 3 tours
  respecté (avec un mock qui boucle indéfiniment), disponibilité coupée,
  plafond de coût atteint, `offres.exiger()` jamais appelé par
  l'orchestrateur lui-même (seulement par les services qu'il invoque —
  distinction testée explicitement, comme pour `generateChatReply` dans
  le spec précédent), journalisation sous `'discuter'` avec le modèle
  d'orchestration.
- `chat.service.spec.ts` — persistance des deux seuls messages (pas des
  tours intermédiaires), fenêtre de contexte, pagination — inchangé du
  spec précédent.
- **Ce que les tests unitaires ne peuvent pas prouver** : que le modèle
  respecte réellement la règle « pas d'outil générateur sans demande
  explicite ». C'est un jugement de langage, pas un fait de code. À
  ajouter à `scripts/validation-reelle.mjs --avec-ia` : un scénario qui
  envoie une remarque vague (« je me demande ce que je devrais faire »)
  et vérifie qu'aucun générateur n'a été déclenché (`ai_usage_events`
  inchangé sur les 5 générateurs), et un scénario qui demande
  explicitement une analyse et vérifie qu'elle l'a été.
- `chat-igini.spec.tsx` — reprend les cas du spec précédent, ajoute
  l'affichage du bouton « Enregistrer ce souvenir » et du lien vers le
  projet après un générateur déclenché.
