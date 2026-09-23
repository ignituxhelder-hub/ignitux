/**
 * LE PARCOURS DU PREMIER UTILISATEUR — tout par l'interface, rien par l'API.
 *
 *   node scripts/parcours-premier-utilisateur.mjs
 *   node scripts/parcours-premier-utilisateur.mjs --telephone
 *   node scripts/parcours-premier-utilisateur.mjs --avec-ia --captures
 *
 * ── Ce que ça fait, et pourquoi c'est différent du reste ─────────────────
 *
 * `validation-reelle.mjs` prouve que les routes répondent.
 * `simulation-beta.mjs` prouve que dix profils tiennent.
 * `traversee-ecrans.mjs` prouve que chaque écran s'ouvre proprement.
 *
 * Aucun des trois ne prouve qu'on peut **aller d'un bout à l'autre** en ne
 * cliquant que sur ce qu'on voit. C'est pourtant la seule chose que fera un
 * bêta-testeur : il n'a pas de jeton, pas de \`curl\`, et pas la carte des
 * routes. S'il existe une étape où le bouton suivant n'est nulle part,
 * personne ne la franchira — et aucune des trois suites ne le dira, parce
 * que toutes trois savent où aller.
 *
 * Alors ici : aucun appel d'API, aucun jeton posé à la main, aucune URL
 * tapée en dur après la première. On lit l'écran, on cherche quoi cliquer,
 * on clique. Quand on ne trouve pas, c'est le constat.
 *
 * ── Ce qu'on note à chaque étape ─────────────────────────────────────────
 *
 *   — l'étape a-t-elle abouti ;
 *   — combien de temps elle a pris, du point de vue de la personne ;
 *   — ce que l'écran affiche, pour qu'on puisse le relire sans le rejouer ;
 *   — ce qu'on a dû chercher pour continuer, quand ce n'était pas évident.
 */
const args = process.argv.slice(2);
const lire = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : defaut;
};

const API = lire('api', 'http://127.0.0.1:3000');
const WEB = lire('web', 'http://127.0.0.1:3001');
const TELEPHONE = args.includes('--telephone');
const AVEC_IA = args.includes('--avec-ia');
const CAPTURES = args.includes('--captures');

/** iPhone 14 : la taille la plus probable chez un bêta-testeur français. */
const ECRAN = TELEPHONE ? { width: 390, height: 844 } : { width: 1280, height: 900 };

const constats = [];
const note = (etape, gravite, quoi, detail) => constats.push({ etape, gravite, quoi, detail });

const pw = await import(
  new URL('../frontend/node_modules/playwright/index.js', import.meta.url).href
);
const chromium = pw.chromium ?? pw.default.chromium;
const nav = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await nav.newContext({
  viewport: ECRAN,
  ...(TELEPHONE ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
});
const page = await ctx.newPage();

const erreurs = [];
page.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 110)));
page.on('response', (r) => {
  if (r.status() >= 500) erreurs.push(`HTTP ${r.status()} ${r.url().slice(-45)}`);
  if (r.status() === 429) erreurs.push(`HTTP 429 ${r.url().slice(-45)}`);
});

const horodatage = Date.now();
const EMAIL = `parcours.${horodatage}@ignitux.test`;
const MDP = 'MotDePasse123!';

console.log('┌─ Parcours du premier utilisateur ─────────────────────────');
console.log(`│ interface : ${WEB}`);
console.log(`│ écran     : ${ECRAN.width}×${ECRAN.height}${TELEPHONE ? ' (téléphone)' : ''}`);
console.log(`│ IA        : ${AVEC_IA ? 'appels réels' : 'non appelée'}`);
console.log('└───────────────────────────────────────────────────────────\n');

let numero = 0;
/** Une étape bloquée arrête le parcours : tout ce qui suit en dépend. */
let bloque = false;

