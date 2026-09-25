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

---

## 8. Suite de la même session — l'article 16, et le dernier trou silencieux

Écrit après coup, le même jour. Trois chantiers, dans l'ordre où ils se sont
imposés l'un l'autre.

### 8.1 L'application démarre sans réseau

Tu avais relevé, à juste titre, que « Offline First » n'était pas tenu : cache
de lecture, file d'écriture, synchronisation — mais **pas de service worker**,
donc l'application ne s'**ouvrait** pas sans connexion. Un rechargement sans
réseau donnait la page d'erreur du navigateur.

C'est fait : `frontend/public/sw.js`.

- **Les navigations passent par le réseau d'abord**, le cache seulement s'il ne
  répond pas. C'est l'inverse du réflexe habituel, et c'est voulu : un worker
  qui sert le cache d'abord fige les gens sur une version morte, parfois des
  jours. C'est la panne la plus pénible qu'un service worker sache produire.
- **Les ressources de Next passent par le cache d'abord** : leur nom contient
  leur empreinte, donc les servir depuis le cache est exact.
- **L'API n'est jamais interceptée.** Le produit a déjà son cache de lecture et
  sa file d'écriture ; deux caches pour la même donnée finissent toujours par
  se contredire, et celui qu'on oublie est celui qui ment.
- **Pas de `skipWaiting()`.** Remplacer le worker sous un onglet ouvert, au
  milieu d'une saisie, produit des incohérences que personne ne sait
  reproduire.

**L'écran jamais visité a demandé trois essais**, et les deux ratés valent
d'être gardés :

1. Servir le HTML d'une page `/hors-ligne` sous l'adresse d'un autre écran :
   Next hydrate alors une route qui ne correspond pas au document,
   l'hydratation échoue, et le produit affiche « Quelque chose a échoué de
   notre côté, pas du tien ». C'est **faux** — la personne n'a plus de réseau —
   et c'est pire que la page du navigateur, qui au moins dit la vérité.
2. Rediriger vers une vraie page `/hors-ligne` : même résultat. Une page Next a
   besoin de son fragment JavaScript, et ce fragment n'est téléchargé que
   lorsqu'on visite la page — ce que personne n'avait fait.

Ce qui marche est plus simple que les deux : **une page autonome écrite dans le
worker lui-même**, sans fragment, sans hydratation, sans redirection, servie à
l'adresse demandée. Une pièce au lieu de trois. La route `/hors-ligne` a été
supprimée.

**L'article 16 reste `declared`, et ce n'est pas de la modestie.** Ce champ dit
si **une règle du moteur** vérifie l'article, pas s'il est implémenté. Aucune
règle ne peut constater depuis le serveur qu'un navigateur a reçu son worker.
Le marquer `enforced` annoncerait un contrôle qui n'existe pas — ce que
l'article 11 interdit. Ce qui garde la promesse à la place :
`node scripts/hors-ligne.mjs`, **7 vérifiés, 0 en échec**.

### 8.2 Le worker était le seul fichier que rien ne vérifiait

`frontend/public/` ne traverse ni le lint, ni TypeScript, ni le build. Ce n'est
pas une déduction : la faute de syntaxe a été plantée exprès, et `next lint`
comme `next build` ont répondu « aucune erreur ».

Ce qui rend l'angle mort coûteux, c'est que **le worker échoue en silence par
conception** — son enregistrement vit dans un `catch` vide, pour qu'un worker
cassé n'empêche pas le produit de fonctionner en ligne. Personne ne verrait
donc la panne en production non plus.

La CI fait désormais deux choses : `node --check public/sw.js`, et la vraie
commande hors ligne dans un navigateur, réseau coupé. Le pas de CI a été
éprouvé sur les deux navigateurs avant d'être écrit, avec le même résultat
de part et d'autre.

### 8.3 Une écriture revenue du froid ne peut plus effacer du travail

`docs/outillage.md` appelait ceci « le vrai trou non résolu » et demandait un
choix explicite. Le scénario : tu modifies un projet sur ton téléphone, sans
réseau ; depuis ton ordinateur, tu modifies le même projet ; le téléphone
retrouve le réseau et **écrase la version la plus récente, sans rien dire**.

