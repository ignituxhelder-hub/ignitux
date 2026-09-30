/**
 * DESSINE LES IMAGES DE L'APPLICATION INSTALLÉE — à relancer après toute
 * retouche du logo (`src/app/icon.svg`) ou de la liste d'appareils
 * (`src/lib/ecrans-demarrage.json`).
 *
 *   cd frontend && node scripts/generer-images-app.mjs
 *
 * Tout part d'une seule source, le logo SVG, rendu par le Chromium de
 * Playwright (déjà là pour les tests) : aucune dépendance d'image à
 * installer, et aucune icône retouchée à la main qui finirait par diverger.
 *
 * Ce qu'il produit :
 *   public/icons/icon-192.png, icon-512.png   — Android, Windows, Chrome
 *   public/icons/maskable-512.png             — Android, qui découpe l'icône
 *                                               en cercle ou en goutte : le
 *                                               logo tient dans la zone sûre
 *   src/app/apple-icon.png                    — iPhone et iPad (180 px, fond plein :
 *                                               iOS remplit la transparence de noir)
 *   public/splash/apple-splash-LxH.png        — écrans de démarrage iOS
 */

import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FOND = '#08090d';

const logo = await readFile(path.join(RACINE, 'src/app/icon.svg'), 'utf8');
// Le logo sans son carré de fond : sur les images à fond plein, c'est
// l'image qui porte le fond, et le carré arrondi y dessinerait un cadre.
const glyphe = logo.replace(/<rect[^>]*\/>/, '');
const ecrans = JSON.parse(await readFile(path.join(RACINE, 'src/lib/ecrans-demarrage.json'), 'utf8'));

function page(corps, fond = 'transparent') {
  return `<!doctype html><html><head><style>
    html,body{margin:0;width:100%;height:100%;background:${fond};overflow:hidden}
    body{display:flex;flex-direction:column;align-items:center;justify-content:center}
    svg{display:block}
  </style></head><body>${corps}</body></html>`;
}

function taille(svg, px) {
  return svg.replace(/width="64" height="64"/, `width="${px}" height="${px}"`);
}

const navigateur = await chromium.launch();
let produites = 0;

/**
 * LES CAPTURES DU MANIFESTE — `--captures http://localhost:3055`.
 *
 * Il faut une instance qui tourne (un `next start`), mais pas d'API : les
 * réponses sont fabriquées ici, avec un compte et des données fictifs. Rien
 * ne part vers le vrai serveur, aucune vraie personne n'apparaît.
 */
const indexCaptures = process.argv.indexOf('--captures');
if (indexCaptures !== -1) {
  const base = process.argv[indexCaptures + 1] ?? 'http://localhost:3055';
  await mkdir(path.join(RACINE, 'public/screenshots'), { recursive: true });

  const app = (id, nom, resume, categorie, route) => ({ id, nom, resume, categorie, route, horsOffre: false });
  const lanceur = {
    applications: [
      app('parcours', 'Mes projets', "De l'idée au lancement, étape par étape.", 'creer', '/projects'),
      app('relations', 'Relations', 'Les personnes que tu rencontres, et où vous en êtes.', 'vendre', '/crm'),
      app('facturation', 'Facturation', 'Devis et factures conformes, numérotés sans trou.', 'vendre', '/facturation'),
      app('communaute', 'Communauté', 'Les projets publics et leurs porteurs.', 'reseau', '/community'),
    ],
    suggestions: [
      {
        ...app('comptabilite', 'Comptabilité', 'Le journal, tenu à partir de tes factures.', 'gerer', '/comptabilite'),
        raison: 'Tu as émis tes premières factures : elles peuvent tenir ton journal toutes seules.',
      },
    ],
    reglages: [
      app('profil', 'Profil', '', 'reglages', '/profil'),
      app('offres', 'Offre', '', 'reglages', '/offres'),
      app('compte', 'Compte', '', 'reglages', '/account'),
    ],
    prevues: [
      {
        ...app('caisse', 'Caisse', 'Encaisser au comptoir.', 'vendre', null),
        pourToi: true,
        cadre: 'Un logiciel de caisse doit être certifié (art. 286 I 3° bis du CGI).',
      },
      { ...app('agenda', 'Agenda', 'Tes rendez-vous et ceux de ton équipe.', 'gerer', null), pourToi: false, cadre: null },
    ],
    rolesRetenus: ['entrepreneur'],
  };
  const reponses = {
    '/me/applications': lanceur,
    '/roles/moi': { roles: ['entrepreneur'], activeRole: 'entrepreneur', suggestions: [], catalogue: [] },
  };

  for (const { fichier, largeur, hauteur, ratio } of [
    { fichier: 'lanceur-telephone.png', largeur: 390, hauteur: 844, ratio: 3 },
    { fichier: 'lanceur-ordinateur.png', largeur: 1280, hauteur: 800, ratio: 1.5 },
  ]) {
    const contexte = await navigateur.newContext({
      viewport: { width: largeur, height: hauteur },
      deviceScaleFactor: ratio,
      serviceWorkers: 'block',
    });
    await contexte.addInitScript(() => {
      localStorage.setItem(
        'ignitux.auth',
        JSON.stringify({ token: 'demonstration', user: { id: 'demo', email: 'camille@exemple.test' } }),
      );
      // L'invitation à installer n'a rien à faire sur une capture qui sert
      // justement à l'installation.
      localStorage.setItem('ignitux.installation.masquee', '1');
    });
    // Toute requête hors de l'instance est l'API : on répond à sa place.
    await contexte.route(
      (url) => url.origin !== new URL(base).origin,
      (requete) => {
        const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
        // Le jeton part dans un en-tête : le navigateur demande d'abord la
        // permission, et elle doit recevoir un 2xx.
        if (requete.request().method() === 'OPTIONS') return requete.fulfill({ status: 204, headers: cors });
        const chemin = new URL(requete.request().url()).pathname;
        const corps = reponses[chemin];
        return requete.fulfill({
          status: corps ? 200 : 404,
          contentType: 'application/json',
          headers: cors,
          body: JSON.stringify(corps ?? { message: 'Absent de la démonstration.' }),
        });
      },
    );
    const onglet = await contexte.newPage();
    await onglet.goto(`${base}/accueil`, { waitUntil: 'networkidle' });
    await onglet.getByText('Ton bureau').waitFor();
    await onglet.evaluate(() => document.fonts.ready);
    await onglet.screenshot({ path: path.join(RACINE, 'public/screenshots', fichier) });
    await contexte.close();
    produites += 1;
  }
  await navigateur.close();
  console.log(`${produites} captures produites.`);
  process.exit(0);
}

