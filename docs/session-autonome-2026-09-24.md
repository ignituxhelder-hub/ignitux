# Session autonome du 24 septembre 2026 — l'expérience, pas les routes

Travail mené sans personne devant l'écran, à la demande du porteur. Tout est
vérifié par exécution ; ce qui ne l'est pas est dit comme tel.

> **Quatre défauts réels trouvés et corrigés, tous invisibles aux 1 648 tests
> existants — parce qu'aucun d'eux ne regarde le produit avec les yeux de
> quelqu'un qui l'utilise.**
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

## 2. Les quatre défauts corrigés

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
Backend unitaires        1 034 verts   (77 fichiers)
Backend bout en bout       252 verts   (15 fichiers)
Frontend                   362 verts   (39 fichiers)
Validation réelle          41 / 41, appels IA compris
Simulation dix profils     0 critique · 0 majeur · 0 moyen · 0 mineur
Traversée 21 écrans        0 constat au bureau
Parcours complet           0 critique · 0 majeur
```

**Dépense IA du mois : 1,76 € sur 50 € de plafond**, 32 appels.

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
