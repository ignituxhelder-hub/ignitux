/**
 * LA TRAVERSÉE DES ÉCRANS — regarder le produit avec les yeux de quelqu'un
 * qui arrive.
 *
 *   node scripts/traversee-ecrans.mjs
 *   node scripts/traversee-ecrans.mjs --web http://127.0.0.1:3001 --captures
 *
 * ── Ce que ça cherche, et que les tests ne cherchent pas ─────────────────
 *
 * Les 1 636 tests vérifient que chaque écran *fonctionne*. Aucun ne vérifie
 * qu'il se *comprend*. Ce sont deux questions différentes, et la seconde ne
 * se pose qu'en regardant la page entière, d'un coup, sans savoir ce qu'elle
 * est censée contenir.
 *
 * Cinq questions, posées à chaque écran :
 *
 *   1. Répond-il ? — pas de 5xx, pas d'erreur JavaScript.
 *   2. Se nomme-t-il ? — un `<h1>` et un seul. Deux titres, c'est deux
 *      pages empilées ; zéro, c'est une page dont on ne sait pas où on est.
 *   3. Laisse-t-il fuir de la technique ? — `undefined`, `NaN`,
 *      `[object Object]`, un nom de table, une pile d'appels. Ce sont des
 *      mots qui n'appartiennent pas à la personne qui lit.
 *   4. S'il est vide, s'explique-t-il ? — un écran vide est normal chez
 *      quelqu'un qui arrive. Un écran vide SANS phrase qui dise pourquoi et
 *      quoi faire, c'est le produit qui laisse quelqu'un devant une porte
 *      close en supposant qu'il devinera. Un écran de formulaire ne compte
 *      pas comme vide : le formulaire est son contenu.
 *   5. Est-ce un cul-de-sac ? — au moins un lien, un bouton ou un champ pour
 *      continuer. Une page sans sortie oblige à revenir en arrière, et
 *      chaque retour en arrière est un endroit où on abandonne.
 *
 * ── Ce que ça ne remplace pas ────────────────────────────────────────────
 *
 * Le jugement. Ce script signale ce qui est mesurable ; il ne dit pas si une
 * phrase est bien écrite ni si un enchaînement a du sens. Il réduit la liste
 * à regarder, il ne la supprime pas.
 *
 * ── Ce qu'il a coûté d'apprendre ─────────────────────────────────────────
 *
 * Sa première exécution a rendu quatorze constats. Aucun n'était réel :
 * treize venaient d'une seule connexion échouée — bloquée par CORS, parce
 * que je naviguais depuis une origine que le serveur n'autorise pas — et le
 * quatorzième appelait « cul-de-sac » un écran fait de cases à cocher.
 * Un harnais qui multiplie une cause par le nombre d'écrans fait perdre
 * exactement le temps qu'il prétend faire gagner ; les trois garde-fous
 * ci-dessous existent à cause de ça.
 */
const args = process.argv.slice(2);
const lire = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : defaut;
};

const API = lire('api', 'http://127.0.0.1:3000');
const WEB = lire('web', 'http://127.0.0.1:3001');
const CAPTURES = args.includes('--captures');

/** Les mots qui n'appartiennent pas à la personne qui lit l'écran. */
const FUITES = [
  'undefined',
  'NaN',
  '[object Object]',
  'null,',
  'Prisma',
  'at Object.',
  'Error:',
  'ECONNREFUSED',
];

/**
 * En dessous, on considère l'écran comme vide.
 *
 * Deux cents caractères, c'est un titre, une phrase et un bouton. Moins que
 * ça, il n'y a rien à lire — reste à savoir si le produit le dit.
 */
const SEUIL_VIDE = 200;

/** Ce qu'on accepte comme « l'écran vide s'explique ». */
const EXPLIQUE = /aucun|pas encore|vide|commenc|cré(e|é)|ajout|premi(er|ère)|rien .*(ici|pour l)/i;

const ECRANS = [
  { chemin: '/', nom: 'Accueil', public: true },
  { chemin: '/login', nom: 'Connexion', public: true },
  { chemin: '/signup', nom: 'Inscription', public: true },
  { chemin: '/forgot-password', nom: 'Mot de passe oublié', public: true },
  { chemin: '/offres', nom: 'Offres' },
  { chemin: '/projects', nom: 'Projets' },
  { chemin: '/profil', nom: 'Profil' },
  { chemin: '/account', nom: 'Compte' },
  { chemin: '/constitution', nom: 'Constitution' },
  { chemin: '/consommation-ia', nom: 'Consommation IA' },
  { chemin: '/roles', nom: 'Rôles' },
  { chemin: '/community', nom: 'Communauté' },
  { chemin: '/marketplace', nom: 'Place de marché' },
  { chemin: '/crm', nom: 'Clients' },
  { chemin: '/banque', nom: 'Banque' },
  { chemin: '/comptabilite', nom: 'Comptabilité' },
  { chemin: '/facturation', nom: 'Facturation' },
  { chemin: '/investisseur', nom: 'Investisseur' },
];

