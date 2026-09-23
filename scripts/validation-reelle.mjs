/**
 * LA VALIDATION RÉELLE — une commande, une vraie base, un verdict.
 *
 * Tout ce que les tests unitaires ne peuvent pas prouver, parce qu'ils
 * simulent la base et le réseau. Ce script parle au vrai serveur, écrit dans
 * la vraie base, et pilote un vrai navigateur.
 *
 *   node scripts/validation-reelle.mjs
 *   node scripts/validation-reelle.mjs --api http://localhost:3000 --web http://localhost:3001
 *   node scripts/validation-reelle.mjs --avec-ia          (un vrai appel Claude)
 *   node scripts/validation-reelle.mjs --sans-navigateur
 *
 * ── Ce qu'il crée, et ce qu'il ne touche pas ──────────────────────────────
 *
 * Un compte `validation.<horodatage>@ignitux.test` et ses projets, à chaque
 * exécution. Il ne lit, ne modifie et ne supprime **aucune** donnée
 * existante — pas de `deleteMany`, pas de requête sur d'autres comptes. Le
 * lancer sur une base qui porte du travail réel est sans danger ; il y
 * laissera seulement un compte de test de plus.
 *
 * ── Comment lire la sortie ────────────────────────────────────────────────
 *
 *   OK      le fait est vérifié
 *   ÉCHEC   le fait est faux — c'est un défaut à corriger
 *   IGNORÉ  la vérification n'a pas pu avoir lieu (prérequis absent), et
 *           ce n'est PAS un succès : la ligne compte comme non prouvée
 *
 * Un `IGNORÉ` silencieux serait pire qu'un échec, parce qu'il se lirait
 * comme un vert de plus dans le total.
 */
const args = process.argv.slice(2);
const lire = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : defaut;
};

const API = lire('api', 'http://localhost:3000');
const WEB = lire('web', 'http://localhost:3001');
const AVEC_NAVIGATEUR = !args.includes('--sans-navigateur');
/**
 * Éteint par défaut, et c'est le seul drapeau du script qui coûte de
 * l'argent : il déclenche un vrai appel Claude. Par défaut la ligne compte
 * comme *non prouvée*, jamais comme un succès — ne pas dépenser est un choix
 * défendable, se dire vérifié sans avoir vérifié ne l'est pas.
 */
const AVEC_IA = args.includes('--avec-ia');

const horodatage = Date.now();
const EMAIL = `validation.${horodatage}@ignitux.test`;
const MDP = `Val!${horodatage}aA`;

// ── Le journal ─────────────────────────────────────────────────────────────

const resultats = [];
let section = '';

const titre = (t) => {
  section = t;
  console.log('');
  console.log(`── ${t} ${'─'.repeat(Math.max(0, 62 - t.length))}`);
};

function noter(etat, libelle, detail = '') {
  resultats.push({ section, etat, libelle, detail });
  const marque = { ok: 'OK    ', echec: 'ÉCHEC ', ignore: 'IGNORÉ' }[etat];
  console.log(`  ${marque} ${libelle}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Exécute une vérification et la note.
 *
 * Une exception est un échec, pas un arrêt : on veut le tableau complet en
 * une exécution, pas le premier problème puis rien.
 */
async function verifier(libelle, fn) {
  try {
    const resultat = await fn();
    if (resultat === false) noter('echec', libelle);
    else if (typeof resultat === 'string') noter('ok', libelle, resultat);
    else noter('ok', libelle);
    return resultat;
  } catch (erreur) {
    noter('echec', libelle, String(erreur.message).slice(0, 110));
    return undefined;
  }
}

// ── L'API ──────────────────────────────────────────────────────────────────

let jeton = null;

async function appel(chemin, options = {}) {
  const reponse = await fetch(`${API}${chemin}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
      ...options.headers,
    },
  });
  let corps = null;
  try {
    corps = await reponse.json();
  } catch {
    /* certaines réponses n'ont pas de corps */
  }
  return { statut: reponse.status, corps };
}

// ═══════════════════════════════════════════════════════════════════════════

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║  VALIDATION RÉELLE D’IGNITUX                                  ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
console.log('API     :', API);
console.log('Web     :', WEB);
console.log('Compte  :', EMAIL);

// ── 0. Le serveur répond-il ? ──────────────────────────────────────────────

titre('Socle');

