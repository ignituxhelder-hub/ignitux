/**
 * CE QU'IL FAUT AVOIR DÉCIDÉ AVANT DE SERVIR DE VRAIES PERSONNES.
 *
 * Toutes ces vérifications portent sur des réglages qui, mal posés, ne
 * provoquent **aucune erreur visible** : le serveur démarre, répond, et se
 * comporte mal en silence. Un secret resté à sa valeur d'exemple signe des
 * jetons que n'importe qui peut forger ; un limiteur de débit derrière un
 * proxy non déclaré met tout le monde dans le même seau ; une base de
 * développement branchée en production mélange les vraies données aux
 * essais.
 *
 * C'est précisément parce que ces fautes sont muettes qu'elles méritent un
 * refus de démarrer. Une panne bruyante au lancement coûte cinq minutes ;
 * la même faute découverte trois semaines plus tard coûte la confiance des
 * personnes qui utilisaient le produit.
 *
 * Le module est pur — aucune dépendance Nest, aucun accès réseau — pour que
 * chaque règle soit vérifiable ligne à ligne.
 */

export interface PreflightInput {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  JWT_SECRET?: string;
  FRONTEND_URL?: string;
  TRUST_PROXY?: string;
  MAIL_TRANSPORT?: string;
  MAIL_FROM?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  ENABLE_API_DOCS?: string;
  IGNITUX_RAISON_SOCIALE?: string;
  IGNITUX_ADRESSE?: string;
  IGNITUX_EMAIL?: string;
}

export interface PreflightProblem {
  /** Le réglage en cause, tel qu'il s'écrit dans l'environnement. */
  setting: string;
  /** Ce qui ne va pas, et ce qu'il faut faire. Lu par un humain pressé. */
  detail: string;
}

/** Valeurs d'exemple du dépôt : les laisser en production est une faille. */
const SECRETS_D_EXEMPLE = [
  'change-me-generate-a-long-random-secret',
  'change-me',
  'secret',
  'development-secret-at-least-32-characters',
];

/**
 * Les domaines qui ne peuvent pas recevoir de courrier, jamais.
 *
 * `.test`, `.invalid`, `.example` et `.localhost` sont réservés par les
 * RFC 2606 et 6761 : ils ne seront jamais délégués, donc aucune adresse qui
 * s'y termine n'existe ni n'existera. `exemple.` et `example.` attrapent les
 * valeurs du fichier d'exemple laissées en place.
 *
 * Pourquoi c'est un refus et non un avertissement : un courrier expédié depuis
 * une adresse inexistante part quand même, arrive parfois — et la personne qui
 * y répond écrit dans le vide. Elle croit avoir répondu. C'est la panne la
 * plus discrète de tout le dispositif d'email, et elle se découvre par le
 * silence de quelqu'un qui attendait.
 */
const DOMAINES_IMPOSSIBLES = [
  // Les TLD réservés, ancrés en fin d adresse : on refuse le domaine
  // `monsite.test`, pas un mot `test` qui traînerait ailleurs dans la ligne.
  /@[^@\s>]*\.test>?\s*$/i,
  /@[^@\s>]*\.invalid>?\s*$/i,
  /@[^@\s>]*\.example>?\s*$/i,
  /@[^@\s>]*\.localhost>?\s*$/i,
  // Les valeurs du fichier d exemple. Le point est échappé : sans lui,
  // `@exemplaire-conseil.fr` serait refusé alors qu il peut exister.
  /@exemple\./i,
  /@example\./i,
];

export function isProduction(env: PreflightInput): boolean {
  return env.NODE_ENV === 'production';
}

/**
 * Un hôte local ne peut pas être l'origine d'un frontend servi à de vraies
 * personnes : CORS refuserait tout le monde sauf la machine du serveur.
 */
function estLocal(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(url);
}

/**
 * Les valeurs acceptées pour `TRUST_PROXY`.
 *
 * `false` est une réponse valide et doit être écrite : sans proxy devant le
 * serveur, ne rien faire confiance est le bon réglage. Ce qui est refusé,
 * c'est de ne pas avoir tranché — parce que le mauvais défaut est silencieux
 * dans les deux sens.
 */