Le choix est fait : **détecter et le dire**. « La dernière écriture gagne »
reviendrait à effacer le travail de quelqu'un derrière un avertissement
général, ce qu'une devise « la vérité avant tout » supporte mal — et que
l'article 13 supporterait encore moins le jour où le conflit porte sur la
visibilité d'un projet. **Si tu préfères l'autre réponse, elle se remet en
place en retirant un décorateur par route.**

Le point technique qui compte, et qui aurait pu tout casser : **on transmet un
âge, pas une date.** Une date viendrait de l'horloge du téléphone. Une montre
en retard de dix minutes ferait refuser tout ce que la personne a fait hors
ligne — c'est-à-dire provoquer exactement la panne qu'on veut éviter. Un âge
est une soustraction entre deux lectures de la même horloge : le décalage
s'annule, et le serveur reconstitue l'instant de capture sur la sienne.

Le garde **détecte, il ne fusionne pas**. Fusionner supposerait savoir quelle
version a raison, ce que personne ici ne sait. L'écriture rejoint les
« refusées » du bandeau, avec la raison, et tu décides.

Et il **se trompe toujours du même côté** : ligne introuvable, `updated_at`
vide, en-tête illisible, route non décorée — il laisse passer. Refuser à tort
bloque du travail réel ; laisser passer à tort ramène au comportement d'avant.
La moitié des tests vérifient qu'il laisse passer.

Couvert : `projects`, `tasks`, `billing_documents`, `crm_contacts`,
`crm_companies` — les modèles qui portent `updated_at`, 11 sur 50, sans aucune
migration.

### 8.4 Une addition fausse dans mon propre rapport

La note de préparation bêta affichait **84/100**. La colonne de droite de son
propre tableau fait **89** : 30 + 20 + 14 + 15 + 10 + 0. Une faute d'addition,
pas un jugement.

Corriger une note vers le haut sur son propre travail est exactement le genre
de rectification qu'on aimerait faire en silence. Le document porte donc un
paragraphe qui l'annonce, et aucune ligne du tableau n'a bougé pour y arriver.
Les points manquants passent de 16 à 11 : 10 pour les quatre comptes chez des
tiers, 1 pour un réglage que l'hébergeur ne cède pas.

### 8.5 Les chiffres, remesurés et non recopiés

| Quoi | Résultat |
|---|---|
| Tests unitaires backend | 1 055 verts (78 fichiers) |
| Bout en bout backend | 258 verts (16 fichiers) |
| Frontend | 367 verts (39 fichiers) |
| Validation réelle, avec IA | **69 vérifiés · 0 en échec · 1 non prouvé** |
| Hors ligne | **7/7** |
| Traversée des écrans | **21/21**, aucun constat |
| Parcours premier utilisateur | 0 critique, 0 majeur, 1 moyen (connu) |

Le seul contrôle non prouvé est le même qu'hier et ne dépend pas du code : le
parcours complet du mot de passe oublié exige qu'un vrai courrier parte.

**Chaque pièce livrée ici a été neutralisée exprès pour vérifier que ses tests
tombent** — 2 unitaires et 2 e2e pour le garde, 3 côté client pour l'âge de
capture, et la commande hors ligne contre un worker retiré. Un test qui passe
dans les deux cas ne prouve rien.

### 8.6 Ce que le cache du worker retient d'une session

Un service worker garde les pages visitées, y compris celles d'une personne
connectée, et **ce cache survit à la déconnexion**. Sur un téléphone prêté, la
question « que reste-t-il de la session précédente ? » a une réponse, et il
vaut mieux qu'elle soit mesurée plutôt que déduite.

Le raisonnement disait que non : le jeton vit dans `localStorage` et jamais
dans un cookie, donc le serveur ne peut pas savoir qui demande la page ; les
données arrivent ensuite par l'API, que le worker n'intercepte jamais.

