import { BAREME } from '../../credits/bareme.js';

/**
 * LE PRIX D'UN OUTIL PAYANT, CONFIRMÉ AVANT D'ÊTRE DÉPENSÉ.
 *
 * Depuis le chat, IGINI peut lancer une étape de sa méthode (analyser,
 * construire…), qui se paie à son prix, en plus du message. Sur un bouton,
 * le prix est affiché avant le clic ; dans une conversation, rien ne
 * l'affichait — et une consigne au modèle (« ne lance que si la personne
 * l'a demandé ») n'est pas une garantie : c'est le serveur qui décide.
 *
 * ## La règle, en deux temps
 *
 * 1. IGINI appelle l'outil. Le serveur ne lance rien, ne débite rien, et lui
 *    rend le prix à annoncer (« PRIX À CONFIRMER… »). La réponse d'IGINI se
 *    termine alors par UN marqueur **écrit par le serveur**,
 *    `[[confirmer: <outil> <projet> <crédits>]]`, que l'écran montre comme
 *    un bouton « Confirmer — N crédits ». **Une action payante à la fois** :
 *    une seconde proposée dans le même tour attend (`messageUneALaFois`) —
 *    sinon un seul bouton à 4 crédits en aurait confirmé 9.
 * 2. Au message suivant, l'outil s'exécute seulement si le bouton a envoyé
 *    une **confirmation structurée** (`{ outil, projectId, credits }`, pas du
 *    texte) qui correspond au marqueur du message d'IGINI qui précède
 *    immédiatement : même outil, même projet, prix ACTUEL du barème. Un « oui »
 *    tapé ne lance jamais rien — « ok, trop cher » commence aussi par « ok ».
 *    La confirmation se réclame **une seule fois en base** : l'écriture
 *    conditionnelle qui retire le marqueur du message d'IGINI ne réussit
 *    qu'une fois, même depuis deux onglets.
 *
 * Le modèle ne peut pas fabriquer la confirmation : il n'écrit pas le
 * marqueur (ceux qu'il écrirait sont retirés avant d'enregistrer sa
 * réponse), et la confirmation vient du bouton de la personne.
 */

/** Les outils du chat qui lancent un générateur payant. */
export const OUTILS_PAYANTS = ['analyser', 'construire', 'financer', 'developper', 'transmettre'] as const;
export type OutilPayant = (typeof OUTILS_PAYANTS)[number];

export function estOutilPayant(nom: string): nom is OutilPayant {
  return (OUTILS_PAYANTS as readonly string[]).includes(nom);
}

export interface Confirmation {
  outil: OutilPayant;
  projectId: string;
}

/** Ce que le bouton envoie, et ce que le marqueur porte : l'outil, le projet, le prix affiché. */
export interface ConfirmationPrix {
  outil: string;
  projectId: string;
  credits: number;
}

/** « 4 crédits », « 1 crédit ». */
export function enCredits(n: number): string {
  return `${n} crédit${n > 1 ? 's' : ''}`;
}

/** Le marqueur que le serveur ajoute à la réponse qui propose un outil payant. */
export function marqueurConfirmation(outil: OutilPayant, projectId: string): string {
  return `[[confirmer: ${outil} ${projectId} ${BAREME[outil].credits}]]`;
}

const MARQUEUR_RE = /\n?\[\[confirmer:\s*([^\]\s]+)\s+([^\]\s]+)\s+([^\]\s]+)\s*\]\]/g;

/**
 * La proposition d'un message d'IGINI, telle que le serveur l'a écrite : le
 * premier marqueur valide, et lui seul. Un outil gratuit ou inconnu, ou un
 * prix qui n'est plus celui du barème (changé entre-temps), ne vaut pas
 * proposition : il sera reproposé au bon prix.
 */
export function lireConfirmation(contenu: string): (Confirmation & { credits: number }) | null {
  for (const [, outil, projectId, credits] of contenu.matchAll(MARQUEUR_RE)) {
    if (!estOutilPayant(outil)) continue;
    if (Number(credits) !== BAREME[outil].credits) continue;
    return { outil, projectId, credits: Number(credits) };
  }
  return null;
}

