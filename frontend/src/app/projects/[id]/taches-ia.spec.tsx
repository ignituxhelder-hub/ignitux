import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TasksSection } from './engine-sections';

const TOKEN = 'tok123';
const PROJECT_ID = 'p1';
const TIMEOUT = 15000;

function tache(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    project_id: PROJECT_ID,
    title: `Tâche ${id}`,
    description: null,
    status: 'pending',
    assignee: 'human',
    source: 'manual',
    ai_status: null,
    ai_result_kind: null,
    ai_result: null,
    ai_refusal_reason: null,
    ai_run_at: null,
    note: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

type Reponse = { status: number; body: unknown };

/** fetch simulé : une file de réponses par route, et le journal des appels. */
function mockFetch(routes: Record<string, Reponse | Reponse[]>) {
  const appels: string[] = [];
  const bodies: Record<string, unknown> = {};
  global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    const key = `${options?.method ?? 'GET'} ${new URL(url).pathname}`;
    appels.push(key);
    if (options?.body) bodies[key] = JSON.parse(options.body as string);
    const entree = routes[key];
    const rep: Reponse = Array.isArray(entree) ? (entree.length > 1 ? entree.shift()! : entree[0]) : (entree ?? { status: 200, body: [] });
    return Promise.resolve({
      ok: rep.status >= 200 && rep.status < 300,
      status: rep.status,
      json: () => Promise.resolve(rep.body),
      text: () => Promise.resolve(JSON.stringify(rep.body)),
    });
  }) as unknown as typeof fetch;
  return { appels, bodies };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TasksSection — IGINI fait les tâches', () => {
  it('lance les tâches cochées une par une, dans l\'ordre', async () => {
    const { appels } = mockFetch({
      'GET /projects/p1/tasks': { status: 200, body: [tache('t1'), tache('t2'), tache('t3')] },
      'POST /projects/p1/tasks/t1/run': { status: 200, body: tache('t1', { ai_status: 'a_valider', ai_result_kind: 'livrable', ai_result: 'Texte un' }) },
      'POST /projects/p1/tasks/t2/run': { status: 200, body: tache('t2', { ai_status: 'a_valider', ai_result_kind: 'livrable', ai_result: 'Texte deux' }) },
    });
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Tâche t1');
    expect(screen.queryByRole('button', { name: /Démarrer IGINI/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Faire faire : Tâche t1'));
    fireEvent.click(screen.getByLabelText('Faire faire : Tâche t2'));
    expect(screen.getByText('2 éléments sélectionnés, ~2 appels IA')).toBeInTheDocument();
    const bouton = screen.getByRole('button', { name: /Démarrer IGINI/ });
    expect(bouton).not.toBeDisabled();
    // Orange (style « primary »), pas le gris d'un bouton sans classe.
    expect(bouton).toHaveClass('primary');
    fireEvent.click(bouton);

    expect(await screen.findByText('Texte deux')).toBeInTheDocument();
    expect(appels.filter((a) => a.endsWith('/run'))).toEqual([
      'POST /projects/p1/tasks/t1/run',
      'POST /projects/p1/tasks/t2/run',
    ]);
    expect(screen.getByText('Texte un')).toBeInTheDocument();
  }, TIMEOUT);

  it('affiche « Limite atteinte » et garde cochés les éléments non traités', async () => {
    mockFetch({
      'GET /projects/p1/tasks': { status: 200, body: [tache('t1'), tache('t2'), tache('t3')] },
      'POST /projects/p1/tasks/t1/run': { status: 200, body: tache('t1', { ai_status: 'a_valider', ai_result_kind: 'livrable', ai_result: 'Texte un' }) },
      'POST /projects/p1/tasks/t2/run': { status: 403, body: { message: 'Quota atteint.' } },
    });
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Tâche t1');
    fireEvent.click(screen.getByLabelText('Faire faire : Tâche t1'));
    fireEvent.click(screen.getByLabelText('Faire faire : Tâche t2'));
    fireEvent.click(screen.getByLabelText('Faire faire : Tâche t3'));
    fireEvent.click(screen.getByRole('button', { name: /Démarrer IGINI/ }));

    expect(await screen.findByText('Limite atteinte : 2 éléments non traités')).toBeInTheDocument();
    expect(screen.getByLabelText('Faire faire : Tâche t2')).toBeChecked();
    expect(screen.getByLabelText('Faire faire : Tâche t3')).toBeChecked();
  }, TIMEOUT);

  it('Valider appelle /validate et la tâche apparaît faite', async () => {
    const { appels } = mockFetch({
      'GET /projects/p1/tasks': {
        status: 200,
        body: [tache('t1', { ai_status: 'a_valider', ai_result_kind: 'instructions', ai_result: '1. Ouvrir\n2. Cliquer' })],
      },
      'POST /projects/p1/tasks/t1/validate': {
        status: 200,
        body: tache('t1', { status: 'done', ai_status: 'valide', ai_result_kind: 'instructions', ai_result: '1. Ouvrir\n2. Cliquer' }),
      },
    });
    const onChanged = vi.fn();
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} onChanged={onChanged} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Valider' }));

    await waitFor(() => expect(appels).toContain('POST /projects/p1/tasks/t1/validate'));
    expect(await screen.findByLabelText('Statut de Tâche t1')).toHaveValue('done');
    expect(onChanged).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Faire faire : Tâche t1')).not.toBeInTheDocument();
  }, TIMEOUT);

  it('Refuser demande un motif optionnel puis appelle /refuse', async () => {
    const { appels, bodies } = mockFetch({
      'GET /projects/p1/tasks': {
        status: 200,
        body: [tache('t1', { ai_status: 'a_valider', ai_result_kind: 'livrable', ai_result: 'Brouillon' })],
      },
      'POST /projects/p1/tasks/t1/refuse': {
        status: 200,
        body: tache('t1', { ai_status: 'refuse', ai_result_kind: 'livrable', ai_result: 'Brouillon', ai_refusal_reason: 'Trop long' }),
      },
    });
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Refuser' }));
    fireEvent.change(screen.getByLabelText('Motif du refus (facultatif)'), { target: { value: 'Trop long' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le refus' }));

    await waitFor(() => expect(appels).toContain('POST /projects/p1/tasks/t1/refuse'));
    expect(bodies['POST /projects/p1/tasks/t1/refuse']).toEqual({ reason: 'Trop long' });
    expect(await screen.findByText(/Refusé/)).toBeInTheDocument();
    expect(screen.getByText(/Trop long/)).toBeInTheDocument();
    expect(screen.getByLabelText('Faire faire : Tâche t1')).toBeInTheDocument();
  }, TIMEOUT);

  it('une tâche en échec propose « Réessayer » qui ne relance que celle-là', async () => {
    const { appels } = mockFetch({
      'GET /projects/p1/tasks': {
        status: 200,
        body: [tache('t1', { ai_status: 'echec' }), tache('t2')],
      },
      'POST /projects/p1/tasks/t1/run': {
        status: 200,
        body: tache('t1', { ai_status: 'a_valider', ai_result_kind: 'livrable', ai_result: 'Réussi' }),
      },
    });
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText("IGINI n'a pas pu faire cette tâche")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('Réussi')).toBeInTheDocument();
    expect(appels.filter((a) => a.endsWith('/run'))).toEqual(['POST /projects/p1/tasks/t1/run']);
  }, TIMEOUT);

  it('une tâche en échec accepte une note, enregistrée sans relancer IGINI', async () => {
    const { appels, bodies } = mockFetch({
      'GET /projects/p1/tasks': { status: 200, body: [tache('t1', { ai_status: 'echec' })] },
      'PATCH /tasks/t1/note': { status: 200, body: tache('t1', { ai_status: 'echec', note: 'À faire par téléphone' }) },
    });
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} />);

    // Replié : seul un lien, pas de champ vide sous chaque tâche en échec.
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter une note' }));
    const champ = screen.getByLabelText('Note sur Tâche t1');
    expect(screen.queryByRole('button', { name: 'Enregistrer la note' })).not.toBeInTheDocument();
    fireEvent.change(champ, { target: { value: 'À faire par téléphone' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la note' }));

    await waitFor(() => expect(appels).toContain('PATCH /tasks/t1/note'));
    expect(bodies['PATCH /tasks/t1/note']).toEqual({ note: 'À faire par téléphone' });
    // Une fois enregistrée, la note s'affiche et le champ se replie.
    expect(await screen.findByText('Note : À faire par téléphone')).toBeInTheDocument();
    expect(screen.queryByLabelText('Note sur Tâche t1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier la note' })).toBeInTheDocument();
    expect(appels.filter((a) => a.endsWith('/run'))).toEqual([]);
  }, TIMEOUT);

  it('un long texte suggéré ne montre que sa première phrase, le reste à la demande', async () => {
    const long =
      'Faites le test d’assurabilité cette semaine, avant tout le reste. Appelez 4 à 5 assureurs spécialisés bâtiment en décrivant précisément l’activité et demandez un devis écrit.';
    mockFetch({ 'GET /projects/p1/tasks': { status: 200, body: [tache('t1', { title: long, source: 'analysis' })] } });
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText('Faites le test d’assurabilité cette semaine, avant tout le reste.')).toBeInTheDocument();
    expect(screen.queryByText(long)).not.toBeInTheDocument();
    // La case garde le texte complet : c'est lui que lit un lecteur d'écran.
    expect(screen.getByLabelText(`Faire faire : ${long}`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Voir le détail/ }));
    expect(screen.getByText(long)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Réduire/ }));
    expect(screen.queryByText(long)).not.toBeInTheDocument();
  }, TIMEOUT);

  it('« À faire » est rangé par origine, chaque groupe se sélectionne d’un coup', async () => {
    mockFetch({
      'GET /projects/p1/tasks': {
        status: 200,
        body: [
          tache('t1', { source: 'financing_plan' }),
          tache('t2', { source: 'analysis' }),
          tache('t3', { source: 'analysis' }),
        ],
      },
    });
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} />);

    const groupes = (await screen.findAllByRole('group')).map((g) => g.querySelector('summary')?.textContent);
    // L'analyse d'abord, puis les plans ; libellés en français, jamais « financing_plan ».
    expect(groupes).toEqual(["Suggérées par l'analyse (2)", 'Plan de financement (1)']);
    expect(screen.queryByText('financing_plan')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Sélectionner : Suggérées par l'analyse"));
    expect(screen.getByLabelText('Faire faire : Tâche t2')).toBeChecked();
    expect(screen.getByLabelText('Faire faire : Tâche t3')).toBeChecked();
    expect(screen.getByLabelText('Faire faire : Tâche t1')).not.toBeChecked();
    expect(screen.getByText('· 2 sélectionnées')).toBeInTheDocument();
    expect(screen.getByText('2 éléments sélectionnés, ~2 appels IA')).toBeInTheDocument();
  }, TIMEOUT);

  it('en lecture seule, la note est affichée mais ne se modifie pas', async () => {
    mockFetch({
      'GET /projects/p1/tasks': { status: 200, body: [tache('t1', { ai_status: 'echec', note: 'Voir avec le comptable' })] },
    });
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} readOnly />);

    expect(await screen.findByText('Note : Voir avec le comptable')).toBeInTheDocument();
    expect(screen.queryByLabelText('Note sur Tâche t1')).not.toBeInTheDocument();
  }, TIMEOUT);

  it('en lecture seule : ni case, ni bouton de lancement, ni validation', async () => {
    mockFetch({
      'GET /projects/p1/tasks': {
        status: 200,
        body: [tache('t1'), tache('t2', { ai_status: 'a_valider', ai_result_kind: 'livrable', ai_result: 'X' })],
      },
    });
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} readOnly />);

    await screen.findByText('Tâche t1');
    expect(screen.queryByRole('button', { name: /Démarrer IGINI/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument();
  }, TIMEOUT);
});

