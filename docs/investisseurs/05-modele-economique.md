# Modèle économique — état réel

Sources : `backend/src/offres/offres-catalogue.ts` (code, vérifié le 30/09/2026), `PRICING.md`,
`docs/modele-economique.md`, Bible chapitre 7.

## La ligne de partage

Le principe, vérifié dans le code et cohérent partout où il est documenté : ce qui ne coûte rien à
faire tourner reste gratuit ; ce qui coûte de l'argent réel à chaque clic (un appel à un générateur
IGINI) est payant **[Code, Bible]**. Ce n'est pas « basique contre avancé ».

## Les offres — chiffres vérifiés dans le code

> **Mise à jour du 10/10/2026.** Il n'y a plus que deux offres : Découverte (gratuite) et
> Entrepreneur à **20,00 €/mois**, qui reprend tout ce que Construction contenait. L'évaluation de
> financement ne se vend plus à part (99,00 €) : elle est **comprise dans Entrepreneur**, et son
> parcours n'est pas encore construit (affichée « bientôt disponible »). **[Code]**

| | Découverte | Entrepreneur |
|---|---|---|
| Prix | Gratuit | 20,00 €/mois |
| Projets | 1 | Sans limite |
| Générateurs IGINI | Analyser seul | Tous |
| Générations IA/mois | 3 | 35 |
| Comptabilité, facturation, banque | — | Oui |
| Financement, investisseurs | — | Oui |
| Collaborateurs | — | Sans limite |
| Évaluation de financement | — | Incluse (bientôt disponible) |

*Avant le 10/10/2026 :*

| | Découverte | Entrepreneur | Construction |
|---|---|---|---|
| Prix | Gratuit | 9,90 €/mois | 59,00 €/mois |
| Projets | 1 | Sans limite | Sans limite |
| Générateurs IGINI | Analyser seul | Les 5 | Les 5 |
| Générations IA/mois | 3 | 30 | 35 |
| Comptabilité, facturation, banque | — | — | Oui |
| Financement, investisseurs | — | — | Oui |
| Collaborateurs | — | — | Sans limite |

Une **évaluation de financement** existe à part, 99,00 €, explicitement non vendue comme un
abonnement (un avertissement obligatoire, testé dans le code, l'accompagne partout où le prix
s'affiche) **[Code]**.

Les prix sont réglables par variable d'environnement sans redéploiement (`OFFRE_<ID>_PRIX_CENTIMES`)
**[Code]** — utile pour une bêta à prix réduit, mais cela signifie aussi que **le prix affiché en
production à un instant T doit être vérifié dans la configuration réelle**, pas supposé égal au
catalogue par défaut.

## Coût de l'intelligence artificielle — mesuré, pas estimé

Sur 55 appels réels au modèle `claude-opus-5` (mesure du 19-20/09/2026) : **0,0511 € par génération
en moyenne** **[Bible, Pricing]**. Un pipeline complet (les 5 générateurs, une fois chacun) mesuré à
**0,3530 €** **[Pricing]**.

## ⚠️ Incohérence identifiée par cet audit — à trancher par le fondateur

> **Tranchée le 10/10/2026.** L'offre payante unique vaut 20,00 €/mois : le plafond IA de 2,00 €
> correspond désormais exactement aux 10 % annoncés. La suite de cette section décrit la situation
> d'avant, conservée pour l'historique.

`PRICING.md` construit tout son raisonnement de plafond de coût IA (« 10 % du prix de vente ») sur
un **prix de vente de référence de 20,00 €/mois** — cité explicitement dans ses tableaux. **Aucune
des trois offres réellement en vigueur ne vaut 20,00 €/mois** : Entrepreneur est à 9,90 € et
Construction à 59,00 €.

Conséquence chiffrée :

| Offre | Prix réel | Plafond IA actuel (2,00 €) | % réel du prix |
|---|---|---|---|
| Entrepreneur | 9,90 € | 2,00 € | **20,2 %** — le double du taux annoncé |
| Construction | 59,00 € | 2,00 € | **3,4 %** — très en dessous du taux annoncé |

**[À DÉFINIR — décision fondateur]** : soit le plafond de 2,00 €/mois s'applique tel quel et le
« taux de 10 % » n'a jamais correspondu aux offres réellement lancées (il faut le dire autrement),
soit le plafond doit être recalculé par offre (par exemple 0,99 € pour Entrepreneur, 5,90 € pour
Construction, pour respecter réellement 10 % sur chacune). Ce point doit être tranché **avant** de
présenter « le coût IA est maîtrisé à 10 % du prix de vente » à un investisseur, sous peine de
présenter un chiffre qui ne résiste pas à une question de suivi.

Ce que le calcul montre malgré tout, et qui reste solide : le coût réel mesuré (0,3530 € pour un
pipeline complet) est **très inférieur** à n'importe laquelle des deux offres payantes, avec une
marge confortable même dans le scénario le plus défavorable (Entrepreneur à 9,90 €, coût réel à
3,6 % du prix). Le sujet n'est pas la viabilité du coût IA — elle est acquise — mais la formulation
du « plafond de 10 % » telle qu'écrite aujourd'hui.

## Ce que ce dossier ne peut pas fournir

- **Aucune donnée d'utilisateurs payants réels** — 0 utilisateur confirmé par le dépôt.
- **Aucun coût d'acquisition, aucun taux de conversion, aucune rétention** — non mesurables sans
  utilisateurs réels.
- **Aucune projection de revenu** au-delà de ce que l'arithmétique des offres permet de calculer
  mécaniquement (voir `12-besoin-financement.md` pour un usage prudent de ce calcul).

## Ce qui reste hors modèle économique actuel

- Aucun encaissement réel (pas de Stripe/Mollie/autre branché) **[Doc: en-attente-paiement.md]**.
- Le modèle de participation (accord par projet, paliers validés par IGNITUX, droit sur les
  dividendes une fois le capital entièrement transmis) est **suivi** dans le code. Les valeurs de
  départ (51/49, 5 %) sont des valeurs par défaut recopiées dans chaque accord ; **les conditions qui
  déclenchent un palier ne sont pas définies par le produit** : elles sont écrites projet par projet
  **[Code, Doc]**. Le montage juridique de ce modèle n'a aucun contrat généré à ce jour et n'a pas été
  relu par un juriste **[Status]**.