Un raisonnement se vérifie. Le septième contrôle crée un compte, un projet au
titre reconnaissable, visite les écrans connectés, puis relit **chaque entrée**
du cache et y cherche l'adresse et le titre. Rien.

Et il sait trouver : en remplaçant le titre par une chaîne forcément présente,
il signale seize entrées. Un contrôle qui ne trouve rien peut simplement être
aveugle ; celui-ci ne l'est pas.

C'est le seul des sept qui ait besoin du serveur. Sans serveur il s'écrit
**IGNORÉ** et n'échoue pas — en intégration continue seule l'interface tourne,
et accuser le produit d'un manque du banc d'essai serait la pire façon de
rendre une commande inutile.

### 8.7 Le harnais qui a inventé deux défauts

Dernière exécution de la traversée, juste avant de clore : **deux constats sur
l'écran d'un projet** — « aucun titre : on ne sait pas où on est » et « écran
vide qui ne dit ni pourquoi ni quoi faire ». La relance suivante : **rien**.

Le produit n'avait pas changé. Le harnais posait `waitForTimeout(1200)` après
chaque navigation, et ce jour-là la base a répondu un peu plus lentement que
d'habitude : l'écran a été mesuré avant l'arrivée de ses données.

C'est la onzième fois de cette série qu'un harnais mesure sa propre ignorance
et l'appelle défaut du produit. Deux constats inventés valent moins que zéro :
un harnais qui dit deux choses différentes du même écran apprend à ne plus le
croire, et le jour où il aura raison, personne ne regardera.

Corrigé en attendant **le silence du réseau** plutôt qu'un nombre de secondes —
c'est-à-dire les appels d'API que la page déclenche après son montage, que
`domcontentloaded` ne couvre pas. Une borne de huit secondes derrière, parce
qu'une page qui interroge en boucle ne se tait jamais. Trois exécutions
consécutives propres, durée inchangée (~50 s).

Le harnais du parcours utilise lui aussi des attentes fixes, mais n'a jamais
montré cette instabilité, et ses questions ne portent pas sur le vide d'un
écran. Il n'a pas été touché : corriger ce qui marche par symétrie est une
bonne façon de casser quelque chose.

Rien n'a été déployé.

---

## 9. Le lendemain — Ignitux sait-il vraiment envoyer un courrier ?

25 septembre. Il restait **un** contrôle « non prouvé » dans la validation :
le parcours complet du mot de passe oublié. La raison donnée depuis des jours
était qu'il faut un fournisseur d'email pour le savoir.

C'était faux. Il faut quelqu'un qui **écoute en SMTP**, et quatre-vingts lignes
suffisent à l'écrire.

### 9.1 Ce qui n'avait jamais été éprouvé

Tout ce qui touche à l'email était simulé. `MailService` est bien écrit et ses
tests sont bons, mais ils remplacent `nodemailer` : ils vérifient **nos
décisions**, jamais notre capacité à poser un message sur une socket. Le jour
où tu branches un fournisseur aurait été le premier où quelqu'un le découvre —
et ce jour-là, tu aurais cherché la panne du côté du fournisseur.

`scripts/courrier-reel.mjs` ouvre une boîte aux lettres SMTP locale, démarre le
serveur en transport « smtp » contre elle, et regarde ce qui arrive. Aucun
fournisseur, aucun secret, aucun message vers l'extérieur.

### 9.2 Ce que la commande a trouvé en s'écrivant

**Deux courriers partent, pas un.** L'inscription envoie une confirmation
d'adresse, et ce parcours-là n'avait jamais été suivi de bout en bout non plus.
La première version cherchait le lien de réinitialisation et tombait sur celui
de confirmation, parce qu'elle prenait le premier message adressé à la bonne
personne. Les deux sont couverts désormais.

**Le corps d'un courrier n'est pas le texte qu'on a écrit.** nodemailer encode
en *quoted-printable* et replie à 76 colonnes : le lien est coupé en deux, et
le `=` de `?token=` devient `=3D`. La commande cherchait une chaîne que
personne n'avait jamais écrite. Ce que lit une vraie boîte aux lettres est le
texte **décodé** ; c'est donc lui qu'on examine.

