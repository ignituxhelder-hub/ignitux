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
 *    termine alors par un marqueur **écrit par le serveur**,
 *    `[[confirmer: <outil> <projet> <crédits>]]`, que l'écran montre comme
 *    un bouton « Confirmer — N crédits ».
 * 2. Au message suivant, l'outil s'exécute seulement si les deux tiennent :
 *    - le message d'IGINI qui précède immédiatement porte ce marqueur pour
 *      CET outil, CE projet et le prix ACTUEL du barème ;
 *    - le message de la personne est un oui (`estConfirmation`).
 *    Une confirmation sert une fois.
 *
 * Le modèle ne peut pas fabriquer la confirmation : il n'écrit pas le
 * marqueur (ceux qu'il écrirait sont retirés avant d'enregistrer sa
 * réponse), et le oui vient du message de la personne. Module pur : tout se
 * teste sans rien démarrer.
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
 * Les propositions d'un message d'IGINI, telles que le serveur les a
 * écrites. Un outil gratuit ou inconnu, ou un prix qui n'est plus celui du
 * barème (changé entre-temps), ne vaut pas proposition : il sera reproposé
 * au bon prix.
 */
export function lireConfirmations(contenu: string): Array<Confirmation & { credits: number }> {
  const trouvees: Array<Confirmation & { credits: number }> = [];
  for (const [, outil, projectId, credits] of contenu.matchAll(MARQUEUR_RE)) {
    if (!estOutilPayant(outil)) continue;
    if (Number(credits) !== BAREME[outil].credits) continue;
    trouvees.push({ outil, projectId, credits: Number(credits) });
  }
  return trouvees;
}

/** Retire tout marqueur de confirmation — ceux qu'un modèle écrirait lui-même. */
export function retirerMarqueursConfirmation(texte: string): string {
  return texte.replace(MARQUEUR_RE, '').trim();
}

/** Ajoute à la réponse un marqueur par outil proposé pendant le tour. */
export function ajouterPropositions(texte: string, propositions: readonly Confirmation[]): string {
  const vus = new Set<string>();
  const marqueurs: string[] = [];
  for (const p of propositions) {
    const cle = `${p.outil} ${p.projectId}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    marqueurs.push(marqueurConfirmation(p.outil, p.projectId));
  }
  return marqueurs.length === 0 ? texte : `${texte}\n${marqueurs.join('\n')}`;
}

/**
 * Ce que l'outil rend à IGINI tant que le prix n'est pas confirmé : un
 * résultat normal (pas une erreur), pour qu'il le transmette.
 */
export function messagePrixAConfirmer(outil: OutilPayant): string {
  const { libelle, credits } = BAREME[outil];
  return (
    `PRIX À CONFIRMER — « ${libelle} » coûte ${enCredits(credits)}, débités du compte du propriétaire du ` +
    'projet. Rien n’a été lancé ni débité. Annonce ce prix à la personne en une phrase et demande-lui de ' +
    'confirmer ; un bouton de confirmation s’affiche sous ta réponse. Ne relance cet outil qu’après son oui.'
  );
}

const OUI = /^(oui|ouais|ok|okay|d'?accord|dac|vas[- ]y|go|confirme|je confirme|c'?est bon|lance|lance[- ]la|lance[- ]le|yes|yep|sure|sim|pode)\b/;
const NEGATION = /\b(non|pas|ne|jamais|attends?|plus tard|annule|stop|no|nao)\b/;

/**
 * Le message de la personne est-il un oui ? Court, commençant par un mot
 * d'accord, sans négation. Strict à dessein : un doute coûte une seconde
 * question, une erreur coûte des crédits.
 */
export function estConfirmation(message: string): boolean {
  const texte = message
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .toLowerCase()
    .trim();
  if (texte === '' || texte.length > 80) return false;
  return OUI.test(texte) && !NEGATION.test(texte);
}

/**
 * Les confirmations d'un tour de chat : accordées par le message de la
 * personne, consommées une fois par l'outil, et les nouvelles propositions
 * faites pendant le tour.
 */
export class ConfirmationsDuTour {
  private readonly accordees: Set<string>;
  private readonly proposees: Confirmation[] = [];

  constructor(accordees: readonly Confirmation[]) {
    this.accordees = new Set(accordees.map((c) => `${c.outil} ${c.projectId}`));
  }

  /** `true` une seule fois, et seulement pour ce que la personne a confirmé. */
  consommer(outil: OutilPayant, projectId: string): boolean {
    return this.accordees.delete(`${outil} ${projectId}`);
  }

  proposer(outil: OutilPayant, projectId: string): void {
    this.proposees.push({ outil, projectId });
  }

  propositions(): Confirmation[] {
    return [...this.proposees];
  }
}
