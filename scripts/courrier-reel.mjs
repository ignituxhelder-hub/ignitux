/**
 * IGNITUX SAIT-IL VRAIMENT ENVOYER UN COURRIER ?
 *
 *   node scripts/courrier-reel.mjs
 *   node scripts/courrier-reel.mjs --port 3002 --web http://127.0.0.1:3001
 *
 * ── Le trou que cette commande bouche ────────────────────────────────────
 *
 * Il restait un seul contrôle « non prouvé » dans `validation-reelle.mjs` :
 * le parcours complet du mot de passe oublié. Le mécanisme est éprouvé — jeton
 * d'une heure, ancien mot de passe refusé, rejeu refusé — mais **personne
 * n'avait jamais vu Ignitux parler SMTP**. Les tests unitaires simulent
 * `nodemailer` ; ils vérifient nos décisions, pas notre capacité à poser un
 * message sur une socket.
 *
 * L'argument habituel est qu'il faut un fournisseur d'email pour le savoir.
 * C'est faux. Il faut quelqu'un qui écoute en SMTP, et quatre-vingts lignes
 * suffisent à l'écrire. C'est ce que fait la première moitié de ce fichier.
 *
 * Ce qui reste hors de portée sans fournisseur : qu'un message **arrive** dans
 * une vraie boîte, et n'atterrisse pas en indésirable. C'est une question de
 * réputation d'expéditeur (SPF, DKIM, DMARC), pas de code, et aucune commande
 * ne peut y répondre depuis cette machine. La commande le dit à la fin plutôt
 * que de laisser croire que tout est couvert.
 *
 * ── Ce qu'elle a trouvé en s'écrivant ────────────────────────────────────
 *
 * Deux courriers partent, pas un. L'inscription envoie une confirmation
 * d'adresse, et ce parcours-là n'avait jamais été éprouvé de bout en bout non
 * plus — la première version de cette commande cherchait le lien de
 * réinitialisation et tombait sur celui de confirmation, parce qu'elle prenait
 * le premier message adressé à la bonne personne. Les deux sont couverts
 * désormais.
 *
 * ── Ce qu'elle vérifie ───────────────────────────────────────────────────
 *
 *    1. le serveur démarre en transport « smtp » et l'annonce ;
 *    2. `/ready` constate que le transport répond — le chemin `verify()`,
 *       jamais exercé pour de vrai jusqu'ici ;
 *    3. l'inscription fait partir un courrier de confirmation ;
 *    4. ce courrier porte un expéditeur, un objet et un lien ;
 *    5. le lien confirme réellement l'adresse ;
 *    6. une demande d'oubli de mot de passe fait partir un second courrier ;
 *    7. il porte lui aussi expéditeur, objet et lien ;
 *    8. le lien change réellement le mot de passe ;
 *    9. l'ancien mot de passe ne marche plus, le nouveau oui ;
 *   10. le même lien, rejoué, est refusé ;
 *   11. une adresse inconnue ne fait partir aucun message — et répond pareil.
 *
 * Le onzième compte autant que les autres : si une demande sur une adresse
 * inconnue se comportait différemment, n'importe qui pourrait savoir qui a un
 * compte chez Ignitux.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const lire = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : defaut;
};

const PORT_API = Number(lire('port', '3002'));
const WEB = lire('web', 'http://127.0.0.1:3001');
const API = `http://127.0.0.1:${PORT_API}`;
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

const resultats = [];
const noter = (etat, libelle, detail = '') => {
  resultats.push({ etat, libelle, detail });
  const marque = { ok: 'OK    ', echec: 'ÉCHEC ', ignore: 'IGNORÉ' }[etat];
  console.log(`  ${marque} ${libelle}${detail ? ` — ${detail}` : ''}`);
};

/**
 * Défaire l'encodage « quoted-printable ».
 *
 * nodemailer encode le texte et le replie à 76 colonnes : un lien plus long
 * est coupé, la coupure marquée par un « = » en fin de ligne, et le « = » de
 * `?token=` devient `=3D`. La première version cherchait le lien dans le corps
 * brut et ne le trouvait jamais — elle cherchait une chaîne que personne
 * n'avait écrite. Ce que lit une vraie boîte aux lettres est le texte décodé ;
 * c'est donc lui qu'on examine.
 */
