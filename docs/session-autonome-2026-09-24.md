# Session autonome du 24 septembre 2026 — l'expérience, pas les routes

Travail mené sans personne devant l'écran, à la demande du porteur. Tout est
vérifié par exécution ; ce qui ne l'est pas est dit comme tel.

> **Huit défauts réels trouvés et corrigés, tous invisibles aux 1 658 tests
> existants — parce qu'aucun d'eux ne regarde le produit avec les yeux de
> quelqu'un qui l'utilise.**
>
> **Et vingt propriétés déjà bonnes ont été éprouvées puis gelées** — RGPD,
> partage d'un projet, silence des refus d'authentification, réinitialisation
> de mot de passe, espace investisseur, facturation. Elles ne corrigent rien : elles empêchent la régression,
> parce que ce sont exactement celles qu'on casse en voulant bien faire.
>
> Deux constats sont laissés au porteur : ce sont des décisions de conception,
> pas des défauts.

---

## 1. Pourquoi les tests ne pouvaient pas les voir

Les suites en place répondent à trois questions, et elles y répondent bien :

| Suite | Question |
|---|---|
| 1 034 tests unitaires | chaque fonction fait-elle ce qu'on attend d'elle |
| 252 tests de bout en bout | les routes répondent-elles contre une vraie base |
| 362 tests frontend | chaque composant rend-il ce qu'il doit |

Aucune ne pose la quatrième : **est-ce qu'une personne peut s'en servir ?**
Ces tests savent où aller. Ils connaissent les identifiants des boutons, les
formes des réponses, les chemins des routes. Un bêta-testeur n'a rien de tout
ça : il a un écran, un doigt, et parfois un téléphone.

Trois harnais ont été écrits pour poser cette question-là.

---

## 2. Les huit défauts corrigés

### 2.1 Le mot de passe en clair dans le navigateur — *sécurité*

Une connexion tentée hors ligne était mise en file d'attente comme n'importe
quelle écriture, et la file conserve le corps de la requête tel quel.
Constaté dans `localStorage` :

```
ignitux.offline → {"pending":[{"path":"/auth/login","method":"POST",
  "body":"{\"email\":\"…\",\"password\":\"MonMotDePasseSecret123!\"}"
```

C'est exactement ce que cette file dit vouloir éviter — elle ne stocke pas le
jeton *« pour qu'un vol du stockage local ne livre pas aussi la session »* — en
pire : un jeton expire, un mot de passe non, et il ouvre souvent la boîte mail
avec.

