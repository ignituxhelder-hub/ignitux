# Rapport — où en est IGNITUX

26 septembre 2026.

## En une phrase

Le produit est prêt à ouvrir une bêta. Ce qui manque, ce n'est plus du code :
c'est un hébergement, un domaine et le mot de passe de l'email.

## Ce qui marche aujourd'hui

- On crée un compte, on décrit son projet, IGINI l'analyse et propose un
  plan en cinq étapes (Découvrir, Construire, Financer, Développer,
  Transmettre).
- Un entrepreneur a sa facturation légale, son CRM, sa comptabilité et
  ses comptes bancaires.
- Un investisseur suit chaque projet séparément ; l'argent d'un projet ne
  se mélange jamais avec celui d'un autre. C'est vérifié par des tests,
  pas seulement promis.
- Une même personne peut être entrepreneur et investisseur à la fois,
  avec deux espaces qui ne se mélangent pas.
- Le produit fonctionne hors ligne : on peut écrire sans réseau, et c'est
  envoyé au retour de la connexion — sans écraser un changement plus
  récent fait ailleurs.
- Les offres ne promettent plus ce que le budget IA ne peut pas tenir.

## Ce qu'il te reste à faire

Voir [`en-attente-paiement.md`](en-attente-paiement.md). Dans l'ordre :

1. Acheter le domaine.
2. Choisir l'hébergeur (je recommande Scalingo, ~14 €/mois).
3. Mettre le mot de passe SMTP dans `.env.production`.

Ensuite je prépare tout le déploiement ; c'est toi qui appuies sur le
bouton.

## Ce qu'il me reste à faire

Voir [`reste-a-faire.md`](reste-a-faire.md). Rien de bloquant, quatre
petites finitions (brancher le signalement d'erreurs, compléter la mémoire
IGINI, deux incohérences dans les générateurs).

## La Vision 2.0

Voir [`vision-v2-analyse.md`](vision-v2-analyse.md) pour le détail. Ce
qu'il faut retenir :

- **Bonne nouvelle : rien n'est à jeter.** Les 50 tables, les règles de
  la constitution, les modules métier restent tels quels. Ce qui change,
  c'est la façon dont la personne les découvre : IGINI au centre, des
  applications qui s'ouvrent quand elles deviennent utiles, au lieu d'un
  menu de 25 pages.
- **Une correction** : IGNITUX n'est pas en FastAPI, mais en NestJS —
  tout est en TypeScript. C'est un avantage pour le mobile.
- **Pour le mobile, je déconseille Flutter.** Il faudrait tout réécrire
  dans un autre langage. Je recommande d'abord une application web
  installable (une semaine, grâce au hors-ligne déjà fait), puis une
  vraie application des stores seulement si elle devient nécessaire.
- **Durée estimée** : 4 à 5 mois pour la Vision 2.0 avec l'application
  installable ; 7 à 9 mois avec une application des stores.
- **Le plus gros risque** : un IGINI « permanent » consomme beaucoup plus
  d'IA. Le budget de 50 €/mois doit être recalculé avant de l'ouvrir à
  tout le monde.

## IGNITUX OS

Voir [`ignitux-os.md`](ignitux-os.md). La vision « système d'exploitation
d'entreprise » est atteignable sans rien jeter, mais elle demande trois
pièces qui n'existent pas encore :

- **L'entreprise** : aujourd'hui chaque donnée appartient à une personne.
  Un restaurant avec des salariés a besoin d'une entreprise et de membres.
  C'est le chantier le plus délicat, parce qu'il touche les factures.
- **Le journal d'événements et l'ordonnanceur** : sans eux, IGINI ne peut
  rien faire de lui-même, il attend qu'on lui parle.
- **Les sessions longues** : on se reconnecte chaque jour. Acceptable sur
  le web, rédhibitoire sur mobile.

Le socle prend environ **8 à 10 mois** pour une personne seule ; la vision
complète 2030 demandera au moins un renfort. Pour Flutter : défendable si
IGNITUX doit tourner aussi sur Windows et sur des caisses, mais après la
version web installable, pas avant. Et deux modules ne se construisent pas
seuls : la caisse (certification obligatoire) et la paie — on les intègre.

## Mon conseil

Ouvrir la bêta actuelle d'abord, et commencer la Vision 2.0 ensuite, avec
les retours des vrais utilisateurs. Les deux ne se gênent pas : la
Vision 2.0 s'ajoute par-dessus, sans rien casser.
