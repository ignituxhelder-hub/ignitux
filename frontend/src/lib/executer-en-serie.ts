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
  /** Ids jamais lancés : celui qui a déclenché la limite, puis les suivants. */
  restants: string[];
}

// 403 : offre ou quota mensuel épuisé. 503 : générateurs coupés ou plafond de coût.
// Insister sur les ids suivants ne ferait que reproduire la même réponse.
function estUneLimite(erreur: unknown): erreur is ApiError {
  return erreur instanceof ApiError && (erreur.status === 403 || erreur.status === 503);
}

function messageDe(erreur: unknown): string {
  return erreur instanceof Error && erreur.message ? erreur.message : 'Une erreur est survenue.';
}

/**
 * Lance `lancer` pour chaque id, un à la fois : on ne démarre le suivant
 * qu'une fois le précédent terminé, pour ne pas griller le quota en parallèle.
 * Une limite arrête tout le lot ; toute autre erreur ne marque que son id.
 */
export async function executerEnSerie<T>(
  ids: string[],
  lancer: (id: string) => Promise<T>,
  onProgres: (info: ProgresExecution<T>) => void,
): Promise<BilanExecution> {
  let traites = 0;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    onProgres({ id, etat: 'en_cours' });
    try {
      const resultat = await lancer(id);
      traites += 1;
      onProgres({ id, etat: 'ok', resultat });
    } catch (erreur) {
      if (estUneLimite(erreur)) {
        onProgres({ id, etat: 'arret', message: erreur.message });
        return { traites, arretePourLimite: true, restants: ids.slice(i) };
      }
      onProgres({ id, etat: 'echec', message: messageDe(erreur) });
    }
  }

  return { traites, arretePourLimite: false, restants: [] };
}