describe('TasksSection — lot en cours', () => {
  const resultat = (id: string) =>
    tache(id, { ai_status: 'a_valider', ai_result_kind: 'livrable', ai_result: `Texte ${id}` });

  /** fetch dont les /run restent en attente jusqu'à `liberer(id, reponse)`. */
  function mockFetchDiffere(liste: unknown[]) {
    const appels: string[] = [];
    const attente: Record<string, (r: Reponse) => void> = {};
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      const key = `${options?.method ?? 'GET'} ${new URL(url).pathname}`;
      appels.push(key);
      const fabrique = (rep: Reponse) => ({
        ok: rep.status >= 200 && rep.status < 300,
        status: rep.status,
        json: () => Promise.resolve(rep.body),
        text: () => Promise.resolve(JSON.stringify(rep.body)),
      });
      if (key === 'GET /projects/p1/tasks') return Promise.resolve(fabrique({ status: 200, body: liste }));
      return new Promise((resolve) => {
        attente[key] = (rep) => resolve(fabrique(rep));
      });
    }) as unknown as typeof fetch;
    return { appels, liberer: (id: string, rep: Reponse) => attente[`POST /projects/p1/tasks/${id}/run`](rep) };
  }

  it('affiche la progression, désactive le bouton et ignore un second clic', async () => {
    const { appels, liberer } = mockFetchDiffere([tache('t1'), tache('t2')]);
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Tâche t1');
    fireEvent.click(screen.getByLabelText('Faire faire : Tâche t1'));
    fireEvent.click(screen.getByLabelText('Faire faire : Tâche t2'));
    const bouton = screen.getByRole('button', { name: /Démarrer IGINI/ });
    fireEvent.click(bouton);

    expect(await screen.findByText('1 / 2')).toBeInTheDocument();
    expect(bouton).toBeDisabled();
    fireEvent.click(bouton);
    await waitFor(() => expect(appels.filter((a) => a.endsWith('/run'))).toHaveLength(1));

    liberer('t1', { status: 200, body: resultat('t1') });
    expect(await screen.findByText('2 / 2')).toBeInTheDocument();
    liberer('t2', { status: 200, body: resultat('t2') });
    expect(await screen.findByText('Texte t2')).toBeInTheDocument();
    expect(appels.filter((a) => a.endsWith('/run'))).toHaveLength(2);
  }, TIMEOUT);

  it('ne lance plus rien une fois le composant démonté', async () => {
    const { appels, liberer } = mockFetchDiffere([tache('t1'), tache('t2')]);
    const onChanged = vi.fn();
    const { unmount } = render(<TasksSection token={TOKEN} projectId={PROJECT_ID} onChanged={onChanged} />);

    await screen.findByText('Tâche t1');
    fireEvent.click(screen.getByLabelText('Faire faire : Tâche t1'));
    fireEvent.click(screen.getByLabelText('Faire faire : Tâche t2'));
    fireEvent.click(screen.getByRole('button', { name: /Démarrer IGINI/ }));
    await waitFor(() => expect(appels.filter((a) => a.endsWith('/run'))).toHaveLength(1));

    unmount();
    liberer('t1', { status: 200, body: resultat('t1') });
    await new Promise((r) => setTimeout(r, 50));

    expect(appels.filter((a) => a.endsWith('/run'))).toEqual(['POST /projects/p1/tasks/t1/run']);
    expect(onChanged).not.toHaveBeenCalled();
  }, TIMEOUT);

  it("une erreur hors limite n'arrête pas le lot", async () => {
    const { appels } = mockFetch({
      'GET /projects/p1/tasks': { status: 200, body: [tache('t1'), tache('t2'), tache('t3')] },
      'POST /projects/p1/tasks/t1/run': { status: 200, body: resultat('t1') },
      'POST /projects/p1/tasks/t2/run': { status: 500, body: { message: 'Panne.' } },
      'POST /projects/p1/tasks/t3/run': { status: 200, body: resultat('t3') },
    });
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Tâche t1');
    for (const id of ['t1', 't2', 't3']) fireEvent.click(screen.getByLabelText(`Faire faire : Tâche ${id}`));
    fireEvent.click(screen.getByRole('button', { name: /Démarrer IGINI/ }));

    expect(await screen.findByText('Texte t3')).toBeInTheDocument();
    expect(screen.getByText("IGINI n'a pas pu faire cette tâche")).toBeInTheDocument();
    expect(appels.filter((a) => a.endsWith('/run'))).toHaveLength(3);
  }, TIMEOUT);


  it('Connexion perdue : le lot s arrête, rien n est marqué en échec, les cases restent cochées', async () => {
    const appels: string[] = [];
    mockFetch({
      'GET /projects/p1/tasks': { status: 200, body: [tache('t1'), tache('t2'), tache('t3')] },
    });
    const base = global.fetch as unknown as (u: string, o?: RequestInit) => Promise<unknown>;
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if ((options?.method ?? 'GET') === 'POST') {
        appels.push(new URL(url).pathname);
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return base(url, options);
    }) as unknown as typeof fetch;
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Tâche t1');
    for (const id of ["t1","t2","t3"]) fireEvent.click(screen.getByLabelText('Faire faire : Tâche ' + id));
    fireEvent.click(screen.getByRole('button', { name: /Démarrer IGINI/ }));

    expect(await screen.findByText('Connexion perdue : 3 éléments non traités')).toBeInTheDocument();
    expect(appels).toHaveLength(1);
    expect(screen.queryByText("IGINI n'a pas pu faire cette tâche")).not.toBeInTheDocument();
    for (const id of ["t1","t2","t3"]) expect(screen.getByLabelText('Faire faire : Tâche ' + id)).toBeChecked();
  }, TIMEOUT);

  it("affiche le motif d'échec du serveur sous l'intitulé générique", async () => {
    mockFetch({
      'GET /projects/p1/tasks': { status: 200, body: [tache('t1'), tache('t2'), tache('t3')] },
      'POST /projects/p1/tasks/t1/run': { status: 500, body: { message: 'Le modèle a répondu hors format.' } },
    });
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Tâche t1');
    fireEvent.click(screen.getByLabelText('Faire faire : Tâche t1'));
    fireEvent.click(screen.getByRole('button', { name: /Démarrer IGINI/ }));

    expect(await screen.findByText("IGINI n'a pas pu faire cette tâche")).toBeInTheDocument();
    expect(screen.getByText('Le modèle a répondu hors format.')).toBeInTheDocument();
  }, TIMEOUT);

  it('une tâche issue de l automatisation n a pas de case à cocher', async () => {
    mockFetch({
      'GET /projects/p1/tasks': { status: 200, body: [tache('t1', { source: 'automation' }), tache('t2')] },
    });
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Tâche t1');
    expect(screen.queryByLabelText('Faire faire : Tâche t1')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Faire faire : Tâche t2')).toBeInTheDocument();
  }, TIMEOUT);

  it('un double clic synchrone ne lance qu un seul lot', async () => {
    const { appels } = mockFetch({
      'GET /projects/p1/tasks': { status: 200, body: [tache('t1'), tache('t2')] },
      'POST /projects/p1/tasks/t1/run': { status: 200, body: resultat('t1') },
      'POST /projects/p1/tasks/t2/run': { status: 200, body: resultat('t2') },
    });
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Tâche t1');
    fireEvent.click(screen.getByLabelText('Faire faire : Tâche t1'));
    fireEvent.click(screen.getByLabelText('Faire faire : Tâche t2'));
    const bouton = screen.getByRole('button', { name: /Démarrer IGINI/ });
    fireEvent.click(bouton);
    fireEvent.click(bouton);

    expect(await screen.findByText('Texte t2')).toBeInTheDocument();
    expect(appels.filter((a) => a.endsWith('/run'))).toEqual([
      'POST /projects/p1/tasks/t1/run',
      'POST /projects/p1/tasks/t2/run',
    ]);
  }, TIMEOUT);

  it('un 503 arrête le lot avec « Limite atteinte »', async () => {
    const { appels } = mockFetch({
      'GET /projects/p1/tasks': { status: 200, body: [tache('t1'), tache('t2'), tache('t3')] },
      'POST /projects/p1/tasks/t1/run': { status: 503, body: { message: 'Coupé.' } },
    });
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Tâche t1');
    for (const id of ['t1', 't2', 't3']) fireEvent.click(screen.getByLabelText(`Faire faire : Tâche ${id}`));
    fireEvent.click(screen.getByRole('button', { name: /Démarrer IGINI/ }));

    expect(await screen.findByText('Limite atteinte : 3 éléments non traités')).toBeInTheDocument();
    expect(appels.filter((a) => a.endsWith('/run'))).toHaveLength(1);
  }, TIMEOUT);

  it('une tâche déjà validée (statut remis à faire) n\'a pas de case', async () => {
    mockFetch({
      'GET /projects/p1/tasks': {
        status: 200,
        body: [tache('t1', { ai_status: 'valide', ai_result_kind: 'livrable', ai_result: 'X' })],
      },
    });
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Tâche t1');
    expect(screen.queryByLabelText('Faire faire : Tâche t1')).not.toBeInTheDocument();
  }, TIMEOUT);
});