const decoder = (brut) =>
  brut
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

// ── Le serveur SMTP qui écoute vraiment ────────────────────────────────────
//
// Le strict nécessaire pour qu'un client considère le message remis : les
// salutations, l'enveloppe, le corps, et l'au revoir. Il n'annonce ni STARTTLS
// ni AUTH, ce qui fait que nodemailer poste en clair — acceptable sur une
// boucle locale, et cela évite de fabriquer un certificat pour éprouver autre
// chose que du chiffrement.
//
// Ce qu'il ne simule pas : le refus. Un vrai serveur peut répondre 550, et ce
// chemin-là reste couvert par les tests unitaires, qui savent faire échouer
// `sendMail` sans qu'aucune socket existe.
function demarrerBoiteAuxLettres() {
  const recus = [];
  const serveur = createServer((socket) => {
    let tampon = '';
    let dansLeCorps = false;
    let corps = '';
    let destinataires = [];
    let expediteur = null;

    const dire = (ligne) => socket.write(`${ligne}\r\n`);
    dire('220 boite-locale ESMTP Ignitux');

    socket.on('data', (donnees) => {
      tampon += donnees.toString('utf8');

      for (;;) {
        const coupure = tampon.indexOf('\r\n');
        if (coupure === -1) break;
        const ligne = tampon.slice(0, coupure);
        tampon = tampon.slice(coupure + 2);

        if (dansLeCorps) {
          if (ligne === '.') {
            recus.push({ expediteur, destinataires: [...destinataires], corps });
            dansLeCorps = false;
            corps = '';
            destinataires = [];
            dire('250 2.0.0 Ok: recu');
          } else {
            // Un point en début de ligne est doublé par le client (« dot
            // stuffing ») pour ne pas être pris pour la fin du message.
            corps += `${ligne.startsWith('..') ? ligne.slice(1) : ligne}\n`;
          }
          continue;
        }

        const commande = ligne.split(' ')[0].toUpperCase();
        if (commande === 'EHLO' || commande === 'HELO') {
          dire('250-boite-locale');
          dire('250 SIZE 10485760');
        } else if (commande === 'MAIL') {
          expediteur = ligne.slice(ligne.indexOf(':') + 1).trim();
          dire('250 2.1.0 Ok');
        } else if (commande === 'RCPT') {
          destinataires.push(ligne.slice(ligne.indexOf(':') + 1).trim());
          dire('250 2.1.5 Ok');
        } else if (commande === 'DATA') {
          dansLeCorps = true;
          dire('354 Envoie le message, termine par <CRLF>.<CRLF>');
        } else if (commande === 'RSET') {
          destinataires = [];
          expediteur = null;
          dire('250 2.0.0 Ok');
        } else if (commande === 'QUIT') {
          dire('221 2.0.0 Au revoir');
          socket.end();
        } else if (commande === 'NOOP') {
          dire('250 2.0.0 Ok');
        } else {
          dire('502 5.5.1 Commande inconnue');
        }
      }
    });

    socket.on('error', () => {});
  });

  return new Promise((resoudre) => {
    // Port 0 : le système en choisit un libre. Un port fixe finirait par se
    // heurter à autre chose, et l'échec ressemblerait à un défaut du produit.
    serveur.listen(0, '127.0.0.1', () => {
      resoudre({ port: serveur.address().port, recus, fermer: () => serveur.close() });
    });
  });
}

/**
 * Attend un message adressé à `qui` et dont le texte décodé contient `motif`.
 *
 * Le `motif` n'est pas un raffinement : deux courriers partent pour la même
 * personne, et prendre « le premier arrivé » revient à examiner celui qu'on ne
 * cherchait pas.
 */
