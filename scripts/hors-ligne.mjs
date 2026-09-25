/**
 * IGNITUX S'OUVRE-T-IL SANS CONNEXION ?
 *
 *   node scripts/hors-ligne.mjs
 *   node scripts/hors-ligne.mjs --web http://127.0.0.1:3001
 *   node scripts/hors-ligne.mjs --navigateur chromium   (intégration continue)
 *
 * ── Pourquoi une commande à part ─────────────────────────────────────────
 *
 * L'article 16 dit : « IGNITUX doit continuer à fonctionner sans
 * connexion. » Il reste marqué `declared` et non `enforced`, parce
 * qu'`enforcement` dit si **une règle du moteur** vérifie l'article — et
 * aucune règle ne peut constater depuis le serveur qu'un navigateur a bien
 * reçu son service worker.
 *
 * Ce script est ce qui tient la promesse à la place. Il coupe le réseau pour
 * de bon et regarde ce que le produit fait.
 *
 * ── Les six faits qu'il vérifie ──────────────────────────────────────────
 *
 *   1. le service worker s'installe et prend la main ;
 *   2. il garde en cache les écrans effectivement visités ;
 *   3. un de ces écrans s'ouvre sans réseau, à la bonne adresse ;
 *   4. un écran jamais visité montre la page hors ligne d'Ignitux — ni la
 *      page du navigateur, ni le boîtier d'erreur du produit ;
 *   5. cette page dit ce qui marche encore et ce qui ne marche pas ;
 *   6. le réseau revenu, tout repasse par le serveur ;
 *   7. rien de personnel ne reste dans le cache du worker.
 *
 * Le septième n'est pas une précaution de principe. Un service worker garde
 * les pages visitées, y compris celles d'une personne connectée, et ce cache
 * survit à la déconnexion. Sur un téléphone prêté, la question « que reste-
 * t-il de la session précédente ? » a une réponse, et il vaut mieux qu'elle
 * soit mesurée. Elle l'est ici : le contrôle échouerait si l'adresse du
 * compte ou le titre de son projet apparaissait dans une page mise en cache.
 *
 * C'est le seul des sept qui ait besoin du serveur — il lui faut un vrai
 * compte. Sans serveur il s'écrit « IGNORÉ » et n'échoue pas : en intégration
 * continue, seule l'interface tourne, et accuser le produit d'un manque du
 * banc d'essai serait la pire façon de rendre une commande inutile.
 *
 * Le quatrième a demandé trois essais, et les deux premiers méritent d'être
 * écrits ici parce qu'ils se représenteront :
 *
 * — Servir le HTML d'une page `/hors-ligne` sous l'adresse d'un autre écran :
 *   Next hydrate alors une route qui ne correspond pas au document,
 *   l'hydratation échoue, et le produit affiche « Quelque chose a échoué de
 *   notre côté ». C'est faux — la personne n'a plus de réseau — et c'est pire
 *   que la page du navigateur, qui au moins dit la vérité.
 *
 * — Rediriger vers une vraie page `/hors-ligne` : elle ne s'affiche pas non
 *   plus. Une page Next a besoin de son fragment JavaScript, et ce fragment
 *   n'est téléchargé que lorsqu'on visite la page — ce que personne n'avait
 *   fait. Même boîtier d'erreur, même mensonge.
 *
 * Ce qui marche est plus simple que les deux : une page autonome écrite dans
 * le worker lui-même, sans fragment, sans hydratation, sans redirection,
 * servie à l'adresse demandée. Une pièce au lieu de trois.
 */
const args = process.argv.slice(2);
const lire = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : defaut;
};

const WEB = lire('web', 'http://127.0.0.1:3001');
const API = lire('api', 'http://127.0.0.1:3000');

/**
 * Quel navigateur. Par défaut l'Edge du système, qui est installé sur la
 * machine de développement et n'a rien à télécharger. En intégration
 * continue il n'existe pas : on y passe `--navigateur chromium`, celui que
 * Playwright installe lui-même.
 *
 * Le service worker est la même norme dans les deux, et c'est ce qu'on
 * éprouve ici — pas une particularité d'Edge.
 */
const NAVIGATEUR = lire('navigateur', 'msedge');

const resultats = [];
/**
 * Trois états, et le troisième compte.
 *
 * `ignore` n'est ni un succès ni un échec : le contrôle n'a pas pu être fait.
 * Le septième a besoin du serveur, et l'intégration continue n'en lance pas —
 * l'écrire « en échec » accuserait le produit d'un manque qui est celui du
 * banc d'essai, et l'écrire « OK » serait pire encore.
 */
const noter = (etat, libelle, detail = '') => {
  resultats.push({ etat, libelle, detail });
  const marque = { ok: 'OK    ', echec: 'ÉCHEC ', ignore: 'IGNORÉ' }[etat];
  console.log(`  ${marque} ${libelle}${detail ? ` — ${detail}` : ''}`);
};