Deux autres raisons de corriger, qui tiendraient même sans le mot de passe :
une connexion en file **ne peut jamais être rejouée** (le rejeu exige un jeton
qu'on n'obtient qu'en se connectant), et l'écran promettait « 1 action en
attente d'envoi » pour quelque chose qui n'arriverait pas.

Six routes n'entrent plus en file. Vérifié deux fois au navigateur :
`localStorage` contenait le mot de passe avant, **il est vide après**.

### 2.2 Quatorze champs aux réglages du navigateur — *mobile*

Trois écrans — Relations, Facturation, Place de marché — n'utilisaient pas la
classe `.field` que treize autres emploient. Mesure au téléphone :

| | `/login` | `/crm` |
|---|---|---|
| Taille | 319×43 | **177×21** |
| Police | 16px | **13,33px** |
| Padding | 10,4 / 12,8 | **1 / 2** |

Vingt et un points de haut se visent mal au pouce. Mais le vrai défaut est la
police : **sous 16px, iOS zoome tout seul quand on touche le champ.** La page
saute, déborde, il faut repincer. La connexion y échappait avec ses 16px ; ces
trois écrans non. Ce n'est pas une question de goût, c'est un comportement du
système qu'on déclenche ou qu'on évite.

Corrigé par un socle en `:where()` plutôt qu'écran par écran : aucun champ ne
retombe plus sur les réglages du navigateur, y compris ceux qui n'existent pas
encore.

### 2.3 Le seul refus qui ne s'expliquait pas — *honnêteté*

Tous les refus d'Ignitux disent pourquoi : un 403 nomme l'offre qui rouvre la
porte, un 402 dit ce qui a été consommé, un 422 cite l'article. Un seul faisait
exception, et c'était le plus fréquent.

Corrélation entre le statut HTTP et l'écran, avant :

```
clic 1-2 : HTTP 401 → « Email ou mot de passe incorrect. »
clic 3-8 : HTTP 429 → « Une erreur est survenue. »
```

Trois choses fausses dans cette phrase : rien n'est survenu (le produit a
*décidé* de refuser, et c'est un bon refus) ; elle ne dit pas quoi faire alors
que la réponse portait déjà `Retry-After: 60` ; et elle invite à réessayer tout
de suite, ce qui ne débloque rien. La personne clique, relit la même phrase, et
conclut que le site est cassé — au moment précis où elle essaie d'entrer chez
elle.

Après :

```
clic 6 : « Trop de tentatives en peu de temps. Attends 60 secondes avant de
          réessayer — ce n'est pas une panne : cette limite existe pour
          empêcher quelqu'un de deviner un mot de passe en essayant en rafale. »
clic 7 : « Attends 59 secondes »
clic 8 : « Attends 58 secondes »
```

Le décompte est juste parce qu'il lit le temps restant réel, et jamais
« 0 seconde », qui se lirait « réessaie maintenant ».

### 2.4 La file partait, l'écran restait en arrière — *confiance*

Reseau coupé puis rebranché, séquence constatée :

| | |
|---|---|
| tâche côté serveur | **présente** |
| tâche à l'écran sans recharger | absente |
| tâche à l'écran après rechargement | présente |

La file fonctionne ; rien ne prévenait les pages de relire leurs données. Pour
la personne, « 1 action en attente » disparaît et sa tâche n'est toujours pas
là : la conclusion raisonnable est qu'elle a été perdue. Elle la ressaisit, et
se retrouve avec un doublon.

On ne recharge pas à sa place — un rechargement d'office effacerait un
formulaire à demi rempli, et le moment où l'on retrouve le réseau est
précisément celui où l'on écrivait. Le bandeau dit maintenant :

```
1 action(s) envoyée(s). Cet écran date d'avant la coupure et ne les montre
pas encore.  [Rafraîchir l'affichage]
```

### 2.5 Une course de numérotation rendue comme une panne — *droit*

Huit factures créées exactement en même temps contre la vraie base :
**quatre réussies, quatre en HTTP 500.** Mesuré avec un compte neuf, un
compteur vierge et une fenêtre de limiteur vierge, pour qu'il ne reste aucun
doute sur la cause.

Le défaut n'est pas la collision — elle est prévue, et voulue. Le numéro se
calcule depuis le maximum existant, la contrainte unique tranche, et mieux
vaut échouer que produire deux factures portant le même numéro, ce que la loi
ne pardonne pas.

Le défaut est que **les réessais repartaient tous ensemble**. Huit requêtes
qui lisent le même maximum, échouent ensemble, puis relisent ensemble se
retrouvent au même endroit au coup suivant : le réessai reproduisait la course
au lieu de la défaire. Monter le plafond seul n'aurait fait que retarder
l'échec.

Corrigé par un recul tiré au hasard entre les essais — c'est le hasard qui
fait le travail, pas la durée. Et si le numéro reste imprenable au bout de
huit essais, le bon mot n'est toujours pas « erreur » : c'est un conflit, il
est passager, la personne n'a rien à réparer. Désormais **409**, avec la phrase
qui dit quoi faire et pourquoi le produit refuse plutôt que d'inventer un
numéro.

| | avant | après |
|---|---|---|
| 8 créations simultanées | 4 créées, **4 en 500** | **8 créées, 0 erreur** |
| 10 créations simultanées | — | 8 créées, 2 refusées en 409 |
| numérotation | — | séquences 1→8 contiguës, aucun doublon |

### 2.6 L'image Docker ne pouvait pas démarrer — *déploiement*

`@prisma/client` et `dotenv` étaient rangés en `devDependencies`. L'image
d'exécution installe `npm ci --omit=dev`, et `dist/` importe les deux :

```
Cannot find package 'dotenv' imported from /app/dist/main.js
```

**L'image se construisait parfaitement. Elle ne démarrait pas.**

Et rien ne pouvait le voir : le développement installe tout, les 1 658 tests
tournent dans ce même environnement complet, et le job CI des images s'arrête
à la construction — son propre commentaire le disait, *« on construit sans
pousser »*.

Prouvé dans les deux sens en simulant une installation de production : avant,
l'import échoue ; après, le serveur répond **HTTP 200 sur `/health`** sans une
seule devDependency. Deux garde-fous depuis : un contrôle qui exige que tout ce
que `dist/` importe soit en `dependencies`, et **la CI démarre maintenant
l'image** au lieu de seulement la construire.

### 2.7 La production ne pouvait pas démarrer non plus — *configuration*

Le schéma zod ne déclarait pas `IGNITUX_RAISON_SOCIALE`, `_ADRESSE`, `_EMAIL`.
Zod retire les clés inconnues : le contrôle de production les recevait vides et
refusait de démarrer en annonçant *« est vide. Ignitux ne l'invente pas —
renseigne-la »*, **devant un fichier où elles sont renseignées.**

```
avant : 4 refus au démarrage, dont 3 faux
après : 1 refus — FRONTEND_URL, qui attend un domaine
```

Et mon propre outil de déploiement à blanc interrogeait l'environnement brut
au lieu du chemin réel : il annonçait « 1 bloquant » quand le serveur en
comptait quatre. **Un contrôle à blanc plus optimiste que la réalité est une
permission de déployer quelque chose qui ne démarrera pas.** Les deux empruntent
désormais le même schéma.

Le test « ne reproche rien à une configuration saine » existait et passait : il
donne au contrôle un objet **brut**, jamais celui que le produit lui donne.

### 2.8 Une correction de capital ignorée le jour même — *argent*

`occurred_at` est saisi par la personne, et un champ « date » y met minuit. Deux
changements enregistrés le même jour portent donc la même valeur, et la lecture
gardait le dernier élément **itéré** — l'ordre que la base voulait bien rendre.

```
un détenteur, deux événements le même jour : 4000 puis 10000
lecture actuelle          → 4000   (le PREMIER)
avec départage created_at → 10000  (la correction)
```

Le produit retenait la valeur périmée. Quelqu'un qui corrige sa répartition le
jour même voyait sa correction ignorée, en silence — et la garantie des 51 % du
porteur se calculait sur le mauvais chiffre.

---

## 3. Ce qui va bien, et qu'il faut dire aussi

Un rapport qui ne liste que des défauts donne une fausse image. Ces
vérifications-là sont passées du premier coup :

- **La mise en page tient au téléphone** : aucun débordement horizontal sur
  aucun des 21 écrans, à 390 points de large.
- **Aucun problème de nom accessible** : chaque champ est étiqueté, chaque
  bouton porte un intitulé, chaque image a son `alt`. Un lecteur vocal n'est
  muet nulle part.
- **Rien de cliquable hors clavier** : aucun `div` rendu cliquable sans être
  focalisable, le défaut d'accessibilité le plus courant.
- **Le parcours se traverse** : de l'arrivée sur le site jusqu'aux offres, en
  ne cliquant que sur ce qu'on voit, sans jamais taper une adresse. 0 critique,
  0 majeur.
- **Les contrastes avaient déjà été travaillés** : `globals.css` porte des
  ratios calculés à la décimale et des couleurs corrigées pour les atteindre.
  Ils n'ont pas été re-mesurés : le refaire produirait du bruit, pas de
  l'information.
- **Le référentiel de conformité se sème tout seul** au démarrage du serveur.
  `ignitux_prod` se remplira au premier lancement, sans intervention.

---

## 3 bis. Ce qui était déjà bon, et qui ne pourra plus se casser en silence

Six domaines ont été joués à la main de bout en bout, trouvés corrects, puis
figés en vingt contrôles dans `validation-reelle.mjs`. Aucun n'a demandé de
correction — ce qui est le meilleur résultat possible, à condition de le
prouver plutôt que de le supposer.

### Le RGPD tient

L'écran `/account` est atteignable par « Tous mes outils › Mon compte ». Il
propose « Télécharger mes données » et « Voir ce qui sera supprimé ».

L'export rend un fichier nommé, en huit sections, contenant l'email et les
projets. Il cite les CGU (§2.2) pour qu'on puisse comparer le promis au rendu.
Il prévient la personne qu'elle devient **gardienne des données de tiers**
qu'elle a saisies. Et — c'est rare — il liste ce qu'il **n'inclut pas**, avec
le motif : les jetons de sécurité par exemple, parce que *« te le remettre ne
t'apprendrait rien et reviendrait à recopier du matériel de sécurité dans un
fichier qui circulera par email ou par clé USB »*. Ni mot de passe ni empreinte
dedans.

La suppression refuse un mauvais mot de passe sans abîmer le compte ; avec le
bon, elle efface vraiment — compte, projets, tâches et souvenirs à zéro en
base, et les lignes du journal des coûts ne portent plus l'identifiant. **La
dépense reste dans les totaux, la personne disparaît.**

### Le partage se referme

| | |
|---|---|
| avant l'invitation | lecture **404**, écriture **404** |
| après l'invitation | lit 200 · écrit 404 · supprime 404 · invite 404 |
| après le retrait | lecture **404** |

404 et non 403, et c'est le bon mot : un 403 confirmerait que le projet existe,
ce qui est déjà un renseignement. Le collaborateur est en lecture seule. Et le
troisième fait est celui qu'on oublie de vérifier : **inviter une fois ne
revient pas à inviter pour toujours.**

### Les refus n'apprennent rien

Un message qui distingue « cet email n'existe pas » de « ce mot de passe est
faux » transforme la page de connexion en annuaire.

| Route | Distingue un compte existant ? |
|---|---|
| Connexion | **non** — même 401, même phrase |
| Mot de passe oublié | **non** — même 204, même corps |
| Inscription | oui — 409 « Un compte existe déjà » |

Les deux qui comptent sont muettes. L'inscription parle, et c'est assumé : se
taire enfermerait dehors quelqu'un qui a simplement oublié qu'il s'était
inscrit, et la limite de cinq par minute borne l'usage détourné. C'est le
compromis que fait tout le monde.

### La facturation tient le droit

Une facture est un document qui engage. Trois règles y sont des obligations et
non des préférences, et toutes trois se cassent en silence.

**L'arrondi se fait à la ligne, jamais au total.** Vérifié par un recalcul
indépendant sur trois lignes choisies pour ne pas tomber rond : 8 633 + 1 562 =
10 195 centimes, sans un seul flottant. Arrondir au total produirait des écarts
d'un centime que le client trouve en recalculant — et une facture qui ne tombe
pas juste se conteste.

**Un trop-perçu reste négatif.** Après un versement excédentaire, le reste dû
passe sous zéro au lieu d'être ramené à zéro : un trop-perçu masqué est un
trop-perçu jamais remboursé.

**Un document émis ne bouge plus.** Ni modification, ni suppression, ni retour
en brouillon — et le refus nomme le remède : *« Pour le corriger, crée un avoir
qui le référence. »* Sans cette phrase, la personne serait bloquée devant une
règle qu'elle ne comprend pas.

### L'espace investisseur compte juste, et ne montre pas trop

Un rôle entier, l'un des dix profils de bêta-testeurs, que personne n'avait
parcouru. Choisir « Investisseur » mène directement à `/investisseur`, dont
l'écran vide s'explique et propose une suite :

> *« Aucun investissement n'est encore enregistré à ton nom. Te déclarer crée
> ton identifiant d'investisseur : c'est lui que tu communiqueras au porteur
> d'un projet pour qu'il puisse enregistrer ton apport. **Cela n'engage rien
> et n'investit rien.** »*

Le parcours complet tient — déclaration, ouverture du financement par le
porteur, apport enregistré — et le portefeuille compte juste :

```
investedCents  500000
netCents      -500000
```

**Le net est négatif, et c'est le bon chiffre** : cinq mille euros sont sortis,
rien n'est revenu. Une implémentation naïve afficherait zéro, ou compterait
l'apport comme un actif — une histoire plus agréable et fausse.

Et la propriété la plus facile à casser sans y penser : **investir n'ouvre pas
le projet**. Quelqu'un qui met 5 000 € a toutes les raisons de vouloir le lire,
mais le porteur ne lui a pas ouvert son espace de travail — il a reçu son
argent. Notes, souvenirs, concepts et tâches restent à lui. Vérifié : lecture
directe 404, et la description ne transite pas par le portefeuille.

### La réinitialisation de mot de passe marche — seul l'envoi manque

Jeton de 64 caractères valable une heure, ancien mot de passe refusé après
coup, nouveau accepté, et **le même jeton rejoué est refusé**. Le journal écrit
d'ailleurs le lien en clair sous un avertissement explicite (« Email NON
ENVOYÉ, transport log ») : un testeur bloqué n'est pas perdu, le lien se
récupère à la main. Ce n'est pas tenable à l'échelle, mais ce n'est pas une
impasse.

