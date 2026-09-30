# Chat avec Igini — icône persistante + panneau de discussion libre

27 septembre 2026. Design validé avec Helder en session de brainstorming.

> **Remplacé le 27 septembre 2026 par
> [`2026-09-27-igini-conversationnel-design.md`](2026-09-27-igini-conversationnel-design.md).**
> La table `chat_messages`, les endpoints et l'emplacement frontend décrits
> ici sont repris tels quels par le nouveau document ; ce qui change (le
> chat devient un orchestrateur à outils dès la v1, pas un texte-seul) y
> est décrit. Ne pas implémenter ce document seul.

## Pourquoi

Aujourd'hui, la seule façon de « parler » à Igini est de passer par l'un des
5 générateurs (Analyser/Construire/Financer/Développer/Transmettre), chacun
figé sur un schéma de sortie précis et rattaché à un projet. Il n'existe
aucun moyen de poser une question libre à Igini — une remarque, une demande
d'explication, une réflexion à voix haute — sans que ça produise (ou tente
de produire) un plan structuré. Le besoin : une icône de chat, visible
partout dans l'appli une fois connecté, qui ouvre une conversation libre
avec Igini.

## Portée v1

Un seul fil de conversation continu par utilisateur (pas de notion de
« conversations » multiples nommées), accessible uniquement connecté,
avec historique conservé en base.

## Décision architecturale : le chat reste hors du système d'offres

Ignitux protège déjà les 5 générateurs par deux verrous empilés : un quota
par offre (`OffresService.exiger()` — ex. « 3 analyses/mois en
Découverte ») et un plafond de coût global par utilisateur
(`AiUsageService.assertWithinQuota()`, 2 €/mois par défaut, tous
générateurs confondus).

Le quota par offre est calibré pour des générations ponctuelles et
coûteuses (une analyse = un appel facturé). Un chat, c'est l'inverse : une
conversation normale fait 10-20 aller-retours dans la même session. Le
brancher sur ce même compteur mensuel viderait le quota « analyses » d'un
compte Découverte en une seule conversation — ce n'est pas ce que ce quota
promet, et retrofiter un quota séparé « messages/mois » par offre dans
`offres-catalogue.ts`/`droits.ts` (modules volontairement purs et très
testés) est un chantier disproportionné pour une v1.

**Décision (validée avec Helder) : le chat n'appelle jamais
`offres.exiger()`.** Il reste protégé uniquement par le plafond de coût
global déjà en place, qui s'applique automatiquement à tout nouvel appel
IA sans rien changer au catalogue des offres. Si l'usage réel révèle un
jour un abus spécifique au chat, un quota dédié pourra être ajouté à ce
moment — pas avant (YAGNI).

## Modèle de données

Nouvelle table Prisma, une ligne par message (pas de table
`conversations` séparée : le fil est implicitement « tous les messages de
cet utilisateur, triés par date », même logique que `memories`) :

```prisma
/// CHAT — un message échangé librement avec Igini, en dehors des 5
/// générateurs structurés. Un seul fil continu par utilisateur : le rôle
/// (`role`) porte la distinction entre ce que la personne a écrit et ce
/// qu'Igini a répondu, sans ambiguïté de provenance à documenter en plus
/// (contrairement à analyses/build_plans, qui restent property d'un
/// projet et peuvent être saisis à la main).
model chat_messages {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id    String    @db.Uuid
  user       users     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  /// 'user' | 'igini'
  role       String
  content    String
  created_at DateTime? @default(now()) @db.Timestamptz(6)

  @@index([user_id, created_at])
}
```

`users` gagne la relation `chat_messages chat_messages[]`.

## Backend : `ClaudeService.generateChatReply()`

Nouvelle méthode à côté de `generateStructuredOutput`, dans
`backend/src/igini/claude/claude.service.ts` :

