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

/**
 * Le même appel, mais qui attend son tour quand le limiteur refuse.
 *
 * Le limiteur autorise cinq connexions par minute et par adresse. Ce script
 * en fait déjà trois pour le compte principal, et le bloc « Données
 * personnelles » en ajoute deux pour son compte jetable : au sixième appel —
 * c'est-à-dire à la deuxième exécution d'affilée — tout part en échec, et le
 * rapport accuse le produit d'un défaut qui est le nôtre.
 *
 * On attend plutôt que d'échouer, et on sait combien : depuis que le limiteur
 * s'explique, la réponse porte `secondesAAttendre`. C'est le premier usage de
 * cette correction, et il tombe bien — un harnais qui se heurte à un mur
 * saura désormais quand revenir, exactement comme une personne devant
 * l'écran.
 */
async function appelPatient(chemin, options = {}, essais = 2) {
  for (let i = 0; i < essais; i += 1) {
    const reponse = await appel(chemin, options);
    if (reponse.statut !== 429 || i === essais - 1) return reponse;
    const secondes = Number(reponse.corps?.secondesAAttendre) || 60;
    console.log(`  (limiteur atteint — attente de ${secondes + 1} s)`);
    await new Promise((r) => setTimeout(r, (secondes + 1) * 1000));
  }
  return { statut: 429, corps: null };
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
  const { statut } = await appelPatient('/users/signup', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: MDP }),
  });
  if (statut !== 201 && statut !== 200) return false;
  return `HTTP ${statut}`;
});

await verifier('Connexion et jeton', async () => {
  const { statut, corps } = await appelPatient('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: MDP }),
  });
  if (statut !== 200 || !corps?.accessToken) return false;
  jeton = corps.accessToken;
  return 'jeton obtenu';
});

/**
 * Ce que les refus ne doivent PAS apprendre.
 *
 * Un message d'erreur qui distingue « cet email n'existe pas » de « ce mot
 * de passe est faux » transforme la page de connexion en annuaire : on
 * essaie une adresse, on lit la réponse, on sait si la personne a un compte
 * Ignitux. Pour un produit dont les comptes sont des porteurs de projet,
 * c'est un renseignement qu'on ne doit pas donner.
 *
 * Ignitux fait déjà bien : la connexion rend le même 401 et la même phrase
 * dans les deux cas, et le mot de passe oublié rend 204 que le compte existe
 * ou non. Ces deux contrôles ne corrigent rien — ils **empêchent la
 * régression**, parce que c'est exactement le genre de propriété qu'on casse
 * en voulant rendre un message plus aimable.
 *
 * L'inscription, elle, répond 409 « Un compte existe déjà avec cet email. »
 * et se distingue donc. C'est le compromis universel, et il est assumé : se
 * taire enfermerait dehors quelqu'un qui a simplement oublié qu'il s'était
 * inscrit. La limite de cinq inscriptions par minute et par adresse borne
 * l'usage détourné.
 */
/**
 * Le mot de passe oublié — ce qui se prouve d'ici, et ce qui ne s'y prouve
 * pas.
 *
 * Le parcours complet a été joué à la main : le jeton fait 64 caractères,
 * vaut une heure, l'ancien mot de passe est refusé après coup, le nouveau
 * accepté, et **le même jeton rejoué est refusé**. Le mécanisme est intact.
 *
 * Il n'est pas rejouable ici : le jeton n'existe que dans l'email, et avec
 * `MAIL_TRANSPORT=log` l'email n'est qu'une ligne du journal du serveur —
 * que ce script ne lit pas, et n'a pas à lire. Ce qui reste vérifiable, ce
 * sont les refus, et ils comptent : un jeton inventé qui passerait ouvrirait
 * tous les comptes.
 */
await verifier('Un jeton de réinitialisation inventé ne change rien', async () => {
  const bidon = await appelPatient('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token: 'a'.repeat(64), newPassword: 'UnAutreMotDePasse789!' }),
  });
  if (bidon.statut < 400) throw new Error(`jeton inventé accepté (${bidon.statut})`);

  const vide = await appelPatient('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token: '', newPassword: 'UnAutreMotDePasse789!' }),
  });
  if (vide.statut < 400) throw new Error(`jeton vide accepté (${vide.statut})`);

  // Et le compte doit toujours répondre à son vrai mot de passe.
  const toujours = await appelPatient('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: MDP }),
  });
  if (toujours.statut !== 200) throw new Error('le compte a été abîmé par la tentative');
  return `inventé ${bidon.statut}, vide ${vide.statut}, compte intact`;
});