/** Une étape : on la nomme, on la joue, on dit ce qu'on a vu. */
async function etape(nom, action) {
  if (bloque) return null;
  numero += 1;
  erreurs.length = 0;
  dormi = 0;
  const depart = Date.now();
  let resultat;
  try {
    resultat = await action();
  } catch (erreur) {
    const message = String(erreur.message).split('\n')[0].slice(0, 100);
    console.log(`  ${String(numero).padStart(2)}. ${nom.padEnd(38)} BLOQUÉ`);
    console.log(`      ${message}`);
    note(nom, 'CRITIQUE', 'étape infranchissable par l’interface', message);
    if (CAPTURES) await capturer(nom);
    // On s'arrête là. Un parcours est une chaîne : les étapes suivantes
    // supposent celle-ci franchie, et les jouer quand même produit une
    // cascade de constats qui disent tous la même chose. La première
    // version en a rendu cinq pour un seul bouton mal cherché.
    bloque = true;
    return null;
  }
  const duree = Math.max(0, Date.now() - depart - dormi);
  const lent = duree > 5000;
  console.log(
    `  ${String(numero).padStart(2)}. ${nom.padEnd(38)} ${String(duree).padStart(5)} ms  ${resultat ?? ''}`,
  );
  if (lent) note(nom, 'MOYEN', `l’étape prend ${(duree / 1000).toFixed(1)} s`);
  for (const e of erreurs) {
    const gravite = e.startsWith('HTTP 429') ? 'MAJEUR' : 'CRITIQUE';
    note(nom, gravite, e.startsWith('HTTP') ? 'réponse serveur' : 'erreur JavaScript', e);
    console.log(`      ${e}`);
  }
  if (CAPTURES) await capturer(nom);
  return resultat;
}

async function capturer(nom) {
  const fichier = `captures/${TELEPHONE ? 'tel-' : ''}${String(numero).padStart(2, '0')}-${nom
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}.png`;
  await page.screenshot({ path: fichier, fullPage: true }).catch(() => {});
}

/**
 * Attendre, sans que l'attente compte dans la durée de l'étape.
 *
 * La première version chronométrait bêtement : « Créer un projet » était
 * annoncé à 6,7 s, dont 4 s de `waitForTimeout` que j'avais écrites
 * moi-même. Mesurer sa propre patience et l'appeler lenteur du produit,
 * c'est fabriquer un défaut.
 */
let dormi = 0;
async function dormir(ms) {
  dormi += ms;
  await page.waitForTimeout(ms);
}

/** Le texte de l'écran, mis à plat — ce que la personne lit. */
const ecran = () => page.locator('body').innerText().catch(() => '');

/**
 * Déplie ce qui est replié avant de conclure à une absence.
 *
 * Une navigation repliée derrière « Tous mes outils » est un choix courant
 * et légitime. Mon harnais ne l'ouvrait pas, et concluait que les offres
 * « ne sont atteignables que par l'adresse directe » — alors qu'elles sont
 * à deux clics, dans un menu de onze liens. Chercher sans ouvrir ce qui
 * s'ouvre, c'est mesurer sa propre paresse.
 */
async function deplier() {
  for (const libelle of ['tous mes outils', 'menu', 'vue avancée', 'plus']) {
    const bouton = page
      .locator('button, [role="button"]')
      .filter({ hasText: new RegExp(libelle, 'i') })
      .first();
    if ((await bouton.count()) > 0 && (await bouton.isEnabled().catch(() => false))) {
      await bouton.click();
      await dormir(1000);
      return libelle;
    }
  }
  return null;
}

/**
 * Remplit un champ trouvé par son libellé visible.
 *
 * Même principe que `cliquerSur`, et pour la même raison : viser un champ
 * par sa position dans le DOM prouve qu'on connaît la page. La première
 * version prenait « le dernier champ texte » pour saisir une tâche, et
 * remplissait « Montant (€) » — puis concluait que la tâche n'apparaissait
 * pas. Le produit était juste ; la mesure ne l'était pas.
 */
async function remplir(libelles, valeur) {
  for (const libelle of libelles) {
    for (const selecteur of [
      `input[placeholder*="${libelle}" i]`,
      `textarea[placeholder*="${libelle}" i]`,
    ]) {
      const champ = page.locator(selecteur).first();
      if ((await champ.count()) > 0 && (await champ.isEditable().catch(() => false))) {
        await champ.fill(valeur);
        return libelle;
      }
    }
  }
  return null;
}

/**
 * Cherche de quoi continuer, par le libellé visible et non par un sélecteur.
 *
 * Un test qui vise `[data-testid="submit"]` prouve que le développeur sait
 * où est le bouton. On veut savoir si la personne le trouve : on cherche
 * donc un texte qu'elle pourrait lire.
 */
