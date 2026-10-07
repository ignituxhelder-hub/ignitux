import { ApiError } from './api';

export interface ProgresExecution<T> {
  id: string;
  etat: 'en_cours' | 'ok' | 'echec' | 'arret';
  resultat?: T;
  message?: string;
}

export interface BilanExecution {
  /** Nombre d'ids exécutés avec succès. */
  traites: number;
  /** Vrai si une limite (droits, quota, coût) a interrompu le lot. */
  arretePourLimite: boolean;
  /** Ids non traités : celui qui a déclenché l'arrêt (limite ou réseau), puis les suivants. */
  restants: string[];
  /** Vrai si la connexion est perdue (hors ligne) : le lot s'arrête, rien n'est marqué en échec. */
  arretReseau: boolean;
  /** Vrai si l'appelant a annulé le lot (ex. écran quitté) avant la fin. */
  annule: boolean;
}

// 403 : offre ou quota mensuel épuisé. 503 : générateurs coupés ou plafond de coût.
// Insister sur les ids suivants ne ferait que reproduire la même réponse.
function estUneLimite(erreur: unknown): erreur is ApiError {
  return erreur instanceof ApiError && (erreur.status === 403 || erreur.status === 503);
}

// Statut 0 : pas de réseau. Les ids suivants échoueraient de la même façon, et
// les marquer « échec » ferait croire que l'IA a échoué alors qu'elle n'a rien reçu.
function estHorsLigne(erreur: unknown): erreur is ApiError {
  return erreur instanceof ApiError && erreur.status === 0;
}

function messageDe(erreur: unknown): string {
  return erreur instanceof Error && erreur.message ? erreur.message : 'Une erreur est survenue.';
}

/**
 * Lance `lancer` pour chaque id, un à la fois : on ne démarre le suivant
 * qu'une fois le précédent terminé, pour ne pas griller le quota en parallèle.
 * Une limite ou la perte du réseau arrête tout le lot ; toute autre erreur ne marque que son id.
 */
export async function executerEnSerie<T>(
  ids: string[],
  lancer: (id: string) => Promise<T>,
  onProgres: (info: ProgresExecution<T>) => void,
  estAnnule?: () => boolean,
): Promise<BilanExecution> {
  let traites = 0;

  for (let i = 0; i < ids.length; i++) {
    if (estAnnule?.()) {
      return { traites, arretePourLimite: false, restants: ids.slice(i), arretReseau: false, annule: true };
    }
    const id = ids[i];
    onProgres({ id, etat: 'en_cours' });
    try {
      const resultat = await lancer(id);
      traites += 1;
      onProgres({ id, etat: 'ok', resultat });
    } catch (erreur) {
      if (estUneLimite(erreur)) {
        onProgres({ id, etat: 'arret', message: erreur.message });
        return { traites, arretePourLimite: true, restants: ids.slice(i), arretReseau: false, annule: false };
      }
      if (estHorsLigne(erreur)) {
        onProgres({ id, etat: 'arret', message: erreur.message });
        return { traites, arretePourLimite: false, restants: ids.slice(i), arretReseau: true, annule: false };
      }
      onProgres({ id, etat: 'echec', message: messageDe(erreur) });
    }
  }

  return { traites, arretePourLimite: false, restants: [], arretReseau: false, annule: false };
}