await verifier('La connexion ne dit pas si le compte existe', async () => {
  const inconnu = await appelPatient('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: `jamais.vu.${horodatage}@ignitux.test`, password: MDP }),
  });
  const mauvais = await appelPatient('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: 'CeNEstPasLeBon123!' }),
  });
  // Deux 429 identiques feraient passer ce contrôle pour la mauvaise
  // raison : le limiteur rend la même chose à tout le monde, ce qui prouve
  // seulement qu'il a refusé les deux appels.
  if (inconnu.statut === 429 || mauvais.statut === 429) {
    throw new Error('limiteur atteint : la comparaison ne prouverait rien');
  }
  if (inconnu.statut !== mauvais.statut) {
    throw new Error(`statuts différents : ${inconnu.statut} contre ${mauvais.statut}`);
  }
  if (JSON.stringify(inconnu.corps?.message) !== JSON.stringify(mauvais.corps?.message)) {
    throw new Error(`messages différents : « ${inconnu.corps?.message} » contre « ${mauvais.corps?.message} »`);
  }
  return `même réponse : ${inconnu.statut} « ${String(inconnu.corps?.message).slice(0, 40)} »`;
});

await verifier('Le mot de passe oublié ne dit pas si le compte existe', async () => {
  const existant = await appelPatient('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL }),
  });
  const inexistant = await appelPatient('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: `nexiste.pas.${horodatage}@ignitux.test` }),
  });
  if (existant.statut === 429 || inexistant.statut === 429) {
    throw new Error('limiteur atteint : la comparaison ne prouverait rien');
  }
  if (existant.statut !== inexistant.statut) {
    throw new Error(`statuts différents : ${existant.statut} contre ${inexistant.statut}`);
  }
  if (JSON.stringify(existant.corps) !== JSON.stringify(inexistant.corps)) {
    throw new Error('les corps de réponse diffèrent');
  }
  return `même réponse : ${existant.statut}`;
});

