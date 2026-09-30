# Ce qui attend un paiement ou un compte externe

26 septembre 2026. Tout ce qui est bloqué non par du code, mais par une
décision ou un achat côté Helder.

---

## Bloquants absolus

### Hébergement — ~14-15 €/mois

Deux options analysées dans [`hebergement.md`](hebergement.md) :

| Option | Prix | Note |
|---|---:|---|
| **Scalingo** (recommandé) | ~14,40 €/mois | Français, en euros, deux conteneurs de 256 Mo |
| Railway | ~15 $/mois | Plus rapide à démarrer, facturation en dollars |

**Ce que ça débloque** : le domaine, le préflight de production, le
déploiement réel, le service worker (HTTPS obligatoire).

### Domaine — ~10-15 €/an

`ignitux.fr` ou `ignitux.com` chez OVH, Gandi ou Cloudflare.

**Ce que ça débloque** : `FRONTEND_URL` en `https`, SPF/DKIM/DMARC pour
les emails, l'accès public au produit.

### Fournisseur d'email — 0 à ~5 €/mois

Pour envoyer les emails de vérification et de réinitialisation. Le domaine
doit être en place en premier pour configurer SPF/DKIM.

Options gratuites : Brevo (300 emails/jour gratuits), Mailjet. Payant si le
volume monte.

**Ce que ça débloque** : le mot de passe perdu, la vérification d'email,
la confirmation d'inscription.

---

## Bloquants pour les paiements réels

### SIRET / immatriculation — variable

Requis dans `IGNITUX_IDENTIFIANT` pour que les factures soient valides au
sens légal français. `IGNITUX_TVA` suit.

**Ce que ça débloque** : les abonnements payants, la facturation légale,
les mentions légales complètes.

### Fournisseur de paiement — commission ~1,5-2,9 %

Pour les abonnements Entrepreneur et Construction. Le code attend un
`provider` et un `provider_ref` dans la table `subscriptions` ; aucun
webhook n'est encore câblé.

Options courantes : Stripe (UE), Mollie (français), LemonSqueezy.

**Ce que ça débloque** : le revenu, la limite de 360 utilisateurs gratuits.

---

## Optionnel mais recommandé

### Collecteur d'erreurs — 0 à ~10 €/mois

Pour recevoir les alertes quand quelque chose casse en production.
`ERREURS_WEBHOOK_URL` est prêt dans le code ; il suffit d'une URL de
webhook. Options gratuites : Sentry (5 000 erreurs/mois gratuits), webhook
maison vers Slack ou email.

### Sonde de disponibilité — gratuit

UptimeRobot (gratuit) ou Better Uptime. Scrute `/health` et envoie un
email si le serveur ne répond plus.

---

## Résumé

| Quoi | Quand | Coût |
|---|---|---:|
| Hébergement | Avant déploiement | ~14-15 €/mois |
| Domaine | Avant déploiement | ~12 €/an |
| Email SMTP | Avant déploiement | 0-5 €/mois |
| SIRET | Avant paiements | démarches administratives |
| Fournisseur paiement | Avant paiements | 0 + commission |
| Collecteur erreurs | Jour du déploiement | 0-10 €/mois |
| Sonde disponibilité | Jour du déploiement | gratuit |