export function parseTrustProxy(valeur: string | undefined): number | false | null {
  if (valeur === undefined || valeur.trim() === '') return null;
  const propre = valeur.trim().toLowerCase();
  if (propre === 'false' || propre === 'off' || propre === '0') return false;
  const sauts = Number(propre);
  if (Number.isInteger(sauts) && sauts > 0 && sauts < 10) return sauts;
  return null;
}

/**
 * Les transports d'email acceptés.
 *
 * `log` est une réponse valide — un déploiement peut légitimement tourner
 * sans email — mais elle doit être **écrite**. Par omission, on obtient un
 * produit où la réinitialisation de mot de passe échoue en silence et où la
 * personne enfermée dehors n'a aucun recours.
 */
export type MailTransport = 'smtp' | 'log';

export function parseMailTransport(valeur: string | undefined): MailTransport | null {
  const propre = valeur?.trim().toLowerCase();
  if (propre === 'smtp' || propre === 'log') return propre;
  return null;
}

/**
 * Tout ce qui empêche ce processus de servir de vraies personnes.
 *
 * Rend une liste vide quand tout va bien. Hors production, rend toujours une
 * liste vide : ces exigences n'ont de sens que face à de vrais comptes, et
 * les imposer en développement ferait perdre du temps sans rien protéger.
 */