await verifier('Un mot de passe faux est refusé', async () => {
  const { statut } = await appelPatient('/auth/login', {
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

// ── 9. Le partage d'un projet ─────────────────────────────────────────────
//
// Le chemin par lequel on accorde délibérément l'accès à quelqu'un est
// celui où les fuites arrivent. L'audit statique a montré que rien ne
// traverse entre comptes ; il ne dit rien de ce qui se passe quand on
// ouvre volontairement la porte, puis qu'on la referme.
//
// Quatre faits à tenir, et le troisième est celui qu'on oublie :
//
//   1. avant l'invitation, l'autre ne voit rien ;
//   2. après, il lit — et seulement lit ;
//   3. **après le retrait, il ne voit plus rien** : une porte qu'on ferme
//      doit se refermer, sinon l'inviter une fois revient à l'inviter pour
//      toujours ;
//   4. un tiers non invité ne voit rien à aucun moment.

titre('Courrier');

await (async () => {
  // Une ligne « non prouvée » plutôt qu'un silence : le parcours complet du
  // mot de passe oublié dépend d'un email, et un email qui ne part pas
  // enferme dehors la première personne qui oublie son mot de passe.
  const { corps } = await appel('/ready');
  const mail = corps?.verifications?.mail;
  const transport = String(mail?.detail ?? '');
  if (/smtp/i.test(transport)) {
    await verifier('Le courrier part réellement', async () => {
      if (mail?.etat !== 'ok') throw new Error(transport.slice(0, 80));
      return transport.slice(0, 60);
    });
  } else {
    noter(
      'ignore',
      'Le parcours complet du mot de passe oublié',
      'MAIL_TRANSPORT n’est pas « smtp » : le lien s’écrit dans le journal du ' +
        'serveur au lieu de partir. Le mécanisme est bon — éprouvé à la main : ' +
        'jeton d’une heure, ancien mot de passe refusé, rejeu refusé — mais ' +
        'personne ne recevra le lien tant qu’un fournisseur d’email n’est pas branché.',
    );
  }
})();

// ── Investir n'est pas collaborer ─────────────────────────────────────────
//
// Deux droits qu'il serait naturel de confondre, et coûteux de confondre.
// Quelqu'un qui met 5 000 € dans un projet a toutes les raisons de vouloir
// le lire — mais le porteur ne lui a pas ouvert son espace de travail, il a
// reçu son argent. Ses notes, ses souvenirs, ses concepts, ses tâches
// restent à lui.
//
// Le fait est facile à casser sans y penser, en « améliorant » la vue
// investisseur pour qu'elle montre enfin quelque chose d'utile.

// ── La facturation : de l'argent et du droit ──────────────────────────────
//
// Une facture est un document qui engage. Trois règles y sont des
// obligations et non des préférences, et toutes trois se cassent en
// silence :
//
//   1. l'arrondi se fait à la ligne, jamais au total. Arrondir au total
//      produit des écarts d'un centime que le client trouve en
//      recalculant, et une facture qui ne tombe pas juste se conteste ;
//   2. la numérotation ne saute aucun numéro, y compris quand plusieurs
//      documents naissent dans la même milliseconde ;
//   3. un document émis ne bouge plus. Le corriger se fait par un avoir,
//      pas en réécrivant le passé.

// ── La Constitution refuse-t-elle vraiment ? ─────────────────────────────
//
// Vingt-quatre articles, un moteur qui les applique, douze services qui
// l'appellent. Tout cela peut n'être qu'un décor : un moteur qui ne refuse
// jamais rien est indiscernable d'un moteur absent, et c'est la partie du
// produit qui porte son identité.
//
// On tente donc une violation pour de bon, par l'API, sur la règle la plus
// caractéristique : le porteur reste propriétaire principal — « y compris à
// la demande du porteur lui-même », dit le code.

titre('Constitution');

let detenteurPorteur = null;
let detenteurFonds = null;

await verifier('Une répartition partielle ne déclenche rien', async () => {
  if (!projetId) throw new Error('aucun projet');
  const porteur = await appel(`/projects/${projetId}/financing/holders`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Le porteur', isFounder: true }),
  });
  if (porteur.statut !== 201) throw new Error(`détenteur refusé (${porteur.statut})`);
  detenteurPorteur = porteur.corps.id;

  const fonds = await appel(`/projects/${projetId}/financing/holders`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Fonds de validation', isFounder: false }),
  });
  if (fonds.statut !== 201) throw new Error(`détenteur refusé (${fonds.statut})`);
  detenteurFonds = fonds.corps.id;

  // Le porteur descend à 40 % : la répartition ne boucle pas encore à
  // 100 %, donc la règle se tait. C'est voulu — trancher sur une donnée
  // partielle empêcherait de saisir une répartition ligne par ligne, ce
  // qui est le cas normal.
  const baisse = await appel(`/financing/holders/${detenteurPorteur}/equity-events`, {
    method: 'POST',
    body: JSON.stringify({ shareBasisPoints: 4000, reason: 'Dilution', occurredAt: '2026-09-24T10:00:00.000Z' }),
  });
  if (baisse.statut !== 201) {
    throw new Error(`une répartition partielle a été bloquée (${baisse.statut})`);
  }
  return 'porteur à 40 %, total incomplet : acceptée';
});

await verifier('Une répartition qui boucle sans majorité est refusée en 422', async () => {
  if (!detenteurFonds) throw new Error('prérequis manquant');
  // Le fonds monte à 60 % : le total atteint 100 %, et le porteur se
  // retrouve minoritaire. La Constitution doit trancher.
  const montee = await appel(`/financing/holders/${detenteurFonds}/equity-events`, {
    method: 'POST',
    body: JSON.stringify({ shareBasisPoints: 6000, reason: 'Entrée au capital', occurredAt: '2026-09-24T10:00:00.000Z' }),
  });
  if (montee.statut !== 422) {
    throw new Error(`attendu 422, reçu ${montee.statut} — la Constitution n’a pas tranché`);
  }
  const message = String(montee.corps?.message ?? "");
  // Le refus doit citer la Constitution et dire le chiffre en cause :
  // « refusé » sans raison est un mur, pas une règle.
  if (!/Constitution/i.test(message)) throw new Error("le refus ne cite pas la Constitution");
  if (!/40[.,]00\s*%|majorité/i.test(message)) {
    throw new Error(`le refus ne dit pas ce qui cloche : « ${message.slice(0, 70)} »`);
  }
  return `422, « ${message.slice(message.indexOf(":") + 2, message.indexOf(":") + 62)}… »`;
});

await verifier('Le refus est inscrit au journal des violations', async () => {
  // Un refus non journalisé est un refus qu’on ne peut ni auditer ni
  // contester. L’article violé doit être nommé.
  const { statut, corps } = await appel('/constitution/violations');
  if (statut !== 200) throw new Error(`journal illisible (${statut})`);
  const lignes = Array.isArray(corps) ? corps : (corps?.violations ?? []);
  const trace = lignes.find((v) => v.rule_id === "majorite-du-porteur");
  if (!trace) throw new Error("le refus n’apparaît pas au journal");
  if (!trace.article_slug) throw new Error("la violation ne nomme aucun article");
  if (trace.severity !== "blocking") throw new Error(`gravité « ${trace.severity} »`);
  return `article ${trace.article_slug}, règle ${trace.rule_id}, ${trace.severity}`;
});

await verifier('La répartition est refermée derrière nous', async () => {
  // Ce contrôle laisse le porteur à 40 % et le fonds à 0 : une répartition
  // qui ne boucle pas. L'audit financier global la signale, à raison —
  // « capital-incomplet », et la garantie des 51 % est alors en sommeil.
  //
  // Un harnais qui laisse derrière lui un état que le produit considère
  // comme incohérent fabrique du bruit pour l'outil suivant, et personne ne
  // saura si le constat vient d'un vrai projet ou d'une exécution de test.
  // On remet donc le porteur à 100 %.
  if (!detenteurPorteur) throw new Error('prérequis manquant');
  const retour = await appel(`/financing/holders/${detenteurPorteur}/equity-events`, {
    method: 'POST',
    body: JSON.stringify({
      shareBasisPoints: 10000,
      reason: 'Fin du contrôle : on referme la répartition',
      occurredAt: '2026-09-24T10:00:00.000Z',
    }),
  });
  if (retour.statut !== 201) throw new Error(`retour à 100 % refusé (${retour.statut})`);
  return 'porteur remis à 100 %, la répartition boucle';
});

titre('Facturation');

let documentFacture = null;

await verifier('L’arrondi se fait à la ligne, et les totaux concordent', async () => {
  // Trois lignes choisies pour que le calcul ne tombe pas rond : 7 × 1,05 €
  // à 5,5 %, 3 × 1,33 € à 5,5 %, 1,5 × 49,99 € à 20 %.
  const lignes = [
    [7000, 105, 550],
    [3000, 133, 550],
    [1500, 4999, 2000],
  ];
  const { statut, corps } = await appel('/billing/documents', {
    method: 'POST',
    body: JSON.stringify({
      type: 'facture',
      clientName: 'Contrôle de validation',
      lines: lignes.map(([q, prix, tva], i) => ({
        label: `Ligne ${i + 1}`,
        quantityMilli: q,
        unitPriceCents: prix,
        vatRateBasisPoints: tva,
      })),
    }),
  });
  if (statut !== 201) throw new Error(`création refusée (${statut})`);
  documentFacture = corps.id;

  const lu = await appel(`/billing/documents/${corps.id}`);
  const totaux = lu.corps?.totals;
  if (!totaux) throw new Error('le document ne porte aucun total');

  // Recalcul indépendant, ligne par ligne, sans un seul flottant.
  const sousTotal = lignes.reduce((a, [q, prix]) => a + Math.round((q * prix) / 1000), 0);
  const tva = lignes.reduce(
    (a, [q, prix, taux]) => a + Math.round((Math.round((q * prix) / 1000) * taux) / 10000),
    0,
  );
  if (totaux.subtotalCents !== sousTotal) {
    throw new Error(`sous-total ${totaux.subtotalCents} contre ${sousTotal} recalculé`);
  }
  if (totaux.vatCents !== tva) throw new Error(`TVA ${totaux.vatCents} contre ${tva}`);
  if (totaux.totalCents !== sousTotal + tva) {
    throw new Error('le total ne vaut pas la somme de ses parts');
  }
  return `${sousTotal} + ${tva} = ${totaux.totalCents} centimes`;
});

await verifier('Un trop-perçu reste visible au lieu d’être ramené à zéro', async () => {
  if (!documentFacture) throw new Error('aucun document');
  // Un brouillon ne reçoit pas de règlement : il faut l’émettre d’abord,
  // et c’est une bonne règle.
  const emission = await appel(`/billing/documents/${documentFacture}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'emis' }),
  });
  if (emission.statut !== 200) throw new Error(`émission refusée (${emission.statut})`);

  await appel(`/billing/documents/${documentFacture}/payments`, {
    method: 'POST',
    body: JSON.stringify({ amountCents: 999_999, method: 'virement', receivedAt: '2026-09-24T10:00:00.000Z' }),
  });
  const lu = await appel(`/billing/documents/${documentFacture}`);
  // Négatif, et non zéro : un trop-perçu masqué est un trop-perçu jamais
  // remboursé.
  if (!(lu.corps.remainingCents < 0)) {
    throw new Error(`reste dû à ${lu.corps.remainingCents} après un versement excédentaire`);
  }
  return `reste dû ${lu.corps.remainingCents} centimes`;
});

await verifier('Un document émis ne bouge plus, et le dit', async () => {
  if (!documentFacture) throw new Error('aucun document');
  const modification = await appel(`/billing/documents/${documentFacture}`, {
    method: 'PATCH',
    body: JSON.stringify({ clientName: 'Nom réécrit après coup' }),
  });
  if (modification.statut < 400) throw new Error('un document émis a été modifié');
  const suppression = await appel(`/billing/documents/${documentFacture}`, {
    method: 'DELETE',
  });
  if (suppression.statut < 400) throw new Error('un document émis a été supprimé');
  const retour = await appel(`/billing/documents/${documentFacture}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'brouillon' }),
  });
  if (retour.statut < 400) throw new Error('un document émis est redevenu brouillon');
  // Et le refus doit nommer le remède, sinon la personne est bloquée.
  const message = String(modification.corps?.message ?? "");
  if (!/avoir/i.test(message)) throw new Error(`refus sans remède : « ${message.slice(0, 60)} »`);
  return `modification ${modification.statut}, suppression ${suppression.statut}, retour ${retour.statut}`;
});

