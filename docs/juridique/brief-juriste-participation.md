# Brief pour relecture juridique — le modèle de participation IGNITUX

*Document préparé par l'équipe produit à l'attention d'un juriste (droit des sociétés et droit
financier). Il décrit **des faits** tels que le logiciel les réalise aujourd'hui, et pose **des
questions**. Il ne contient aucun avis juridique, et rien ici ne doit être lu comme une
affirmation que le dispositif est conforme ou valide. Date : 7 octobre 2026.*

## 1. Pourquoi ce brief

IGNITUX est une plateforme d'accompagnement d'entrepreneurs. Elle veut proposer un mécanisme par
lequel elle finance et accompagne un projet en prenant au départ une participation au capital de la
société, participation qui diminue ensuite jusqu'à zéro, l'entrepreneur devenant propriétaire à
100 %. Le logiciel qui suit ce mécanisme existe. **Aucun contrat n'existe**, et **aucune relecture
juridique n'a eu lieu** à ce jour. C'est l'objet de ce brief.

## 2. Le mécanisme, en clair

Trois choses distinctes, que le logiciel enregistre séparément :

**A. Le capital.** Au départ, l'entrepreneur détient une majorité et IGNITUX le reste ; la
répartition de départ actuelle est **51 % / 49 %**. Ces chiffres sont une valeur de départ **propre
à chaque accord**, pas une règle. La part d'IGNITUX ne peut que **diminuer**, par **paliers**,
jusqu'à **0 %**, l'entrepreneur atteignant alors 100 %. Les pourcentages intermédiaires sont libres
et propres à chaque projet (exemple purement illustratif : 51/49, puis 64/36, puis 88/12, puis
100/0).

**B. Aucune règle de temps.** Un palier n'est jamais déclenché par une durée ou une date. Il est
*prévu*, puis *validé par IGNITUX* lorsque des **conditions écrites pour ce projet** sont remplies,
puis *exécuté* à une date effective. Ces conditions ne sont pas encore définies par IGNITUX : le
logiciel les enregistre mais n'en invente aucune.

**C. Le droit sur les dividendes.** Une fois l'entrepreneur à 100 % (IGNITUX à 0 %), IGNITUX
conserve **5 % des dividendes effectivement distribués** (taux par défaut, porté par chaque
accord). Ce n'est **pas** une part de capital, ni du chiffre d'affaires, ni du bénéfice : sans
dividende distribué, rien n'est dû. Exemple : 10 000 € distribués → 500 € dus à IGNITUX, 9 500 € à
l'entrepreneur. Avant les 100 %, IGNITUX ne perçoit que ce que lui donne sa part de capital, sans
aucun droit supplémentaire.

**D. L'accès à l'écosystème.** Pendant et après la transmission, l'entrepreneur garde l'accès aux
outils et services IGNITUX (offre « construction » par défaut, modifiable par accord). Contractuellement,
l'intention est que le droit de 5 % soit la contrepartie de cet accès ; **techniquement les deux
sont indépendants**.

## 3. Ce que le logiciel fait, et ne fait pas