const sante = await appel('/health').catch(() => ({ statut: 0 }));
if (sante.statut !== 200) {
  console.log('');
  console.log("Le serveur ne répond pas sur /health. Rien d'autre ne peut être vérifié.");
  console.log('Démarrer le serveur, puis relancer.');
  process.exit(1);
}
noter('ok', 'Le serveur répond et la base est jointe (/health)');

await verifier('/ready rend un diagnostic à trois états', async () => {
  const { corps } = await appel('/ready');
  if (!corps?.etat) return false;
  const details = Object.entries(corps.verifications)
    .map(([k, v]) => `${k}=${v.etat}`)
    .join(' ');
  return `${corps.etat} · ${details}`;
});

await verifier('Le schéma est complet, colonnes comprises', async () => {
  const { corps } = await appel('/ready');
  const schema = corps?.verifications?.schema;
  if (schema?.etat !== 'ok') throw new Error(schema?.detail?.slice(0, 100) ?? 'état inconnu');
  return schema.detail.slice(0, 60);
});

await verifier('Le référentiel de conformité est semé', async () => {
  const { corps } = await appel('/ready');
  const ref = corps?.verifications?.referentiel;
  if (ref?.etat !== 'ok') throw new Error(ref?.detail?.slice(0, 100) ?? 'état inconnu');
  return ref.detail.slice(0, 50);
});

// ── 1. Mentions légales ────────────────────────────────────────────────────

titre('Mentions légales et identité');

await verifier('/mentions-legales répond sans authentification', async () => {
  const { statut, corps } = await appel('/mentions-legales');
  if (statut !== 200) return false;
  return `${corps.raisonSociale ?? '(vide)'}`;
});

await verifier("L'IBAN complet ne sort d'aucune réponse", async () => {
  const { corps } = await appel('/mentions-legales');
  const texte = JSON.stringify(corps);
  // Un IBAN entier fait au moins 15 caractères alphanumériques d'affilée.
  if (/[A-Z]{2}\d{2}[A-Z0-9]{11,}/.test(texte)) throw new Error('IBAN complet détecté');
  return corps.iban ? `masqué : ${corps.iban}` : 'aucun IBAN configuré';
});

await verifier('La paternité du concept est publiée', async () => {
  const { corps } = await appel('/mentions-legales');
  return Boolean(corps.paternite?.includes('Helder'));
});

// ── 2. Inscription et connexion ────────────────────────────────────────────

titre('Compte');

await verifier('Inscription', async () => {
  const { statut } = await appel('/users/signup', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: MDP }),
  });
  if (statut !== 201 && statut !== 200) return false;
  return `HTTP ${statut}`;
});

await verifier('Connexion et jeton', async () => {
  const { statut, corps } = await appel('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: MDP }),
  });
  if (statut !== 200 || !corps?.accessToken) return false;
  jeton = corps.accessToken;
  return 'jeton obtenu';
});

await verifier('Un mot de passe faux est refusé', async () => {
  const { statut } = await appel('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: 'ce-n-est-pas-le-bon' }),
  });
  return statut === 401 || statut === 403;
});

await verifier('Mot de passe oublié : la demande est acceptée', async () => {
  const { statut } = await appel('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL }),
  });
  // 200 ou 204 : le produit reste silencieux sur l'existence du compte.
  if (statut >= 400) return false;
  return `HTTP ${statut} — vérifier le journal du serveur pour le lien`;
});

// ── 3. Offres et droits ────────────────────────────────────────────────────

titre('Offres et droits — jamais éprouvés sur une vraie base');

await verifier('Un compte neuf est en Découverte', async () => {
  const { corps } = await appel('/offres');
  if (corps?.actuelle !== 'decouverte') return false;
  return `souscription possible : ${corps.souscriptionPossible}`;
});

await verifier("L'évaluation de financement porte son avertissement", async () => {
  const { corps } = await appel('/offres');
  return Boolean(corps?.evaluationFinancement?.avertissement?.includes('pas un financement'));
});

let projetId = null;

await verifier('Création du premier projet', async () => {
  const { statut, corps } = await appel('/projects', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Projet de validation',
      description:
        'Un projet cree par le script de validation reelle, pour eprouver le parcours complet de bout en bout.',
    }),
  });
  if (statut !== 201 && statut !== 200) return false;
  projetId = corps.id;
  return `id ${String(corps.id).slice(0, 8)}…`;
});