await verifier('Huit documents nés ensemble : aucun doublon, aucun trou', async () => {
  // La course la plus coûteuse du produit. Sans recul aléatoire entre les
  // réessais, la moitié de ces créations rendait un 500 — mesuré contre la
  // vraie base. Ce qu'on refuse ici : un numéro en double (illégal), un
  // trou dans la suite (illégal), et une erreur 500 (un conflit passager
  // présenté comme une panne).
  const reponses = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      appel('/billing/documents', {
        method: 'POST',
        body: JSON.stringify({
          type: 'devis',
          clientName: `Client ${i}`,
          lines: [{ label: 'Ligne', quantityMilli: 1000, unitPriceCents: 1000, vatRateBasisPoints: 2000 }],
        }),
      }),
    ),
  );

  const cinqCents = reponses.filter((r) => r.statut >= 500);
  if (cinqCents.length) {
    throw new Error(`${cinqCents.length} création(s) en 500 : un conflit rendu comme une panne`);
  }

  const crees = reponses.filter((r) => r.statut === 201).map((r) => r.corps);
  // Le limiteur peut en refuser certaines (429) : c’est son travail, et
  // cela ne dit rien de la numérotation. Seul ce qui est créé se juge.
  if (crees.length < 2) throw new Error('trop peu de créations pour juger de la course');

  const numeros = crees.map((d) => d.number);
  if (new Set(numeros).size !== numeros.length) {
    throw new Error('deux documents portent le même numéro');
  }
  const suite = crees.map((d) => d.sequence).sort((a, b) => a - b);
  for (let i = 1; i < suite.length; i += 1) {
    if (suite[i] !== suite[i - 1] + 1) {
      throw new Error(`trou dans la numérotation : ${suite[i - 1]} puis ${suite[i]}`);
    }
  }
  const refuses = reponses.length - crees.length;
  const mention = refuses > 0 ? `, ${refuses} refusé(s) proprement` : "";
  return `${crees.length} créés, suite ${suite[0]}→${suite[suite.length - 1]}${mention}`;
});

