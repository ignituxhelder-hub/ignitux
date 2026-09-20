# Vérification de l'interface — parcours d'un utilisateur réel

Mesuré le 20 septembre 2026, sur l'instance réelle : backend `localhost:3000`, frontend
`192.168.1.12:3001`, base de développement, `IGINI_AI_ENABLED=false`.

Tout ce qui suit a été fait **par l'interface** : un vrai navigateur (Edge, piloté par
Playwright), des clics et de la saisie. Aucun appel direct à l'API pour produire un résultat.
L'API n'a servi qu'à instruire un défaut déjà constaté à l'écran.

Compte utilisé : `ui.1789912662972@test-interface.invalid`. **Supprimé à la fin de ce
document** — voir §11.

---

## 1. Ce qui a été fait, et ce que cela a donné

| Parcours | Résultat |
|---|---|
| Arriver sans compte, lire la Constitution | **Défaut corrigé** — voir §2 |
| Créer un compte | Fonctionne ; le refus était muet, **corrigé** — voir §3 |
| Se connecter | Fonctionne, redirige vers `/projects` |
| Créer un projet | Fonctionne, apparaît dans la liste, la fiche s'ouvre |
| Modifier un projet | **Fonctionne** — voir §4, où je m'étais trompé |
| Partager un projet (visibilité) | Fonctionne, l'état est dit en clair |
| Inviter un collaborateur | Fonctionne ; l'adresse inconnue est refusée avec un message juste |
| Utiliser IGINI | Correctement éteint et expliqué — voir §5 |
| Utiliser le CRM | Fonctionne pour les contacts ; deux manques — voir §6 |
| Utiliser la facturation | Règles tenues ; **l'avoir manquait, ajouté** — voir §7 |
| Utiliser le financement | Fonctionne ; quatre modules n'ont aucune interface — voir §6 |

Quatre défauts trouvés, quatre corrigés. Le plus lourd constat n'est pas un défaut mais
une absence : **quatre modules du serveur n'ont aucune interface**.

---

## 2. Défaut corrigé — la Constitution était fermée aux visiteurs

**Ce que j'ai vu.** Une personne qui n'a pas de compte ouvre `/constitution` : elle est
renvoyée vers l'écran de connexion. Elle ne peut pas lire le texte avant de s'engager.

**Pourquoi c'est grave.** Le préambule, les articles et les règles avaient été rendus
publics côté serveur. C'est l'interface qui refermait la porte. Or ce texte est ce qui
engage Ignitux envers la personne : lui demander de créer un compte pour savoir à quoi
elle s'expose inverse l'ordre, et contredit l'article 11 (Transparence).

**Ce qui a été changé.**

- [frontend/src/lib/api.ts](../frontend/src/lib/api.ts) — les trois lectures publiques
  acceptent `token: string | null` et n'envoient l'en-tête d'autorisation que s'il existe.
- [frontend/src/app/constitution/page.tsx](../frontend/src/app/constitution/page.tsx) — plus
  de redirection. L'audit mesuré et le journal des violations, qui sont des données
  personnelles, ne sont demandés que s'il y a un jeton ; leur absence est **dite** au lieu
  d'être silencieuse.
- Le test qui exigeait la redirection encodait le défaut : il a été remplacé par deux tests
  qui vérifient la nouvelle règle dans les deux sens.

**Vérifié dans le navigateur.** Sans compte : 200, 24 articles lisibles, pas de journal,
et la phrase qui explique pourquoi. Avec un compte : 24 articles et le journal.

---

## 3. Défaut corrigé — la règle du mot de passe n'était dite nulle part

**Ce que j'ai vu.** Un mot de passe trop court est refusé, mais rien à l'écran ne dit que
huit caractères sont exigés. On l'apprend en s'y heurtant, par une bulle écrite par le
navigateur — donc pas nécessairement en français, selon la machine du visiteur.

