# Session autonome — 20 septembre 2026

Travail mené sans supervision pas à pas, sur une consigne unique : construire ce qui
manque au bon fonctionnement d'Ignitux. Ce document dit ce qui a été fait, ce qui a été
**vérifié en le faisant**, et les deux points qui attendent une décision.

État à la fin : **920 tests unitaires serveur, 251 de bout en bout, 347 côté interface**,
lint propre des deux côtés, et une traversée navigateur de 18 écrans sans anomalie.

---

## 1. Le défaut le plus grave n'était pas dans le code

Le module de conformité repose entièrement sur une promesse : *chaque démarche cite sa
source officielle*. Le moteur constitutionnel (article 15) vérifie qu'une source
**existe**. Personne ne vérifiait qu'elle **répond**.

En ouvrant les douze liens un par un :

| Vérification | Résultat |
|---|---|
| Liens renvoyant un 404 | **7 sur 12** |
| Liens vivants mais hors sujet | 1 |
| Liens corrects | 4 |

Le domaine `service-public.fr` a migré vers `service-public.gouv.fr`, et plusieurs fiches
ont changé d'identifiant en chemin. Le lien « occupation du domaine public » menait à
l'autorisation de chantier — échafaudages et bennes — au lieu du commerce ambulant.

**Une source morte est pire qu'une source absente : elle a l'air vérifiée.**

Ce qui a changé :

- Les douze liens ont été ouverts, lus, et remplacés quand il le fallait.
- Chaque démarche porte sa date de vérification (`verifiedOn`).
- Un test refuse tout lien vers un domaine connu pour avoir déménagé, vérifie que les
  sources viennent d'un domaine public officiel, et qu'aucune description ne fige un
  montant en euros — un seuil écrit en dur devient faux à la loi de finances suivante.

### Ce que cela n'est toujours pas

Ce référentiel reste **court et français**. Douze démarches ne couvrent pas la création
d'entreprise, et aucun expert-comptable ne les a relues. Les liens sont justes au
20 septembre 2026 ; ils pourriront encore. La date les rend visibles quand ce sera le cas.

---

## 2. Le secteur trie les démarches, il n'en cache aucune

Filtrer la conformité par secteur reviendrait à masquer des obligations légales. Le
déséquilibre est net : une démarche de trop se lit et s'écarte, une démarche manquante ne
se remarque qu'au contrôle. **Un faux négatif y coûte bien plus cher que du bruit.**

Donc un tri en trois groupes — *propre à ton secteur*, *pour toute activité*, *rattachées
à d'autres secteurs* — et le dernier dit explicitement qu'il n'est pas un avis juridique.
Le test qui compte vérifie que la réunion des groupes vaut toujours la liste entière.

Le secteur est porté par **le projet**, pas par le profil. `user_profiles.sectors` répond
à « où as-tu déjà travaillé » : c'est une expérience. Quelqu'un venu du logiciel qui ouvre
une friterie verrait l'hygiène alimentaire reléguée en bas de liste si on triait sur son
passé. La question est posée dans la section Conformité, au moment où la réponse change
quelque chose de visible.

Le pays suit la même logique : le service acceptait déjà un pays mais le forçait à `FR`,
et l'interface demandait `?country=FR` en dur. Sans déclaration, la liste française
s'affiche toujours — mais l'écran dit que c'est une supposition.

---

## 3. Trois modules complets n'avaient aucune porte

Découvert en traversant l'interface route par route. Ils avaient des contrôleurs, des
tests, des données, et rien pour les appeler : de là où se tient la personne qui s'en
servirait, ils n'existaient pas.

| Module | Ce qu'il tenait déjà | Écran |
|---|---|---|
| Audit financier | contrôles de cohérence, par projet | dans `/projects/:id/finances` |
| Banque | comptes, mouvements, solde, rapprochement | `/banque` |
| Comptabilité | plan, écritures, balance | `/comptabilite` |

Trois décisions méritent d'être relues :

**L'audit affiche aussi les contrôles à zéro.** Un audit qui ne montre que ses trouvailles
ne permet pas de distinguer « rien à signaler » de « ce contrôle n'existe pas » — seule la
première mérite la confiance qu'on accorde à une page verte.

**Aucun plan comptable n'est déposé d'office.** Un entrepreneur portugais, suisse ou
français n'a ni le même plan, ni le même régime, ni les mêmes obligations.

**L'écriture n'a que deux lignes.** Le serveur en accepte N. Un compte débité, un compte
crédité, un montant : ainsi construite, une écriture ne *peut pas* être déséquilibrée. Une
grille libre laisserait saisir 100 au débit contre 90 au crédit, faire rejeter l'envoi, et
perdre la saisie. Les écritures à trois lignes attendront un écran qui les mérite.

