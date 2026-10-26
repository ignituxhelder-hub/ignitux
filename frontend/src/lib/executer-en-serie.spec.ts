import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { dejaEnCours, executerEnSerie } from './executer-en-serie';

/** Laisse passer les micro-tâches en attente. */
const souffler = () => new Promise<void>((r) => setTimeout(r, 0));

describe('executerEnSerie', () => {
  it("ne lance le suivant qu'une fois le précédent résolu (promesses contrôlées)", async () => {
    const resolveurs: Array<(v: string) => void> = [];
    const lancer = vi.fn(
      (id: string) => new Promise<string>((resolve) => resolveurs.push((v) => resolve(`${id}:${v}`))),
    );

    const fini = executerEnSerie(['a', 'b'], lancer, vi.fn());

    await souffler();
    expect(lancer).toHaveBeenCalledTimes(1);
    expect(lancer).toHaveBeenLastCalledWith('a');

    resolveurs[0]('ok');
    await souffler();
    expect(lancer).toHaveBeenCalledTimes(2);
    expect(lancer).toHaveBeenLastCalledWith('b');

    resolveurs[1]('ok');
    expect(await fini).toEqual({ traites: 2, arretePourLimite: false, restants: [], arretReseau: false, annule: false });
  });

  it('ne fait rien avec une liste vide', async () => {
    const lancer = vi.fn();
    const onProgres = vi.fn();

    const bilan = await executerEnSerie([], lancer, onProgres);

    expect(bilan).toEqual({ traites: 0, arretePourLimite: false, restants: [], arretReseau: false, annule: false });
    expect(lancer).not.toHaveBeenCalled();
    expect(onProgres).not.toHaveBeenCalled();
  });

  it('traite tous les ids, strictement l\'un après l\'autre', async () => {
    const journal: string[] = [];
    const lancer = vi.fn(async (id: string) => {
      journal.push(`debut ${id}`);
      await new Promise((r) => setTimeout(r, 5));
      journal.push(`fin ${id}`);
      return `r-${id}`;
    });
    const onProgres = vi.fn();

    const bilan = await executerEnSerie(['id1', 'id2', 'id3'], lancer, onProgres);

    expect(bilan).toEqual({ traites: 3, arretePourLimite: false, restants: [], arretReseau: false, annule: false });
    expect(journal).toEqual(['debut id1', 'fin id1', 'debut id2', 'fin id2', 'debut id3', 'fin id3']);
    expect(onProgres).toHaveBeenCalledWith({ id: 'id2', etat: 'en_cours' });
    expect(onProgres).toHaveBeenCalledWith({ id: 'id2', etat: 'ok', resultat: 'r-id2' });
  });

  it('s\'arrête sur une 403 : l\'id fautif et les suivants restent non traités', async () => {
    const lancer = vi.fn(async (id: string) => {
      if (id === 'id2') throw new ApiError('Quota mensuel épuisé.', 403);
      return id;
    });
    const onProgres = vi.fn();

    const bilan = await executerEnSerie(['id1', 'id2', 'id3'], lancer, onProgres);

    expect(bilan).toEqual({ traites: 1, arretePourLimite: true, restants: ['id2', 'id3'], arretReseau: false, annule: false });
    expect(lancer).not.toHaveBeenCalledWith('id3');
    expect(onProgres).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'id2', etat: 'arret', message: 'Quota mensuel épuisé.' }),
    );
    expect(onProgres).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'id3', etat: 'arret' }));
  });

  it('s\'arrête aussi sur une 503', async () => {
    const lancer = vi.fn(async () => {
      throw new ApiError('Générateurs indisponibles.', 503);
    });

    const onProgres = vi.fn();
    const bilan = await executerEnSerie(['a', 'b'], lancer, onProgres);

    expect(bilan).toEqual({ traites: 0, arretePourLimite: true, restants: ['a', 'b'], arretReseau: false, annule: false });
    expect(lancer).toHaveBeenCalledTimes(1);
    const arrets = onProgres.mock.calls.filter(([info]) => info.etat === 'arret');
    expect(arrets).toEqual([
      [expect.objectContaining({ id: 'a', etat: 'arret', message: 'Générateurs indisponibles.' })],
    ]);
    // L'erreur voyage avec l'arrêt : l'écran peut dire « Voir mes crédits » sur un 402.
    expect(arrets[0][0].erreur).toBeInstanceOf(ApiError);
  });

  it.each([
    ['crédits insuffisants', { code: 'credits_insuffisants', requis: 4, disponible: 1 }],
    ['garde-fou de coût', { code: 'plafond_securite' }],
  ])("s'arrête sur une 402 (%s) : le suivant coûterait la même chose", async (_nom, corps) => {
    const lancer = vi.fn(async () => {
      throw new ApiError('Refusé.', 402, ['Refusé.'], corps);
    });

    const onProgres = vi.fn();
    const bilan = await executerEnSerie(['a', 'b', 'c'], lancer, onProgres);

    expect(bilan).toEqual({ traites: 0, arretePourLimite: true, restants: ['a', 'b', 'c'], arretReseau: false, annule: false });
    expect(lancer).toHaveBeenCalledTimes(1);
    // Ni « échec » sur la tâche : IGINI n'a rien tenté, rien n'a été débité.
    expect(onProgres).not.toHaveBeenCalledWith(expect.objectContaining({ etat: 'echec' }));
  });

  it('marque un id en échec sur toute autre erreur et continue', async () => {
    const lancer = vi.fn(async (id: string) => {
      if (id === 'id2') throw new Error('réseau coupé');
      return id;
    });
    const onProgres = vi.fn();

    const bilan = await executerEnSerie(['id1', 'id2', 'id3'], lancer, onProgres);

    expect(bilan).toEqual({ traites: 2, arretePourLimite: false, restants: [], arretReseau: false, annule: false });
    expect(lancer).toHaveBeenCalledWith('id3');
    expect(onProgres).toHaveBeenCalledWith(expect.objectContaining({ id: 'id2', etat: 'echec', message: 'réseau coupé' }));
  });

  it('traite une ApiError non limite (500) comme un simple échec', async () => {
    const lancer = vi.fn(async (id: string) => {
      if (id === 'id1') throw new ApiError('Erreur serveur.', 500);
      return id;
    });

    const bilan = await executerEnSerie(['id1', 'id2'], lancer, vi.fn());

    expect(bilan).toEqual({ traites: 1, arretePourLimite: false, restants: [], arretReseau: false, annule: false });
  });
});

