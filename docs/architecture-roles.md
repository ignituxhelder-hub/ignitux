# Architecture multi-rôles IGNITUX

Une personne, un compte, plusieurs rôles. Construit et mesuré le 20 septembre 2026.

---

## Le principe qui tient tout

**Un rôle est une vue, jamais un conteneur.**

Il n'existe pas de « projets du rôle entrepreneur » : il existe des projets, et un rôle qui
les montre. Il n'existe pas d'« investissements du rôle investisseur » : il existe des
participations, et un rôle qui les montre.

C'est ce qui rend la duplication **impossible par construction** plutôt que par discipline.
Deux copies d'une même donnée finissent toujours par diverger, et le jour où elles divergent
c'est la mauvaise qui sert à calculer un versement.

Trois conséquences directes :

| Geste | Effet sur les données |
|---|---|
| Prendre un rôle | Aucun. Une porte s'ouvre. |
| Basculer de mode | Aucun. Ce qui est montré change. |
| Retirer un rôle | Aucun. Une porte se ferme. |

Et une conséquence moins évidente, qui est le cœur du dispositif : **puisque retirer un rôle
n'efface rien, retirer un rôle qui tient encore des données rendrait ces données invisibles
sans les supprimer.** C'est la pire façon de perdre quelque chose. Ignitux refuse donc le
retrait tant que des données en dépendent, et dit lesquelles.

---

## 1. Modèle de données

Une seule table nouvelle, et une colonne.

```prisma
model user_roles {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id    String    @db.Uuid
  user       users     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  role       String
  granted_at DateTime? @default(now()) @db.Timestamptz(6)

  @@unique([user_id, role])
  @@index([user_id])
}
```

Plus `users.active_role` : le mode courant, rangé en base et non dans le navigateur, pour
qu'il suive la personne d'une machine à l'autre.

**Le vocabulaire des rôles vit dans le code**, pas en base — voir
[backend/src/roles/roles-catalogue.ts](../backend/src/roles/roles-catalogue.ts). Un rôle est
une brique de produit qu'on relit, pas une donnée qu'on saisit. Même raisonnement que la
Constitution.

### Ce qu'un rôle déclare

```ts
{ id, label, summary, available, home, domains }
```

`domains` est la pièce décisive : la liste des domaines de données que ce rôle peut lire.

| Rôle | Ouvert | Espace | Domaines |
|---|---|---|---|
| Entrepreneur | oui | `/projects` | projets, facturation, relations, conformité, comptabilité |
| Investisseur | oui | `/investisseur` | investissements, portefeuille |
| Mentor | non | — | aucun |
| Expert | non | — | aucun |
| Partenaire | non | — | aucun |
| Administrateur | non | — | aucun |

**Les quatre rôles à venir sont déclarés et fermés.** Les cacher laisserait croire
qu'Ignitux ne les a pas prévus ; les ouvrir promettrait un espace qui n'existe pas. Ils
apparaissent à l'écran, désactivés, avec la raison. Un rôle fermé ne peut lire **aucun**
domaine : le jour où l'un s'ouvre, ses domaines seront écrits exprès et non hérités par
oubli.

Un test échoue si deux rôles ouverts partagent un seul domaine.

---

## 2. La règle constitutionnelle

Tu as écrit le principe. Je l'ai rendu **exécutable** plutôt que déclaratif, sous
l'article 13 (« Les données privées sont protégées par défaut »), sans toucher au corpus V1 :

> **`roles-separes`** (bloquant) — Une vue servie sous un rôle ne peut contenir que les
> domaines de données de ce rôle : les données d'un rôle ne se mélangent jamais à celles
> d'un autre.

Son point d'appel est réel, pas décoratif. Avant de servir, chaque espace déclare au moteur
les domaines qu'il s'apprête à rendre :

```ts
await this.roles.assertViewIsSeparated(userId, 'investisseur', [
  'investissements',
  'portefeuille',
]);
```

