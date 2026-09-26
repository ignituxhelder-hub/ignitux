# Où héberger Ignitux

26 septembre 2026. L'hébergement est **le seul bloquant absolu** de
[l'audit d'ouverture](audit-ouverture.md). Ce document sert à le lever.

Les prix ci-dessous ont été relevés le 26 septembre 2026 et **bougent
beaucoup** — voir l'avertissement en fin de document.

---

## Ce qu'Ignitux demande réellement

Avant de comparer, il faut savoir ce qu'on héberge. C'est plus petit qu'il n'y
paraît :

| Besoin | Détail |
|---|---|
| **Deux processus Node** | le serveur NestJS (`dist/main.js`) et l'interface Next (`next start`) |
| **Pas de base de données** | elle est déjà chez Supabase, `aws-1-eu-west-1` |
| **Du SMTP sortant** | vers le fournisseur d'email, port 587 |
| **HTTPS** | le préflight de production **refuse de démarrer** sans |
| **Rien d'autre** | pas de stockage de fichiers, pas de file, pas de cache externe |

Les deux images Docker existent, se construisent en CI, et **l'image du serveur
démarre pour de vrai** contre une base jetable (test de fumée). Un
`docker-compose.yml` est fourni, avec son propre Postgres — inutile ici,
puisque la base est ailleurs.

### La contrainte qui décide : la latence vers la base

**Héberge en Europe.** La base est à `eu-west-1` (Irlande). Un serveur aux
États-Unis ajouterait 80 à 100 ms par aller-retour vers Postgres — et le
produit en fait plusieurs par requête. L'écran d'un projet chargerait en
secondes au lieu de dizaines de millisecondes, sans qu'une seule ligne de code
soit en cause.

C'est la contrainte technique la plus forte du document, et elle élimine
d'emblée toute offre sans région européenne.

### Le dimensionnement

Pour une bêta de 10 à 30 personnes : **le plus petit palier de n'importe quel
fournisseur suffit**. Deux processus Node au repos tiennent dans 512 Mo à eux
deux.

Et ce n'est pas près de changer : **[consigné]** le plafond de capacité
d'Ignitux est le budget IA — environ 360 utilisateurs gratuits par mois à
50 €/mois — pas le serveur. Payer pour de la puissance avant d'avoir levé ce
plafond-là, c'est payer pour rien.

---

## Les trois familles

### A. Un VPS, avec Docker Compose

Une machine, les deux conteneurs dessus, et un Caddy ou un Traefik devant pour
le certificat.

| Fournisseur | Entrée de gamme | Région EU |
|---|---:|---|
| Scaleway `PLAY2-PICO` | ~**4,99 €**/mois | France |
| OVHcloud `VPS-1` | ~**7,60 €**/mois | France |
| Hetzner | **à vérifier** — voir ci-dessous | Allemagne, Finlande |

- **Pour** : le moins cher, et tu contrôles tout. Les deux processus sur une
  seule machine, un seul certificat.
- **Contre** : tu deviens l'administrateur système. Renouvellement des
  certificats, mises à jour de l'OS, redémarrage après une coupure, rotation
  des journaux, surveillance. Rien d'insurmontable, **tout à faire soi-même**.
- **L'économie réelle** : 5 à 10 €/mois par rapport à une PaaS. Quelques heures
  de mise en place, puis quelques heures par an.

### B. Une PaaS conteneurs

Tu pousses le dépôt, elle construit, elle sert, elle renouvelle le certificat.

| Fournisseur | Entrée de gamme | Remarque |
|---|---:|---|
| Railway | **5 $**/mois + consommation | 5 $ de crédit inclus ; sous 5 $ de conso, tu paies 5 $ |
| Render | **7 $**/mois par service | le palier gratuit s'endort après 15 min et met 30 à 50 s à se réveiller — inutilisable ici |
| Fly.io | ~**2 $**/mois par instance | plus de crédit gratuit pour les comptes créés après octobre 2024 |

- **Pour** : en ligne en une heure. Certificat, redémarrage et journaux inclus.
- **Contre** : deux services = deux factures. Et la facture suit la
  consommation, donc elle est moins prévisible qu'un VPS.
- **Le piège de Render** : son offre gratuite endort le service. Un produit
  qui met 40 secondes à répondre au premier visiteur donne exactement la
  mauvaise impression à un bêta-testeur. Il faut le palier payant.

### C. Scalingo — la PaaS française

| Conteneur | Région standard |
|---|---:|
| 256 Mo | ~**7,20 €**/mois |
| 512 Mo | ~**14,40 €**/mois |
| 1 Go | ~**28,80 €**/mois |

Une région SecNumCloud existe, plus chère, pour les exigences de souveraineté.

- **Pour** : entreprise française, facturation en euros avec TVA française,
  support en français, hébergement en France. Pour un produit qui publie des
  mentions légales françaises et facturera en euros, ce n'est pas rien.