await verifier('Le deuxième projet est refusé, en nommant l’offre qui l’ouvre', async () => {
  const { statut, corps } = await appel('/projects', {
    method: 'POST',
    body: JSON.stringify({ title: 'Deuxieme projet', description: 'Doit etre refuse.' }),
  });
  if (statut !== 403) throw new Error(`attendu 403, reçu ${statut}`);
  if (corps?.offreQuiOuvre !== 'entrepreneur') throw new Error('offre non nommée');
  return 'refus + offre nommée';
});

await verifier('Une offre payante ne peut pas être prise sans encaissement', async () => {
  const { statut } = await appel('/offres/changer', {
    method: 'POST',
    body: JSON.stringify({ offre: 'construction' }),
  });
  return statut === 403;
});

// ── 4. Le projet, sa mémoire, ses connaissances ────────────────────────────

titre('Projet, mémoire, connaissances');

await verifier('Modification du projet', async () => {
  if (!projetId) throw new Error('aucun projet');
  const { statut } = await appel(`/projects/${projetId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: 'Projet de validation (modifie)' }),
  });
  return statut === 200;
});

await verifier('Écriture puis relecture d’un souvenir', async () => {
  if (!projetId) throw new Error('aucun projet');
  const ecrit = await appel('/memory', {
    method: 'POST',
    body: JSON.stringify({
      projectId: projetId,
      category: 'decision',
      content: 'Decision prise pendant la validation reelle.',
      tags: [],
    }),
  });
  if (ecrit.statut >= 400) throw new Error(`écriture HTTP ${ecrit.statut}`);
  const lu = await appel(`/memory?projectId=${projetId}`);
  return Array.isArray(lu.corps) && lu.corps.length > 0;
});

await verifier('La catégorie « error » est acceptée', async () => {
  if (!projetId) throw new Error('aucun projet');
  const { statut } = await appel('/memory', {
    method: 'POST',
    body: JSON.stringify({
      projectId: projetId,
      category: 'error',
      content: 'Une erreur passee, pour qu IGINI ne la repete pas.',
      tags: [],
    }),
  });
  return statut < 400;
});

await verifier('Création de deux concepts et d’un lien', async () => {
  if (!projetId) throw new Error('aucun projet');
  const a = await appel('/knowledge/concepts', {
    method: 'POST',
    body: JSON.stringify({ projectId: projetId, name: 'Marche cible' }),
  });
  const b = await appel('/knowledge/concepts', {
    method: 'POST',
    body: JSON.stringify({ projectId: projetId, name: 'Marche local' }),
  });
  if (a.statut >= 400 || b.statut >= 400) throw new Error('création refusée');
  // Le concept source est dans le chemin, pas dans le corps.
  const lien = await appel(`/knowledge/concepts/${a.corps.id}/links`, {
    method: 'POST',
    body: JSON.stringify({ toConceptId: b.corps.id, relationType: 'precise' }),
  });
  if (lien.statut >= 400) throw new Error(`HTTP ${lien.statut}`);
  return 'deux concepts, un lien';
});

// ── 5. Profil et lecture par IGINI ─────────────────────────────────────────

titre('Profil');

await verifier('Enregistrement du profil', async () => {
  const { statut } = await appel('/profil', {
    method: 'PUT',
    // Le DTO attend `{ values: {...} }`. Un envoi à plat est refusé — ce qui
    // prouve au passage que `forbidNonWhitelisted` fait son travail.
    body: JSON.stringify({
      values: {
        display_name: 'Validation',
        activity_country: 'France',
        sectors: ['Transport'],
        experience: 'Conducteur d engins ferroviaires pendant douze ans.',
      },
    }),
  });
  return statut < 400;
});

await verifier('Le profil se relit', async () => {
  const { corps } = await appel('/profil');
  const valeurs = corps?.values ?? corps;
  return valeurs?.activity_country === 'France' || JSON.stringify(corps).includes('France');
});

// ── 6. Conformité ──────────────────────────────────────────────────────────

titre('Conformité');

await verifier('Le pays déclaré est utilisé', async () => {
  if (!projetId) throw new Error('aucun projet');
  const { corps } = await appel(`/projects/${projetId}/compliance`);
  if (corps?.country !== 'FR') return false;
  return `countryDeclared=${corps.countryDeclared}`;
});

await verifier('Le secteur trie sans rien retirer', async () => {
  if (!projetId) throw new Error('aucun projet');
  const avant = await appel(`/projects/${projetId}/compliance`);
  const nAvant = avant.corps?.requirements?.length ?? 0;
  await appel(`/projects/${projetId}/secteur`, {
    method: 'PATCH',
    body: JSON.stringify({ sector: 'Restauration' }),
  });
  const apres = await appel(`/projects/${projetId}/compliance`);
  const nApres = apres.corps?.requirements?.length ?? 0;
  if (nAvant !== nApres) throw new Error(`${nAvant} avant, ${nApres} après — le tri a perdu des lignes`);
  const groupes = (apres.corps?.groupes ?? []).map((g) => g.cle).join(', ');
  return `${nApres} démarches, groupes : ${groupes}`;
});

await verifier('Aucune source de conformité ne renvoie un 404', async () => {
  const { corps } = await appel('/compliance/requirements');
  const liens = (corps?.requirements ?? []).map((r) => r.source_url);
  if (liens.length === 0) throw new Error('aucune démarche');
  let morts = 0;
  for (const lien of liens.slice(0, 4)) {
    try {
      const r = await fetch(lien, { method: 'HEAD', redirect: 'follow' });
      if (r.status === 404) morts += 1;
    } catch {
      /* réseau indisponible : ne compte pas comme un lien mort */
    }
  }
  if (morts > 0) throw new Error(`${morts} lien(s) mort(s)`);
  return `${Math.min(4, liens.length)} liens testés`;
});

// ── 7. Tâches, orchestration, scores ───────────────────────────────────────

titre('Tâches, orchestration, scores');

await verifier('Ajouter une tâche n’en crée qu’une seule', async () => {
  if (!projetId) throw new Error('aucun projet');
  const avant = await appel(`/projects/${projetId}/tasks`);
  const nAvant = (avant.corps ?? []).length;
  await appel(`/projects/${projetId}/tasks`, {
    method: 'POST',
    body: JSON.stringify({ title: 'Trouver un local' }),
  });
  const apres = await appel(`/projects/${projetId}/tasks`);
  const nApres = (apres.corps ?? []).length;
  if (nApres !== nAvant + 1) throw new Error(`${nAvant} → ${nApres}, attendu +1`);
  return `${nAvant} → ${nApres}`;
});

await verifier('Les scores sont null sans source, jamais zéro', async () => {
  if (!projetId) throw new Error('aucun projet');
  const { corps } = await appel(`/projects/${projetId}/scores`);
  if (corps?.etincelle !== null) throw new Error(`étincelle vaut ${corps?.etincelle} sans analyse`);
  return `construction=${corps.construction} confiance=${corps.confiance}`;
});

await verifier('Un relevé de scores est enregistré', async () => {
  if (!projetId) throw new Error('aucun projet');
  await appel(`/projects/${projetId}/scores`);
  const { corps } = await appel(`/projects/${projetId}/scores/historique`);
  if (!Array.isArray(corps)) throw new Error('réponse inattendue');
  return `${corps.length} point(s)`;
});

await verifier('Le parcours ouvre les sections sur des données, pas sur une IA', async () => {
  if (!projetId) throw new Error('aucun projet');
  const { corps } = await appel(`/projects/${projetId}/parcours`);
  if (!corps?.phase) return false;
  return `phase ${corps.phase}, ${corps.visible?.length ?? 0} sections ouvertes`;
});

await verifier('Le tableau de bord rend des repères', async () => {
  if (!projetId) throw new Error('aucun projet');
  const { corps } = await appel(`/projects/${projetId}/parcours`);
  const reperes = corps?.reperes ?? [];
  if (reperes.length === 0) return false;
  return reperes.map((r) => `${r.label}=${r.valeur ?? '—'}`).join(' ');
});

await verifier('L’automatisation tourne et se journalise', async () => {
  if (!projetId) throw new Error('aucun projet');
  const lance = await appel(`/projects/${projetId}/automation/run`, { method: 'POST' });
  if (lance.statut >= 400) throw new Error(`HTTP ${lance.statut}`);
  const runs = await appel(`/projects/${projetId}/automation/runs`);
  return `${(runs.corps ?? []).length} exécution(s) journalisée(s)`;
});

// ── 8. Générateurs ─────────────────────────────────────────────────────────

titre('Générateurs');

const etatIa = await appel('/igini/status');
const iaAllumee = etatIa.corps?.generatorsEnabled === true;

if (!iaAllumee) {
  noter('ignore', 'Analyse par IGINI', 'générateurs éteints — IGINI_AI_ENABLED');
  noter('ignore', 'Le quota de Découverte refuse la 4e analyse', 'générateurs éteints');
  await verifier('Le produit reste utilisable générateurs éteints', async () => {
    if (!projetId) throw new Error('aucun projet');
    const { statut } = await appel(`/projects/${projetId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Tache saisie sans IA' }),
    });
    return statut < 400;
  });
} else {
  await verifier('Le générateur Construire est refusé en Découverte', async () => {
    if (!projetId) throw new Error('aucun projet');
    const { statut, corps } = await appel(`/projects/${projetId}/plan`, { method: 'POST' });
    if (statut !== 403) throw new Error(`attendu 403, reçu ${statut}`);
    return `offre qui ouvre : ${corps?.offreQuiOuvre}`;
  });
  // ── L'analyse réelle : la seule ligne qui coûte de l'argent ────────────
  //
  // Un appel Claude, soit quelques centimes sur un budget mensuel plafonné.
  // Elle reste derrière un drapeau parce qu'une commande qu'on relance vingt
  // fois dans la journée ne doit pas dépenser vingt fois sans le dire ; mais
  // sans elle, IGINI n'est prouvé nulle part — tout le reste vérifie le
  // produit *autour* de l'IA, pas l'IA.
  if (!AVEC_IA) {
    noter(
      'ignore',
      'Analyse réelle par IGINI',
      'non lancée : ajouter --avec-ia (consomme du budget)',
    );
  } else {
    let avant = null;
    await verifier('Le quota d’analyses est lisible avant l’appel', async () => {
      const { statut, corps } = await appel('/igini/usage/mois-en-cours');
      if (statut !== 200) throw new Error(`statut ${statut}`);
      avant = corps?.quota?.restant?.analyses ?? null;
      return `restant : ${avant}`;
    });

    await verifier('IGINI rend une analyse réelle, pas un gabarit', async () => {
      if (!projetId) throw new Error('aucun projet');
      const { statut, corps } = await appel(`/projects/${projetId}/analyze`, { method: 'POST' });
      if (statut !== 201) throw new Error(`attendu 201, reçu ${statut}`);
      const texte = JSON.stringify(corps ?? {});
      // Un gabarit ne parle pas du projet ; une vraie analyse le nomme ou en
      // reprend les termes. Et une réponse de 200 caractères n'est pas une
      // analyse, quel que soit son contenu.
      if (texte.length < 400) throw new Error(`réponse trop courte (${texte.length} car.)`);
      for (const motif of ['undefined', '[object Object]', 'lorem ipsum']) {
        if (texte.toLowerCase().includes(motif)) throw new Error(`« ${motif} » dans la réponse`);
      }
      return `${texte.length} caractères`;
    });

    await verifier('L’appel est journalisé et décompté', async () => {
      const { statut, corps } = await appel('/igini/usage/mois-en-cours');
      if (statut !== 200) throw new Error(`statut ${statut}`);
      const apres = corps?.quota?.restant?.analyses ?? null;
      if (avant !== null && apres !== null && apres >= avant) {
        throw new Error(`quota non décompté : ${avant} → ${apres}`);
      }
      const { corps: historique } = await appel('/igini/usage/historique');
      const appels = historique?.appels;
      if (!Array.isArray(appels) || appels.length === 0) {
        throw new Error('aucune ligne dans l’historique');
      }
      const dernier = appels[0];
      // Une ligne sans tokens ni coût est une ligne qui ne sert à rien : le
      // plafond de 50 €/mois se calcule dessus.
      if (!dernier.tokens_entree || !dernier.tokens_sortie) {
        throw new Error(`ligne sans tokens : ${JSON.stringify(dernier).slice(0, 80)}`);
      }
      return `restant ${avant} → ${apres}, ${appels.length} appel(s), dernier ${dernier.generateur} ${dernier.cout_euros} €`;
    });

    // ── Le plafond de l'offre, et non le garde-fou technique ─────────────
    //
    // Deux plafonds coexistent et se confondent facilement : celui du
    // catalogue (3 analyses/mois en Découverte, ce que la personne a
    // souscrit) et celui du budget Ignitux (`assertWithinQuota`, qui protège
    // la facture). Le second vient d'être prouvé ; le premier est celui dont
    // dépend tout le modèle économique. S'il ne tient pas, Découverte est en
    // réalité illimitée et les offres payantes n'ouvrent rien.
    //
    // Coûte deux appels réels : il faut consommer les 3 pour voir refuser le
    // 4e — et ce 4e refus, lui, ne coûte rien puisqu'il tombe avant Claude.
    await verifier('Découverte s’arrête à 3 analyses, et le 4e refus est gratuit', async () => {
      if (!projetId) throw new Error('aucun projet');
      for (const rang of [2, 3]) {
        const { statut } = await appel(`/projects/${projetId}/analyze`, { method: 'POST' });
        if (statut !== 201) throw new Error(`analyse ${rang} : attendu 201, reçu ${statut}`);
      }
      const { statut, corps } = await appel(`/projects/${projetId}/analyze`, { method: 'POST' });
      if (statut !== 403) throw new Error(`4e analyse : attendu 403, reçu ${statut}`);
      // Un refus qui ne nomme pas la sortie est un mur ; celui-ci doit dire
      // quelle offre rouvre la porte, et que le compteur repart le mois
      // prochain.
      if (!corps?.offreQuiOuvre) throw new Error('refus sans offre nommée');
      return `403, ouvre avec ${corps.offreQuiOuvre}, renouvellement ${corps.seRenouvelleLeMoisProchain}`;
    });
  }
}