async function cliquerSur(libelles, { obligatoire = true } = {}) {
  for (const libelle of libelles) {
    const cible = page
      .locator(`a, button, [role="button"]`)
      .filter({ hasText: new RegExp(libelle, 'i') })
      .first();
    if ((await cible.count()) > 0 && (await cible.isEnabled().catch(() => false))) {
      await cible.click();
      await dormir(1500);
      return libelle;
    }
  }
  if (obligatoire) {
    const visible = (await ecran()).replace(/\s+/g, ' ').slice(0, 150);
    throw new Error(`Rien à cliquer parmi [${libelles.join(', ')}] — écran : « ${visible} »`);
  }
  return null;
}

// ══ LE PARCOURS ═══════════════════════════════════════════════════════════

await etape('Arriver sur le site', async () => {
  await page.goto(WEB, { waitUntil: 'domcontentloaded' });
  await dormir(1200);
  const texte = await ecran();
  if (texte.length < 50) throw new Error("La page d'accueil est vide");
  return `${texte.split('\n')[0].slice(0, 40)}…`;
});

await etape('Trouver comment s’inscrire', async () => {
  const quoi = await cliquerSur(["s'inscrire", 'inscription', 'créer un compte', 'commencer']);
  if (!page.url().includes('/signup')) {
    // On accepte aussi qu'on soit passé par la connexion, tant qu'on y arrive.
    await cliquerSur(["s'inscrire", 'inscription', 'créer un compte']);
  }
  return `« ${quoi} » → ${new URL(page.url()).pathname}`;
});

await etape('Remplir le formulaire d’inscription', async () => {
  await page.fill('input[type="email"]', EMAIL);
  const mdps = await page.locator('input[type="password"]').all();
  for (const champ of mdps) await champ.fill(MDP);
  await cliquerSur(["s'inscrire", 'créer', 'valider', 'continuer']);
  await dormir(2500);
  const arrive = new URL(page.url()).pathname;
  if (arrive.includes('/signup')) {
    const texte = (await ecran()).replace(/\s+/g, ' ');
    throw new Error(`Resté sur l'inscription — « ${texte.slice(0, 120)} »`);
  }
  return `→ ${arrive}`;
});

await etape('Comprendre l’écran qui suit', async () => {
  const texte = await ecran();
  const chemin = new URL(page.url()).pathname;
  // À ce stade la personne ne sait pas encore ce qu'est Ignitux. L'écran
  // doit lui dire quoi faire, pas seulement où elle est.
  if (texte.length < 120) {
    note('Écran après inscription', 'MAJEUR', 'trop peu de texte pour savoir quoi faire', texte.slice(0, 80));
  }
  return `${chemin} — ${texte.split('\n').filter(Boolean)[1]?.slice(0, 45) ?? ''}…`;
});

await etape('Choisir un rôle et continuer', async () => {
  if (!page.url().includes('/roles')) return '(pas d’écran de rôles)';
  const cases = await page.locator('input[type="checkbox"]:not([disabled])').all();
  if (cases.length === 0) throw new Error('Aucun rôle sélectionnable');
  await cases[0].check({ force: true });
  await dormir(600);
  await cliquerSur(['continuer', 'valider', 'suivant']);
  await dormir(2000);
  return `${cases.length} rôle(s) offert(s) → ${new URL(page.url()).pathname}`;
});

await etape('Lire l’écran vide des projets', async () => {
  if (!page.url().includes('/projects')) {
    await page.goto(`${WEB}/projects`, { waitUntil: 'domcontentloaded' });
    await dormir(1500);
    note('Projets', 'MOYEN', 'il a fallu taper l’adresse : aucun chemin visible depuis l’écran précédent');
  }
  const texte = await ecran();
  // Un écran vide chez quelqu'un qui arrive est normal. Ce qui ne l'est pas,
  // c'est qu'il ne dise pas quoi faire.
  if (!/aucun|pas encore|premier|commenc|cré/i.test(texte)) {
    note('Projets', 'MAJEUR', 'l’écran vide ne dit pas quoi faire', texte.replace(/\s+/g, ' ').slice(0, 90));
  }
  return `${texte.replace(/\s+/g, ' ').slice(0, 55)}…`;
});

