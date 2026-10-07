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

    const bouton = await screen.findByRole('button', { name: /Faire faire par IGINI/ });
    expect(bouton).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Faire faire : Tâche t1'));
    fireEvent.click(screen.getByLabelText('Faire faire : Tâche t2'));
    expect(screen.getByText('2 éléments, ~2 appels IA')).toBeInTheDocument();
    expect(bouton).not.toBeDisabled();
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
    fireEvent.click(screen.getByRole('button', { name: /Faire faire par IGINI/ }));

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

  it('en lecture seule : ni case, ni bouton de lancement, ni validation', async () => {
    mockFetch({
      'GET /projects/p1/tasks': {
        status: 200,
        body: [tache('t1'), tache('t2', { ai_status: 'a_valider', ai_result_kind: 'livrable', ai_result: 'X' })],
      },
    });
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} readOnly />);

    await screen.findByText('Tâche t1');
    expect(screen.queryByRole('button', { name: /Faire faire par IGINI/ })).not.toBeInTheDocument();
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
    const bouton = screen.getByRole('button', { name: /Faire faire par IGINI/ });
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
    fireEvent.click(screen.getByRole('button', { name: /Faire faire par IGINI/ }));
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
    fireEvent.click(screen.getByRole('button', { name: /Faire faire par IGINI/ }));

    expect(await screen.findByText('Texte t3')).toBeInTheDocument();
    expect(screen.getByText("IGINI n'a pas pu faire cette tâche")).toBeInTheDocument();
    expect(appels.filter((a) => a.endsWith('/run'))).toHaveLength(3);
  }, TIMEOUT);

  it('un 503 arrête le lot avec « Limite atteinte »', async () => {
    const { appels } = mockFetch({
      'GET /projects/p1/tasks': { status: 200, body: [tache('t1'), tache('t2'), tache('t3')] },
      'POST /projects/p1/tasks/t1/run': { status: 503, body: { message: 'Coupé.' } },
    });
    render(<TasksSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Tâche t1');
    for (const id of ['t1', 't2', 't3']) fireEvent.click(screen.getByLabelText(`Faire faire : Tâche ${id}`));
    fireEvent.click(screen.getByRole('button', { name: /Faire faire par IGINI/ }));

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