Ce qui ne se prouve pas depuis le harnais — le parcours complet dépend d'un
email — est marqué **non prouvé**, avec sa cause et sa conséquence. Le jour où
`MAIL_TRANSPORT` passera à `smtp`, la même ligne deviendra une vérification
au lieu d'un aveu.

---

## 4. Les deux constats laissés au porteur

Ce ne sont pas des défauts, ce sont des décisions — et elles appartiennent à
celui qui a dessiné le produit.

**Les libellés du tableau de bord à 11,2px sur téléphone.** « Étincelle »,
« Tâches », « Étapes » ; les pastilles d'état à 10,88px. Les chiffres sont
grands, les mots qui disent ce qu'ils signifient sont petits — sur l'écran où
l'on passe son temps, pour un public de 30 à 60 ans. C'est un choix explicite
(`fontSize: '0.7rem'` en clair dans `TableauDeBord`), pas un accident de
cascade.

**La tuile « Tâches » annonce le vide sans offrir de le combler.** Elle affiche
« Aucune tâche encore » ; le bouton pour en ajouter existe, mais derrière
« Vue avancée », dont le libellé ne l'annonce pas. Une tuile qui constate un
vide sans proposer de le combler est un petit cul-de-sac, même quand la sortie
existe ailleurs. La vue simple par défaut est un bon choix — reste à décider si
cette tuile mérite une exception.

