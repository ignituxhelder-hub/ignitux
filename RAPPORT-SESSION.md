# Rapport de session — construction autonome IGNITUX

Session du 19 septembre 2026. Mode autonome, sans validation intermédiaire.
Tout ce qui suit est mesuré sur le code réel, pas estimé d'après les intentions.

---

## 1. Avertissement de méthode

Les pourcentages ci-dessous distinguent systématiquement deux choses :

- **Code écrit et testé** : le code existe, il est couvert par des tests automatisés qui passent,
  il compile, il est typé et linté.
- **Vérifié en conditions réelles** : quelqu'un s'en est servi dans un navigateur, sur des données
  réelles, et a constaté le résultat.

Aucun module livré cette session n'a été manipulé dans un navigateur par un humain : la session
s'est faite sans supervision directe. Les chiffres de la colonne « vérifié réel » reflètent donc
essentiellement le travail des sessions précédentes. C'est une limite importante et il serait
malhonnête de la lisser.

---

## 2. État avant / après, module par module

Les pourcentages « avant » sont ceux mesurés à l'audit d'ouverture de session, **pas** ceux annoncés
dans le cahier des charges (qui étaient à réviser par consigne explicite).

| Module | Annoncé au brief | Mesuré avant | Après (code testé) | Après (vérifié réel) |
|---|---|---|---|---|
| Constitution IGNITUX | 10 % | **5 %** | **80 %** | 0 % |
| Mémoire IGINI | 20 % | **45 %** | **85 %** | ~40 % |
| Workflow Engine | 20 % | **30 %** | **80 %** | ~30 % |
| Knowledge Graph | 0 % | **40 %** | **80 %** | ~35 % |
| Offline First | 5 % | **0 %** | **70 %** | 0 % |
| CRM | 0 % | **0 %** | **75 %** | 0 % |
| Facturation | 0 % | **0 %** | **70 %** | 0 % |
| Financement IGNITUX | 0 % | **10 %** | **60 %** | 0 % |
| Modules Pays | 0 % | **25 %** | **30 %** | ~25 % |

### Justification de chaque chiffre « après »

**Constitution — 80 %.** Corpus de 12 articles semés, moteur de 5 règles exécutables, journal des
violations, audit sur données réelles, console de lecture. Les 20 % manquants : le texte officiel
des 24 articles n'existe pas (voir §5), et seuls 4 articles sur 12 sont réellement vérifiables par
du code. Ce n'est pas un défaut d'implémentation, c'est la nature des articles restants.

**Mémoire — 85 %.** Le manque central était que rien ne relisait jamais les souvenirs. `recall()`
les injecte désormais dans le contexte des 5 générateurs. Reste : recherche par similarité
sémantique (écartée volontairement), et pas de purge/archivage des souvenirs anciens.

**Workflow — 80 %.** Définitions, étapes, conditions évaluées sur l'état réel, transitions,
exécutions, journal, avancement automatique après génération. Reste : pas de branchement conditionnel
(un workflow est linéaire), pas d'échéances sur les étapes.

**Knowledge Graph — 80 %.** Traversée de voisinage, plus court chemin, concepts isolés, recherche
multi-termes, suppressions. La visualisation existe mais reste rudimentaire (SVG circulaire, sans
disposition par force).

**Offline First — 70 %.** File d'attente, cache de lecture daté, rejeu ordonné, gestion des refus.
Manque pour aller plus loin : un service worker (l'application ne se charge pas du tout sans réseau,
seules les données déjà chargées restent consultables une fois la page ouverte). C'est la limite la
plus significative de ce module et elle est structurelle.

**CRM — 75 %.** Contacts, entreprises, interactions datées, pipeline, recherche. Manque : import/
export de contacts, rappels et relances.

**Facturation — 70 %.** Devis/factures/avoirs, numérotation sans trou, immuabilité après émission,
règlements, export CSV. Manque : génération PDF, mentions obligatoires paramétrables, facturation
électronique.

**Financement — 60 %.** Apports, répartition des parts en événements datés, dividendes versés,
trajectoire du porteur. Le plafond vient du fait que le modèle économique chiffré n'existe pas
(voir §5) : tout ce qui en dépendrait serait inventé.