- Texte libre via `messages.create` (pas de `zodOutputFormat` — un chat
  n'a pas de schéma de sortie).
- Système : `buildSystemPrompt(...)` avec `IGINI_IDENTITY` + une courte
  instruction propre au chat (ton conversationnel, pas de plan structuré
  imposé).
- Contexte envoyé à Claude : les ~20 derniers messages du fil (pas
  l'historique complet — borne le coût par appel et le nombre de tokens
  d'entrée).
- Réutilise `availability()` (interrupteur `IGINI_AI_ENABLED`) et
  `assertWithinQuota()` — **pas** `offres.exiger()` (voir décision
  ci-dessus).
- Journalise dans `ai_usage_events` via `AiUsageService.record()`, avec un
  nouveau générateur `'discuter'` ajouté à `GENERATOR_NAMES`
  (`backend/src/igini/usage/generator-names.ts`) — uniquement pour la
  traçabilité des coûts (le générateur apparaît dans les totaux/répartition
  déjà existants).

  **Effet de bord vérifié, et sans conséquence** : `offres-catalogue.ts`
  construit les capacités d'Entrepreneur/Construction par
  `generateurs: [...GENERATOR_NAMES]` — `'discuter'` y apparaîtra donc
  mécaniquement (Découverte, listé explicitement en `['analyser']`, ne
  l'aura pas). Ça ne change rien en pratique : `generateChatReply()`
  n'appelle jamais `OffresService.exiger()`, donc cette liste n'est jamais
  consultée pour le chat. La garantie que le chat reste hors du système
  d'offres tient au code (`exiger` jamais appelé), pas à l'absence de
  `'discuter'` dans une liste.

**Ajustement de type nécessaire** : `GenerationAttribution.projectId`
(`backend/src/igini/usage/ai-usage.service.ts`) passe de `string` à
`string | null`. Le chat n'est pas rattaché à un projet (assistant
général — injecter le contexte du projet ouvert est hors scope v1, voir
plus bas) ; la colonne `ai_usage_events.project_id` est déjà nullable en
base, seul le type TypeScript est à assouplir. Les 5 générateurs
existants continuent de passer un `projectId` non nul, ce qui reste
valide pour le type élargi.

**Message d'indisponibilité** : `GENERATORS_DISABLED_MESSAGE`
(`backend/src/igini/claude/generators-availability.ts`) mentionne
aujourd'hui « les 5 générateurs » comme seules fonctionnalités IA. Le
texte est mis à jour pour inclure le chat, qui devient la 6ᵉ chose
protégée par le même interrupteur.

## Backend : module `chat`

`backend/src/igini/chat/` (même structure que `memory/`) :

- `chat.controller.ts`
  - `POST /chat/messages` — reçoit le message de l'utilisateur (DTO avec
    `content: string`, borné en longueur comme `CreateMemoryDto.content`),
    lit les ~20 derniers messages du fil, appelle
    `ClaudeService.generateChatReply()`, persiste les deux messages
    (utilisateur puis Igini) et renvoie la réponse d'Igini.
  - `GET /chat/messages` — historique paginé (`limit`/curseur, même
    convention que `AiUsageService.history()`), pour réafficher le fil à
    l'ouverture du panneau.
- `chat.service.ts` — logique ci-dessus, testée avec un `ClaudeService`
  mocké (même pattern que `memory.service.spec.ts`).
- `chat.module.ts` — importe `ClaudeModule`, déclaré dans `app.module.ts`.

## Frontend

- Icône flottante ajoutée dans `Systeme`
  (`frontend/src/components/systeme.tsx`), rendue dans les mêmes
  conditions que la barre des tâches (`connecte && (app || surBureau)`) —
  donc jamais visible sur login/inscription/landing, comme demandé.
- Clic → panneau (pas une nouvelle route) avec liste des messages + champ
  de saisie. Réponse attendue en une fois (pas de streaming — cohérent
  avec la latence déjà tolérée pour les 5 générateurs ; le streaming reste
  une amélioration future).
- Nouveau composant `frontend/src/components/chat-igini.tsx` +
  `chat-igini.spec.tsx`.
- Nouvelles fonctions dans `frontend/src/lib/api.ts` :
  `chatHistory()` / `envoyerMessageChat()`.
- `POST /chat/messages` rejoint `JAMAIS_EN_FILE`
  (`frontend/src/lib/api.ts`) : un message envoyé hors-ligne doit échouer
  tout de suite avec un message clair, plutôt que d'être mis en file et
  rejoué bien plus tard, hors contexte — même raisonnement déjà écrit pour
  `/auth/login`.

## Hors périmètre (explicitement exclu de cette v1)

- **Contexte projet automatique** — le chat ne sait pas, pour l'instant,
  dans quel projet on se trouve quand on l'ouvre depuis une application ;
  c'est un assistant général. Rattacher la conversation au projet ouvert
  est un chantier séparable (et rouvrirait la question du quota par
  générateur, volontairement écartée ici).
- **Plusieurs fils de conversation** — un seul fil continu par
  utilisateur en v1 ; pas d'historique par sujet ni de suppression
  sélective.
- **Streaming de la réponse** — réponse complète attendue, comme les 5
  générateurs.
- **Accès anonyme / visiteurs non connectés** — le chat n'apparaît que
  connecté, jamais sur la landing page publique.
- **Quota différencié par offre** — voir la décision architecturale
  ci-dessus ; peut être ajouté plus tard si l'usage le justifie.

## Tests à prévoir

- `generator-names.spec.ts` (ou équivalent) — `'discuter'` reconnu par
  `estGenerateur`.
- `claude.service.spec.ts` — `generateChatReply()` : disponibilité
  coupée, plafond de coût atteint, appel réussi, `projectId: null`
  correctement journalisé, et surtout **`offres.exiger` jamais appelé**
  (c'est cette assertion, pas la composition du catalogue, qui garantit
  que le chat reste hors du système d'offres).
- `chat.service.spec.ts` — persistance des deux messages, fenêtre des ~20
  derniers messages envoyée en contexte, pagination de l'historique.
- `chat-igini.spec.tsx` — affichage de l'icône seulement connecté, envoi
  d'un message, erreur explicite hors-ligne (pas de mise en file
  silencieuse).
- `systeme.spec.tsx` — l'icône n'apparaît pas sur login/landing.