---

## 5. Les trois harnais, et ce qu'ils ont coûté

| Commande | Ce qu'elle demande |
|---|---|
| `node scripts/traversee-ecrans.mjs [--telephone]` | chaque écran s'ouvre-t-il proprement, se lit-il, s'entend-il, se tape-t-il |
| `node scripts/parcours-premier-utilisateur.mjs [--telephone]` | peut-on traverser le produit en ne cliquant que sur ce qu'on voit |
| `node backend/scripts/verifier-production.mjs` | cette configuration démarrerait-elle, et servirait-elle quelqu'un |

**Ils se sont trompés dix fois avant de servir, et c'est la partie la plus
instructive de la session.** Chaque erreur disait la même chose : *le harnais
mesurait sa propre ignorance du produit, et la présentait comme un défaut.*

- Il cherchait « Créer » ; le bouton s'appelle « Commencer ».
- Il cherchait un lien vers le projet ; le produit l'ouvre déjà.
- Il chronométrait ses propres `waitForTimeout` — « création : 6,7 s » dont 4 s
  de sommeil écrites par moi.
- Il saisissait la tâche dans le dernier champ de la page, soit « Montant (€) »,
  puis concluait que la tâche n'apparaissait pas.
- Il déclarait les offres injoignables sans ouvrir « Tous mes outils », un menu
  de onze liens où elles figurent.