**Ce qui a été changé.** [frontend/src/app/signup/page.tsx](../frontend/src/app/signup/page.tsx)
énonce la règle sous le champ, avant la saisie, et décompte ce qui manque pendant la frappe
(« Il en manque 5 »). Le champ est relié à ce texte par `aria-describedby`.

---

## 4. Ce que j'avais mal lu — la modification du projet

J'avais d'abord noté que la modification d'un projet ne persistait pas. **C'était faux, et
la faute venait de ma vérification.** Chez le propriétaire, le titre vit dans un champ de
formulaire ; je relisais le texte visible de la page, qui ne contient pas la valeur des
champs. L'échange réseau le montre sans ambiguïté : `PATCH /projects/:id` part avec le bon
corps, revient en 200 avec la valeur modifiée, et elle survit au rechargement.

**Mais ce faux départ a révélé un vrai défaut, corrigé.** La page projet du propriétaire
n'avait **aucun titre de niveau 1**. Sur la page la plus longue du produit — 7 245 px —
le nom du projet n'existait que dans un champ de saisie : aucun repère pour un lecteur
d'écran, aucun point d'ancrage pour l'œil qui revient après avoir fait défiler. Le titre
est maintenant posé une fois, au-dessus, commun aux deux vues (propriétaire et invité).

---

## 5. Incohérence corrigée — deux sections portaient le même nom

La fiche projet affichait **deux sections intitulées « Financement »** :

1. celle où IGINI rédige un plan de financement ;
2. celle où figure l'argent réellement reçu — apports, répartition des parts, dividendes.

Un plan et un fait, sous la même étiquette, sur la même page. La première a été renommée
**« Plan de financement »**, ce qui l'aligne sur sa sœur « Plan de construction » et sur le
libellé de son propre bouton.

### IGINI éteint : correct, et à garder tel quel

Avec `IGINI_AI_ENABLED=false`, les cinq générateurs n'affichent **aucun bouton** — ils
affichent une pastille « IA indisponible » et un encart neutre qui dit que rien n'est cassé
et que la fonction est volontairement éteinte. J'avais d'abord noté « aucun bouton
d'analyse » comme un manque : c'est au contraire le bon comportement. Un bouton grisé
invite à cliquer ; une absence assumée et expliquée ne ment pas.

---

## 6. Éléments manquants — ce que le serveur sait faire et que l'écran n'offre pas

C'est le constat principal de cette vérification. Compté sur
[frontend/src/lib/api.ts](../frontend/src/lib/api.ts) :

| Module du serveur | Appels depuis l'interface |
|---|---|
| `crm` | 34 |
| `billing` | 28 |
| `financing` | 21 |
| `marketplace` | 17 |
| `compliance` | 9 |
| `community` | 7 |
| **`investors`** | **0** |
| **`ledger`** | **0** |
| **`finance-audit`** | **0** |
| **`banking`** | **0** |

**Les quatre derniers modules construits n'ont aucune interface.** Le module investisseurs,
la comptabilité en partie double, l'audit financier et les comptes bancaires existent,
sont testés, appliquent leurs règles — et sont inatteignables pour qui n'écrit pas de
requêtes HTTP à la main. Du point de vue de la personne qui utilise Ignitux, ils n'existent
pas.

Trois manques plus petits, au même endroit du raisonnement :

- **Le suivi des coûts IA n'a pas d'écran.** La télémétrie enregistre modèle, jetons,
  horodatage, utilisateur, projet et type de génération ; les plafonds refusent en 402. Rien
  n'en est montré. Personne ne peut voir ce qu'il a consommé ni ce qu'il lui reste.
- **Le CRM ne gère que des contacts.** L'API gère aussi les entreprises et les échanges ;
  l'écran n'offre ni l'un ni l'autre.
- **Aucun document de facturation ne peut sortir de l'écran** — pas de PDF, pas
  d'impression, pas d'envoi. On peut tenir sa facturation dans Ignitux, mais pas envoyer
  une facture à un client. Pour un module de facturation, c'est la dernière marche qui
  manque.