async function attendreMessage(recus, qui, motif, secondes = 15) {
  for (let i = 0; i < secondes * 4; i += 1) {
    const trouve = recus.find(
      (m) => m.destinataires.some((d) => d.includes(qui)) && decoder(m.corps).includes(motif),
    );
    if (trouve) return trouve;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

async function appel(chemin, options = {}) {
  const reponse = await fetch(`${API}${chemin}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  let corps = null;
  try {
    corps = await reponse.json();
  } catch {
    /* 204 et consorts n'ont pas de corps */
  }
  return { statut: reponse.status, corps };
}

/** Un courrier est-il complet ? Expéditeur, objet, lien — et le lien rendu. */
function examiner(message, chemin) {
  const lisible = decoder(message.corps);
  return {
    expediteur: /^From:.*ignitux/im.test(message.corps),
    objet: /^Subject:\s*\S/im.test(message.corps),
    lien: lisible.match(new RegExp(`https?://\\S*${chemin}\\S*token=[A-Za-z0-9._~-]+`))?.[0] ?? null,
    taille: message.corps.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════

console.log('┌─ Le courrier part-il vraiment ? ──────────────────────────');
const boite = await demarrerBoiteAuxLettres();
console.log(`│ boîte SMTP locale : 127.0.0.1:${boite.port}`);
console.log(`│ serveur           : ${API}`);
console.log('└───────────────────────────────────────────────────────────\n');

const serveur = spawn(process.execPath, ['dist/main.js'], {
  cwd: join(RACINE, 'backend'),
  env: {
    ...process.env,
    PORT: String(PORT_API),
    FRONTEND_URL: WEB,
    TRUST_PROXY: 'false',
    IGINI_AI_ENABLED: 'false',
    MAIL_TRANSPORT: 'smtp',
    MAIL_FROM: 'Ignitux <ne-pas-repondre@ignitux.test>',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(boite.port),
    SMTP_USER: '',
    SMTP_PASSWORD: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let journal = '';
serveur.stdout.on('data', (d) => (journal += d.toString('utf8')));
serveur.stderr.on('data', (d) => (journal += d.toString('utf8')));

try {
  let debout = false;
  for (let i = 0; i < 90 && !debout; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    debout = await fetch(`${API}/health`)
      .then((r) => r.ok)
      .catch(() => false);
  }
  if (!debout) {
    noter('echec', 'Le serveur démarre en transport « smtp »', journal.slice(-200) || 'aucun journal');
    throw new Error('arrêt');
  }

  if (journal.includes('Transport email SMTP vers 127.0.0.1')) {
    noter('ok', 'Le serveur démarre en transport « smtp » et le dit');
  } else {
    noter('echec', 'Le serveur ne déclare pas le transport SMTP', journal.slice(-160));
  }

  const pret = await appel('/ready');
  const sante = pret.corps?.verifications?.email ?? null;
  if (sante?.etat === 'ok') {
    noter('ok', '/ready constate que le transport répond', sante.detail ?? '');
  } else {
    noter('echec', '/ready ne voit pas le transport', JSON.stringify(sante).slice(0, 110));
  }

  const horodatage = Date.now();
  const ADRESSE = `courrier.${horodatage}@ignitux.test`;
  const ANCIEN = 'MotDePasse123!';
  const NOUVEAU = 'NouveauMotDePasse456!';

  // ── L'inscription et sa confirmation d'adresse ────────────────────────
  const inscription = await appel('/users/signup', {
    method: 'POST',
    body: JSON.stringify({ email: ADRESSE, password: ANCIEN }),
  });
  if (inscription.statut !== 201) throw new Error(`inscription HTTP ${inscription.statut}`);

  const confirmation = await attendreMessage(boite.recus, ADRESSE, 'verify-email');
  if (confirmation) {
    noter('ok', 'L’inscription fait partir un courrier de confirmation');
    const vu = examiner(confirmation, 'verify-email');
    if (vu.expediteur && vu.objet && vu.lien) {
      noter('ok', 'Le courrier de confirmation est complet', `${vu.taille} octets`);
      const jeton = new URL(vu.lien).searchParams.get('token');
      const verif = await appel('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: jeton }),
      });
      if (verif.statut === 200) {
        noter('ok', 'Le lien reçu confirme réellement l’adresse');
      } else {
        noter('echec', 'Le lien de confirmation ne confirme rien', `HTTP ${verif.statut}`);
      }
    } else {
      noter(
        'echec',
        'Le courrier de confirmation est incomplet',
        `expéditeur ${vu.expediteur} · objet ${vu.objet} · lien ${Boolean(vu.lien)}`,
      );
    }
  } else {
    noter('echec', 'L’inscription ne fait partir aucune confirmation', `${boite.recus.length} reçu(s)`);
  }

  // ── L'oubli du mot de passe ───────────────────────────────────────────
  const demande = await appel('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: ADRESSE }),
  });
  const message = await attendreMessage(boite.recus, ADRESSE, 'reset-password');

  if (message && demande.statut === 204) {
    noter('ok', 'Une demande d’oubli fait partir un second courrier', `HTTP ${demande.statut}`);
  } else {
    noter('echec', 'Aucun courrier de réinitialisation', `HTTP ${demande.statut}, ${boite.recus.length} reçu(s)`);
    throw new Error('arrêt');
  }

  const vu = examiner(message, 'reset-password');
  if (vu.expediteur && vu.objet && vu.lien) {
    noter('ok', 'Le courrier de réinitialisation est complet', `${vu.taille} octets`);
  } else {
    noter(
      'echec',
      'Le courrier de réinitialisation est incomplet',
      `expéditeur ${vu.expediteur} · objet ${vu.objet} · lien ${Boolean(vu.lien)}`,
    );
  }

  if (vu.lien) {
    const jetonTrouve = new URL(vu.lien).searchParams.get('token');
    const remise = await appel('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: jetonTrouve, newPassword: NOUVEAU }),
    });
    if (remise.statut === 200) {
      noter('ok', 'Le lien reçu change réellement le mot de passe');
    } else {
      noter('echec', 'Le lien reçu ne change rien', `HTTP ${remise.statut}`);
    }

    const avecAncien = await appel('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: ADRESSE, password: ANCIEN }),
    });
    const avecNouveau = await appel('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: ADRESSE, password: NOUVEAU }),
    });
    if (avecAncien.statut === 401 && avecNouveau.statut === 200) {
      noter('ok', 'L’ancien mot de passe ne marche plus, le nouveau oui');
    } else {
      noter(
        'echec',
        'Le changement de mot de passe est incohérent',
        `ancien ${avecAncien.statut}, nouveau ${avecNouveau.statut}`,
      );
    }

    const rejeu = await appel('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: jetonTrouve, newPassword: 'EncoreUnAutre789!' }),
    });
    if (rejeu.statut >= 400) {
      noter('ok', 'Le même lien, rejoué, est refusé', `HTTP ${rejeu.statut}`);
    } else {
      noter('echec', 'Le lien se rejoue', `HTTP ${rejeu.statut}`);
    }

    // Ménage : on rend le compte plutôt que de le laisser traîner.
    const jeton = avecNouveau.corps?.accessToken;
    if (jeton) {
      await appel('/users/me', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${jeton}` },
        body: JSON.stringify({ password: NOUVEAU }),
      }).catch(() => {});
    }
  }

  // ── Une adresse inconnue ne doit rien laisser filtrer ─────────────────
  const avant = boite.recus.length;
  const inconnue = await appel('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: `personne.${horodatage}@ignitux.test` }),
  });
  await new Promise((r) => setTimeout(r, 1500));
  if (inconnue.statut === demande.statut && boite.recus.length === avant) {
    noter('ok', 'Une adresse inconnue ne fait partir aucun message, et répond pareil');
  } else {
    noter(
      'echec',
      'Une adresse inconnue se distingue',
      `HTTP ${inconnue.statut} contre ${demande.statut}, ${boite.recus.length - avant} message(s)`,
    );
  }
} catch (erreur) {
  if (String(erreur.message) !== 'arrêt') {
    noter('echec', 'Interruption', String(erreur.message).slice(0, 110));
  }
} finally {
  serveur.kill();
  boite.fermer();
}

const echecs = resultats.filter((r) => r.etat === 'echec');
console.log('');
console.log('╔═══════════════════════════════════════════════════════════════╗');
const verdict = `  ${resultats.length - echecs.length} vérifiés · ${echecs.length} en échec`;
console.log(`║${verdict.padEnd(63)}║`);
console.log('╚═══════════════════════════════════════════════════════════════╝');
console.log('');
console.log('Hors de portée d’ici : qu’un message arrive dans une vraie boîte sans');
console.log('finir en indésirable. Cela dépend de SPF, DKIM et DMARC sur un domaine');
console.log('réel — de la réputation d’expéditeur, pas du code.');
process.exit(echecs.length > 0 ? 1 : 0);