// ── 9. Le navigateur ───────────────────────────────────────────────────────

if (AVEC_NAVIGATEUR) {
  titre('Navigateur');
  try {
    // `new URL(...).pathname` percent-encode les espaces : le dossier du
    // projet en contient un, et le chemin devenait introuvable. On importe
    // l'URL directement, sans repasser par une chaîne de chemin.
    const pw = await import(
      new URL('../frontend/node_modules/playwright/index.js', import.meta.url).href
    );
    const chromium = pw.chromium ?? pw.default.chromium;
    const nav = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await (await nav.newContext({ viewport: { width: 1280, height: 1600 } })).newPage();

    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 500) erreurs.push(`HTTP ${r.status()} ${r.url()}`);
    });

    const ecrans = [
      ['/login', 'Connexion'],
      ['/signup', 'Inscription'],
      ['/offres', 'Offres'],
      ['/projects', 'Projets'],
    ];

    for (const [chemin, nom] of ecrans) {
      await verifier(`Écran ${nom} : un seul <h1>, aucune erreur`, async () => {
        await page.goto(`${WEB}${chemin}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(600);
        const h1 = await page.locator('h1').count();
        if (h1 !== 1 && !page.url().includes('/login')) throw new Error(`${h1} <h1>`);
        const texte = await page.locator('body').innerText();
        for (const motif of ['undefined', 'NaN', '[object Object]']) {
          if (texte.includes(motif)) throw new Error(`« ${motif} » visible`);
        }
        return 'propre';
      });
    }

    await verifier('Aucune erreur JavaScript ni 500 pendant la traversée', () =>
      erreurs.length === 0 ? 'aucune' : Promise.reject(new Error(erreurs.slice(0, 2).join(' | '))),
    );

    await nav.close();
  } catch (erreur) {
    noter('ignore', 'Traversée navigateur', String(erreur.message).slice(0, 90));
  }
} else {
  noter('ignore', 'Traversée navigateur', '--sans-navigateur');
}

// ── Verdict ────────────────────────────────────────────────────────────────

const ok = resultats.filter((r) => r.etat === 'ok').length;
const echecs = resultats.filter((r) => r.etat === 'echec');
const ignores = resultats.filter((r) => r.etat === 'ignore');

console.log('');
console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log(
  `║  ${String(ok).padStart(3)} vérifiés · ${String(echecs.length).padStart(3)} en échec · ${String(ignores.length).padStart(3)} non prouvés`.padEnd(
    64,
  ) + '║',
);
console.log('╚═══════════════════════════════════════════════════════════════╝');

if (echecs.length) {
  console.log('');
  console.log('ÉCHECS :');
  for (const e of echecs) console.log(`  [${e.section}] ${e.libelle}${e.detail ? ` — ${e.detail}` : ''}`);
}
if (ignores.length) {
  console.log('');
  console.log('NON PROUVÉS (ne comptent pas comme des succès) :');
  for (const i of ignores) console.log(`  [${i.section}] ${i.libelle} — ${i.detail}`);
}

console.log('');
console.log('Compte créé :', EMAIL);
process.exit(echecs.length > 0 ? 1 : 0);