Un devis ne se transforme pas non plus en facture : il faut le ressaisir.

---

## 7. Facturation — les règles tiennent, et l'avoir a été ajouté

**Ce qui marche, vérifié à l'écran** en émettant un devis et deux factures :

- Numérotation séquentielle par type et par année : `DEV-2026-0001`, `FAC-2026-0001`,
  `FAC-2026-0002`. Sans trou.
- Totaux exacts : 850 € HT à 20 % → 170 € de TVA → 1 020 € TTC. 640 € → 128 € → 768 €.
- **Immuabilité réellement appliquée.** Sur un brouillon : « Émettre » et « Supprimer ». Une
  fois émis, les deux disparaissent, remplacés par « Marquer réglé » et par la phrase
  « Émis : ce document ne peut plus être modifié ni supprimé. » La règle est tenue *et*
  expliquée là où elle s'applique.

**Ce qui manquait.** La page annonçait en tête qu'« une facture émise ne se corrige que par
un avoir ». Le serveur sait le faire, avec ses garde-fous : un avoir doit référencer un
document, et ne peut pas corriger un brouillon. **L'interface ne l'offrait nulle part.** Le
type « Avoir » n'était même pas dans la liste déroulante. La règle était affichée sans
qu'aucun geste ne permette de l'appliquer.

**Ce qui a été ajouté** dans
[frontend/src/app/facturation/page.tsx](../frontend/src/app/facturation/page.tsx) : un bouton
« Corriger par un avoir » sur les factures émises ou payées — pas sur les brouillons, qu'il
suffit de modifier. Il ouvre un formulaire pré-rempli au total HT de la facture corrigée, le
montant restant modifiable pour un avoir partiel. L'avoir **reprend le taux de TVA de la
facture corrigée** plutôt qu'un taux saisi : corriger une facture à 5,5 % par un avoir à
20 % produirait une TVA qui ne s'annule pas. Chaque avoir affiche de quel document il se
déduit.

Quatre tests couvrent le geste, dont le refus sur brouillon et le refus d'un montant
illisible. Vérifié dans le navigateur : `AV-2026-0001` créé, référençant `FAC-2026-0001`.

---

## 8. Ce qui a été regardé sans rien trouver à redire

- **Aucun débordement horizontal à 390 px** sur les quatre écrans testés (projets, fiche
  projet, facturation, CRM).
- **Aucune erreur JavaScript, aucune 500** sur l'ensemble des parcours.
- **Le cloisonnement anonyme est juste** : `/community`, `/marketplace`, `/projects`,
  `/facturation`, `/crm`, `/account` renvoient au login ; `/` et `/constitution` sont
  ouverts.
- **Une adresse inconnue invitée comme collaborateur** reçoit « Aucun compte ne correspond
  à cet email. » — refus clair, pas de fuite sur l'existence d'un compte au-delà du
  nécessaire.
- **La table de capitalisation ne ment pas** : « Ignitux n'affiche pas de dividende
  prévisionnel : un dividende se constate après coup, le prédire reviendrait à promettre un
  revenu. »
- **Le rachat progressif** dit explicitement qu'Ignitux ne chiffre ni les trois objectifs ni
  la valorisation, et pourquoi.
- **Mon compte** propose l'export JSON et annonce, avant suppression, ce qui disparaîtra —
  y compris que les violations sont anonymisées et non effacées.

---

## 9. Ce que cette vérification ne dit pas

- **IGINI n'a pas été exercé.** Les générateurs sont éteints ; j'ai vérifié que le refus est
  honnête, pas que les analyses sont bonnes. Cela demande une clé et une dépense réelle.
- **Un seul navigateur** (Edge). Ni Firefox, ni Safari, ni un vrai téléphone.
- **Aucun test au lecteur d'écran.** J'ai vérifié la présence des `aria-label` et des titres,
  pas l'expérience réelle de quelqu'un qui navigue à l'oreille.