**Modules Pays — 30 %.** Seul ajout : l'endpoint qui dit quels pays sont réellement couverts.
Bloqué au même endroit qu'avant, pour la même raison (voir §5).

---

## 3. Ce qui a été produit

| | Nombre |
|---|---|
| Fichiers créés (hors client Prisma généré) | 59 |
| Fichiers modifiés | 31 |
| Lignes ajoutées (hors généré) | ~12 200 |
| Modèles Prisma (total projet) | 35, dont **16 créés cette session** |
| Endpoints HTTP (total projet) | 112 |
| Pages frontend (total projet) | 15, dont **3 créées** (`/constitution`, `/crm`, `/facturation`) |
| Sections projet ajoutées | 2 (`WorkflowSection`, `FinancingSection`) |
| Fichiers de test backend | 50 |
| Fichiers de test frontend | 26 |

**Tests : 518 backend + 147 frontend = 665, tous verts.** Au début de session : 299 + 76 = 375.
**290 tests ajoutés.**

### Migrations

Quatre applications de schéma (`prisma db push`), toutes strictement additives — aucune colonne
supprimée, aucun avertissement de perte de données, aucune donnée existante touchée. Le projet n'a
pas de dossier de migrations versionnées : c'est une dette identifiée (§7).

### Modules backend créés