Si un domaine étranger s'y glisse, la vue est **refusée en 422** et la violation journalisée.
Le garde vaut aussi contre ma propre distraction : le jour où j'ajouterais par commodité une
ligne de projets au tableau de bord investisseur, la page cesserait de répondre.

**Ce qui reste ta décision** : en faire un 25ᵉ article de la Constitution V1. Le corpus est
ton texte ; je n'y touche pas sans que tu le dises.

---

## 3. Permissions

Deux niveaux, et la distinction compte.

**Les espaces** sont réservés par `@RequireRole('investisseur')` + `RoleGuard`. Refus en
**403**, jamais 401 : la personne est bien identifiée, c'est l'espace qui ne la concerne pas.
Un 401 la déconnecterait, ce qui serait faux et brutal. Le message nomme le rôle manquant et
dit où le prendre — un refus qui n'indique pas la sortie n'est qu'un mur.

**Les domaines** ne sont pas réservés. `/investisseurs/moi/portefeuille` n'exige aucun rôle :
il dérive déjà l'investisseur du jeton, et quelqu'un dont l'argent est placé quelque part
doit pouvoir le lire même s'il n'a jamais coché la case.

C'est volontaire. Le rôle range l'interface ; il ne garde pas l'argent.

---

## 4. Navigation

```
Inscription → « Qui es-tu aujourd'hui ? » (/roles) → l'espace choisi
```

Poser la question après l'inscription, et non avant : demander avant d'avoir montré quoi que
ce soit serait abrupt, demander après la première page de projets serait trop tard.

**Le sélecteur de mode** n'apparaît que s'il a quelque chose à dire :

| Situation | Ce qui s'affiche |
|---|---|
| Aucun rôle (comptes antérieurs) | Une invitation à choisir, sans détourner la navigation |
| Un seul rôle | Rien — un sélecteur à une option est du bruit qui ressemble à un choix |
| Un rôle, mais des données existent pour un autre | « 2 participation(s) sont enregistrées à ton nom » |
| Deux rôles ou plus | `Mode actuel : [Entrepreneur] [Investisseur]` |

Arriver sur `/investisseur` par un signet alors que le mode enregistré dit « Entrepreneur »
**aligne le mode sur l'espace** : un sélecteur qui contredit la page qu'il surmonte est pire
qu'absent.

---

## 5. API

| Route | Rôle exigé | Ce qu'elle fait |
|---|---|---|
| `GET /roles` | — (public) | Le catalogue. Savoir ce qu'on peut devenir ne demande pas de compte. |
| `GET /roles/moi` | connecté | Mes rôles, mon mode, et les suggestions |
| `PUT /roles/moi` | connecté | Prendre ou rendre des rôles |
| `PUT /roles/moi/actif` | connecté | Basculer de mode |
| `GET /espaces/entrepreneur` | entrepreneur | Le tableau de bord entrepreneur |
| `GET /espaces/investisseur` | investisseur | Le portefeuille |

**Aucune route ne prend un identifiant de personne en paramètre.** Il n'existe donc aucune
requête capable de désigner les rôles ou le portefeuille de quelqu'un d'autre : ce n'est pas
qu'elle serait refusée, c'est qu'elle ne peut pas s'écrire.

Les espaces **assemblent**, ils ne recopient pas : `SpacesService` emprunte le portefeuille à
`InvestorsService` plutôt que de relire les mouvements pour son compte.

---

## 6. Le tableau de bord investisseur

Mesuré sur un cas réel : 5 000 € placés dans « Ressourcerie du Val », 1 200 € de capital
remboursé, 400 € de dividendes, 12 % du capital.

```
Portefeuille global
  Montant investi   5 000,00 €
  Capital récupéré  1 200,00 €
  Dividendes reçus    400,00 €
  Projets                    1
  Solde net        -3 400,00 €

Mes investissements
  Ressourcerie du Val · Ouvert au financement
  Investi 5 000,00 € · Récupéré 1 200,00 € · Dividendes 400,00 € · Participation 12 %
```

