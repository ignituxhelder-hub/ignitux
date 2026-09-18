# Décisions et contraintes assumées

Ce document existe pour qu'une décision prise une fois n'ait pas besoin d'être redécouverte ou
redébattue plus tard. Chaque entrée : quoi, pourquoi, où c'est appliqué dans le code.

## Pas de score fabriqué

**Quoi** — `ScoringService.getScoreCard` renvoie `null` pour un indicateur quand aucune donnée
réelle n'existe (aucune analyse, aucun plan, aucune tâche), plutôt qu'un chiffre par défaut.
**Pourquoi** — un score inventé donnerait une fausse impression d'intelligence ou de fiabilité,
contraire à la devise « la vérité avant tout ». Un `null` honnête est plus utile qu'un chiffre faux.
**Où** — `backend/src/igini/scoring/scoring.service.ts`.

## Pas de moteur d'automatisation

**Quoi** — le module Workflow transforme les suggestions des générateurs (prochaines étapes, jalons)
en tâches suivables, mais IGINI n'exécute jamais une tâche tout seul.
**Pourquoi** — IGINI conseille, l'humain décide et agit. Prétendre le contraire serait mentir sur ce
que le produit sait réellement faire.
**Où** — `backend/src/igini/workflow/workflow.service.ts` (commentaire explicite dans le code).

## Mémoire commune bornée aux étapes précédentes

**Quoi** — chaque étape (Construire, Financer, Développer, Transmettre) ne reçoit dans son prompt
que le résumé des étapes qui la précèdent dans le pipeline, jamais celles qui la suivent — même si
elles existent déjà en base suite à une régénération d'une étape antérieure.
**Pourquoi** — un bug initial remontait sans distinction tout ce qui existait en base, ce qui aurait
fait fuir des informations "du futur" vers une étape antérieure régénérée après coup. Corrigé et
couvert par des tests de régression.
**Où** — `backend/src/projects/projects.service.ts` (une méthode `latestXContext` par étape,
composées explicitement à chaque appel).

## Collaborateur : lecture seule, pas d'accès aux 4 moteurs

**Quoi** — un collaborateur invité sur un projet peut le consulter et voir l'historique des 5
générateurs, mais ne peut ni modifier le projet, ni générer de nouveaux plans, ni accéder à la
mémoire/connaissance/workflow/score de ce projet.
**Pourquoi** — étendre l'accès aux 4 moteurs aurait multiplié les points de vérification de
permission sans demande explicite ; mieux valait livrer un périmètre restreint mais correct que
risquer une faille d'autorisation sur une fonctionnalité plus large.
**Où** — `ProjectsService.findOneForViewer` (lecture) vs `findOneForOwner` (écriture, inchangé) ;
les 4 moteurs utilisent toujours `assertOwnsProject`, jamais `findOneForViewer`.

## ANTHROPIC_API_KEY optionnelle au niveau de la config

**Quoi** — `env.ts` déclare `ANTHROPIC_API_KEY` comme optionnelle : son absence ne bloque pas le
démarrage du serveur, seulement les endpoints qui en ont besoin (erreur 500 explicite, voir
ci-dessous).
**Pourquoi** — bloquer tout le serveur pour une clé qui ne sert qu'à 5 endpoints sur 39 aurait été
disproportionné, et aurait empêché de développer/tester le reste du produit sans payer l'API.
**Où** — `backend/src/config/env.ts`.

## Messages d'erreur Claude différenciés, jamais le détail brut

**Quoi** — `ClaudeService.toSafeMessage` distingue trois cas (identifiants manquants/invalides,
rate limit, panne réseau) avec un message actionnable pour chacun, mais ne renvoie jamais le message
d'erreur brut du SDK au client.
**Pourquoi** — un message générique unique ("réessaie plus tard") ne permet pas de diagnostiquer un
vrai problème de configuration ; renvoyer le détail brut pourrait exposer des informations internes.
**Où** — `backend/src/igini/claude/claude.service.ts`.

## Pas de refonte visuelle/UX pour l'instant

**Quoi** — l'identité actuelle (fond sombre `#0b0c10`, accent orange `#ff5a1f`) est conservée telle
quelle. Aucune refonte de marque ou de design system n'est en cours.
**Pourquoi** — décision explicite : ce chantier attend que le produit soit validé par de vrais
utilisateurs, pour ne pas investir dans une identité avant de savoir si le produit répond à un vrai
besoin.
**Où** — `frontend/src/app/globals.css` (tokens CSS inchangés).
