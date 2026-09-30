/**
 * LE RAPPORTEUR D'ERREURS.
 *
 * Les `Logger.error` du produit sont soignés : chacun porte une référence, la
 * route, l'utilisateur et la pile. Ils ne servent à rien tant que personne ne
 * les lit — et personne ne lit les journaux d'un serveur en continu. Le
 * premier défaut en production se découvrirait par le message de quelqu'un,
 * plusieurs jours après.
 *
 * ── Pourquoi pas le SDK d'un fournisseur ─────────────────────────────────
 *
 * Parce que leurs intégrations par défaut capturent le corps des requêtes,
 * les en-têtes et les variables d'environnement. C'est ce qui les rend
 * pratiques, et c'est exactement ce que l'article 13 interdit : le corps
 * d'une requête d'Ignitux contient des projets, des contacts, des écritures
 * comptables — les affaires de quelqu'un. Les retirer après coup demande de
 * connaître toutes leurs options, et un oubli ne se voit pas.
 *
 * Ici, **rien ne part qui ne soit nommé ci-dessous**. C'est moins riche, et
 * c'est vérifiable en lisant trente lignes.
 *
 * ── Ce qui part, et rien d'autre ─────────────────────────────────────────
 *
 *   — la référence, celle que la personne peut citer ;
 *   — la méthode HTTP et le chemin, **sans la chaîne de requête** : un jeton
 *     de réinitialisation y circule ;
 *   — le message de l'erreur et sa pile, **expurgés** ;
 *   — l'identifiant de l'utilisateur, qui est un UUID et jamais son adresse ;
 *   — le moment.
 *
 * Ne partent jamais : le corps de la requête, les en-têtes, les témoins, les
 * valeurs de la chaîne de requête, les variables d'environnement.
 *
 * ── Ce qu'il ne fait pas ─────────────────────────────────────────────────
 *
 * Il ne relance pas, ne met pas en file et n'attend pas. Un rapporteur qui
 * ralentit la réponse d'erreur aggrave l'incident qu'il signale ; un
 * rapporteur qui lève une exception le transforme en panne. Il échoue en
 * silence, et le journal local reste la source de vérité.
 */
import { Logger } from '@nestjs/common';

/** Ce qu'on accepte de faire sortir de la machine. */
export interface RapportErreur {
  reference: string;
  methode: string;
  chemin: string;
  message: string;
  pile: string | null;
  utilisateurId: string | null;
  moment: string;
}

const logger = new Logger('Rapporteur');

/**
 * Retire d'un texte ce qui ressemble à une donnée personnelle.
 *
 * Un message d'erreur cite parfois la valeur qui l'a provoquée : « l'adresse
 * jean@exemple.fr existe déjà ». La pile, elle, cite des chemins de fichiers
 * qui portent le nom de l'utilisateur de la machine de développement.
 *
 * Ce n'est pas une garantie absolue — aucune expression régulière ne l'est.
 * C'est une couche de plus, et elle attrape les deux cas qui se produisent
 * vraiment.
 */
export function expurger(texte: string): string {
  return texte
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[adresse retirée]')
    .replace(/\b[A-Za-z]:\\Users\\[^\\\s]+/g, 'C:\\Users\\[retiré]')
    .replace(/\/(home|Users)\/[^/\s]+/g, '/$1/[retiré]');
}

/** L'adresse du collecteur, ou null quand il n'y en a pas. */
function destination(): string | null {
  const brut = process.env.ERREURS_WEBHOOK_URL?.trim();
  if (!brut) return null;
  // Une adresse invalide vaut mieux signalée au démarrage qu'à la première
  // erreur, où elle s'ajouterait à un incident déjà en cours.
  try {
    const url = new URL(brut);
    return url.protocol === 'https:' || url.protocol === 'http:' ? brut : null;
  } catch {
    return null;
  }
}

/** Le collecteur est-il configuré ? Sert à l'endpoint de santé. */
export function rapporteurActif(): boolean {
  return destination() !== null;
}

/**
 * Envoie un rapport, ou ne fait rien.
 *
 * Ne lève jamais, n'attend jamais : l'appelant est un filtre d'exception, et
 * il a une réponse à rendre.
 */
export function signalerErreur(rapport: RapportErreur): void {
  const url = destination();
  if (url === null) return;

  const charge = {
    ...rapport,
    message: expurger(rapport.message),
    pile: rapport.pile === null ? null : expurger(rapport.pile),
    // Le chemin sans sa chaîne de requête : un jeton de réinitialisation y
    // circule, et il ouvre un compte.
    chemin: rapport.chemin.split('?')[0],
    produit: 'ignitux',
  };

  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(charge),
    signal: AbortSignal.timeout(5_000),
  }).catch((erreur: unknown) => {
    // Une seule ligne, sans pile : un collecteur injoignable ne doit pas
    // remplir le journal qu'il était censé rendre inutile.
    logger.warn(
      `Rapport ${rapport.reference} non transmis — ${
        erreur instanceof Error ? erreur.message : String(erreur)
      }`,
    );
  });
}