await etape('Créer un projet', async () => {
  await cliquerSur(['nouveau projet', 'créer un projet', 'créer', 'ajouter', 'commencer']);
  await dormir(1000);
  const titre = page.locator('input[type="text"], input:not([type])').first();
  if ((await titre.count()) === 0) throw new Error('Aucun champ pour nommer le projet');
  await titre.fill('Boulangerie bio de quartier');
  const desc = page.locator('textarea').first();
  if ((await desc.count()) > 0) {
    await desc.fill(
      'Une boulangerie bio dans un quartier résidentiel de Annecy, avec du pain au levain ' +
        'et une petite restauration le midi. Je suis boulanger depuis huit ans.',
    );
  }
  // « Commencer », et non « Créer » : le produit a choisi le mot qui invite
  // plutôt que celui qui décrit. Ma première liste ne le contenait pas, et
  // le parcours s'est déclaré bloqué devant un bouton parfaitement visible.
  await cliquerSur(['commencer', 'créer', 'valider', 'enregistrer', 'ajouter']);
  await dormir(2500);
  const texte = await ecran();
  if (!texte.includes('Boulangerie')) throw new Error('Le projet créé n’apparaît nulle part');
  return 'le projet apparaît';
});

await etape('Ouvrir le projet', async () => {
  // Le produit ouvre le projet directement après sa création — c'est mieux
  // que de revenir à la liste, et ma première version l'a pris pour un
  // blocage parce qu'elle cherchait un lien « Boulangerie » à cliquer sur
  // un écran où l'on était déjà entré.
  const dejaDedans = /\/projects\/[0-9a-f-]{8,}/.test(new URL(page.url()).pathname);
  if (!dejaDedans) await cliquerSur(['Boulangerie']);
  await dormir(2000);
  const chemin = new URL(page.url()).pathname;
  if (!/\/projects\/[0-9a-f-]{8,}/.test(chemin)) {
    throw new Error(`Le clic sur le projet ne mène pas à sa page — ${chemin}`);
  }
  const texte = await ecran();
  for (const motif of ['undefined', 'NaN', '[object Object]']) {
    if (texte.includes(motif)) note('Projet', 'MAJEUR', `« ${motif} » visible`);
  }
  return `${dejaDedans ? 'ouvert d’emblée' : 'par le lien'} — ${texte.length} caractères à lire`;
});

await etape('Trouver la prochaine étape proposée', async () => {
  const texte = await ecran();
  // Le parcours en cinq étapes est le cœur de la promesse. S'il n'est pas
  // visible ici, la personne ne sait pas ce qu'Ignitux attend d'elle.
  const parle = /analyser|construire|financer|développer|transmettre|étape|parcours/i.test(texte);
  if (!parle) {
    note('Projet', 'MAJEUR', 'la page du projet ne propose aucune étape suivante');
    return 'AUCUNE étape visible';
  }
  const etapes = ['Analyser', 'Construire', 'Financer', 'Développer', 'Transmettre'].filter((e) =>
    new RegExp(e, 'i').test(texte),
  );
  return `${etapes.length}/5 étapes nommées : ${etapes.join(', ')}`;
});

await etape('Ajouter une tâche', async () => {
  // Deux essais, et la différence entre les deux est le vrai résultat.
  //
  // La page du projet s'ouvre en vue simple : trois tuiles — Étincelle,
  // Tâches, Étapes — et la prochaine étape expliquée. C'est un bon choix :
  // quelqu'un qui arrive n'a pas besoin de onze mille caractères. Mais la
  // tuile « Tâches » annonce « Aucune tâche encore » sans offrir d'y
  // remédier ; le bouton vit derrière « Vue avancée », qui ne dit pas qu'il
  // contient ça.
  //
  // Signaler « aucun moyen d'ajouter une tâche » serait faux. Ne rien
  // signaler le serait aussi : une tuile qui constate un vide sans proposer
  // de le combler est un petit cul-de-sac, même quand la sortie existe
  // ailleurs.
  const simple = await cliquerSur(['ajouter une tâche', 'nouvelle tâche'], { obligatoire: false });
  if (!simple) {
    const avance = await cliquerSur(['vue avancée', 'avancé'], { obligatoire: false });
    if (!avance) {
      note('Tâches', 'MAJEUR', 'aucun moyen d’ajouter une tâche, ni simple ni avancé');
      return 'introuvable';
    }
    await dormir(1500);
    note(
      'Tâches',
      'MOYEN',
      'la tuile « Tâches » annonce le vide sans offrir de le combler',
      'le bouton existe, mais derrière « Vue avancée », dont le libellé ne l’annonce pas',
    );
  }

  const saisi = await remplir(['ajouter une tâche', 'tâche', 'nouvelle tâche'], 'Trouver un local à Annecy');
  if (!saisi) {
    note('Tâches', 'MAJEUR', 'aucun champ identifiable pour saisir une tâche');
    return 'aucun champ trouvé';
  }
  await cliquerSur(['ajouter', 'créer', 'valider', 'enregistrer'], { obligatoire: false });
  await dormir(2000);
  const apres = await ecran();
  if (!apres.includes('Trouver un local')) {
    note('Tâches', 'MAJEUR', 'la tâche saisie n’apparaît pas à l’écran');
    return 'la tâche n’apparaît pas';
  }
  return `la tâche est là${simple ? '' : ' (via Vue avancée)'}`;
});