Trois décisions qui méritent d'être dites :

**La participation est lue dans la table de capitalisation, jamais dans la participation.**
`participations.share_basis_points_granted` est ce qui a été accordé le jour de l'apport ;
une dilution ultérieure ne l'aurait pas modifié. L'afficher comme la part d'aujourd'hui
serait un mensonge par péremption.

**Une part absente n'est pas zéro.** Quand aucun détenteur n'est rattaché — l'apport était un
prêt, ou le rattachement n'a pas été fait — l'écran affiche « — » et dit pourquoi.

**Aucune projection.** Pas de rendement prévisionnel, pas de valorisation, pas de dividende à
venir. Ce sont les trois chiffres qu'un tableau de bord d'investissement affiche d'habitude,
et les trois qu'Ignitux ne peut pas produire honnêtement.

Le solde net reste négatif tant que le capital n'est pas rentré, et l'écran le dit : c'est
normal au début, et le masquer serait flatteur.

---

## 7. Ce qui a été vérifié dans un vrai navigateur

| Vérification | Résultat |
|---|---|
| Inscription mène à « Qui es-tu aujourd'hui ? » | oui |
| Les quatre rôles à venir sont montrés, désactivés, expliqués | oui |
| « Continuer » bloqué tant qu'aucun rôle n'est coché | oui |
| Le sélecteur propose les deux modes, marque l'actif | oui |
| La bascule mène au bon espace | oui |
| Le mode survit au rechargement | oui |
| Aucune donnée entrepreneur dans l'espace investisseur | vérifié sur 4 marqueurs + 3 montants |
| Retirer un rôle vide : accepté | oui |
| Retirer un rôle qui tient 1 participation : refusé, avec le compte exact | oui |
| L'espace reste accessible après le refus | oui |
| Les cases reviennent à la vérité du serveur après un refus | oui |
| Aucun débordement horizontal à 390 px | oui |
| Aucune erreur JavaScript | oui |

Tests : **765 côté serveur**, **251 côté interface**. Tous verts.

---

## 8. Préparer les rôles à venir

Ouvrir Mentor demande trois choses, et rien d'autre :

1. Dans [roles-catalogue.ts](../backend/src/roles/roles-catalogue.ts) : passer `available` à
   `true`, donner un `home`, et **écrire ses domaines** — qui ne doivent recouper aucun
   domaine d'un rôle déjà ouvert, sinon le test de séparation échoue.
2. Créer la page de son espace, et y appeler `assertViewIsSeparated` avec ces domaines.
3. Ajouter ce qui le rattache à des données réelles dans `RolesService.attachments`, pour que
   le retrait soit refusé quand il tient quelque chose, et suggéré quand des données existent.

Rien à changer dans le modèle de données, la navigation, le sélecteur ou les permissions.

---

## 9. Ce que cette architecture ne fait pas

- **Un rôle ne confère aucun droit sur les données d'autrui.** Il range l'interface. Les
  permissions réelles restent portées par la propriété des données.
- **Aucun rôle n'est accordé automatiquement**, même quand des données l'appelleraient. On le
  signale, la personne décide. Accorder d'office reviendrait à décider à sa place ce qu'elle
  est.
- **Les comptes antérieurs n'ont pas été rétro-attribués.** Ils voient une invitation à
  choisir là où ils sont ; leur navigation n'est pas détournée, et tout continue de
  fonctionner tant qu'ils n'ont pas répondu.
- **Le côté entrepreneur du module investisseurs n'a toujours pas d'interface.** Enregistrer
  l'apport d'un investisseur dans son projet passe encore par l'API. L'espace investisseur
  montre l'argent ; il ne permet pas encore de le saisir. C'est le prochain manque à combler,
  et il figurait déjà dans
  [la vérification d'interface](verification-interface.md).