describe('dejaEnCours', () => {
  // Le serveur prend la tâche « en cours » avant l'appel : un second
  // lancement (autre onglet, double clic) reçoit 409, sans rien débiter. Ce
  // n'est pas un échec d'IGINI — l'écran ne doit pas la ranger « en échec ».
  it('reconnaît le 409 « Déjà en cours. »', () => {
    expect(dejaEnCours(new ApiError('Déjà en cours.', 409))).toBe(true);
  });

  it('un 409 n’arrête pas le lot, et l’échec porte l’erreur pour que l’écran la reconnaisse', async () => {
    const enCours = new ApiError('Déjà en cours.', 409);
    const onProgres = vi.fn();
    const lancer = vi.fn().mockRejectedValueOnce(enCours).mockResolvedValueOnce('ok');

    const bilan = await executerEnSerie(['id1', 'id2'], lancer, onProgres);

    expect(bilan.traites).toBe(1);
    expect(onProgres).toHaveBeenCalledWith({ id: 'id1', etat: 'echec', message: 'Déjà en cours.', erreur: enCours });
  });

  it('ne confond pas avec une autre erreur', () => {
    expect(dejaEnCours(new ApiError('Panne.', 500))).toBe(false);
    expect(dejaEnCours(new ApiError('Crédits insuffisants.', 402))).toBe(false);
    expect(dejaEnCours(new Error('x'))).toBe(false);
    expect(dejaEnCours(undefined)).toBe(false);
  });
});

describe('executerEnSerie — réseau perdu', () => {
  it("s'arrête sur un statut 0 : ni échec, ni suite, restants = non traités", async () => {
    const lancer = vi.fn(async (id: string) => {
      if (id === 'id2') throw new ApiError('Pas de réseau.', 0);
      return id;
    });
    const onProgres = vi.fn();

    const bilan = await executerEnSerie(['id1', 'id2', 'id3'], lancer, onProgres);

    expect(bilan).toEqual({
      traites: 1,
      arretePourLimite: false,
      restants: ['id2', 'id3'],
      arretReseau: true,
      annule: false,
    });
    expect(lancer).not.toHaveBeenCalledWith('id3');
    expect(onProgres).toHaveBeenCalledWith({ id: 'id2', etat: 'arret', message: 'Pas de réseau.' });
    expect(onProgres).not.toHaveBeenCalledWith(expect.objectContaining({ etat: 'echec' }));
  });
});

describe('executerEnSerie — annulation', () => {
  it("s'arrête avant le suivant quand estAnnule devient vrai", async () => {
    let annule = false;
    const lancer = vi.fn(async (id: string) => {
      annule = true;
      return id;
    });
    const onProgres = vi.fn();

    const bilan = await executerEnSerie(['a', 'b', 'c'], lancer, onProgres, () => annule);

    expect(lancer).toHaveBeenCalledTimes(1);
    expect(bilan).toEqual({ traites: 1, arretePourLimite: false, restants: ['b', 'c'], arretReseau: false, annule: true });
    expect(onProgres).not.toHaveBeenCalledWith(expect.objectContaining({ etat: 'arret' }));
  });
});