### 9.3 Les onze faits, maintenant vérifiés

Le transport se déclare au démarrage · `/ready` constate qu'il répond — le
chemin `verify()`, jamais exercé pour de vrai jusqu'ici · l'inscription fait
partir une confirmation · complète, expéditeur, objet et lien · le lien
confirme réellement l'adresse · l'oubli fait partir un second courrier ·
complet lui aussi · le lien change réellement le mot de passe · l'ancien ne
marche plus, le nouveau oui · le même lien rejoué est refusé · **une adresse
inconnue ne fait partir aucun message, et répond exactement pareil**.

Le dernier compte autant que les autres : si une demande sur une adresse
inconnue se comportait différemment, n'importe qui pourrait savoir qui a un
compte chez Ignitux.

**11 vérifiés, 0 en échec** — contre la base de développement et contre
`ignitux_test`, dans les conditions de la CI. Et la commande sait échouer : en
remettant le transport sur « log », quatre contrôles tombent immédiatement.

Le pas est dans la CI, greffé sur le job de bout en bout qui a déjà une base
jetable.

### 9.4 Ce que ça ne prouve pas

Qu'un message **arrive** dans une vraie boîte sans finir en indésirable. Cela
dépend de SPF, DKIM et DMARC sur un domaine réel — de la réputation
d'expéditeur, pas du code. Aucune commande lancée d'ici ne peut y répondre, et
celle-ci le dit en terminant plutôt que de laisser croire que tout est couvert.

Ce qui change pour toi : les deux heures de branchement d'un fournisseur ne
sont plus deux heures de découverte. Le chemin SMTP est éprouvé ; il ne reste
que l'hôte, le port et les identifiants à écrire.

Rien n'a été déployé.

---

## 10. Les deux constats qui t'étaient laissés

Ils traînaient depuis plusieurs jours sous l'étiquette « arbitrages laissés au
porteur ». En les regardant de près, ce n'en étaient pas : c'étaient des
défauts ordinaires, et rien à arbitrer.

### 10.1 Quatre tailles pour un même rôle

Les tuiles d'un projet affichaient « Étincelle », « Tâches » et « Étapes » à
**11,2 px** sur téléphone. En cherchant d'où venait ce chiffre, on trouve
quatre tailles différentes — 0,68 · 0,70 · 0,72 · 0,75 rem — pour exactement le
même rôle : l'intitulé au-dessus d'un chiffre, le titre d'une colonne, le
surtitre d'une section. Quatre tailles pour un rôle, c'est une décision que
personne n'a jamais prise.

Un seul jeton désormais, `--texte-etiquette`, à 0,78 rem (12,5 px). Reste
volontairement en dehors : le chiffre dans la pastille ronde du parcours, dont
le cercle fait 2,1 rem — l'agrandir le ferait déborder, et un chiffre isolé
dans un cercle ne se lit pas comme une étiquette.

### 10.2 La tuile qui constatait un vide sans offrir de le combler

« Aucune tâche encore. » et rien d'autre. Le bouton existait, derrière « Vue
avancée », dont le libellé ne l'annonce pas.

La tuile propose maintenant « Ajouter une tâche », qui ouvre la vue avancée et
défile jusqu'au formulaire — sans animation si le système la refuse.

**Et la première version a introduit un défaut** que le harnais a attrapé dans
la foulée : le raccourci restait affiché au-dessus du formulaire qu'il venait
d'ouvrir. Deux contrôles nommés « Ajouter… » sur le même écran, dont un seul
agissait. Il ne s'affiche plus quand la section est déjà là — un raccourci vers
un endroit où l'on se trouve déjà n'est plus un raccourci.

### 10.3 Ce que la même passe a trouvé en chemin

**`a.secondary` n'existait pas.** La feuille de style ne connaissait que
`button.secondary`. Quatre endroits écrivaient pourtant `<Link
className="secondary">` — en ajoutant même `display: inline-block`, preuve de
l'intention. Ils s'affichaient en texte nu : « Voir mon profil » faisait 105×25
points au lieu d'un bouton.