`constitution/`, `crm/`, `billing/`, `financing/`, plus `igini/workflow/` fortement étendu
(moteur d'exécution) et `igini/knowledge/` (traversée de graphe).

---

## 4. Décisions techniques prises sans validation

Toutes documentées dans `docs/decisions.md` avec leur justification. Les plus structurantes :

1. **La Constitution vit dans le code, pas en base éditable.** Un éditeur d'articles à chaud ferait
   du texte fondateur une donnée mutable sans trace.
2. **Le moteur constitutionnel bloque réellement des écritures.** Il n'est pas décoratif : il est
   branché sur trois points d'appel (scoring, persistance des générateurs, automatisation) et peut
   faire échouer une requête.
3. **Provenance obligatoire sur les contenus IA.** Deux colonnes ajoutées aux 5 tables générées.
4. **Montants en centimes entiers partout** (facturation, financement), quantités en millièmes,
   taux en points de base. Aucun flottant sur de l'argent.
5. **Conditions de workflow en liste fermée**, pas de mini-langage d'expressions.
6. **Aucune probabilité, aucune prévision, aucune valorisation** dans CRM et Financement.
7. **Le CRM est strictement personnel**, non partagé avec les collaborateurs d'un projet.

---

## 5. Ce que j'ai refusé de faire, et pourquoi

Ces points sont des **blocages produit**, pas des oublis. Ils demandent une décision humaine.

### La Constitution V1 à 24 articles n'a jamais été fournie
Le brief dit : « (Insérer ici la Constitution IGNITUX V1 complète avec les 24 articles.) » —
l'emplacement est vide. J'ai transcrit fidèlement les 12 énoncés réellement donnés, sous la version
`principes-fondateurs` et non `v1`. Un test échoue si quelqu'un renomme la version sans avoir le
texte. **Ce qu'il me faut : le texte officiel des 24 articles.**

### Le modèle économique chiffré d'Ignitux n'existe pas
Le brief donne une direction (l'entrepreneur reste propriétaire principal, évolution progressive
vers l'autonomie) mais aucun barème : pas de taux d'entrée au capital, pas de règle de dilution,
pas de formule de rachat, pas de clé de répartition des dividendes. J'ai construit le **suivi** de
ce qui est décidé et versé, jamais le calcul. **Ce qu'il me faut : le barème, ou la décision de le
définir.**

### Aucun second pays pour la conformité
Même blocage qu'à la session précédente : je n'ai pas de source officielle fiable pour un autre
pays, et fabriquer du contenu réglementaire serait dangereux si quelqu'un s'y fiait.
**Ce qu'il me faut : le pays cible, et une source officielle.**

### Pas de génération PDF de facture
Ce serait techniquement faisable, mais une facture PDF sans les mentions obligatoires correctes
donnerait l'illusion d'un document valable. Les mentions dépendent du statut juridique, du régime
de TVA et de l'activité — aucune de ces informations n'est demandée à l'utilisateur aujourd'hui.

---

## 6. Problèmes rencontrés

**Un vrai bug de ma part, attrapé par un test.** Dans le calcul de TVA, j'avais d'abord écrit le
taux « pour mille », ce qui ne permet pas de représenter 20 % par 2000. Le test a échoué ; j'ai
renommé en points de base et corrigé le diviseur plutôt que d'ajuster le test à mon erreur.

**Un bug React réel, attrapé par un test.** Dans le bandeau hors ligne, `isSyncing` figurait dans
les dépendances de l'effet : celui-ci se relançait aussitôt après son propre `setIsSyncing(true)`,
et le nettoyage du relancement annulait le rejeu en cours. La file partait bien, mais le résultat
n'arrivait jamais à l'écran. Passé en `ref`.

**Un défaut du code existant, trouvé par le moteur constitutionnel dès son branchement.** Le score
`confiance` valait `0` quand aucune étape n'avait démarré — un chiffre affiché sans donnée derrière,
exactement ce que l'article 10 interdit. Corrigé en `null`.

**Une erreur de types pré-existante qui neutralisait `tsc`.** `test/app.e2e-spec.ts` importait
`supertest/types`, un sous-chemin que le paquet n'exporte pas. La vérification de types échouait
donc en permanence et ne servait plus de garde-fou. Corrigé.

**Le piège `mockApiRoutes` s'est reproduit deux fois.** Le helper renvoie `[]` pour toute route non
déclarée, ce qui fait planter un composant attendant un objet. Traité par des gardes défensives
(`Array.isArray(...)`) et par l'ajout des routes manquantes aux tests de page.

---

## 7. Dette technique restante

- **Pas de migrations versionnées.** Le schéma est appliqué par `prisma db push`. Acceptable en
  développement, intenable dès qu'une base de production existera.
- **Une seule base pour tout.** Les données de test et les données réelles partagent la même
  instance Supabase. La règle « toujours un projet dédié pour les tests » compense, imparfaitement.
- **Offline First sans service worker.** L'application ne démarre pas hors ligne ; seule une page
  déjà ouverte reste utilisable.
- **Visualisation du graphe rudimentaire.** Disposition circulaire naïve, illisible au-delà d'une
  dizaine de concepts.
- **Aucun test end-to-end.** Tout est en tests unitaires avec mocks. Un vrai parcours navigateur
  n'est jamais rejoué automatiquement.
- **`claude-opus-5` reste le modèle utilisé**, le plus cher. Décision utilisateur en attente.

---

## 8. Estimation du travail restant

Fourchette prudente pour amener les modules livrés cette session à un état réellement éprouvé
(pas seulement testé unitairement) :

| Chantier | Estimation |
|---|---|
| Vérification navigateur des 8 modules + corrections | 3 à 5 jours-homme |
| Tests end-to-end sur les parcours critiques | 4 à 6 jours-homme |
| Migrations versionnées + séparation des bases | 2 à 3 jours-homme |
| Service worker (vrai Offline First) | 4 à 6 jours-homme |
| PDF de facture avec mentions paramétrables | 3 à 5 jours-homme |

Ces chiffres supposent le même niveau d'exigence que le code existant (tests, types, lint).
Ils ne couvrent pas les blocages du §5, qui demandent des décisions avant du code.

---

## 9. Prochaines priorités

1. **Ouvrir l'application et manipuler les 8 modules.** C'est le seul écart qui compte vraiment :
   beaucoup de code testé, rien de vérifié à la main cette session.
2. **Fournir le texte des 24 articles**, ou acter que le corpus actuel fait foi.
3. **Décider du modèle économique chiffré**, ou acter que Financement reste un outil de suivi.
4. **Mettre en place des migrations versionnées** avant tout déploiement.
5. **Trancher sur le modèle IA** : `claude-opus-5` est le plus cher du catalogue.

---

## 10. Budget IA

**Zéro appel à l'API Claude pendant cette session.** Aucun des modules construits n'en avait besoin :
le moteur constitutionnel, le workflow, la traversée de graphe, le CRM, la facturation et le
financement travaillent tous sur des données déjà présentes. Le budget mensuel de 50 € est intact
pour cette session.

C'est aussi un choix de conception récurrent : ni l'automatisation, ni le moteur de workflow
n'appellent l'IA de leur propre initiative. Un automatisme qui déclencherait des générations en
cascade pourrait épuiser le budget sans qu'un humain le voie venir.
