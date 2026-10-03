# Générateur « Statuts » — brouillon des statuts de l'entreprise

3 octobre 2026. Design validé avec Helder en session de brainstorming.

Sous-projet 2 sur 4 du chantier « Ignitux crée l'entreprise » (voir
`docs/superpowers/specs/2026-09-28-generateur-former-design.md`, sous-projet
1/4 « Former », déjà construit). Les deux autres — préparation du dossier de
dépôt et démarches annexes (capital, annonce légale), rattachement du projet
à une entreprise immatriculée — restent des chantiers séparés, non traités
ici.

## Pourquoi

Une fois que Former a recommandé une forme juridique, rien aujourd'hui ne
produit le document juridique fondateur de l'entreprise : les statuts. C'est
un document réel qui engagera l'entreprise une fois déposé — pas un contenu
informatif de plus.

## Décision validée avec Helder : rôle du générateur

**Brouillon structuré à valider**, jamais présenté comme prêt à déposer sans
relecture — même esprit que Former (« aide à la décision, jamais une
décision prise à la place de la personne »). Une erreur dans un capital ou
une répartition de parts a des conséquences réelles ; le document reste donc
une base à corriger et, idéalement, à faire valider par un professionnel
avant tout dépôt.

## Point de cadrage juridique : les statuts ne concernent pas toutes les formes

Seules les formes qui créent une personne morale distincte ont des statuts :
**EURL, SASU, SARL, SAS**. La micro-entreprise et l'EI n'ont pas de
personnalité morale séparée de la personne — il n'y a rien à constituer. Le
générateur ne s'active donc que pour ces quatre formes ; pour les deux
autres, l'écran explique pourquoi plutôt que d'afficher un bouton qui ne
mènerait nulle part.

## Ce que ce lot construit

1. Une **confirmation de forme juridique** sur le projet : jusqu'ici, Former
   ne produit qu'une recommandation — rien ne capture que la personne l'a
   retenue, ou a choisi autre chose. Un projet a maintenant une forme
   juridique confirmée, pré-remplie par la recommandation de Former,
   modifiable.
2. Un **générateur de statuts** : un formulaire ciblé (ce que le projet ne
   sait pas encore : capital, associés et leurs parts, siège social, durée
   de la société), un seul appel à Claude, un brouillon structuré en
   retour.
3. Un **cycle de vie brouillon → retenu** : modifiable et régénérable tant
   que brouillon ; verrouillé une fois retenu (c'est cette version que le
   sous-projet « dépôt du dossier » reprendra plus tard).
4. Un **export PDF à la demande**, généré au moment du téléchargement.

## Ce que ce lot ne construit pas

- Aucun dépôt réel — ça reste le sous-projet suivant, qui viendra
  *consommer* la version retenue des statuts produite ici.
- Aucun éditeur par article : le texte vit comme un seul bloc structuré,
  édité comme tel. Un éditeur article par article serait un vrai chantier
  d'interface pour un besoin qui reste à prouver — personne n'a encore
  demandé mieux qu'une zone de texte éditable.
- Aucune signature/mandat sur les statuts eux-mêmes dans ce lot : le mandat
  déjà construit (voir `docs/superpowers/specs/2026-09-30-identite-mandats-design.md`)
  autorise Ignitux à déposer un dossier ; il ne porte pas sur le contenu des
  statuts. L'articulation entre « statuts retenus » et « mandat signé » est
  le travail du sous-projet « dépôt du dossier », pas de celui-ci.
- Aucune gestion d'historique de versions : une ligne par projet, pas un
  journal de brouillons successifs. Si une refonte complète est nécessaire
  après avoir retenu une version, ça passe par une itération future, pas
  par ce lot.

## Portée v1

### Confirmation de la forme juridique

- Nouveau champ sur le projet : `confirmed_legal_form`, une des six formes
  que Former considère (`micro-entreprise`, `EI`, `EURL`, `SASU`, `SARL`,
  `SAS`) — la validation ne se limite pas aux quatre formes « société »,
  puisque confirmer qu'on reste en micro-entreprise ou en EI est une
  information utile en soi, même si ça ne déclenche pas le générateur de
  statuts.
- Pré-rempli avec la recommandation la plus récente de Former si elle
  existe ; la personne peut la confirmer telle quelle ou choisir une autre
  forme.
- Ce champ et son point d'entrée (confirmer/modifier) vivent dans le module
  `projects` existant — c'est un attribut de projet, pas un sous-système à
  part qui justifierait son propre module.

### Générateur de statuts

- Disponible uniquement quand `confirmed_legal_form` est EURL, SASU, SARL
  ou SAS. Pour les deux autres formes, la section explique pourquoi les
  statuts ne s'appliquent pas.
