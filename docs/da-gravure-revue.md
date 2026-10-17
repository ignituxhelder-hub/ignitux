# Direction « Gravure » — revue de l'intérieur, page par page

Revue du 17/10/2026, Tâche 8 du plan `docs/superpowers/plans/2026-10-17-direction-artistique-gravure.md`.

## Comment

- **Avant** : le site au commit de départ (`5017b7d`, code identique à `3be50f2`). **Après** : la branche `feat/da-cinema` (Tâches 1 à 7).
- Les deux versions ont été construites en production (`next build`) et parcourues par le même script, avec le même compte jetable (`@ignitux.test`) et le même projet, en 390 px (téléphone) et en 1280 px (ordinateur).
- Backend local branché sur la base **de test** (`ignitux_test`), e-mails coupés (`MAIL_TRANSPORT=log`). La base de développement n'a pas pu servir : elle est en retard sur le code (colonne `users.cgu_accepted_at` absente), et l'inscription y échoue.
- **35 pages × 2 largeurs = 70 mesures.** Pages publiques : accueil, connexion, inscription, mot de passe oublié, CGU, confidentialité, mentions légales. Pages connectées : bureau, offres, projets, profil, compte, constitution, consommation IA, rôles, communauté, place de marché, CRM, banque, comptabilité, facturation, investisseur, agenda, caisse, stocks, véhicules, immobilier, publicité, identité, administration, boutique en ligne, évaluations, plus une page de projet, son questionnaire et ses finances.

## Ce qui a été mesuré

| Critère | Résultat |
|---|---|
| (a) La page déborde sur le côté (il faut la faire glisser) | **0 page**, avant comme après |
| (b) Un nouveau texte fait moins de 12 px | **0** |
| (c) La page grandit de plus de 3 % | **1 page, voulu** : l'accueil public (+47 % sur téléphone, +61 % sur ordinateur), qui reçoit la grande scène et « L'histoire ». Ailleurs, +2,2 % au plus (questionnaire 978 → 1000 px, constitution +1,3 %, CGU et confidentialité +1 à 2 %), dû à l'interligne de la police gravée sur les titres. |
| (d) À l'œil : titre coupé, badge illisible, tableau serré | Rien de cassé. Titres de modules gravés en or, cartes au liseré doré, formulaires inchangés. |

## Corrections faites pendant le chantier

Ces défauts ont été repérés sur les captures et corrigés avant la revue :

- **Accueil, colonne de droite** : « La vérité avant tout » s'empilait sur 4 lignes. La boussole passe de 520 à 460 px, et les mots reviennent à la ligne de façon équilibrée.
- **« Et si tu n'étais plus seul ? »** : le « ? » partait seul à la ligne. Une espace insécable a été ajoutée.
- **Pages de compte** : la boussole atténuée aurait débordé de l'écran du téléphone. Elle est limitée à la largeur de l'écran.
- **Bureau** : la boussole en filigrane, décalée vers la droite, aurait fait glisser la page entre 481 et ~1 100 px de large, et se serait dessinée par-dessus les icônes. Elle est maintenant calée dans le cadre, sous le contenu.

## Ce qui reste, hors de ce chantier

Ces points existaient déjà avant, ou viennent de l'environnement local :

- **Bureau** : le fond « feu en haut, acier en bas » s'arrête sur un bord rectangulaire visible. C'est identique avant/après.
- **Icônes de la méthode et des modules** : elles gardent leurs couleurs vives d'application (rouge, vert, bleu, violet). La spec ne les touche pas. On peut les passer en or et métal dans un chantier à part, si Helder le souhaite.
- **Constats du script `traversee-ecrans`**, sans lien avec le style :
  - inscription : la clé de site du captcha manque au build local (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) ;
  - la création d'un projet par l'interface échoue en local ;
  - la page Profil est presque vide pour un compte neuf.
- **Images** : basse définition. À remplacer par des versions grandes et sans texte quand Helder les aura, dans `frontend/public/images/accueil/`, sans changer le code.

Les captures restent hors dépôt, dans `.superpowers/captures-da/` (`avant/`, `apres/`, `mesures.jsonl`).
