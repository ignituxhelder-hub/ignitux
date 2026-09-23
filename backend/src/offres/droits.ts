/**
 * A-T-ELLE LE DROIT DE FAIRE ÇA ? — et si non, que lui dit-on ?
 *
 * Module pur, comme le catalogue. La décision et la phrase qui l'accompagne
 * vivent ensemble, parce qu'un refus sans phrase est une impasse et qu'une
 * phrase écrite loin de la règle finit par ne plus la décrire.
 *
 * ## Deux refus qui n'ont rien à voir
 *
 * **« Ton offre ne le permet pas »** : il existe une offre qui le permet, on
 * la nomme. C'est un choix qu'on propose.
 *
 * **« Tu as épuisé ce que ton offre inclut ce mois-ci »** : monter d'offre
 * peut aider, mais attendre le mois suivant aussi — et sur la dernière
 * offre, attendre est la seule réponse. Vendre quelque chose à quelqu'un
 * qui n'a qu'à patienter serait une vente forcée.
 *
 * Les confondre donnerait le même message dans les deux cas, dont un faux.
 *
 * ## Ce qu'on ne refuse jamais
 *
 * Rien de ce qui n'a pas de coût marginal : lire, écrire une tâche, relier
 * un concept, consulter un score ou une démarche de conformité. Ces actions
 * n'apparaissent pas dans ce fichier, et c'est volontaire — une action
 * absente d'ici est autorisée, toujours.
 */

import {
  offre,
  offreSuivante,
  type Capacites,
  type GenerateurId,
  type Offre,
  type OffreId,
} from './offres-catalogue.js';

export type Action =
  | { kind: 'creer_projet'; projetsActuels: number }
  | { kind: 'generer'; generateur: GenerateurId; appelsCeMois: number }
  | { kind: 'outil_de_gestion'; outil: 'comptabilite' | 'facturation' | 'banque' }
  | { kind: 'ouvrir_financement' }
  | { kind: 'inviter_collaborateur'; collaborateursActuels: number };

export interface Verdict {
  autorise: boolean;
  /** Ce qu'on dit à la personne. `null` quand elle peut continuer. */
  raison: string | null;
  /**
   * L'offre qui lèverait la limite. `null` quand aucune ne le ferait —
   * soit parce qu'elle y est déjà, soit parce que la limite est mensuelle.
   */
  offreQuiOuvre: OffreId | null;
  /** Vrai quand attendre le mois suivant suffit. */
  seRenouvelleLeMoisProchain: boolean;
}

const OUI: Verdict = {
  autorise: true,
  raison: null,
  offreQuiOuvre: null,
  seRenouvelleLeMoisProchain: false,
};

/** La première offre du catalogue qui satisfait la condition, s'il y en a une. */
function premiereOffreQui(
  depuis: OffreId,
  condition: (capacites: Capacites) => boolean,
): Offre | null {
  let courante: Offre | null = offreSuivante(depuis);
  while (courante) {
    if (condition(courante.capacites)) return courante;
    courante = offreSuivante(courante.id);
  }
  return null;
}

function refus(
  raison: string,
  quiOuvre: Offre | null,
  seRenouvelle = false,
): Verdict {
  return {
    autorise: false,
    // Nommer l'offre dans la phrase, pas seulement dans le champ : un
    // message lu sans son contexte doit rester complet.
    raison: quiOuvre ? `${raison} L’offre ${quiOuvre.label} le permet.` : raison,
    offreQuiOuvre: quiOuvre?.id ?? null,
    seRenouvelleLeMoisProchain: seRenouvelle,
  };
}

export function peut(offreId: OffreId, action: Action): Verdict {
  const { capacites } = offre(offreId);

  switch (action.kind) {
    case 'creer_projet': {
      if (capacites.projets === null || action.projetsActuels < capacites.projets) return OUI;
      const quiOuvre = premiereOffreQui(
        offreId,
        (c) => c.projets === null || c.projets > (capacites.projets as number),
      );
      return refus(
        `Ton offre couvre ${capacites.projets} projet${capacites.projets > 1 ? 's' : ''}, ` +
          'et il est déjà ouvert.',
        quiOuvre,
      );
    }

    case 'generer': {
      if (!capacites.generateurs.includes(action.generateur)) {
        const quiOuvre = premiereOffreQui(offreId, (c) =>
          c.generateurs.includes(action.generateur),
        );
        return refus("Ton offre n’inclut pas ce générateur.", quiOuvre);
      }
      if (capacites.appelsIaParMois === null) return OUI;
      if (action.appelsCeMois < capacites.appelsIaParMois) return OUI;

      // Épuisé, pas interdit. La nuance change ce qu'on propose : sur la
      // dernière offre, il n'y a rien à vendre — seulement à attendre.
      const quiOuvre = premiereOffreQui(
        offreId,
        (c) =>
          c.generateurs.includes(action.generateur) &&
          (c.appelsIaParMois === null ||
            c.appelsIaParMois > (capacites.appelsIaParMois as number)),
      );
      return refus(
        `Tu as utilisé les ${capacites.appelsIaParMois} générations que ton offre inclut ` +
          'ce mois-ci. Le compteur repart le 1er du mois prochain.',
        quiOuvre,
        true,
      );
    }

    case 'outil_de_gestion': {
      if (capacites.outilsDeGestion) return OUI;
      return refus(
        'La comptabilité, la facturation et la banque ne sont pas dans ton offre.',
        premiereOffreQui(offreId, (c) => c.outilsDeGestion),
      );
    }

    case 'ouvrir_financement': {
      if (capacites.investisseurs) return OUI;
      return refus(
        'Ouvrir un projet au financement et tenir un registre d’investisseurs ne sont pas ' +
          'dans ton offre.',
        premiereOffreQui(offreId, (c) => c.investisseurs),
      );
    }

    case 'inviter_collaborateur': {
      if (capacites.collaborateurs === null) return OUI;
      if (action.collaborateursActuels < capacites.collaborateurs) return OUI;
      const plafond = capacites.collaborateurs;
      const quiOuvre = premiereOffreQui(
        offreId,
        (c) => c.collaborateurs === null || c.collaborateurs > plafond,
      );
      return refus(
        plafond === 0
          ? 'Ton offre ne permet pas d’inviter quelqu’un sur un projet.'
          : `Ton offre permet ${plafond} collaborateur(s), et ils sont déjà là.`,
        quiOuvre,
      );
    }
  }
}