- Formulaire préalable à la génération, un seul aller simple (pas de
  dialogue multi-tours) :
  - Capital social (en euros, converti en centimes pour le stockage).
  - Associés : nom complet + part en pourcentage, un seul associé à 100 %
    pour EURL/SASU, plusieurs pour SARL/SAS. La somme des parts doit faire
    100 % — contrôle avant l'appel à Claude, pas après.
  - Siège social (adresse).
  - Durée de la société en années (la pratique française plafonne
    généralement à 99 ans ; proposer 99 comme valeur par défaut suggérée,
    sans imposer de plafond strict côté validation — ce n'est pas à
    Ignitux de faire respecter une règle de droit des sociétés par une
    contrainte de formulaire).
- Un seul appel à Claude produit le texte structuré complet (articles
  numérotés), à partir de la forme confirmée et du formulaire — même
  principe que Former : un appel, pas d'itération automatique.
- Statuts possibles : `brouillon` (modifiable, régénérable) → `retenue`
  (verrouillé). Retenir une version déjà retenue est refusé explicitement
  (le même principe que la revue d'identité : une décision ne se reprend
  pas silencieusement).
- Modifier le capital, les associés ou la forme confirmée après génération
  n'actualise pas automatiquement le texte déjà généré — un avertissement
  explicite le dit, la personne régénère si elle veut que le texte suive.

### Export PDF

- Généré à la demande au moment du téléchargement, jamais stocké comme
  source de vérité — le texte structuré en base reste la seule version qui
  compte.
- Bibliothèque `pdfkit` (pure JS, aucune dépendance binaire) — cohérent
  avec le reste du projet qui évite les dépendances système lourdes.

## Modèle de données (aperçu)

- `projects.confirmed_legal_form` : nouvelle colonne, nullable, une des six
  valeurs de forme juridique.
- `company_bylaws` : une ligne par projet (`project_id` unique), `legal_form`
  (copie de la forme confirmée au moment de la génération — pour que le
  document garde une trace de ce pour quoi il a été écrit, même si la
  confirmation change ensuite), `capital_cents`, `head_office`,
  `duration_years`, `content` (texte structuré complet), `status`
  (`brouillon` | `retenue`), `finalized_at`.
- `bylaw_associates` : table fille de `company_bylaws`, nom complet + part
  en pourcentage par associé.

Le détail exact des colonnes, types, et index sera fixé dans le plan
d'implémentation, comme pour Former et Identité/Mandats.

## Backend (aperçu)

Nouveau module `backend/src/statuts/`, sur le patron déjà établi par
`backend/src/identite/` (controller/service/dto/spec) :

- La confirmation de forme juridique est ajoutée au module `projects`
  existant (un endpoint ou un champ sur un endpoint de mise à jour déjà
  là — à préciser dans le plan).
- `POST /statuts` — crée la ligne `brouillon` à partir du formulaire et
  d'un seul appel Claude.
- `PATCH /statuts/:id` — édition directe du texte, tant que `brouillon`.
- `POST /statuts/:id/regenerer` — relance l'appel Claude avec des réponses
  de formulaire mises à jour, tant que `brouillon`.
- `POST /statuts/:id/retenir` — verrouille, refuse si déjà `retenue`.
- `GET /statuts/:id/pdf` — génère et renvoie le PDF à la volée.
- `GET /statuts?projectId=` — la ligne du projet, si elle existe.

## Frontend (aperçu)

- Nouvelle section sur la page projet, à la suite de la section mandat
  (sans s'y mêler, même principe déjà appliqué pour Identité/Mandats) :
  1. Confirmation de la forme juridique (pré-remplie, modifiable).
  2. Si forme à personne morale et aucune ligne `company_bylaws` : le
     formulaire de génération.
  3. Si une ligne existe : le texte affiché dans une zone éditable, avec
     Régénérer / Marquer comme retenu / Télécharger en PDF.
  4. Si forme sans personne morale (micro-entreprise, EI) : un message
     expliquant pourquoi les statuts ne s'appliquent pas, pas un bouton
     désactivé sans explication.

## Garde-fous à prévoir

- Somme des parts des associés = 100 %, vérifiée avant l'appel Claude.
- Capital strictement positif.
- Retenir une version déjà retenue : refusé explicitement.
- Changer la forme confirmée ou les paramètres du formulaire après
  génération : avertissement, pas de régénération automatique.
- Générer des statuts pour une forme sans personne morale : refusé
  explicitement côté backend, pas seulement caché côté frontend — un appel
  direct à l'API ne doit pas pouvoir produire des statuts de
  micro-entreprise.

## Risques et limites connues

- Comme pour Former, ce générateur produit une aide à la décision, pas un
  acte juridique validé par un professionnel — ce n'est pas nouveau par
  rapport à Former, mais les statuts engagent plus directement que la
  simple recommandation d'une forme. Le bandeau de l'écran doit le dire
  aussi clairement que pour Former, sinon plus.
- Le texte généré par Claude pour une forme juridique donnée n'est pas
  vérifié par un juriste avant ce lot — même réserve que celle déjà
  consignée dans `docs/decisions.md` pour le mandat et la vérification
  d'identité. Ce point rejoint les mêmes risques juridiques déjà notés, pas
  un nouveau risque indépendant.