const resultats = [];
const note = (ecran, gravite, quoi, detail) =>
  resultats.push({ ecran, gravite, quoi, detail });

// ── Un compte neuf, comme quelqu'un qui arrive ────────────────────────────

const horodatage = Date.now();
const EMAIL = `traversee.${horodatage}@ignitux.test`;
const MDP = 'MotDePasse123!';

const inscription = await fetch(`${API}/users/signup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: MDP }),
});
if (inscription.status >= 400) {
  console.error(`Inscription impossible (HTTP ${inscription.status}) — le serveur répond-il ?`);
  process.exit(1);
}

const pw = await import(
  new URL('../frontend/node_modules/playwright/index.js', import.meta.url).href
);
const chromium = pw.chromium ?? pw.default.chromium;
const nav = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await nav.newContext({ viewport: { width: 1280, height: 1800 } });
const page = await ctx.newPage();

let erreursJs = [];
let reponses5xx = [];
/** Les blocages du navigateur, qui ne remontent pas comme des erreurs de page. */
const erreursCors = [];
page.on('console', (m) => {
  const t = m.text();
  if (/CORS|Access to fetch|blocked by/i.test(t)) erreursCors.push(t.slice(0, 150));
});
page.on('pageerror', (e) => erreursJs.push(String(e.message).slice(0, 120)));
page.on('response', (r) => {
  if (r.status() >= 500) reponses5xx.push(`HTTP ${r.status()} ${r.url().slice(0, 70)}`);
});

console.log(`┌─ Traversée des écrans ────────────────────────────────────`);
console.log(`│ interface : ${WEB}`);
console.log(`│ compte    : ${EMAIL}`);
console.log(`│ écrans    : ${ECRANS.length}`);
console.log(`└───────────────────────────────────────────────────────────\n`);

// ── La connexion, par l'interface et non par l'API ───────────────────────
//
// Se connecter en posant un jeton dans le stockage local testerait un
// chemin que personne n'emprunte. On remplit le formulaire.

// Une interface injoignable n'est pas un défaut du produit, c'est une
// commande lancée contre rien. On le dit au lieu de dérouler une pile.
try {
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
} catch (erreur) {
  console.error(`Interface injoignable sur ${WEB} — ${String(erreur.message).split('\n')[0]}`);
  console.error('Vérifier que l’interface tourne, et à quelle adresse.');
  await nav.close();
  process.exit(1);
}
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', MDP);
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);

/**
 * Si la connexion échoue, on s'arrête là.
 *
 * La première version continuait : les dix-huit écrans suivants redirigeaient
 * vers `/login`, et le rapport annonçait **treize défauts majeurs** pour une
 * seule cause. Un rapport qui multiplie un problème par le nombre d'écrans
 * fait perdre exactement le temps qu'il prétend faire gagner — et enterre le
 * vrai constat sous ses propres conséquences.
 */
const connecte = !page.url().includes('/login');
if (!connecte) {
  const texte = await page.locator('body').innerText().catch(() => '');
  // La cause la plus fréquente et la plus déroutante : le serveur n'autorise
  // qu'une origine, et on navigue depuis une autre. Le navigateur bloque, et
  // l'écran dit seulement « Connexion impossible ».
  const cors = erreursCors.length > 0;
  console.log(`Connexion : ÉCHEC — resté sur ${page.url()}\n`);
  console.log('ARRÊT. Sans session, les dix-huit écrans suivants redirigeraient tous');
  console.log('vers /login, et le rapport dirait dix-huit fois la même chose.\n');
  if (cors) {
    console.log("CAUSE : le navigateur a bloqué l'appel (CORS).");
    console.log(`  ${erreursCors[0]}`);
    console.log(`  Le serveur n'autorise qu'une origine — celle de FRONTEND_URL.`);
    console.log(`  Relancer la traversée depuis cette origine-là, ou redémarrer le`);
    console.log(`  serveur avec FRONTEND_URL=${WEB}.`);
  } else {
    console.log(`Ce que dit l'écran : « ${texte.replace(/\s+/g, ' ').slice(0, 160)} »`);
  }
  await nav.close();
  process.exit(1);
}
console.log('Connexion : ok\n');

