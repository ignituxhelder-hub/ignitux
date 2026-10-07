import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { executerEnSerie } from './executer-en-serie';

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
    expect(await fini).toEqual({ traites: 2, arretePourLimite: false, restants: [] });
  });

  it('ne fait rien avec une liste vide', async () => {
    const lancer = vi.fn();
    const onProgres = vi.fn();

    const bilan = await executerEnSerie([], lancer, onProgres);

    expect(bilan).toEqual({ traites: 0, arretePourLimite: false, restants: [] });
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

    expect(bilan).toEqual({ traites: 3, arretePourLimite: false, restants: [] });
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

    expect(bilan).toEqual({ traites: 1, arretePourLimite: true, restants: ['id2', 'id3'] });
    expect(lancer).not.toHaveBeenCalledWith('id3');
    expect(onProgres).toHaveBeenCalledWith({ id: 'id2', etat: 'arret', message: 'Quota mensuel épuisé.' });
    expect(onProgres).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'id3', etat: 'arret' }));
  });

  it('s\'arrête aussi sur une 503', async () => {
    const lancer = vi.fn(async () => {
      throw new ApiError('Générateurs indisponibles.', 503);
    });

    const onProgres = vi.fn();
    const bilan = await executerEnSerie(['a', 'b'], lancer, onProgres);

    expect(bilan).toEqual({ traites: 0, arretePourLimite: true, restants: ['a', 'b'] });
    expect(lancer).toHaveBeenCalledTimes(1);
    const arrets = onProgres.mock.calls.filter(([info]) => info.etat === 'arret');
    expect(arrets).toEqual([[{ id: 'a', etat: 'arret', message: 'Générateurs indisponibles.' }]]);
  });

  it('marque un id en échec sur toute autre erreur et continue', async () => {
    const lancer = vi.fn(async (id: string) => {
      if (id === 'id2') throw new Error('réseau coupé');
      return id;
    });
    const onProgres = vi.fn();

    const bilan = await executerEnSerie(['id1', 'id2', 'id3'], lancer, onProgres);

    expect(bilan).toEqual({ traites: 2, arretePourLimite: false, restants: [] });
    expect(lancer).toHaveBeenCalledWith('id3');
    expect(onProgres).toHaveBeenCalledWith({ id: 'id2', etat: 'echec', message: 'réseau coupé' });
  });

  it('traite une ApiError non limite (500) comme un simple échec', async () => {
    const lancer = vi.fn(async (id: string) => {
      if (id === 'id1') throw new ApiError('Erreur serveur.', 500);
      return id;
    });

    const bilan = await executerEnSerie(['id1', 'id2'], lancer, vi.fn());

    expect(bilan).toEqual({ traites: 1, arretePourLimite: false, restants: [] });
  });
});