**Le socle des champs était plus serré que la classe qu'il sous-tend.** Un
champ sans classe faisait 38 points de haut, un champ dans un `.field` en
faisait 43. Deux hauteurs de champ dans le même produit, et la plus petite sous
le seuil où un doigt rate sa cible.

**Onze boutons pour une seule cause.** `button.secondary` faisait 37 points :
« Se déconnecter », « Tous mes outils », « Analyser ce projet »… Onze constats,
une ligne de correction. C'est exactement le cas que la règle écrite plus haut
décrit — un rapport qui multiplie une cause par le nombre d'écrans gâche le
temps qu'il prétend faire gagner.

### 10.4 Ce qui reste petit, et pourquoi

Trois liens : « S'inscrire », « Se connecter », « Le choisir ». Tous les trois
sont des **mots à l'intérieur d'une phrase** — « Pas encore de compte ?
S'inscrire ». Les grossir casserait la ligne et l'espacement du paragraphe pour
un gain douteux : devant un mot souligné au milieu d'un texte, on vise le mot.

CSS ne sait pas distinguer un lien qui **est** le paragraphe d'un lien qui s'y
trouve — `p > a:only-child` attraperait les deux, parce que `:only-child` ne
compte que les éléments et ignore le texte autour. La distinction est une
intention d'auteur ; elle s'écrit donc dans le balisage, avec une classe.

### 10.5 Le compte

| | Avant | Après |
|---|---:|---:|
| Traversée téléphone | 6 moyens · 22 mineurs | **0 · 3** |
| Traversée bureau | 0 | **0** |
| Parcours premier utilisateur | 1 moyen | **0** |

Les trois mineurs restants sont exactement les trois liens ci-dessus, et la
raison de les laisser est écrite dans la feuille de style, à l'endroit où
quelqu'un la cherchera.

### 10.6 Une erreur de ma part, et ce qu'elle a coûté

J'ai lancé `prettier --write` sur la page projet. L'interface n'a aucune
configuration prettier — c'est le serveur qui en a une — et la commande a
reformaté 434 lignes en guillemets doubles, contre le style de tout le dépôt.
Annulé, puis mes changements réappliqués à la main : **52 lignes** au lieu de
434.

Rien n'a été déployé.

---

## 11. L'inventaire de ce qui manque, et ce qui a été résolu

25 septembre, sur demande : regarder tout ce qui manque encore, et le régler.
La première moitié du travail a été de chercher pour de vrai, plutôt que de
relire la liste que les documents portaient déjà.

### 11.1 Ce que l'inventaire a donné

Le code ne porte **aucun** `TODO`, `FIXME` ni `pas encore implémenté` — vérifié
sur les deux moitiés du produit. Les documents, eux, listaient cinq manques :
hébergement, collecteur d'erreurs, fournisseur d'email, paiement, sauvegardes
vérifiées.

Quatre des cinq demandent un compte chez un tiers, et ne sont donc pas de mon
ressort. Le cinquième l'était à moitié, et c'est traité plus bas.

**Mais chercher dans le code a donné trois choses que la liste ne portait
pas**, et elles étaient plus graves que ce qu'elle portait.

### 11.2 Un projet public s'affichait sans son porteur

`GET /community/projects` rendait un titre, une description et une date.
**Aucun auteur.** L'article 21 dit pourtant : « Les créateurs conservent la
reconnaissance de leurs idées. » Une idée exposée sans son porteur ne lui en
laisse aucune.

Les commentaires souffraient du trou inverse : ils partaient avec un
`author_id`, c'est-à-dire un identifiant technique que personne ne peut lire.
Un encouragement signé d'un UUID n'encourage personne.

Ce qui est exposé désormais : le **nom d'affichage**, et lui seul — jamais
l'adresse. Et quand la personne n'en a pas renseigné, on rend `null`, pas
« Anonyme » : elle n'a pas choisi de se cacher, elle n'a pas rempli le champ.
L'écran le dit avec ses mots.