for (const ecran of ECRANS) {
  erreursJs = [];
  reponses5xx = [];

  await page.goto(`${WEB}${ecran.chemin}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1200);

  const arrive = new URL(page.url()).pathname;
  const redirige = arrive !== ecran.chemin;

  const texte = await page.locator('body').innerText().catch(() => '');
  const h1 = await page.locator('h1').count().catch(() => 0);
  /**
   * Ce qui compte comme « on peut continuer ».
   *
   * La première version ne regardait que les liens et les boutons actifs, et
   * déclarait l'écran des rôles en cul-de-sac. C'est faux : cet écran est
   * fait de cases à cocher, et son bouton « Continuer » est délibérément
   * désactivé tant qu'aucun rôle n'est choisi — ce qui est juste, puisque
   * sans rôle le produit ne saurait plus quoi montrer. Cocher une case
   * l'active, et il mène à /projects.
   *
   * Un formulaire est une sortie, même quand son bouton attend une saisie.
   */
  const sorties = await page
    .locator(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
        'select:not([disabled]), textarea:not([disabled])',
    )
    .count()
    .catch(() => 0);
  const champs = await page
    .locator('input:not([type="hidden"]), select, textarea')
    .count()
    .catch(() => 0);

  const ligne = [];

  if (redirige && !ecran.public) {
    // Une redirection vers /login sur un écran qui demande un compte est
    // correcte. Ailleurs, c'est un écran qu'on ne peut pas atteindre.
    if (arrive.includes('/login')) {
      note(ecran.nom, 'MAJEUR', 'renvoie vers la connexion alors qu’on est connecté', arrive);
      ligne.push('→ login');
    } else {
      ligne.push(`→ ${arrive}`);
    }
  }

  if (reponses5xx.length) {
    note(ecran.nom, 'CRITIQUE', 'erreur serveur pendant le chargement', reponses5xx[0]);
    ligne.push(`${reponses5xx.length} erreur(s) 5xx`);
  }
  if (erreursJs.length) {
    note(ecran.nom, 'MAJEUR', 'erreur JavaScript', erreursJs[0]);
    ligne.push(`${erreursJs.length} erreur(s) JS`);
  }

  if (h1 === 0) {
    note(ecran.nom, 'MOYEN', 'aucun titre : on ne sait pas où on est');
    ligne.push('0 h1');
  } else if (h1 > 1) {
    note(ecran.nom, 'MINEUR', `${h1} titres de niveau 1`);
    ligne.push(`${h1} h1`);
  }

  for (const fuite of FUITES) {
    if (texte.includes(fuite)) {
      note(ecran.nom, 'MAJEUR', `« ${fuite} » visible à l’écran`, extrait(texte, fuite));
      ligne.push(`fuite : ${fuite}`);
      break;
    }
  }

  // Un écran de formulaire n'est pas vide : le formulaire EST son contenu.
  // Sans cette réserve, « Mot de passe oublié » — un titre, un champ, un
  // bouton, un retour — passait pour un écran sans rien à lire.
  if (texte.length < SEUIL_VIDE && champs === 0) {
    if (EXPLIQUE.test(texte)) {
      ligne.push(`vide mais expliqué (${texte.length} car.)`);
    } else {
      note(
        ecran.nom,
        'MOYEN',
        'écran vide qui ne dit ni pourquoi ni quoi faire',
        `${texte.length} caractères : « ${texte.replace(/\s+/g, ' ').slice(0, 60)} »`,
      );
      ligne.push(`VIDE non expliqué (${texte.length} car.)`);
    }
  }

  if (sorties === 0) {
    note(ecran.nom, 'MAJEUR', 'cul-de-sac : ni lien, ni bouton, ni champ pour continuer');
    ligne.push('cul-de-sac');
  }

  const verdict = ligne.length === 0 ? 'ok' : ligne.join(' · ');
  const marque = ligne.length === 0 ? '  ok  ' : '  !!  ';
  console.log(`${marque}${ecran.nom.padEnd(22)}${verdict}`);

  if (CAPTURES && ligne.length > 0) {
    const nom = ecran.chemin.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'accueil';
    await page.screenshot({ path: `captures/${nom}.png`, fullPage: true }).catch(() => {});
  }
}

await nav.close();

// ── Verdict ──────────────────────────────────────────────────────────────

const par = (g) => resultats.filter((r) => r.gravite === g);
console.log('');
console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log(
  `║  ${par('CRITIQUE').length} critique(s) · ${par('MAJEUR').length} majeur(s) · ${par('MOYEN').length} moyen(s) · ${par('MINEUR').length} mineur(s)`.padEnd(
    64,
  ) + '║',
);
console.log('╚═══════════════════════════════════════════════════════════════╝');

for (const gravite of ['CRITIQUE', 'MAJEUR', 'MOYEN', 'MINEUR']) {
  const lot = par(gravite);
  if (!lot.length) continue;
  console.log(`\n${gravite} :`);
  for (const r of lot) {
    console.log(`  [${r.ecran}] ${r.quoi}${r.detail ? ` — ${r.detail}` : ''}`);
  }
}

console.log(`\nCompte créé : ${EMAIL}`);
process.exit(par('CRITIQUE').length > 0 ? 1 : 0);

function extrait(texte, motif) {
  const i = texte.indexOf(motif);
  return texte
    .slice(Math.max(0, i - 30), i + motif.length + 30)
    .replace(/\s+/g, ' ')
    .trim();
}
