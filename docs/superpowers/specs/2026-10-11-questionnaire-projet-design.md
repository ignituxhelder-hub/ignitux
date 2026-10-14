# Questionnaire de projet et CV — design

Date : 2026-10-11 · Validé par Helder en conversation (option C, liste des questions, CV + formations).

## Pourquoi

Aujourd'hui IGINI analyse un projet à partir d'un titre et de quelques phrases.
Tout le reste — seul ou à plusieurs, budget, structure existante, diplômes,
situation de la personne — est **supposé**. La consigne de Former le dit
elle-même : « quand une information te manque, suppose explicitement ».
On pose ces questions une fois, au moment où la personne décrit son idée,
et toutes les étapes d'IGINI en profitent.

## Parcours (frontend)

« Créer mon projet » garde l'étape 1 (nom + description). Le projet est créé
à la fin de l'étape 1, puis la personne arrive sur
`/projects/[id]/questionnaire`, un parcours par étapes (« Étape X sur Y »,
Précédent / Suivant / Terminer plus tard) :

| # | Étape | Où c'est rangé |
|---|-------|----------------|
| 1 | Ton idée (nom, description) | `projects` (inchangé) |
| 2 | Ton parcours : CV (expériences, formations) | `user_experiences`, `user_formations` |
| 3 | Ta situation : situation actuelle, déjà entrepris, compétences, disponibilité | `user_profiles` |
| 4 | Le projet : nouvelle / existante / reprise, forme et année et CA si existante, stade | `project_questionnaires.reponses` |
| 5 | L'activité : secteur, produits/services, clients, vente, activité réglementée, ville | idem (+ `projects.sector`) |
| 6 | Équipe et protection : associés, salariés, patrimoine, CA visé | idem |
| 7 | Argent et calendrier : budget, apport, lancement | idem |
| 8 | Questions d'IGINI (0 à 3) | `project_igini_questions` |

- Les étapes 2 et 3 sont sautées quand le profil les couvre déjà.
- Chaque étape s'enregistre en passant à la suivante : rien n'est perdu.
- Toute question a « Je ne sais pas encore » ; rien n'est obligatoire.
- Les choix se cliquent (boutons), le texte libre est l'exception.
- La page projet affiche « Compléter les informations » tant que le
  questionnaire n'est pas terminé ; la page Profil gagne l'éditeur de CV.

## Données

- `user_profiles.current_situation` (texte, nullable) : nouveau champ du
  catalogue de profil, moment `premier-projet`.
- `user_experiences` : `poste`, `entreprise?`, `debut` (`AAAA-MM`), `fin?`,
  `en_cours`, `description?`, `position`. Cascade sur l'utilisateur.
- `user_formations` : `diplome`, `etablissement?`, `annee?`, `position`.
  **Facultatif, et jamais un critère** : sert uniquement à vérifier une
  qualification obligatoire pour une activité réglementée (CAP coiffure,
  diplôme d'État santé…). Le catalogue de profil refusait le « niveau
  d'étude » parce qu'il trie les gens ; ici on ne trie personne, on vérifie
  un droit d'exercer, et seulement si la personne a voulu le dire.
- `project_questionnaires` (1 ligne par projet) : `reponses` JSONB validé
  contre un catalogue, `termine_le?`. Un catalogue plutôt qu'une colonne par
  question : même principe que `profile-fields.ts`, une question s'ajoute à
  un seul endroit.
- `project_igini_questions` : `question`, `pourquoi`, `reponse?`, `position`.
- Export RGPD : les quatre nouvelles données sortent dans l'export
  (`compte` pour le CV, `projets_et_contenus` pour le questionnaire).

## API

- `GET /profil/cv` · `PUT /profil/cv` (remplace la liste entière, 30 lignes max chacune)
- `GET /projects/:id/questionnaire` → étapes, champs, valeurs, questions d'IGINI
- `PUT /projects/:id/questionnaire` → enregistre des réponses (fusion ; clé
  inconnue ignorée, valeur hors options refusée)
- `POST /projects/:id/questionnaire/questions-igini` → génère une fois par projet
- `PUT /projects/:id/questionnaire/questions-igini` → enregistre les réponses
  et marque le questionnaire terminé

Propriétaire seulement.

## IGINI

- `contexte-personne.ts` lit aussi le CV, les formations et la situation.
- Nouveau `contexte-projet.ts` (pur) : des faits, jamais de conclusions
  (aucun « donc », « réduit », « favorise » — testé).
- Ce contexte entre dans les six générateurs (analyser, former, construire,
  financer, développer, transmettre).
- Le générateur `questionner` : un appel structuré qui rend 0 à 3 questions.
  Il est journalisé (coût) mais **ne décompte pas** le forfait mensuel
  (Découverte n'a que 3 générations) ; le plafond de coût global le borne,
  et il ne tourne qu'une fois par projet. Échec ⇒ l'étape 8 est sautée.

## Tests

Catalogue (validation, options), contexte-projet (faits, pas de « donc »),
contexte-personne (CV), droits (`questionner` hors forfait), export RGPD
(couverture des nouvelles tables), composants frontend (éditeur de CV,
parcours par étapes).

## Mise en ligne

Migration additive `20261011140000_questionnaire_projet` à appliquer sur la
base de production **avant** le push sur `main` : le déploiement est
automatique depuis `main`, et un backend qui démarre sans ses tables casse.

## Plan

1. Schéma Prisma + migration + régénération du client.
2. Backend profil : champ `current_situation`, CV (service, DTO, routes), contexte-personne.
3. Backend projet : catalogue du questionnaire, service + routes, contexte-projet, branchement dans les générateurs.
4. Générateur `questionner` (droits, journal, service).
5. Export RGPD.
6. Frontend : API, éditeur de CV, parcours `/projects/[id]/questionnaire`, liens depuis la création, la page projet et le profil.
7. Tests, lint, build ; commit sur `feat/questionnaire-projet`.
8. Instructions de mise en ligne pour Helder (migration prod puis push).