/**
 * La confirmation du bouton correspond-elle exactement au marqueur ? Même
 * outil, même projet, même prix — celui que la personne a lu sur le bouton.
 */
export function confirmationCorrespond(
  confirmation: ConfirmationPrix | null | undefined,
  marqueur: (Confirmation & { credits: number }) | null,
): boolean {
  if (!confirmation || !marqueur) return false;
  return (
    confirmation.outil === marqueur.outil &&
    confirmation.projectId === marqueur.projectId &&
    confirmation.credits === marqueur.credits
  );
}

/**
 * Retire tout marqueur de confirmation — ceux qu'un modèle écrirait
 * lui-même. Jusqu'à ce que le texte ne bouge plus : un marqueur imbriqué
 * dans un autre se reformerait après un seul passage.
 */
export function retirerMarqueursConfirmation(texte: string): string {
  let avant: string;
  let apres = texte;
  do {
    avant = apres;
    apres = avant.replace(MARQUEUR_RE, '');
  } while (apres !== avant);
  return apres.trim();
}

/** Ajoute à la réponse le marqueur de l'outil proposé pendant le tour — un au plus. */
export function ajouterProposition(texte: string, proposition: Confirmation | null): string {
  return proposition ? `${texte}\n${marqueurConfirmation(proposition.outil, proposition.projectId)}` : texte;
}

/**
 * Ce que l'outil rend à IGINI tant que le prix n'est pas confirmé : un
 * résultat normal (pas une erreur), pour qu'il le transmette.
 */
export function messagePrixAConfirmer(outil: OutilPayant): string {
  const { libelle, credits } = BAREME[outil];
  return (
    `PRIX À CONFIRMER — « ${libelle} » coûte ${enCredits(credits)}, débités du compte du propriétaire du ` +
    'projet. Rien n’a été lancé ni débité. Annonce ce prix à la personne en une phrase : un bouton ' +
    '« Confirmer » s’affiche sous ta réponse, et lui seul lance l’action (un oui écrit ne suffit pas).'
  );
}

/** Ce que l'outil rend quand une autre action payante a déjà été proposée dans ce tour. */
export function messageUneALaFois(outil: OutilPayant, dejaProposee: OutilPayant): string {
  return (
    `UNE ACTION PAYANTE À LA FOIS — « ${BAREME[outil].libelle} » attendra : « ${BAREME[dejaProposee].libelle} » ` +
    'vient d’être proposée et doit d’abord être confirmée. Rien n’a été lancé ni débité. Dis à la personne ' +
    'qu’elle pourra demander la suivante ensuite.'
  );
}

/**
 * Les confirmations d'un tour de chat : celle que le bouton a accordée
 * (une au plus), consommée une seule fois — d'abord ici, puis en base par
 * `reclamer` (l'écriture conditionnelle) — et la proposition payante faite
 * pendant le tour (une au plus).
 */
export class ConfirmationsDuTour {
  private accordee: Confirmation | null;
  private proposee: Confirmation | null = null;

  constructor(
    accordee: Confirmation | null,
    private readonly reclamer?: () => Promise<boolean>,
  ) {
    this.accordee = accordee;
  }

  /** `true` une seule fois, seulement pour ce que le bouton a confirmé, et si la réclamation en base passe. */
  async consommer(outil: OutilPayant, projectId: string): Promise<boolean> {
    const a = this.accordee;
    if (!a || a.outil !== outil || a.projectId !== projectId) return false;
    // Retirée avant toute attente : un second appel du même tour ne passe pas.
    this.accordee = null;
    return this.reclamer ? this.reclamer() : true;
  }

  /**
   * Note la proposition payante du tour. `false` si une AUTRE action payante
   * est déjà proposée : une à la fois, pour qu'un bouton ne confirme jamais
   * qu'un seul prix.
   */
  proposer(outil: OutilPayant, projectId: string): boolean {
    if (this.proposee === null) {
      this.proposee = { outil, projectId };
      return true;
    }
    return this.proposee.outil === outil && this.proposee.projectId === projectId;
  }

  /** L'outil payant proposé dans ce tour, s'il y en a un. */
  proposition(): Confirmation | null {
    return this.proposee;
  }
}