const pw = await import(
  new URL('../frontend/node_modules/playwright/index.js', import.meta.url).href
);
const chromium = pw.chromium ?? pw.default.chromium;
const nav = await chromium.launch(
  NAVIGATEUR === 'chromium'
    ? { headless: true }
    : { channel: NAVIGATEUR, headless: true },
);
const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const texte = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

console.log('┌─ Ouverture sans connexion ────────────────────────────────');
console.log(`│ interface : ${WEB}`);
console.log('└───────────────────────────────────────────────────────────\n');

try {
  // ── 1. Le worker s'installe-t-il ? ────────────────────────────────────
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  let actif = false;
  for (let essai = 0; essai < 12 && !actif; essai += 1) {
    await page.waitForTimeout(700);
    actif = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const enregistrement = await navigator.serviceWorker.getRegistration();
      return Boolean(enregistrement?.active);
    });
  }
  if (actif) noter('ok', 'Le service worker s’installe et prend la main');
  else {
    noter('echec', 'Le service worker ne s’active pas', 'rien de ce qui suit ne peut marcher');
    throw new Error('arrêt');
  }

  // Des visites APRÈS activation : ce sont elles qui remplissent le cache.
  // Avant, le worker ne contrôle pas encore la page et ne voit rien passer.
  for (const chemin of ['/signup', '/forgot-password', '/login']) {
    await page.goto(`${WEB}${chemin}`, { waitUntil: 'networkidle' });
  }

  const coquille = await page.evaluate(async () => {
    const noms = await window.caches.keys();
    const coquilles = noms.filter((n) => n.endsWith('-coquille'));
    if (coquilles.length === 0) return [];
    const cache = await window.caches.open(coquilles[0]);
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  // Rien n'est préchargé à l'installation : le worker garde ce qu'on a
  // réellement ouvert. C'est donc la visite qui doit avoir rempli le cache.
  if (coquille.includes('/signup') && coquille.includes('/login')) {
    noter('ok', 'Les écrans visités sont gardés en cache', `${coquille.length} écran(s)`);
  } else {
    noter('echec', 'Les écrans visités ne sont pas gardés', coquille.join(', ') || 'cache vide');
  }

  // ── 3 à 5. Réseau coupé ───────────────────────────────────────────────
  await ctx.setOffline(true);

  await page.goto(`${WEB}/signup`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  const vu = await texte();
  const pageNavigateur = /ERR_INTERNET_DISCONNECTED|pas connecté|not connected/i.test(vu);
  if (pageNavigateur) {
    noter('echec', 'Un écran déjà visité s’ouvre sans réseau', 'page d’erreur du navigateur');
  } else if (!/IGNITUX/i.test(vu)) {
    noter('echec', 'Un écran déjà visité s’ouvre sans réseau', vu.slice(0, 60));
  } else if (new URL(page.url()).pathname !== '/signup') {
    noter('echec', 'Un écran déjà visité garde son adresse', `arrivé sur ${new URL(page.url()).pathname}`);
  } else {
    noter('ok', 'Un écran déjà visité s’ouvre sans réseau, à la bonne adresse');
  }

  await page.goto(`${WEB}/comptabilite`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  const vu2 = await texte();
  const arrivee = new URL(page.url()).pathname;
  // Le boîtier d'erreur du produit dirait « de notre côté », ce qui est faux
  // quand la cause est l'absence de réseau.
  const mensonge = /échoué de notre côté/i.test(vu2);
  const navigateur2 = /ERR_INTERNET_DISCONNECTED|pas connecté|not connected/i.test(vu2);
  if (mensonge) {
    noter('echec', 'Un écran jamais visité montre une erreur qui accuse le produit', vu2.slice(0, 70));
  } else if (navigateur2) {
    noter('echec', 'Un écran jamais visité tombe sur la page du navigateur');
  } else if (arrivee !== '/comptabilite') {
    noter('echec', 'Un écran jamais visité perd son adresse', `arrivé sur ${arrivee}`);
  } else if (!/IGNITUX/i.test(vu2)) {
    noter('echec', 'Un écran jamais visité ne montre pas Ignitux', vu2.slice(0, 70));
  } else {
    noter('ok', 'Un écran jamais visité montre la page hors ligne d’Ignitux, à son adresse');
  }

  const diteCeQuiMarche = /écrans que tu as déjà ouverts/i.test(vu2);
  const diteCeQuiNeMarchePas = /se connecter/i.test(vu2);
  if (diteCeQuiMarche && diteCeQuiNeMarchePas) {
    noter('ok', 'La page hors ligne dit ce qui marche encore et ce qui ne marche pas');
  } else {
    noter('echec', 'La page hors ligne n’explique rien', vu2.slice(0, 70));
  }

  // ── 6. Le réseau revient ──────────────────────────────────────────────
  await ctx.setOffline(false);
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(600);
  if (/IGNITUX/i.test(await texte()) && new URL(page.url()).pathname === '/login') {
    noter('ok', 'Le réseau revenu, tout repasse par le serveur');
  } else {
    noter('echec', 'Le réseau revenu, l’application reste bloquée', new URL(page.url()).pathname);
  }

  // ── 7. Le cache ne retient rien de personnel ──────────────────────────
  //
  // Les pages d'Ignitux sont rendues sans connaître la personne : le jeton
  // vit dans le stockage local, jamais dans un cookie, donc le serveur ne
  // peut pas savoir qui demande. Les données arrivent ensuite par l'API, que
  // le worker n'intercepte jamais.
  //
  // C'est un raisonnement, et un raisonnement se vérifie. On crée un compte,
  // un projet au titre reconnaissable, on visite les écrans connectés, puis
  // on relit le cache et on y cherche ces deux chaînes.
  const horodatage = Date.now();
  const EMAIL = `horsligne.${horodatage}@ignitux.test`;
  const MDP = 'MotDePasse123!';
  const TITRE = `Projet temoin ${horodatage}`;

  // Sans serveur, ce contrôle-là ne peut pas être fait. On le dit.
  const serveurLa = await fetch(`${API}/health`)
    .then((r) => r.ok)
    .catch(() => false);
  if (!serveurLa) {
    noter(
      'ignore',
      'Le cache ne retient rien de personnel',
      `aucun serveur sur ${API} — ce contrôle demande un compte réel`,
    );
    throw new Error('fin');
  }

  const inscription = await fetch(`${API}/users/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: MDP }),
  });

  // L'inscription ne rend pas de jeton — elle rend le compte. Le jeton
  // s'obtient en se connectant, ce qui est aussi ce que fait une personne.
  const connexion = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: MDP }),
  });
  const jeton = (await connexion.json())?.accessToken ?? null;

  if (!jeton) {
    noter(
      'echec',
      'Le cache ne retient rien de personnel',
      `inscription ${inscription.status}, connexion ${connexion.status}`,
    );
  } else {
    const cree = await fetch(`${API}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
      body: JSON.stringify({ title: TITRE, description: 'Temoin pour le cache.' }),
    });
    const projetId = (await cree.json())?.id ?? null;

    // Connexion par le formulaire : c'est le chemin que les gens empruntent,
    // et c'est lui qui remplit le cache du worker.
    await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', MDP);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);

    for (const chemin of ['/projects', '/profil', projetId ? `/projects/${projetId}` : '/projects']) {
      await page.goto(`${WEB}${chemin}`, { waitUntil: 'networkidle' });
    }

    const fuite = await page.evaluate(
      async ([email, titre]) => {
        const trouve = [];
        for (const nom of await window.caches.keys()) {
          const cache = await window.caches.open(nom);
          for (const requete of await cache.keys()) {
            const reponse = await cache.match(requete);
            const texte = reponse ? await reponse.text() : '';
            if (texte.includes(email)) trouve.push(`email dans ${new URL(requete.url).pathname}`);
            if (texte.includes(titre)) trouve.push(`titre dans ${new URL(requete.url).pathname}`);
          }
        }
        return trouve;
      },
      [EMAIL, TITRE],
    );

    if (fuite.length === 0) {
      noter('ok', 'Le cache ne retient rien de personnel', 'ni l’adresse, ni le titre du projet');
    } else {
      noter('echec', 'Le cache retient des données personnelles', fuite.join(' · '));
    }

    // On rend le compte : un harnais qui laisse des comptes derrière lui
    // finit par polluer ce qu'il mesure.
    await fetch(`${API}/users/me`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
      body: JSON.stringify({ password: MDP }),
    }).catch(() => {});
  }
} catch (erreur) {
  if (!['arrêt', 'fin'].includes(String(erreur.message))) {
    noter('echec', 'Interruption', String(erreur.message).slice(0, 90));
  }
} finally {
  await nav.close();
}

const echecs = resultats.filter((r) => r.etat === 'echec');
const ignores = resultats.filter((r) => r.etat === 'ignore');
console.log('');
console.log('╔═══════════════════════════════════════════════════════════════╗');
const verdict =
  `  ${resultats.length - echecs.length - ignores.length} vérifiés · ${echecs.length} en échec` +
  (ignores.length > 0 ? ` · ${ignores.length} non fait(s)` : '');
console.log(`║${verdict.padEnd(63)}║`);
console.log('╚═══════════════════════════════════════════════════════════════╝');
process.exit(echecs.length > 0 ? 1 : 0);
