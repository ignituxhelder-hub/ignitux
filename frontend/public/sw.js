/* eslint-disable no-undef */
/**
 * LE SERVICE WORKER — pour que l'application DÉMARRE sans connexion.
 *
 * ── Ce qui manquait ──────────────────────────────────────────────────────
 *
 * L'article 16 de la Constitution dit : « IGNITUX doit continuer à
 * fonctionner sans connexion. » Les données déjà chargées restaient
 * consultables et les écritures partaient en file d'attente, mais
 * **l'application ne démarrait pas hors ligne** : un rechargement sans
 * réseau donnait la page d'erreur du navigateur, pas Ignitux.
 *
 * C'était honnête, et c'était une moitié de promesse. Ce fichier est
 * l'autre moitié.
 *
 * ── Ce qu'il fait, et la raison de chaque choix ──────────────────────────
 *
 * **Les navigations passent par le réseau d'abord.** Le cache ne sert que
 * lorsque le réseau ne répond pas. C'est l'inverse du réflexe habituel, et
 * c'est délibéré : un service worker qui sert le cache d'abord fige les
 * gens sur une version morte, parfois pendant des jours, et c'est la panne
 * la plus pénible qu'un service worker sache produire. Ici, quelqu'un de
 * connecté voit toujours le produit à jour.
 *
 * **Les ressources statiques passent par le cache d'abord.** Next leur donne
 * un nom qui contient leur empreinte : `main-a3f9c2.js` ne changera jamais
 * de contenu. Les servir depuis le cache est donc exact, et c'est ce qui
 * rend le démarrage instantané.
 *
 * **L'API n'est jamais interceptée.** Elle vit sur une autre origine, et le
 * produit a déjà son propre cache de lecture et sa file d'écriture
 * (`src/lib/offline-cache.ts`, `offline-queue.ts`). Deux caches pour la même
 * donnée finissent toujours par se contredire, et celui qu'on oublie est
 * celui qui ment.
 *
 * ── Ce qu'il ne fait pas ─────────────────────────────────────────────────
 *
 * Il ne remplace pas la file d'attente : écrire hors ligne passe toujours
 * par elle, avec son bandeau et ses avertissements. Il ne met rien en cache
 * de ce qui appartient à quelqu'un — aucune réponse d'API, aucun jeton.
 * Il rend seulement l'application capable de s'ouvrir.
 */

/**
 * Le numéro de cache. Le changer efface les anciens à la prochaine
 * activation.
 *
 * Il ne protège pas contre le code périmé — c'est le rôle du « réseau
 * d'abord » ci-dessous. Il sert à ne pas laisser s'accumuler indéfiniment
 * les ressources de versions précédentes dans le navigateur des gens.
 */
const VERSION = 'ignitux-v3';
const COQUILLE = `${VERSION}-coquille`;
const STATIQUE = `${VERSION}-statique`;

/**
 * LA PAGE HORS LIGNE, ÉCRITE ICI ET NULLE PART AILLEURS.
 *
 * Elle a d'abord été une vraie page Next, `/hors-ligne`, mise en cache à
 * l'installation. Elle ne s'affichait pas : une page Next a besoin de son
 * fragment JavaScript, et ce fragment n'est téléchargé que lorsqu'on visite
 * la page — ce que personne n'avait fait. Hors ligne, l'hydratation
 * échouait et le produit montrait son boîtier d'erreur : « Quelque chose a
 * échoué de notre côté, pas du tien. » Un mensonge, au pire moment.
 *
 * D'où cette page-ci, autonome : pas de fragment, pas d'hydratation, pas de
 * route à maintenir. Elle s'affiche même si le service worker vient d'être
 * installé, et elle ne peut pas se casser puisqu'elle ne dépend de rien.
 * Une pièce au lieu de trois.
 *
 * Elle est servie **à l'adresse demandée**, sans redirection : sans
 * hydratation, il n'y a rien à faire correspondre, et la personne garde son
 * adresse pour recharger une fois le réseau revenu.
 */
