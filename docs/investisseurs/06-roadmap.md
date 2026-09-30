# Roadmap

Source principale : Bible IGNITUX, chapitre 9 (« La vision IGNITUX OS — 2026 → 2030 »), croisée avec
l'état Git réel constaté le 30/09/2026.

## Feuille de route publique (Bible, chapitre 9)

| Période | Jalon |
|---|---|
| T4 2026 | Bêta ouverte : hébergement, domaine, email ; entreprises et membres (première moitié) |
| T1 2027 | Le lanceur : catalogue d'applications, moteur d'activation, nouvel onboarding, PWA installable |
| T2 2027 | IGINI parle : conversation avec outils, mémoire étendue, niveaux d'autonomie inscrits dans la Constitution |
| T3 2027 | IGINI veille : journal d'événements, ordonnanceur, suggestions, notifications |
| T4 2027 | Offre entreprise : invitations de salariés, permissions par membre, agenda |
| 2028 | Le commerce et le mobile : caisse via une solution certifiée, stocks, application sur les boutiques Android/iOS |
| 2029 | L'entreprise complète : ressources humaines, production, formation, banque synchronisée via un agrégateur agréé |
| 2030 | La plateforme : applications de partenaires, API ouverte, IGINI capable d'orchestrer plusieurs applications dans une même demande |

Chaque jalon est conçu pour être livrable seul : si la feuille de route s'arrête à un jalon donné, ce
qui a été construit tient debout sans le reste **[Bible]**.

## Ce que l'audit du 30/09/2026 ajoute à cette feuille de route

Plusieurs jalons sont **déjà en avance** sur leur date prévue, dans des branches de travail non
fusionnées :

- **« Le lanceur » (T1 2027)** — le catalogue d'applications (19-20 applications), le moteur
  d'activation et la PWA installable sont déjà largement codés, mais **non commités sur `main`**
  **[Git]**. Ce jalon pourrait être livré très en avance sur T1 2027 s'il est intégré rapidement.
- **« IGINI parle » (T2 2027)** — l'orchestrateur conversationnel à outils est développé et a passé
  une revue de sécurité/logique dans une branche isolée (`.worktrees/chat-igini`, 16 commits), un an
  avant son jalon prévu **[Git]**.
- **Un chantier non prévu par la Bible** : une intégration Shopify (« boutique en ligne ») est
  également développée dans une branche isolée, avec une revue de sécurité ayant corrigé deux
  vulnérabilités réelles **[Git]**. Elle n'apparaît dans aucune version de la feuille de route
  publique — décision à prendre sur son positionnement (avant ou après T4 2026 ?).
- **Un sixième générateur IGINI, « Former »** (recommandation automatique de forme juridique), non
  mentionné dans la feuille de route de la Bible, est en développement actif dans une troisième
  branche isolée **[Git]**.

## Ce qui reste un vrai jalon non commencé

- **« One Brain, Multiple Regulations »** — l'adaptation fiscale/juridique/comptable par pays.
  Explicitement « pas commencé » dans la Bible : nécessite un pays cible et une source réglementaire
  fiable avant toute ligne de code **[Bible]** — **[G — décision fondateur]**.
- **L'entreprise comme entité partagée** (plusieurs salariés, une même caisse) — aucune donnée
  n'appartient aujourd'hui à une organisation, seulement à une personne **[Bible]**.
- **Le journal d'événements et l'ordonnanceur** — aucune automatisation déclenchée par le temps
  n'existe encore **[Bible]**.
- **Les sessions longues** — un jeton d'accès dure un jour sans renouvellement, un frein pour une
  application mobile ouverte plusieurs fois par jour **[Bible]**.

## Recommandation pour la présentation investisseur

Présenter la roadmap Bible telle quelle, en signalant que certains jalons sont en avance grâce à un
travail déjà engagé (bon signal de vélocité), **sans laisser croire que ce travail est déjà en
production** — il ne l'est pas tant qu'il n'est pas fusionné dans `main`, testé en intégration
continue, et déployé.
