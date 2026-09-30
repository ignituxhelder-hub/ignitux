/**
 * IGNITUX S'INSTALLE-T-IL SUR WINDOWS, ANDROID ET IPHONE ?
 *
 *   node scripts/installable.mjs
 *   node scripts/installable.mjs --web http://127.0.0.1:3055
 *   node scripts/installable.mjs --navigateur chromium   (intégration continue)
 *
 * ── Pourquoi une commande à part ─────────────────────────────────────────
 *
 * Rien dans lint, tsc ou `next build` ne dit si l'application est
 * installable. Une icône renommée, une taille déclarée fausse, un manifeste
 * qui perd `display` : le build reste vert, et le bouton « Installer »
 * disparaît sans un message, chez tout le monde à la fois.
 *
 * ── Ce qu'il vérifie ─────────────────────────────────────────────────────
 *
 *   Windows et Android (Chrome, Edge) :
 *     1. le manifeste est servi, et complet ;
 *     2. chaque icône et chaque capture existe, à la taille qu'il annonce
 *        (dimensions lues dans le PNG, pas dans le nom du fichier) ;
 *     3. **Chromium lui-même** dit n'avoir aucune objection à l'installer —
 *        la question posée par son protocole de débogage, la même que celle
 *        qui décide d'afficher le bouton ;
 *     4. `/.well-known/assetlinks.json` répond du JSON (vide tant que
 *        l'application Android n'est pas signée : c'est dit, pas compté
 *        comme une faute).
 *
 *   iPhone et iPad (Safari ne lit presque rien du manifeste) :
 *     5. les balises Apple sont là : icône, titre, mode application ;
 *     6. chaque écran de démarrage annoncé existe, et ses dimensions sont
 *        exactement celles de l'appareil qu'il vise — iOS ignore une image
 *        à un pixel près ;
 *     7. la page accepte d'aller sous l'encoche (`viewport-fit=cover`).
 *
 * Ce qu'il ne peut pas faire : appuyer sur « Installer ». Aucun navigateur
 * n'accepte qu'un script le fasse, et c'est heureux. Le passage sur un vrai
 * téléphone reste à faire une fois l'application hébergée — la liste est
 * dans `docs/applications-natives.md`.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const lire = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : defaut;
};
const WEB = lire('web', 'http://127.0.0.1:3001');
// Edge est sur la machine de développement ; l'intégration continue passe
// `--navigateur chromium`. Même moteur, même verdict d'installation.
const NAVIGATEUR = lire('navigateur', 'msedge');

const resultats = [];
const noter = (etat, libelle, detail = '') => {
  resultats.push({ etat, libelle, detail });
  const marque = { ok: 'OK    ', echec: 'ÉCHEC ', info: 'NOTE  ' }[etat];
  console.log(`  ${marque} ${libelle}${detail ? ` — ${detail}` : ''}`);
};

/** Largeur et hauteur d'un PNG, lues dans son en-tête IHDR. */
async function dimensionsPng(url) {
  const reponse = await fetch(url);
  if (!reponse.ok) return { erreur: `HTTP ${reponse.status}` };
  const octets = Buffer.from(await reponse.arrayBuffer());
  if (octets.subarray(1, 4).toString('latin1') !== 'PNG') return { erreur: 'pas un PNG' };
  return { largeur: octets.readUInt32BE(16), hauteur: octets.readUInt32BE(20) };
}

console.log('┌─ Installation ────────────────────────────────────────────');
console.log(`│ interface : ${WEB}`);
console.log('└───────────────────────────────────────────────────────────\n');

// ── 1. Le manifeste ─────────────────────────────────────────────────────
console.log('Windows et Android');
const accueil = await fetch(`${WEB}/accueil`).then((r) => r.text());
const lienManifeste = accueil.match(/<link rel="manifest" href="([^"]+)"/)?.[1];
let manifeste = null;
if (!lienManifeste) {
  noter('echec', 'la page annonce son manifeste', 'aucune balise <link rel="manifest">');
} else {
  const reponse = await fetch(new URL(lienManifeste, WEB));
  manifeste = reponse.ok ? await reponse.json() : null;
  const manques = manifeste
    ? ['name', 'short_name', 'start_url', 'display', 'icons', 'id'].filter((c) => !manifeste[c])
    : ['tout'];
  if (manifeste && manifeste.display !== 'standalone') manques.push('display ≠ standalone');
  noter(manques.length ? 'echec' : 'ok', 'manifeste servi et complet', manques.join(', '));
}

// ── 2. Chaque image, à la taille annoncée ───────────────────────────────
if (manifeste) {
  const images = [
    ...manifeste.icons.map((i) => ({ ...i, genre: `icône ${i.purpose ?? 'any'}` })),
    ...(manifeste.screenshots ?? []).map((i) => ({ ...i, genre: `capture ${i.form_factor}` })),
    ...(manifeste.shortcuts ?? []).flatMap((r) => (r.icons ?? []).map((i) => ({ ...i, genre: `raccourci ${r.name}` }))),
  ];
  const fautes = [];
  for (const image of images) {
    const d = await dimensionsPng(new URL(image.src, WEB));
    const attendu = image.sizes;
    if (d.erreur) fautes.push(`${image.src} : ${d.erreur}`);
    else if (`${d.largeur}x${d.hauteur}` !== attendu) fautes.push(`${image.src} : ${d.largeur}x${d.hauteur} au lieu de ${attendu}`);
  }
  noter(fautes.length ? 'echec' : 'ok', `${images.length} images du manifeste à la bonne taille`, fautes.join(' ; '));
  const tailles = new Set(manifeste.icons.filter((i) => (i.purpose ?? 'any').includes('any')).map((i) => i.sizes));
  noter(
    tailles.has('192x192') && tailles.has('512x512') ? 'ok' : 'echec',
    'icônes 192 et 512 présentes (minimum de Chrome)',
  );
  noter(
    manifeste.icons.some((i) => i.purpose === 'maskable') ? 'ok' : 'echec',
    'icône masquable pour Android',
  );
  const formats = new Set((manifeste.screenshots ?? []).map((s) => s.form_factor));
  noter(
    formats.has('narrow') && formats.has('wide') ? 'ok' : 'echec',
    'captures téléphone et ordinateur (fenêtre d’installation enrichie, Microsoft Store)',
  );
}

