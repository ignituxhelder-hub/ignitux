# Direction « Gravure » — revue de l'intérieur, page par page

Revue des 17 et 18/10/2026 : Tâche 8 du plan `docs/superpowers/plans/2026-10-17-direction-artistique-gravure.md`, puis contre-mesures après la relecture indépendante de la branche.

## Comment

- **Avant** : le site au commit de départ (`5017b7d`, code identique à `3be50f2`). **Après** : la branche `feat/da-cinema`, corrections de relecture comprises (`38db6df`).
- Les deux versions sont construites en production (`next build`), puis parcourues par le même script, avec le même compte jetable (`@ignitux.test`) et les mêmes données.
- Backend local branché sur la base **de test** (`ignitux_test`), e-mails coupés (`MAIL_TRANSPORT=log`). La base de développement n'a pas pu servir : elle est en retard sur le code (colonne `users.cgu_accepted_at` absente), et l'inscription y échoue.
- **Deux séries de mesures :**
  1. **35 pages × 2 largeurs** (390 px téléphone, 1280 px ordinateur), en français, avec un compte presque vide.
     - Pages publiques : accueil, connexion, inscription, mot de passe oublié, CGU, confidentialité, mentions légales.
     - Pages connectées : bureau, offres, projets, profil, compte, constitution, consommation IA, rôles, communauté, place de marché, CRM, banque, comptabilité, facturation, investisseur, agenda, caisse, stocks, véhicules, immobilier, publicité, identité, administration, boutique en ligne, évaluations, une page de projet, son questionnaire et ses finances.
  2. **10 pages × 2 largeurs × 3 langues (fr, en, pt)**, avec des listes remplies.
     - Pages : accueil, connexion, inscription, bureau, projets, CRM, une page de projet, facturation, banque, rôles.
     - Données : 6 projets, dont des titres longs en portugais et un mot de 55 lettres sans espace, plus 4 entreprises et 6 contacts.
     - On mesure la hauteur **de chaque élément de liste**, pas seulement celle de la page. La hauteur de la page entière ne voit rien sur une page plus courte que l'écran.

## Ce qui a été mesuré

| Critère | Résultat |
|---|---|
| (a) La page déborde sur le côté (il faut la faire glisser) | **0**, dans les deux séries, dans les 3 langues |
| (b) Un nouveau texte fait moins de 12 px | **0** |
| (c) Les listes grandissent | **Non**, à une exception voulue près. Les projets gardent 109 px chacun (131 px pour un titre sur deux lignes), avant comme après, en fr/en/pt et sur les deux largeurs. L'exception : sur téléphone, le projet au mot de 55 lettres passe de 109 à 131 px. **Avant, ce titre était coupé** (« …développemen ») ; il revient maintenant à la ligne et se lit en entier. |
| (c') La page entière grandit de plus de 3 % | Seulement l'accueil public (+47 % sur téléphone, +61 % sur ordinateur), qui reçoit la grande scène et « L'histoire » : c'est voulu. Ailleurs, +2,2 % au plus, dû à l'interligne de la police gravée sur les titres. |
| (d) À l'œil : titre coupé, badge illisible, tableau serré | Rien de cassé. Titres de modules gravés en or, cartes au liseré doré, formulaires inchangés. |
| Scène de l'accueil sur ordinateur | Deux colonnes de 210 px et une boussole de 460 px centrée. « La vérité avant tout » tient sur 2 lignes (fr, pt) ou 1 ligne (en) au lieu de 6. |

## Corrections faites pendant le chantier

- **Accueil, colonne de droite** : « La vérité avant tout » s'empilait sur 6 lignes, parce que la colonne de la boussole prenait la largeur naturelle de la photo (810 px). Une première correction (réduire l'image) **n'avait aucun effet**, et la relecture l'a vu. La colonne a maintenant sa propre largeur : `1fr minmax(0, 460px) 1fr`.
- **Facture imprimée** : le titre en or clair aurait été quasiment invisible sur le papier (1,12:1). À l'impression, il reprend la couleur du document.
- **Titres très longs** (nom de projet sans espace) : ils reviennent à la ligne au lieu de sortir du cadre.
- **Lecteurs d'écran** : les mots autour de la boussole étaient lus collés (« DécouvrirConstruireTransmettre »). Ils sont maintenant séparés.
- **« Et si tu n'étais plus seul ? »** : une espace insécable empêche le « ? » de partir seul à la ligne.
- **Pages de compte** : la boussole atténuée aurait débordé de l'écran du téléphone. Elle est limitée à la largeur de l'écran.
- **Bureau** : la boussole en filigrane aurait fait glisser la page entre 481 et ~1 100 px de large, et se serait dessinée par-dessus les icônes. Elle est maintenant calée dans le cadre, sous le contenu.

## Ce qui reste, hors de ce chantier

Ces points existaient déjà avant, ou viennent de l'environnement local :

- **Bureau** : le fond « feu en haut, acier en bas » s'arrête sur un bord rectangulaire visible. C'est identique avant/après.
- **Icônes de la méthode et des modules** : elles gardent leurs couleurs vives d'application. On peut les passer en or et métal dans un chantier à part, si Helder le souhaite.
- **Constats du script `traversee-ecrans`**, sans lien avec le style :
  - inscription : la clé de site du captcha manque au build local (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) ;
  - la création d'un projet par l'interface échoue en local ;
  - la page Profil est presque vide pour un compte neuf.
- **Images** : basse définition. À remplacer par des versions grandes et sans texte quand Helder les aura, dans `frontend/public/images/accueil/`, sans changer le code.
- **Petites améliorations relevées par la relecture et laissées à la décision de Helder** : voir le message de fin de chantier.

Les captures et les mesures restent hors dépôt, dans `.superpowers/captures-da/` (`avant/`, `apres/`, `avant-langues/`, `apres-langues/`, fichiers `*.jsonl`).