- Il appelait « cul-de-sac » l'écran des rôles, fait de cases à cocher.
- Il mesurait une case de 13×13 sans voir le `<label>` de 319×96 qui l'entoure —
  vérifié en tapant sur le texte, qui coche la case.
- Puis, en corrigeant, il a mesuré le libellé « EMAIL » de 319×20 au lieu du
  champ de 319×43 qu'il surmonte : le même piège, dans l'autre sens.
- Il a rendu **treize** constats majeurs pour une seule connexion bloquée par
  CORS, et **dix-huit** pour un bouton « ← Retour » présent sur dix écrans.
- Et le socle CSS, écrit d'abord avec trois `:not()`, est passé devant
  `.field input` et a **rétréci** les champs de connexion de 43 à 38 points :
  une correction qui abîmait précisément ce qui allait bien.

Chaque garde-fou ajouté depuis existe à cause de l'une de ces erreurs. Les deux
règles qui en sortent :

1. **Un contrôle qui ne trouve rien peut simplement être cassé.** Les deux
   contrôles d'accessibilité ont donc été éprouvés sur des pages fabriquées
   portant des défauts connus : ils trouvent les défauts plantés, ignorent les
   cas corrects. Sans cette preuve, « aucun problème » ne voudrait rien dire.
2. **Un rapport qui multiplie une cause par le nombre d'écrans fait perdre le
   temps qu'il prétend faire gagner.** Les harnais s'arrêtent maintenant à la
   première étape bloquée, et regroupent les constats par élément.