**L'article 21 passe de `declared` à `enforced`**, et cette fois le produit a
changé en même temps que l'étiquette. La règle `projet-public-sans-porteur`
refuse de servir un projet public dont la requête n'a pas ramené son porteur.
Elle ne vérifie pas que le nom existe — une personne sans nom d'affichage n'est
pas une violation ; elle empêche que l'attribution disparaisse du code sans que
rien ne s'y oppose.

### 11.3 L'annuaire distribuait les adresses email

`GET /marketplace/profiles` renvoyait l'**adresse email** de chaque mentor et
de chaque investisseur inscrit, à n'importe quelle personne connectée. Une
requête, tout l'annuaire.

Et l'interface ne l'affichait **nulle part**. Une exposition sans le moindre
usage, ce qui est la pire des deux moitiés : tout le risque, aucun bénéfice.
Elle n'est d'ailleurs pas nécessaire — le produit a une mise en relation
interne pour écrire à quelqu'un sans connaître son adresse.

Retirée. Ce qui reste : l'identifiant, et le nom d'affichage.

### 11.4 Une adresse était transmise sans que personne le dise

Le destinataire d'un message voit l'adresse de qui lui écrit. C'est
défendable : c'est le seul canal de retour, le produit n'ayant pas de
messagerie interne. Mais la personne qui écrivait ne l'apprenait nulle part.

L'écran le dit maintenant **avant** d'écrire : « En écrivant, tu lui donnes ton
adresse email : c'est par là qu'il ou elle pourra te répondre. » Une adresse
donnée et une adresse prise ne sont pas la même chose.

### 11.5 Une sauvegarde qu'on peut enfin vérifier

`node backend/scripts/verifier-sauvegarde.mjs` lit une sauvegarde **sans
aucune base** : manifeste, présence et lisibilité des 50 fichiers, décomptes
conformes, et surtout la **fermeture référentielle** — chaque clé étrangère
pointe-t-elle vers une ligne présente dans la même sauvegarde ?

C'est le contrôle qui décide, parce que `restauration.mjs` insère par tours
successifs : une référence orpheline fait échouer la restauration pendant un
incident, au moment où personne n'a le temps de comprendre. Sur la dernière
sauvegarde : **2 206 références suivies, aucune perdue**. Et la commande sait
refuser — éprouvée contre une sauvegarde abîmée exprès, elle nomme les deux
relations cassées.

Le graphe des 58 relations est lu sur `schema.prisma`, pas recopié : écrit à la
main, il se tromperait en silence le jour où quelqu'un ajoute une relation.

Ce qu'elle ne remplace pas : une restauration réelle, qui demande une base
jetable. Il n'y en a pas ici — ni Docker, ni Postgres local — et créer une
quatrième base sur l'instance partagée est une décision qui t'appartient.

### 11.6 Une faute de ma part, et ce qui l'a attrapée

La relation s'appelle `owner` sur `projects`. J'ai écrit `user`. **Toute la
communauté a répondu 500**, et les tests unitaires sont restés au vert — ils
simulent Prisma, donc ils vérifiaient consciencieusement la forme que je venais
d'inventer.

Ce qui l'a vu est un appel contre une vraie base. J'en ai fait six tests de
bout en bout (`test/communaute.e2e-spec.ts`), pour que la prochaine fois ce
soit la CI qui le dise et non une commande qu'il faut penser à lancer.

### 11.7 Ce qui reste, et qui ne dépend pas de moi

| Ce qui manque | Pourquoi ce n'est pas de mon ressort |
|---|---|
| Hébergement | un compte, une carte, une décision |
| Domaine | idem |
| Fournisseur d'email | idem — mais le chemin SMTP est éprouvé, 11/11 |
| Paiement | demande un SIRET |
| Collecteur d'erreurs | un compte chez un tiers |
| Sauvegardes de l'hébergeur | se vérifient dans sa console |
| Les « Gardiens » (article 17) | une décision de gouvernance, pas du code |
| Une restauration réellement rejouée | demande une base jetable — à créer, ou pas |

Rien n'a été déployé.