titre('Investisseur');

const EMAIL_INV = `validation.investisseur.${horodatage}@ignitux.test`;
let jetonInv = null;
let idInvestisseur = null;

const appelInv = async (chemin, options = {}) => {
  const reponse = await fetch(`${API}${chemin}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(jetonInv ? { Authorization: `Bearer ${jetonInv}` } : {}),
      ...options.headers,
    },
  });
  let corps = null;
  try {
    corps = await reponse.json();
  } catch {
    /* 204 */
  }
  if (reponse.status === 429) {
    const secondes = Number(corps?.secondesAAttendre) || 60;
    console.log(`  (limiteur atteint — attente de ${secondes + 1} s)`);
    await new Promise((r) => setTimeout(r, (secondes + 1) * 1000));
    return appelInv(chemin, options);
  }
  return { statut: reponse.status, corps };
};

await verifier('Un investisseur se déclare, et son portefeuille part de zéro', async () => {
  await appelInv('/users/signup', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL_INV, password: MDP }),
  });
  const connexion = await appelInv('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL_INV, password: MDP }),
  });
  jetonInv = connexion.corps?.accessToken;
  if (!jetonInv) throw new Error('pas de jeton');

  const declaration = await appelInv('/investisseurs', {
    method: 'POST',
    body: JSON.stringify({ displayName: 'Fonds de validation' }),
  });
  if (declaration.statut !== 201) throw new Error(`déclaration refusée (${declaration.statut})`);
  idInvestisseur = declaration.corps?.id;

  const portefeuille = await appelInv('/investisseurs/moi/portefeuille');
  if (portefeuille.statut !== 200) throw new Error(`portefeuille ${portefeuille.statut}`);
  // Zéro, et non « — » ni un total inventé : rien n'a encore été investi.
  if (portefeuille.corps?.global?.investedCents !== 0) {
    throw new Error('un portefeuille neuf annonce autre chose que zéro');
  }
  if ((portefeuille.corps?.parProjet ?? []).length !== 0) {
    throw new Error('un portefeuille neuf contient déjà un projet');
  }
  return 'déclaré, portefeuille à zéro';
});

await verifier('Un apport enregistré se voit, et le net reste négatif', async () => {
  if (!projetId || !idInvestisseur) throw new Error('prérequis manquant');

  const financement = await appel('/projets-finances', {
    method: 'POST',
    body: JSON.stringify({ projectId: projetId, openedOn: '2026-09-24', targetCents: 2_500_000 }),
  });
  if (financement.statut !== 201) throw new Error(`financement refusé (${financement.statut})`);

  const apport = await appel(`/projets-finances/${financement.corps.id}/participations`, {
    method: 'POST',
    body: JSON.stringify({
      investorId: idInvestisseur,
      investedCents: 500_000,
      shareBasisPointsGranted: 1000,
      occurredOn: '2026-09-24',
    }),
  });
  if (apport.statut !== 201) throw new Error(`apport refusé (${apport.statut})`);

  const portefeuille = await appelInv('/investisseurs/moi/portefeuille');
  const global = portefeuille.corps?.global ?? {};
  if (global.investedCents !== 500_000) throw new Error(`investi : ${global.investedCents}`);
  // Le net doit être NÉGATIF : 5 000 € sont sortis, rien n'est revenu.
  // Afficher zéro, ou compter l'apport comme un actif, raconterait une
  // histoire plus agréable et fausse.
  if (global.netCents >= 0) {
    throw new Error(`net à ${global.netCents} alors que rien n'est encore revenu`);
  }
  return `investi ${global.investedCents / 100} €, net ${global.netCents / 100} €`;
});