describe('TasksSection — organisation en groupes', () => {
  it('range les tâches par groupe avec un compteur', async () => {
    mockFetch({
      'GET /projects/p1/tasks': {
        status: 200,
        body: [
          tache('t1'),
          tache('t2', { ai_status: 'a_valider', ai_result_kind: 'livrable', ai_result: 'X' }),
          tache('t3', { ai_status: 'echec' }),
          tache('t4', { status: 'done' }),
        ],
      },
    });
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Tâche t1');
    expect(screen.getByText('À valider (1)')).toBeInTheDocument();
    expect(screen.getByText('À faire (1)')).toBeInTheDocument();
    expect(screen.getByText('En échec (1)')).toBeInTheDocument();
    expect(screen.getByText('Faites (1)')).toBeInTheDocument();
  }, TIMEOUT);

  it('« Tout sélectionner » coche toutes les tâches à faire et fait apparaître la barre', async () => {
    mockFetch({
      'GET /projects/p1/tasks': { status: 200, body: [tache('t1'), tache('t2'), tache('t3', { source: 'automation' })] },
    });
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Tâche t1');
    fireEvent.click(screen.getByLabelText('Tout sélectionner'));
    expect(screen.getByText('2 éléments sélectionnés, ~2 appels IA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Démarrer IGINI' })).not.toBeDisabled();

    fireEvent.click(screen.getByLabelText('Tout sélectionner'));
    expect(screen.queryByRole('button', { name: 'Démarrer IGINI' })).not.toBeInTheDocument();
  }, TIMEOUT);
});