---

## 6. État à la fin de la session

```
Backend unitaires        1 044 verts   (77 fichiers)
Backend bout en bout       252 verts   (15 fichiers)
Frontend                   362 verts   (39 fichiers)
Validation réelle          64 vérifiés · 0 échec · 1 non prouvé
Simulation dix profils     0 critique · 0 majeur · 0 moyen · 0 mineur
Traversée 21 écrans        0 constat au bureau
Parcours complet           0 critique · 0 majeur · 1 moyen
```

La validation réelle est passée de **41 à 61 contrôles** : vingt de plus, tous
sur des propriétés qui existaient déjà et que rien ne protégeait. Le seul
« non prouvé » restant est le parcours complet du mot de passe oublié, qui
attend un fournisseur d'email — et il le dit.

**Dépense IA du mois : 2,16 € sur 50 € de plafond**, 40 appels.

Corrigé aussi : un test intermittent (`ReadinessService`, 5 232 ms contre un
délai de 5 000) qui aurait échoué au hasard en CI. Un échec une fois sur quatre
apprend à relancer sans lire — et le jour où l'échec est réel, on le relance
aussi.

Rien n'a été déployé. Rien ne sera déployé sans que tu le demandes.

---

## 7. Ce qui reste, et qui ne dépend pas de moi

Inchangé depuis `validation-finale.md` : **il n'y a ni hébergeur, ni domaine,
ni fournisseur d'email, ni fournisseur de paiement.** C'est le seul obstacle
entre Ignitux et une bêta privée, et les trois premiers se règlent en une
soirée.

Le contrôle de déploiement à blanc le dit en une commande :

```
node backend/scripts/verifier-production.mjs .env.production
→ 1 bloquant : FRONTEND_URL n'est pas en https, faute de domaine
```