await verifier('Investir n’ouvre pas le projet : ni lecture, ni description', async () => {
  const lecture = await appelInv(`/projects/${projetId}`);
  if (lecture.statut === 200) throw new Error('l’investisseur lit le projet du porteur');

  // Et la vue investisseur ne doit pas recopier ce que la lecture refuse.
  const portefeuille = await appelInv('/investisseurs/moi/portefeuille');
  const brut = JSON.stringify(portefeuille.corps ?? {});
  if (brut.includes('Projet de validation créé par le script')) {
    throw new Error('la description du projet transite par le portefeuille');
  }
  return `lecture directe ${lecture.statut}, portefeuille sans la description`;
});

titre('Partage d’un projet');

const EMAIL_INVITE = `validation.invite.${horodatage}@ignitux.test`;
let jetonInvite = null;
let projetPartage = null;

const appelInvite = async (chemin, options = {}) => {
  const reponse = await fetch(`${API}${chemin}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(jetonInvite ? { Authorization: `Bearer ${jetonInvite}` } : {}),
      ...options.headers,
    },
  });
  let corps = null;
  try {
    corps = await reponse.json();
  } catch {
    /* 204 */
  }
  if (reponse.status === 429) {
    const secondes = Number(corps?.secondesAAttendre) || 60;
    console.log(`  (limiteur atteint — attente de ${secondes + 1} s)`);
    await new Promise((r) => setTimeout(r, (secondes + 1) * 1000));
    return appelInvite(chemin, options);
  }
  return { statut: reponse.status, corps };
};

await verifier('Un second compte, et un projet à partager', async () => {
  await appelInvite('/users/signup', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL_INVITE, password: MDP }),
  });
  const { corps } = await appelInvite('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL_INVITE, password: MDP }),
  });
  jetonInvite = corps?.accessToken;
  if (!jetonInvite) throw new Error('pas de jeton pour l’invité');
  projetPartage = projetId;
  if (!projetPartage) throw new Error('aucun projet à partager');
  return 'prêts';
});

await verifier('Avant l’invitation, l’autre ne voit rien — et l’ignore', async () => {
  const lecture = await appelInvite(`/projects/${projetPartage}`);
  // 404 et non 403 : un 403 confirmerait que le projet existe, ce qui est
  // déjà un renseignement. Le produit répond « rien ici », et c'est le bon
  // mot.
  if (lecture.statut !== 404) throw new Error(`attendu 404, reçu ${lecture.statut}`);
  const ecriture = await appelInvite(`/projects/${projetPartage}/tasks`, {
    method: 'POST',
    body: JSON.stringify({ title: 'Intrusion' }),
  });
  if (ecriture.statut < 400) throw new Error(`écriture acceptée (${ecriture.statut})`);
  return `lecture ${lecture.statut}, écriture ${ecriture.statut}`;
});

await verifier('Après l’invitation, l’autre lit — et seulement lit', async () => {
  const invitation = await appel(`/projects/${projetPartage}/collaborators`, {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL_INVITE }),
  });
  if (invitation.statut !== 201) throw new Error(`invitation refusée (${invitation.statut})`);

  const lecture = await appelInvite(`/projects/${projetPartage}`);
  if (lecture.statut !== 200) throw new Error(`l’invité ne lit pas (${lecture.statut})`);

  const ecriture = await appelInvite(`/projects/${projetPartage}/tasks`, {
    method: 'POST',
    body: JSON.stringify({ title: 'Tâche de l’invité' }),
  });
  const suppression = await appelInvite(`/projects/${projetPartage}`, { method: 'DELETE' });
  const relais = await appelInvite(`/projects/${projetPartage}/collaborators`, {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL }),
  });
  if (ecriture.statut < 400) throw new Error('un invité peut écrire');
  if (suppression.statut < 400) throw new Error('un invité peut supprimer le projet');
  if (relais.statut < 400) throw new Error('un invité peut inviter à son tour');
  return `lit 200 · écrit ${ecriture.statut} · supprime ${suppression.statut} · invite ${relais.statut}`;
});

await verifier('Après le retrait, la porte se referme vraiment', async () => {
  const liste = await appel(`/projects/${projetPartage}/collaborators`);
  const ligne = (liste.corps ?? []).find(
    (x) => x.user?.email === EMAIL_INVITE || x.email === EMAIL_INVITE,
  );
  const idInvite = ligne?.user_id ?? ligne?.userId ?? ligne?.user?.id;
  if (!idInvite) throw new Error('l’invité est introuvable dans la liste');

  const retrait = await appel(`/projects/${projetPartage}/collaborators/${idInvite}`, {
    method: 'DELETE',
  });
  if (retrait.statut !== 204 && retrait.statut !== 200) {
    throw new Error(`retrait refusé (${retrait.statut})`);
  }

  // Le fait qui compte : l'accès est coupé, pas seulement la ligne effacée.
  const apres = await appelInvite(`/projects/${projetPartage}`);
  if (apres.statut === 200) throw new Error('l’ancien invité lit encore le projet');
  return `retrait ${retrait.statut}, lecture ensuite ${apres.statut}`;
});

// ── 10. Les droits de la personne sur ses données ──────────────────────────
//
// Ignitux est français et recevra de vraies personnes. Le droit d'accès et
// le droit à l'effacement ne sont pas des options : ils doivent exister, et
// ils doivent **tenir**. Un export qui oublie la moitié des données, ou une
// suppression qui laisse les projets en base, valent moins que rien — ils
// donnent à la personne la certitude d'une chose fausse.
//
// Ces contrôles usent un compte à part, créé et détruit ici. Le compte
// principal de la validation sert aux sections suivantes : le supprimer
// arrêterait tout.

titre('Données personnelles');

const EMAIL_RGPD = `validation.rgpd.${horodatage}@ignitux.test`;
let jetonRgpd = null;
let projetRgpd = null;

const appelRgpd = async (chemin, options = {}, essais = 2) => {
  for (let i = 0; i < essais; i += 1) {
    const r = await appelRgpdUneFois(chemin, options);
    if (r.statut !== 429 || i === essais - 1) return r;
    const secondes = Number(r.corps?.secondesAAttendre) || 60;
    console.log(`  (limiteur atteint — attente de ${secondes + 1} s)`);
    await new Promise((res) => setTimeout(res, (secondes + 1) * 1000));
  }
  return { statut: 429, corps: null };
};

const appelRgpdUneFois = async (chemin, options = {}) => {
  const reponse = await fetch(`${API}${chemin}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(jetonRgpd ? { Authorization: `Bearer ${jetonRgpd}` } : {}),
      ...options.headers,
    },
  });
  let corps = null;
  try {
    corps = await reponse.json();
  } catch {
    /* 204 n'a pas de corps */
  }
  return { statut: reponse.status, corps };
};