Le rapprochement bancaire est arrivé ensuite, une fois la comptabilité atteignable — sans
rapprochement automatique par montant : deux achats du même jour au même prix ne sont pas
interchangeables.

---

## 4. Ce que la sonde de démarrage ne voyait pas

`/ready` comparait les **tables** attendues à celles présentes. Une table présente mais
amputée d'une colonne se comporte exactement comme une table manquante, en plus discret :
l'application démarre, les lectures passent, et seule l'écriture qui touche la colonne
échoue — des jours plus tard, chez quelqu'un.

La sonde dérive maintenant les colonnes attendues des énumérations générées par Prisma,
comme elle dérivait déjà les tables. Une liste écrite à la main finirait par diverger du
schéma, et c'est alors la sonde qui mentirait.

Elle vérifie en plus que le référentiel de conformité est réellement semé — parce que le
semis a cessé d'être fatal. Il tournait dans `onModuleInit` ; son échec faisait échouer le
démarrage de tout le serveur. Plus personne ne pouvait se connecter parce que la section
Conformité n'avait pas pu se remplir. **La disproportion était le défaut.**

---

## 5. Une tâche ajoutée en donnait six

La base de test avait deux tables et cinq colonnes de retard, donc la suite de bout en
bout ne tournait plus. Remise à niveau, elle a montré trois tests rouges, tous sur le même
fait : *attendu 1 tâche, reçu 6*.

Ils avaient raison. Depuis que les actions manuelles relancent l'orchestration, écrire
« Trouver un local » faisait apparaître la tâche saisie **plus les cinq tâches d'étape**.
Faire A et voir six choses arriver est le contraire du produit visé.

La réconciliation garde ce qui remet l'état d'accord avec les faits — refermer une tâche
d'étape franchie, relier des concepts devenus proches. Ouvrir cinq chantiers que personne
n'a demandés reste le geste explicite « Lancer l'automatisation ».

### Pourquoi cela avait pu dormir

La CI ne lançait pas les tests de bout en bout. Le commentaire qui l'expliquait tenait à
l'instance : brancher Supabase demanderait d'exposer un accès à la production. L'objection
tenait à l'instance, pas aux tests — un conteneur Postgres créé et détruit avec le job n'a
rien à voir avec Supabase, ne demande aucun secret, et part d'une base vide, ce qui
éprouve en prime que le schéma se pose à neuf.

**Ce job n'a pas pu être exécuté ici** : pas de Docker dans cet environnement. Son YAML
est valide et les 251 tests passent en local sur le même réglage ; la première exécution
réelle sera sur GitHub.

---

## 6. Ce qui attend une décision

### La base de production est en retard

Relue en lecture seule le 20 septembre 2026 :

```
tables        : 47 présentes / 48 attendues
  manquante   : user_profiles
colonnes      : analyses.score_rationale, compliance_requirements.sectors,
                compliance_requirements.verified_on, projects.sector
utilisateurs  : 0
```

`analyses.score_rationale` manquait **avant** cette session : la base dérivait déjà sans
que rien ne le dise, et c'est exactement ce que la nouvelle sonde attrape.

La migration est additive — une table, quatre colonnes nullables — et la base ne porte
aucun compte. Elle n'a **pas** été lancée : toucher à la base de production est une
décision qui revient au porteur du projet, même quand elle est sans risque apparent.

```bash
cd backend
DATABASE_URL="$(grep '^DATABASE_URL' .env.production | cut -d= -f2- | tr -d '\"')" npx prisma db push
```

### Deux remarques d'usage, sans réponse évidente

- Le tableau de bord et la bande Découvrir → Construire → Transmettre ont la même forme :
  trois boîtes bordées, côte à côte. Ça se lit, mais ça fait un écho visuel.
- Le référentiel de conformité ne contient que **deux** démarches sectorielles. Le tri
  fonctionne ; il a peu de matière à trier. L'enrichir est un travail éditorial à enjeu
  légal, pas un travail de code — chaque ajout affirme une obligation à quelqu'un qui
  monte une entreprise réelle.

---

## 7. Comptes créés pendant la session

Six comptes `autotest.claude.*@ignitux.test` sur la base de développement, créés par les
vérifications navigateur. Ils ne servent à aucun test automatique et peuvent être
supprimés.

À ne pas confondre avec `testeur1@ignitux.test` et `testeur2@ignitux.test`, qui sont de
vrais testeurs — `testeur1` porte un vrai projet.