| Le logiciel **fait** | Le logiciel **ne fait pas** |
|---|---|
| Tient un registre de la répartition du capital, avec historique daté et motivé | Ne réalise aucune cession de parts ou d'actions : le registre n'a **aucun effet juridique** par lui-même |
| Refuse toute répartition où l'entrepreneur passe sous la majorité, ou où la part d'IGNITUX remonte | Ne **calcule aucun prix** : ni valorisation, ni prix de rachat des parts à chaque palier |
| Exige qu'IGNITUX (et non l'entrepreneur seul) valide chaque palier | N'**encaisse rien** et n'émet **aucun virement** (aucun fournisseur de paiement n'est branché) |
| Calcule 5 % d'un dividende que l'entrepreneur **déclare** avoir distribué (arrondi au centime) | **Ne vérifie pas** les dividendes déclarés (aucune source externe) |
| Marque une ligne « réglée » quand IGNITUX le saisit | Ne génère **aucun contrat** ni aucun document juridique |

Qui fait quoi : l'entrepreneur lit, prend connaissance d'un palier (ce qui ne le valide pas) et
déclare ses dividendes distribués. IGNITUX crée l'accord, rédige les conditions, valide et exécute
les paliers, et marque les règlements.

## 4. Les questions que nous vous posons

*Les références de textes ci-dessous sont indiquées de mémoire, par des non-juristes, comme pistes
de vérification : elles sont à confirmer ou écarter.*

1. **Qualification et régulation.** Que représente juridiquement la participation d'IGNITUX
   (financement + accompagnement contre une part du capital qui revient ensuite à l'entrepreneur) ?
   L'activité est-elle un simple accord bilatéral entre associés, ou relève-t-elle d'un statut
   réglementé (financement participatif, conseil ou services d'investissement, autre) ? Le point se
   pose d'autant plus que le logiciel comporte aussi un module de suivi d'investissements par des
   tiers (voir `docs/investisseurs/10-risques-et-reponses.md`, point 1).
2. **Le prix de la transmission.** Chaque palier fait revenir des parts à l'entrepreneur. À quel
   prix, à titre onéreux ou gratuit, et avec quelles conséquences (fiscales, de validité) ? Le produit
   ne définit **aucun** prix : comment l'encadrer (valorisation, formule, option d'achat) ?
3. **Le droit de 5 %, perpétuel.** Un droit perpétuel sur les dividendes, perçu par une personne qui
   n'est plus associée, est-il valable ? Nous avons repéré à vérifier : la prohibition des engagements
   perpétuels (art. 1210 du Code civil) et la clause léonine (art. 1844-1). Comment le rédiger pour qu'il
   soit solide (durée, résiliation, contrepartie) ?
4. **Nature et fiscalité du paiement.** Si le droit de 5 % rémunère l'accès à l'écosystème, quelle est sa
   nature (redevance, prix de service, participation aux bénéfices) ? Quel traitement pour l'entrepreneur
   (déductibilité éventuelle) et pour IGNITUX (TVA, impôt) ?
5. **Gouvernance de départ.** À 49 %, quels droits minoritaires IGNITUX peut-elle ou doit-elle avoir
   (blocage, information, sortie) ? La validation des paliers par IGNITUX s'articule comment avec le
   pacte d'associés et les statuts ?
6. **Les conditions des paliers.** Elles seront « définies ultérieurement » et propres à chaque projet.
   Un contrat peut-il renvoyer à des conditions fixées après coup par une seule partie ? Comment les
   figer sans rigidifier le modèle ?
7. **Valeur probante du registre.** Quelle valeur a un registre tenu par un logiciel (historique daté,
   validation par une personne identifiée) face à un litige ? Que faut-il y ajouter (signature
   électronique, horodatage) ?
8. **Documents et mentions.** Quels documents faut-il, et dans quel ordre : accord de participation,
   pacte d'associés, promesse ou option de cession, clause sur le droit de 5 %, adaptation des CGU et de
   la politique de confidentialité ?
9. **Cas particuliers.** Que se passe-t-il si le projet n'atteint jamais 100 %, s'il est cédé, liquidé,
   ou si l'entrepreneur refuse de déclarer un dividende ?

## 5. Ce que nous attendons de vous

- Une note de qualification et de risques (questions 1 à 4), avec les points bloquants s'il y en a.
- Les pistes de rédaction ou des modèles pour l'accord de participation et la clause sur les dividendes.
- La liste des mentions et adaptations de CGU à prévoir.
- Si le dispositif doit changer : ce que le logiciel devrait faire différemment.

## 6. Pour vérifier les faits sur pièces

- Décision de conception : `docs/decisions.md`, entrée « La participation d'IGNITUX ».
- Règles de calcul et de validation : `backend/src/participation/participation-model.ts`.
- Règles de blocage (majorité, la part d'IGNITUX ne remonte pas) : `backend/src/constitution/constitution-rules.ts`.
- Tests qui décrivent le parcours complet : `backend/test/scenarios/participation.e2e-spec.ts`.
- Point réglementaire déjà identifié : `docs/investisseurs/10-risques-et-reponses.md`.