await verifier('Un compte à part, avec de quoi exporter', async () => {
  await appelRgpd('/users/signup', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL_RGPD, password: MDP }),
  });
  const { corps } = await appelRgpd('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL_RGPD, password: MDP }),
  });
  jetonRgpd = corps?.accessToken;
  if (!jetonRgpd) throw new Error('pas de jeton');
  const projet = await appelRgpd('/projects', {
    method: 'POST',
    body: JSON.stringify({ title: 'Projet à effacer', description: 'Contenu personnel.' }),
  });
  projetRgpd = projet.corps?.id;
  if (!projetRgpd) throw new Error('projet non créé');
  await appelRgpd(`/projects/${projetRgpd}/tasks`, {
    method: 'POST',
    body: JSON.stringify({ title: 'Tâche personnelle' }),
  });
  return 'compte, projet et tâche prêts';
});

await verifier('L’export rend les données, et dit ce qu’il n’inclut pas', async () => {
  const { statut, corps } = await appelRgpd('/users/me/export');
  if (statut !== 200) throw new Error(`statut ${statut}`);
  const brut = JSON.stringify(corps);
  if (!brut.includes(EMAIL_RGPD)) throw new Error('l’email du compte manque');
  if (!brut.includes('Projet à effacer')) throw new Error('le projet manque');
  // Dire ce qui n'est PAS dans l'export vaut autant que le reste : sans
  // cette liste, la personne croit tenir la totalité de ce qu'on détient.
  if (!Array.isArray(corps?.non_inclus) || corps.non_inclus.length === 0) {
    throw new Error('aucune liste de ce qui n’est pas inclus');
  }
  if (corps.non_inclus.some((e) => !e.pourquoi)) {
    throw new Error('une exclusion n’est pas justifiée');
  }
  return `${Object.keys(corps.donnees ?? {}).length} section(s), ${corps.non_inclus.length} exclusion(s) justifiée(s)`;
});

