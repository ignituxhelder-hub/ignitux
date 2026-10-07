# Index de data room

Classement : A. Prêt · B. À créer · C. À vérifier · D. Confidentiel · E. Juridique · F. Financier ·
G. Technique.

| Document | Catégorie(s) | Statut |
|---|---|---|
| Bible IGNITUX (`docs/IGNITUX-la-bible.pdf`) | A, G | Prêt, mais **non versionné dans Git** — à corriger (voir `10-risques-et-reponses.md`) |
| Ce dossier investisseur (`docs/investisseurs/`) | A | Prêt (ce document même) |
| Architecture technique (`docs/architecture.md`) | A, G | Prêt, à rafraîchir (contient des chiffres de constitution obsolètes — voir `04-dossier-investisseur.md` §1.6) |
| Modèle économique (`docs/modele-economique.md`, `PRICING.md`) | A, F | Prêt, avec l'incohérence de plafond IA à trancher (`05-modele-economique.md`) |
| Registre de traitements RGPD (`docs/registre-de-traitements.md`) | A, E | Prêt |
| Résultats de tests | C | À produire une exécution propre et datée avant tout envoi (voir `07-technologie.md` — 10 échecs de timeout observés le 30/09/2026, à ré-exécuter sur une machine de référence) |
| Démonstration produit (vidéo ou accès live) | B | À créer — nécessite un environnement de démo stable (hébergement) |
| Roadmap (`docs/IGNITUX-la-bible.pdf` ch. 9, `docs/ignitux-os.md`, `docs/vision-v2-analyse.md`) | A | Prêt, à consolider avec les 3 chantiers en avance (voir `06-roadmap.md`) |
| Prévisions financières chiffrées | B | À créer — nécessite les données listées dans `22-informations-a-fournir-par-le-fondateur.md` |
| Statuts de société | B, E, C | Statut réel inconnu de ce dépôt — **[À VÉRIFIER auprès du fondateur]** |
| Propriété intellectuelle (dépôt de marque, etc.) | B, E, C | **[À VÉRIFIER auprès du fondateur]** |
| Contrats (fournisseurs, prestataires) | C, E | Aucun trouvé dans le dépôt — **[À VÉRIFIER]** |
| Licences logicielles utilisées | C, G | Non auditées dans le cadre de cette mission — à faire séparément si nécessaire |
| Sécurité (revues internes, correctifs) | A, G, D | Deux revues de sécurité documentées dans les branches de travail isolées (voir `04-dossier-investisseur.md` §1.11) — contenu technique, à ne partager qu'en due diligence avancée |
| RGPD — export et suppression de compte | A, G | Prêt, code testé (`backend/src/users/user-data.service.ts`) |
| Fournisseurs (hébergement, email, paiement, IA) | C, F | Aucun encore engagé — choix en attente (`docs/en-attente-paiement.md`) |
| Coûts IA réels | A, F | Prêt, mesuré (`PRICING.md`), avec le point de vigilance sur le plafond à 10 % |
| Comptes de l'entreprise | B, D, F | **[À DÉFINIR — Fondateur]**, hors périmètre du dépôt de code |
| Cap table | B, D, E, F | **[À DÉFINIR — Fondateur]**, absente du dépôt |
| Documentation juridique du modèle de participation (51/49 au départ) | B, E | N'existe pas encore — suivi technique seulement, pas de contrat (voir `10-risques-et-reponses.md` point 1) |
| Avis juridique sur le statut réglementaire du module Financement & Investisseurs | B, E | **À produire en priorité** — voir `10-risques-et-reponses.md` point 1 |

## Ce qui est confidentiel et ne doit pas être envoyé avant un accord de confidentialité (NDA)

- Le détail des deux failles de sécurité corrigées dans la branche « boutique en ligne » (le contenu
  précis de la vulnérabilité, pas seulement le fait qu'une revue a eu lieu).
- Tout accès direct au code source complet, avant un stade avancé de discussion.
- Toute donnée personnelle réelle si une bêta a déjà commencé (à croiser avec la question 8 de
  `08-traction-et-validation.md`).