- **Un seul utilisateur.** Rien ici ne dit comment l'interface se comporte à plusieurs sur
  le même projet, en même temps.
- **Les longs contenus n'ont pas été éprouvés** : un projet avec cent tâches, une facture à
  cinquante lignes, un CRM à mille contacts.

---

## 10. Ce que je ferais ensuite, dans cet ordre

1. **Donner une interface aux quatre modules muets** — investisseurs, comptabilité, audit
   financier, banque. Ce qui n'a pas d'écran n'existe pas pour qui l'utilise.
2. **Montrer la consommation IA** avant de rallumer l'IA. Un plafond qu'on ne voit pas
   approcher est un refus qui tombera sans prévenir.
3. **Faire sortir les documents de facturation** — PDF ou impression. Sans cela le module
   s'arrête une marche avant son but.
4. **Découper la fiche projet.** 7 245 px, quinze sections, une seule colonne : le
   financement réel est à plus de cinq mille pixels du haut. Des onglets ou des ancres.
5. **Compléter le CRM** : entreprises et échanges, que l'API sait déjà tenir.

---

## 11. Les données de test

**Le compte créé pour cette vérification est supprimé**, et il l'a été **par l'interface**,
comme le ferait la personne : `ui.1789912662972@test-interface.invalid`. Reconnexion
tentée ensuite : « Email ou mot de passe incorrect. »

L'écran d'annonce préalable s'est révélé exact au document près — « 1 projets, 1 contacts
crm, 1 documents de facturation émis, 3 documents de facturation en brouillon » — et il
avertit d'une chose qu'on n'attend pas d'un produit : qu'une facture émise doit être
conservée dix ans en France, que **cette obligation incombe à la personne et non à
Ignitux**, et qu'il faut donc exporter avant de partir.

Vérifié en base après coup : 0 compte, 0 projet, 0 contact, 0 document de facturation
restants pour ce test.

### Ce qui n'a pas pu être nettoyé

Cinq comptes de test **antérieurs**, laissés par l'exécution automatisée du 19 septembre,
sont toujours en base :

```
autotest.claude.1789836970618@ignitux.test
autotest.claude.1789837007621@ignitux.test
autotest.claude.1789837172495@ignitux.test
testeur1@ignitux.test
testeur2@ignitux.test
```

> **Correction du 20/09/2026, après vérification des usages.** J'avais écrit ici qu'ils
> étaient « sans ambiguïté les miens ». **C'était faux pour deux d'entre eux.** Une recherche
> dans le dépôt montre que `testeur1` et `testeur2` sont cités dans PROGRESS.md comme de
> vrais testeurs, et la base confirme que **`testeur1` porte un projet réel**. Ce sont des
> comptes de personnes, pas des artefacts de mes scripts.

Après vérification :

| Compte | Origine | Contenu | À faire |
|---|---|---|---|
| `autotest.claude.1789836970618` | mon script du 19/09 | 1 projet, 1 souvenir | effaçable |
| `autotest.claude.1789837007621` | mon script du 19/09 | 1 projet, 1 souvenir | effaçable |
| `autotest.claude.1789837172495` | mon script du 19/09 | 1 projet, 1 souvenir | effaçable |
| **`testeur1@ignitux.test`** | **un vrai testeur** | **1 projet réel** | **ne pas toucher** |
| **`testeur2@ignitux.test`** | **un vrai testeur** | vide | **ta décision** |

Aucun des cinq n'est référencé par un test automatique ni par un parcours e2e : les seules
occurrences dans le dépôt sont narratives (PROGRESS.md, docs/decisions.md).

Les trois `autotest.claude.*` sont les miens et peuvent partir, mais je n'ai pas leur mot de
passe — ils ont été créés par un script d'une session antérieure, et l'endpoint de
suppression du produit l'exige. Une suppression directe en base a été **refusée par le
garde-fou**, que je n'ai pas contourné. Ils attendent donc soit une remise à zéro que tu
décides, soit rien : trois comptes inertes dans une base de développement ne gênent personne.
