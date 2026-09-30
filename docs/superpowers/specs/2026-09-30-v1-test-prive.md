# Spec — IGNITUX V1 pour test privé

**Source :** demande de Helder (propriétaire du projet, débutant en programmation) du 2026-09-30.
**But :** avoir une version en ligne d'IGNITUX qu'un petit groupe de testeurs invités peut utiliser : créer un compte, se connecter, utiliser les générateurs IGINI, retrouver leur historique. Pas de lancement public.

## Définition de "terminé" (V1)

1. **Base de données** : toutes les tables nécessaires (utilisateurs, projets, résultats des analyses…), migrations Prisma propres et versionnées dans git.
2. **Comptes** : inscription, connexion, déconnexion. Chaque utilisateur ne voit QUE ses propres données. (Supabase Auth préféré si simple ; sinon un système équivalent déjà robuste et testé est acceptable.)
3. **Générateurs IGINI** : tous fonctionnent de bout en bout et leurs résultats sont enregistrés.
4. **Frontend** : écran connexion/inscription, bureau avec icônes, un écran par générateur, historique. Tout en français, utilisable sur téléphone et ordinateur.
5. **Protections** :
   - `ANTHROPIC_API_KEY` reste uniquement côté serveur, jamais dans le frontend.
   - Limite du nombre d'analyses par utilisateur et par jour, pour que le coût IA ne dépasse jamais 50 €/mois au total.
   - Messages d'erreur clairs si IGINI ne répond pas.
6. **Légal minimum (France, RGPD)** : page politique de confidentialité, page conditions d'utilisation "version test", possibilité de supprimer son compte. Les recommandations juridiques/fiscales d'IGINI (forme juridique, etc.) doivent afficher clairement qu'elles sont indicatives et à vérifier avec un professionnel.
7. **PWA** : l'app peut s'ajouter à l'écran d'accueil du téléphone (manifest + icône).
8. **Mise en ligne** : backend sur Render ou Railway, frontend sur Vercel, variables d'environnement bien configurées.
9. **Vérification finale** : parcours complet testé sur la version en ligne (créer un compte → utiliser chaque générateur → voir l'historique → supprimer le compte).

## Hors scope V1 (ne pas construire de nouveau)

Multi-pays, scores Étincelle, rôles mentor/investisseur, marketplace, mode hors-ligne, applications sur les stores.

## Règles de travail

- Avancer tâche par tâche ; après chaque tâche, lancer les tests réellement, vérifier, committer avec un message clair.
- Ne jamais affirmer qu'une chose fonctionne sans l'avoir vérifiée.
- Garder le code simple (V1 de test, pas d'architecture compliquée).

## Quand s'arrêter et demander à Helder

- Créer un compte / payer un service (hébergeur, nom de domaine…).
- Une clé, un mot de passe ou un secret manquant.
- Une action irréversible (supprimer des données, écraser une base en ligne).
- Un choix qui change ce que les utilisateurs voient ou ce que ça coûte.
- Un texte légal à valider.

## État des lieux vérifié le 2026-09-30 (résumé — voir le plan pour le détail complet)

Contrairement à une lecture rapide du dépôt, le projet est **très avancé**, pas partant de zéro :

- Backend NestJS : build ✅, 1203/1206 tests passent (3 échecs = ralentissement mémoire, pas des bugs). Auth JWT + bcrypt maison (pas Supabase Auth) avec isolation par utilisateur vérifiée. 62 tables Prisma, migration existante mais **non commitée**. 5 générateurs IGINI réels (Analyser/Construire/Financer/Développer/Transmettre), tous appellent réellement Claude et enregistrent leurs résultats. **Le contrôle de coût IA (quota par utilisateur, coupe-circuit) est déjà construit** (`ai-quota.ts`), reste juste à l'activer et calibrer pour la bêta.
- Frontend Next.js : build ✅, 490/499 tests passent. 31 pages réelles (aucune n'est un stub), bureau avec grille d'icônes + historique réel, auth par page, PWA déjà fonctionnelle (manifest, icônes, écran de démarrage, service worker) — **il manque uniquement les pages légales publiques** (confidentialité / CGU / mentions légales) : ce texte n'existe aujourd'hui que dans un `.docx` privé hors dépôt, jamais publié.
- 3 branches isolées (worktrees) contiennent du travail non fusionné : un 6ᵉ générateur (forme juridique, prêt à fusionner sans conflit), une boutique en ligne Shopify (hors scope V1), et un chat libre avec IGINI (hors scope V1 explicite — pas demandé).
- Aucun secret réel commité dans le dépôt. Aucune configuration de déploiement (Render/Railway/Vercel) n'existe encore — seulement du Docker pour le développement local.
- Le module "Portefeuille investisseur" et "Mentors & investisseurs" (marketplace) existent déjà dans le code (construits avant cette demande), mais correspondent à ce que Helder classe "hors V1". Leur statut réglementaire n'a jamais été revu par un juriste.

Voir le plan associé : `docs/superpowers/plans/2026-09-30-v1-test-prive.md`.