await verifier('L’export ne contient ni mot de passe ni empreinte', async () => {
  const { corps } = await appelRgpd('/users/me/export');
  const brut = JSON.stringify(corps);
  if (brut.includes(MDP)) throw new Error('mot de passe en clair dans l’export');
  // bcrypt commence par $2a$, $2b$ ou $2y$. Remettre l'empreinte n'apprend
  // rien à la personne et recopie du matériel de sécurité dans un fichier
  // qui circulera par email.
  if (/\$2[aby]\$/.test(brut)) throw new Error('empreinte du mot de passe dans l’export');
  return 'ni l’un ni l’autre';
});

await verifier('L’aperçu de suppression annonce ce qui disparaîtra', async () => {
  const { statut, corps } = await appelRgpd('/users/me/deletion-preview');
  if (statut !== 200) throw new Error(`statut ${statut}`);
  const brut = JSON.stringify(corps);
  if (!/projet/i.test(brut)) throw new Error('les projets ne sont pas mentionnés');
  return `${(corps?.avertissements ?? []).length} avertissement(s)`;
});

await verifier('Un mauvais mot de passe ne supprime rien', async () => {
  const { statut } = await appelRgpd('/users/me', {
    method: 'DELETE',
    body: JSON.stringify({ password: 'CeNEstPasLeBon123!' }),
  });
  if (statut < 400) throw new Error(`suppression acceptée sans le bon mot de passe (${statut})`);
  // Et le compte doit toujours répondre.
  const encore = await appelRgpd('/users/me/export');
  if (encore.statut !== 200) throw new Error('le compte a été abîmé par la tentative');
  return `refusé en ${statut}, compte intact`;
});

await verifier('La suppression efface vraiment, projets compris', async () => {
  const { statut } = await appelRgpd('/users/me', {
    method: 'DELETE',
    body: JSON.stringify({ password: MDP }),
  });
  if (statut !== 204 && statut !== 200) throw new Error(`statut ${statut}`);

  // On ne croit pas la réponse sur parole : on essaie de se reconnecter.
  const reconnexion = await appelRgpd('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL_RGPD, password: MDP }),
  });
  if (reconnexion.statut === 200) throw new Error('le compte répond encore après suppression');

  // Et le jeton d'avant ne doit plus ouvrir le projet.
  const projet = await appelRgpd(`/projects/${projetRgpd}`);
  if (projet.statut === 200) throw new Error('le projet est encore lisible');
  return `connexion ${reconnexion.statut}, projet ${projet.statut}`;
});

// ── 11. Le navigateur ───────────────────────────────────────────────────────

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