if (AVEC_IA) {
  await etape('Lancer une analyse IGINI', async () => {
    const clique = await cliquerSur(['analyser', 'lancer l’analyse', 'analyse'], {
      obligatoire: false,
    });
    if (!clique) {
      note('Analyse', 'MAJEUR', 'aucun bouton visible pour lancer une analyse');
      return 'pas de bouton trouvé';
    }
    // Un appel Claude prend du temps. Ce qui compte ici : est-ce que la
    // personne sait que ça travaille, ou croit-elle que rien ne se passe ?
    await dormir(1500);
    const pendant = await ecran();
    const patiente = /analyse en cours|patient|chargement|en train|\.\.\./i.test(pendant);
    if (!patiente) {
      note('Analyse', 'MAJEUR', 'rien n’indique que l’analyse travaille — l’attente paraît un bug');
    }
    for (let i = 0; i < 60; i += 1) {
      await dormir(2000);
      const texte = await ecran();
      if (/étincelle|faisabilit|risque|score|verdict/i.test(texte) && !/en cours/i.test(texte)) {
        return `analyse rendue${patiente ? ', attente signalée' : ''}`;
      }
    }
    note('Analyse', 'MAJEUR', 'aucun résultat après deux minutes');
    return 'pas de résultat en 2 min';
  });
}

await etape('Revenir à ses projets', async () => {
  const clique = await cliquerSur(['mes projets', 'projets', 'retour', 'accueil'], {
    obligatoire: false,
  });
  if (!clique) {
    note('Navigation', 'MAJEUR', 'aucun retour visible vers la liste des projets');
    return 'aucun retour trouvé';
  }
  await dormir(1500);
  return `« ${clique} » → ${new URL(page.url()).pathname}`;
});

await etape('Trouver les offres depuis l’interface', async () => {
  let clique = await cliquerSur(['offre', 'abonnement', 'tarif'], { obligatoire: false });
  let parLeMenu = false;
  if (!clique) {
    // La navigation est repliée derrière « Tous mes outils » — onze liens,
    // dont les offres. Deux clics, pas zéro chemin.
    if (await deplier()) {
      clique = await cliquerSur(['offre', 'abonnement', 'tarif'], { obligatoire: false });
      parLeMenu = Boolean(clique);
    }
  }
  if (!clique) {
    note('Offres', 'MOYEN', 'les offres ne sont atteignables que par l’adresse directe');
    return 'aucun lien trouvé';
  }
  if (parLeMenu) {
    await dormir(1500);
    return `« ${clique} » via « Tous mes outils » → ${new URL(page.url()).pathname}`;
  }
  await dormir(1500);
  return `« ${clique} » → ${new URL(page.url()).pathname}`;
});

await nav.close();

// ══ VERDICT ═══════════════════════════════════════════════════════════════

const par = (g) => constats.filter((c) => c.gravite === g);
console.log('');
console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log(
  `║  ${par('CRITIQUE').length} critique(s) · ${par('MAJEUR').length} majeur(s) · ${par('MOYEN').length} moyen(s)`.padEnd(
    64,
  ) + '║',
);
console.log('╚═══════════════════════════════════════════════════════════════╝');

for (const gravite of ['CRITIQUE', 'MAJEUR', 'MOYEN']) {
  const lot = par(gravite);
  if (!lot.length) continue;
  console.log(`\n${gravite} :`);
  for (const c of lot) console.log(`  [${c.etape}] ${c.quoi}${c.detail ? ` — ${c.detail}` : ''}`);
}

console.log(`\nCompte créé : ${EMAIL}`);
process.exit(par('CRITIQUE').length > 0 ? 1 : 0);