- **Contre** : environ deux fois le prix d'une PaaS américaine. Deux conteneurs
  de 256 Mo font ~14,40 €/mois.

---

## Ce que je recommande, et pourquoi

**Une PaaS, pas un VPS** — et pour une raison qui vient de l'audit, pas du
confort.

L'audit range juste après l'hébergement trois choses : **le collecteur
d'erreurs, la sauvegarde planifiée, le fournisseur d'email**. Ce sont elles qui
décident si la bêta se passe bien. Les 5 à 10 € que fait gagner un VPS se
paient en heures d'administration système — exactement les heures qu'il faut
mettre ailleurs.

Le VPS redevient le bon choix plus tard, quand la facture aura grossi et que
ces trois-là seront en place.

**Entre les PaaS**, deux réponses défendables selon ce que tu privilégies :

| Si tu veux… | Alors |
|---|---|
| **Le plus vite, le moins cher** | **Railway** — ~10 à 15 $/mois pour les deux services, en ligne dans l'heure. Vérifie qu'une région européenne est disponible sur ton compte : c'est la condition qui décide, à cause de la latence vers la base. |
| **Français, en euros, sur facture française** | **Scalingo** — ~14,40 €/mois pour deux conteneurs de 256 Mo. Plus cher, mais la cohérence avec une entreprise française qui facture en France a une valeur qui ne se lit pas sur la facture d'hébergement. |

Mon avis, si je devais trancher : **Scalingo**. Non pour la technique — Railway
fait aussi bien pour moins cher — mais parce qu'Ignitux publie des mentions
légales françaises, facturera en euros avec TVA, et se destine à des
entrepreneurs français. Un hébergeur français supprime toute question de
transfert de données hors UE avant qu'elle ne se pose, et l'écart est de
l'ordre de 5 €/mois.

---

## Le domaine

Indépendant du choix ci-dessus, et à prendre en même temps :

- **`ignitux.fr` ou `ignitux.com`** — environ 10 à 15 €/an chez un bureau
  d'enregistrement (OVH, Gandi, Cloudflare).
- Il sert **trois fois** : l'adresse du produit, le `FRONTEND_URL` en `https`
  que le préflight exige, et — surtout — **l'adresse d'expédition des
  courriers**. Avec un domaine à toi, tu peux poser SPF, DKIM et DMARC, ce
  qu'expédier depuis `@outlook.com` ne permet pas ; voir
  [`decisions.md`](decisions.md).

---

## Ce que je ferai une fois ton choix fait

1. Les variables d'environnement de production, complètes, avec ce que chacune
   protège.
2. La procédure de déploiement pour le fournisseur retenu.
3. Le passage de `verifier-production.mjs` jusqu'à **0 bloquant**.
4. La sauvegarde planifiée, et le contrôle de restauration qui va avec.

Ce que je ne ferai pas sans que tu le demandes : **ouvrir quoi que ce soit au
public**. Le déploiement reste ta décision.

---

## Avertissement sur les prix

**Ils ont beaucoup bougé en 2026, et tous dans le même sens.** Le coût de la
mémoire a augmenté d'environ 30 % fin 2025, et les hébergeurs l'ont répercuté :

- **Hetzner** a relevé ses tarifs **jusqu'à ×3,1 en juin 2026**, et ses gammes
  CX et CAX apparaissent indisponibles en septembre. Si tu as en tête « Hetzner,
  c'est le moins cher », cette idée date.
- **OVHcloud** a fait passer son VPS-1 d'environ 3,50 € à **7,60 €** au
  1ᵉʳ avril 2026.

**Vérifie chaque prix sur le site du fournisseur avant de t'engager.** Ceux
au-dessus datent du 26 septembre 2026 et viennent de comparatifs, pas des
grilles officielles.

### Sources

- [Hetzner cloud server price increases in 2026 — Northflank](https://northflank.com/blog/hetzner-cloud-server-price-increases)
- [Hetzner Price Adjustment 15 June 2026 — Hetzner Docs](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)
- [OVH vs Scaleway: Pricing & Features Compared (2026) — getdeploying](https://getdeploying.com/ovh-vs-scaleway)
- [Virtual Instances Pricing — Scaleway](https://www.scaleway.com/en/pricing/virtual-instances/)
- [Render vs Railway vs Fly.io: Pricing Compared (2026) — HOSTIM.DEV](https://hostim.dev/blog/render-vs-railway-vs-fly-pricing/)
- [Railway vs Render vs Fly.io for Solo Developers in 2026 — devtoolpicks](https://devtoolpicks.com/blog/railway-vs-render-vs-fly-io-solo-developers-2026)
- [Scalingo Pricing 2026 — G2](https://www.g2.com/products/scalingo/pricing)
- [Best European PaaS Providers in 2026 — sliplane.io](https://sliplane.io/blog/best-european-paas-provider)