const PAGE_HORS_LIGNE = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Hors ligne — Ignitux</title>
<style>
 :root{--bg:#08090d;--surface:#14161c;--border:#272b35;--text:#f3f4f7;--muted:#99a0ae;--flame:#ff5a1f}
 *{box-sizing:border-box}
 body{margin:0;min-height:100dvh;background:var(--bg);color:var(--text);padding:2rem 1rem;
      font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;line-height:1.55;
      display:flex;justify-content:center}
 main{width:100%;max-width:30rem}
 .marque{color:var(--flame);font-weight:700;letter-spacing:.055em;text-transform:uppercase;
         font-size:.9rem;margin:0 0 1.5rem}
 h1{font-size:1.5rem;line-height:1.22;margin:0 0 .6rem}
 p{color:var(--muted);margin:0 0 1rem}
 section{background:var(--surface);border:1px solid var(--border);border-radius:14px;
         padding:1rem 1.1rem;margin:0 0 .75rem}
 h2{font-size:1rem;margin:0 0 .5rem}
 ul{color:var(--muted);margin:0;padding-left:1.15rem}
 li{margin:0 0 .4rem}
 .rappel{font-size:.9rem;margin-top:1.25rem}
</style></head>
<body><main>
 <p class="marque">Ignitux</p>
 <h1>Pas de connexion</h1>
 <p>Cet écran n'a jamais été chargé sur cet appareil, il n'y a donc rien à en
    montrer. Ce n'est pas une panne&nbsp;: Ignitux s'est ouvert sans réseau.</p>

 <section>
  <h2>Ce qui marche encore</h2>
  <ul>
   <li>Les écrans que tu as déjà ouverts restent lisibles.</li>
   <li>Ce que tu écris est gardé sur cet appareil et part dès le retour du
       réseau. Le bandeau en haut de page dit combien d'actions attendent.</li>
  </ul>
 </section>

 <section>
  <h2>Ce qui ne marche pas</h2>
  <ul>
   <li>Se connecter&nbsp;: le serveur doit vérifier le mot de passe, et rien ne
       peut le faire à sa place. Ce n'est pas mis en attente — cela ne
       servirait à rien.</li>
   <li>Tout ce qui demande une réponse du serveur&nbsp;: analyses, recherches,
       financement.</li>
  </ul>
 </section>

 <p class="rappel">Recharge cette page une fois le réseau revenu&nbsp;: l'adresse
    est restée la bonne.</p>
</main></body></html>`;

self.addEventListener('install', () => {
  // Rien à précharger : la page hors ligne est dans ce fichier, et les
  // ressources de l'application se mettent en cache à mesure qu'on s'en
  // sert. Précharger la coquille au moment de l'installation demanderait
  // de connaître les noms des fragments, qui changent à chaque build.
  //
  // Pas de `skipWaiting()`, et c'est un choix. Il remplacerait le worker
  // sous les pieds d'un onglet ouvert, au milieu d'une saisie : le code
  // change, la page non, et l'on obtient des incohérences que personne ne
  // sait reproduire. Le nouveau worker prend la main au prochain
  // chargement complet — c'est plus lent, et c'est plus sûr.
});

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    (async () => {
      const noms = await caches.keys();
      await Promise.all(
        noms.filter((nom) => !nom.startsWith(VERSION)).map((nom) => caches.delete(nom)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;

  // Une seule origine, et seulement des GET. Tout le reste — l'API, les
  // écritures, les appels vers un tiers — passe sans qu'on y touche.
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  // ── Navigation : réseau d'abord ───────────────────────────────────────
  if (requete.mode === 'navigate') {
    evenement.respondWith(
      (async () => {
        try {
          const reponse = await fetch(requete);
          // On garde la dernière page vue de chaque adresse : c'est elle qui
          // sera servie si l'on y revient sans réseau.
          const cache = await caches.open(COQUILLE);
          cache.put(requete, reponse.clone()).catch(() => {});
          return reponse;
        } catch {
          const cache = await caches.open(COQUILLE);
          const enCache = await cache.match(requete);
          if (enCache) return enCache;
          return new Response(PAGE_HORS_LIGNE, {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
      })(),
    );
    return;
  }

  // ── Ressources de Next : cache d'abord ────────────────────────────────
  //
  // Leur nom contient leur empreinte : le contenu d'une adresse donnée ne
  // change jamais. Les servir depuis le cache est donc exact, et c'est ce
  // qui fait démarrer l'application instantanément.
  if (url.pathname.startsWith('/_next/static/')) {
    evenement.respondWith(
      (async () => {
        const cache = await caches.open(STATIQUE);
        const enCache = await cache.match(requete);
        if (enCache) return enCache;
        const reponse = await fetch(requete);
        if (reponse.ok) cache.put(requete, reponse.clone()).catch(() => {});
        return reponse;
      })(),
    );
  }

  // Tout le reste : comportement par défaut du navigateur. On n'intercepte
  // que ce qu'on sait servir correctement.
});