// ── 3. Le verdict de Chromium ───────────────────────────────────────────
const pw = await import(new URL('../frontend/node_modules/playwright/index.js', import.meta.url).href);
const chromium = pw.chromium ?? pw.default.chromium;
// Un profil persistant, pas une fenêtre privée : Chromium refuse d'installer
// quoi que ce soit en navigation privée, et le dirait à juste titre.
const profil = await mkdtemp(path.join(tmpdir(), 'ignitux-installable-'));
const contexte = await chromium.launchPersistentContext(profil, {
  headless: true,
  ...(NAVIGATEUR === 'chromium' ? {} : { channel: NAVIGATEUR }),
  viewport: { width: 1280, height: 900 },
});
try {
  const page = contexte.pages()[0] ?? (await contexte.newPage());
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  let actif = false;
  for (let essai = 0; essai < 15 && !actif; essai += 1) {
    await page.waitForTimeout(600);
    actif = await page.evaluate(async () => Boolean((await navigator.serviceWorker?.getRegistration())?.active));
  }
  noter(actif ? 'ok' : 'echec', 'service worker actif (sans lui, pas d’installation)');

  const cdp = await contexte.newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  const erreurs = installabilityErrors.map(
    (e) => e.errorId + (e.errorArguments?.length ? ` (${e.errorArguments.map((a) => a.value).join(', ')})` : ''),
  );
  noter(erreurs.length ? 'echec' : 'ok', `${NAVIGATEUR} accepte d'installer Ignitux`, erreurs.join(' ; '));

  // ── 5 à 7. iPhone et iPad ─────────────────────────────────────────────
  console.log('\niPhone et iPad');
  const tete = await page.evaluate(() =>
    [...document.head.querySelectorAll('link, meta')].map((e) => ({
      rel: e.getAttribute('rel'),
      name: e.getAttribute('name'),
      href: e.getAttribute('href'),
      media: e.getAttribute('media'),
      content: e.getAttribute('content'),
    })),
  );
  const meta = (nom) => tete.find((e) => e.name === nom)?.content;
  const icone = tete.find((e) => e.rel === 'apple-touch-icon');
  const dIcone = icone ? await dimensionsPng(new URL(icone.href, WEB)) : { erreur: 'absente' };
  noter(
    dIcone.largeur === 180 && dIcone.hauteur === 180 ? 'ok' : 'echec',
    'icône d’écran d’accueil 180 × 180',
    dIcone.erreur ?? '',
  );
  noter(
    meta('apple-mobile-web-app-capable') === 'yes' || meta('mobile-web-app-capable') === 'yes' ? 'ok' : 'echec',
    's’ouvre sans barre Safari une fois ajoutée',
  );
  noter(meta('apple-mobile-web-app-title') === 'Ignitux' ? 'ok' : 'echec', 'nom sous l’icône : « Ignitux »');
  noter(/viewport-fit=cover/.test(meta('viewport') ?? '') ? 'ok' : 'echec', 'la page va sous l’encoche (viewport-fit=cover)');

  const demarrages = tete.filter((e) => e.rel === 'apple-touch-startup-image');
  const fautes = [];
  for (const ecran of demarrages) {
    const [, l, h, r] = ecran.media.match(/device-width: (\d+)px\).*device-height: (\d+)px\).*pixel-ratio: (\d+)/) ?? [];
    const d = await dimensionsPng(new URL(ecran.href, WEB));
    if (d.erreur) fautes.push(`${ecran.href} : ${d.erreur}`);
    else if (d.largeur !== l * r || d.hauteur !== h * r) {
      fautes.push(`${ecran.href} : ${d.largeur}x${d.hauteur}, l'appareil attend ${l * r}x${h * r}`);
    }
  }
  noter(
    demarrages.length > 0 && fautes.length === 0 ? 'ok' : 'echec',
    `${demarrages.length} écrans de démarrage, chacun à la taille exacte de son appareil`,
    fautes.join(' ; '),
  );
} finally {
  await contexte.close();
  await rm(profil, { recursive: true, force: true });
}

// ── 4. Android : le lien entre l'application et le site ─────────────────
console.log('\nBoutiques');
const liens = await fetch(`${WEB}/.well-known/assetlinks.json`);
const corps = liens.ok ? await liens.json().catch(() => null) : null;
if (!Array.isArray(corps)) {
  noter('echec', '/.well-known/assetlinks.json répond du JSON', `HTTP ${liens.status}`);
} else if (corps.length === 0) {
  noter('info', '/.well-known/assetlinks.json répond, vide', 'à remplir quand l’application Android sera signée');
} else {
  noter('ok', '/.well-known/assetlinks.json déclare l’application Android', corps[0].target?.package_name);
}

const echecs = resultats.filter((r) => r.etat === 'echec').length;
console.log(`\n${resultats.filter((r) => r.etat === 'ok').length} OK, ${echecs} échec(s).`);
process.exit(echecs ? 1 : 0);