async function rendre(fichier, { largeur, hauteur, ratio = 1, html, transparent = false }) {
  const contexte = await navigateur.newContext({
    viewport: { width: largeur, height: hauteur },
    deviceScaleFactor: ratio,
  });
  const onglet = await contexte.newPage();
  await onglet.setContent(html);
  await onglet.screenshot({ path: fichier, omitBackground: transparent });
  await contexte.close();
  produites += 1;
}

await mkdir(path.join(RACINE, 'public/icons'), { recursive: true });
await mkdir(path.join(RACINE, 'public/splash'), { recursive: true });

for (const px of [192, 512]) {
  await rendre(path.join(RACINE, `public/icons/icon-${px}.png`), {
    largeur: px,
    hauteur: px,
    html: page(taille(logo, px)),
    transparent: true,
  });
}

// Zone sûre d'une icône masquable : un cercle de 80 % du côté. L'anneau de
// la boussole occupe 81 % du logo ; à 72 % de l'image, il tient dedans avec
// ses quatre points cardinaux.
await rendre(path.join(RACINE, 'public/icons/maskable-512.png'), {
  largeur: 512,
  hauteur: 512,
  html: page(taille(glyphe, Math.round(512 * 0.72)), FOND),
});

await rendre(path.join(RACINE, 'src/app/apple-icon.png'), {
  largeur: 180,
  hauteur: 180,
  html: page(taille(glyphe, Math.round(180 * 0.78)), FOND),
});

for (const ecran of ecrans) {
  const cote = Math.round(Math.min(ecran.largeur, ecran.hauteur) * 0.3);
  const html = page(
    `${taille(glyphe, cote)}
     <p style="margin:${Math.round(cote * 0.18)}px 0 0;font:600 ${Math.max(14, Math.round(cote * 0.13))}px
        system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:.24em;text-transform:uppercase;
        color:#f3f4f7;padding-left:.24em">Ignitux</p>`,
    // La même braise basse que le fond de l'application : l'écran de
    // démarrage s'enchaîne sur la première page sans changement de lumière.
    `radial-gradient(120% 60% at 12% 108%, rgb(255 90 31 / 13%), transparent 62%), ${FOND}`,
  );
  const nom = `apple-splash-${ecran.largeur * ecran.ratio}x${ecran.hauteur * ecran.ratio}.png`;
  await rendre(path.join(RACINE, 'public/splash', nom), {
    largeur: ecran.largeur,
    hauteur: ecran.hauteur,
    ratio: ecran.ratio,
    html,
  });
}

await navigateur.close();
console.log(`${produites} images produites.`);