export function productionProblems(env: PreflightInput): PreflightProblem[] {
  if (!isProduction(env)) return [];

  const problemes: PreflightProblem[] = [];
  const probleme = (setting: string, detail: string) => problemes.push({ setting, detail });

  // ── Le secret de signature ───────────────────────────────────────────────
  const secret = env.JWT_SECRET ?? '';
  if (SECRETS_D_EXEMPLE.includes(secret.toLowerCase())) {
    probleme(
      'JWT_SECRET',
      "porte encore une valeur d'exemple du dépôt. Elle est publique : " +
        "n'importe qui peut forger un jeton et se connecter sous n'importe quel compte. " +
        'Génère-en un nouveau, différent de celui de développement.',
    );
  } else if (secret.length < 32) {
    probleme(
      'JWT_SECRET',
      `ne fait que ${secret.length} caractères. En dessous de 32, un jeton signé HS256 se ` +
        'casse par force brute hors ligne, sans laisser la moindre trace côté serveur. ' +
        'Génère-en un avec : openssl rand -base64 48',
    );
  }

  // ── L'origine du frontend ────────────────────────────────────────────────
  const frontend = env.FRONTEND_URL ?? '';
  if (frontend === '' || estLocal(frontend)) {
    probleme(
      'FRONTEND_URL',
      `vaut « ${frontend || '(vide)'} », une adresse locale. CORS refuserait toutes les ` +
        'personnes sauf celles connectées à la machine du serveur.',
    );
  } else if (!frontend.startsWith('https://')) {
    probleme(
      'FRONTEND_URL',
      'doit être en https en production : un jeton de session qui circule en clair ' +
        "s'intercepte sur n'importe quel réseau partagé.",
    );
  }

  // ── La base ──────────────────────────────────────────────────────────────
  const base = env.DATABASE_URL ?? '';
  if (base === '') {
    probleme(
      'DATABASE_URL',
      'est vide. La production écrit dans `ignitux_prod`, jamais dans la base de ' +
        'développement : même hôte, même identifiants, chemin final différent.',
    );
  } else if (/\/postgres(\?|$)/.test(base)) {
    probleme(
      'DATABASE_URL',
      'pointe sur la base `postgres`, celle du développement. Les vraies personnes ' +
        'écriraient au milieu des données d’essai. La production utilise `ignitux_prod`.',
    );
  }

  // ── Le proxy ─────────────────────────────────────────────────────────────
  if (parseTrustProxy(env.TRUST_PROXY) === null) {
    probleme(
      'TRUST_PROXY',
      "doit être posée explicitement : le nombre de proxys devant le serveur (« 1 » " +
        'derrière un seul reverse proxy), ou « false » s’il n’y en a aucun. Sans ce ' +
        'réglage, le limiteur de débit voit l’adresse du proxy et met tout le monde ' +
        'dans le même seau — une seule personne peut alors verrouiller tous les comptes.',
    );
  }

  // ── L'email ──────────────────────────────────────────────────────────────
  const transport = parseMailTransport(env.MAIL_TRANSPORT);
  if (transport === null) {
    probleme(
      'MAIL_TRANSPORT',
      'doit valoir « smtp » ou « log ». Par omission, la réinitialisation de mot de ' +
        'passe échoue en silence : la personne qui oublie son mot de passe est enfermée ' +
        'dehors sans recours. « log » est une réponse valide, mais elle doit être écrite.',
    );
  } else if (transport === 'smtp') {
    for (const [nom, valeur] of [
      ['SMTP_HOST', env.SMTP_HOST],
      ['SMTP_USER', env.SMTP_USER],
      ['SMTP_PASSWORD', env.SMTP_PASSWORD],
      ['MAIL_FROM', env.MAIL_FROM],
    ] as const) {
      if (!valeur || valeur.trim() === '') {
        probleme(nom, 'est requise quand MAIL_TRANSPORT vaut « smtp ».');
      }
    }
    const port = Number(env.SMTP_PORT ?? '');
    if (env.SMTP_PORT !== undefined && (!Number.isInteger(port) || port <= 0 || port > 65535)) {
      probleme('SMTP_PORT', `« ${env.SMTP_PORT} » n'est pas un port valide.`);
    }

    const expediteur = env.MAIL_FROM ?? '';
    if (expediteur.trim() !== '' && DOMAINES_IMPOSSIBLES.some((motif) => motif.test(expediteur))) {
      probleme(
        'MAIL_FROM',
        `vaut « ${expediteur} », dont le domaine ne peut pas exister — il est réservé ` +
          'par les RFC, ou vient du fichier d’exemple. Les courriers partiraient quand même, ' +
          'et toute réponse tomberait dans le vide : la personne croirait avoir répondu. ' +
          "Mets l'adresse réelle depuis laquelle Ignitux écrit.",
      );
    }
  }

  // ── L'identité légale ────────────────────────────────────────────────────
  //
  // Un service en ligne ouvert au public doit publier qui l'édite, et une
  // facture sans raison sociale ni adresse n'est pas une facture incomplète :
  // c'est un document sans valeur. Les deux se découvrent tard — l'un à une
  // mise en demeure, l'autre à un contrôle — donc ils se refusent tôt.
  //
  // Le SIREN et la TVA ne figurent pas ici : une activité peut démarrer
  // avant son immatriculation, et toutes ne sont pas assujetties.
  const identite: Array<[string, string | undefined, string]> = [
    ['IGNITUX_RAISON_SOCIALE', env.IGNITUX_RAISON_SOCIALE, 'le nom sous lequel Ignitux facture'],
    ['IGNITUX_ADRESSE', env.IGNITUX_ADRESSE, "l'adresse postale de l'éditeur"],
    ['IGNITUX_EMAIL', env.IGNITUX_EMAIL, "l'adresse de contact publiée"],
  ];
  for (const [cle, valeur, quoi] of identite) {
    if (!valeur || valeur.trim() === '') {
      probleme(
        cle,
        `est vide. C'est ${quoi} : sans elle, les mentions légales sont incomplètes et ` +
          "toute facture émise est sans valeur. Ignitux ne l'invente pas — renseigne-la.",
      );
    }
  }

  return problemes;
}

/**
 * La documentation d'API est-elle servie ?
 *
 * Éteinte en production sauf demande explicite. `/docs` décrit toute la
 * surface de l'API, y compris les routes d'administration : c'est une carte
 * offerte à qui cherche par où entrer. L'éteindre ne protège rien à soi seul
 * — la sécurité ne tient pas au secret des routes — mais rien n'oblige à
 * fournir le plan.
 */
export function shouldServeApiDocs(env: PreflightInput): boolean {
  if (!isProduction(env)) return true;
  return env.ENABLE_API_DOCS?.trim().toLowerCase() === 'true';
}
