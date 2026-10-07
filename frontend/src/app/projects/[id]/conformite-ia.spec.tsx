import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComplianceSection } from './compliance-section';

const TOKEN = 'tok123';
const PROJECT_ID = 'p1';
const TIMEOUT = 15000;

function exigence(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    country: 'FR',
    category: 'Création',
    title: `Démarche ${id}`,
    description: 'Description.',
    source_name: 'service-public.fr',
    source_url: 'https://entreprendre.service-public.fr',
    completed: false,
    ai: null,
    ...extra,
  };
}

function ligne(id: string, extra: Record<string, unknown> = {}) {
  return {
    project_id: PROJECT_ID,
    requirement_id: id,
    status: 'a_valider',
    result_kind: 'livrable',
    result: `Texte ${id}`,
    refusal_reason: null,
    ...extra,
  };
}

function checklist(requirements: unknown[]) {
  return { status: 200, body: { disclaimer: 'd', country: 'FR', countryDeclared: true, sector: 'x', requirements, groupes: [] } };
}

type Reponse = { status: number; body: unknown };

/** fetch simulé : une réponse par route, et le journal des appels. */
function mockFetch(routes: Record<string, Reponse>) {
  const appels: string[] = [];
  const bodies: Record<string, unknown> = {};
  global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    const key = `${options?.method ?? 'GET'} ${new URL(url).pathname}`;
    appels.push(key);
    if (options?.body) bodies[key] = JSON.parse(options.body as string);
    const rep = routes[key] ?? { status: 200, body: [] };
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

describe('ComplianceSection — IGINI prépare les démarches', () => {
  it('rappelle qu\'IGINI ne dépose rien et lance les exigences cochées une par une', async () => {
    const { appels } = mockFetch({
      'GET /projects/p1/compliance': checklist([exigence('r1'), exigence('r2'), exigence('r3')]),
      'POST /projects/p1/compliance/r1/run': { status: 200, body: ligne('r1') },
      'POST /projects/p1/compliance/r2/run': { status: 200, body: ligne('r2') },
    });
    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} />);

    const bouton = await screen.findByRole('button', { name: /Faire faire par IGINI/ });
    expect(screen.getByText('IGINI prépare, il ne dépose rien à ta place.')).toBeInTheDocument();
    expect(bouton).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Faire faire : Démarche r1'));
    fireEvent.click(screen.getByLabelText('Faire faire : Démarche r2'));
    expect(screen.getByText('2 éléments, ~2 appels IA')).toBeInTheDocument();
    fireEvent.click(bouton);

    expect(await screen.findByText('Texte r2')).toBeInTheDocument();
    expect(appels.filter((a) => a.endsWith('/run'))).toEqual([
      'POST /projects/p1/compliance/r1/run',
      'POST /projects/p1/compliance/r2/run',
    ]);
    expect(screen.getByText('Texte r1')).toBeInTheDocument();
    // Les cases « fait » restent distinctes et décochées.
    expect(screen.getByLabelText('Démarche r1')).not.toBeChecked();
  }, TIMEOUT);

  it('garde les lignes d\'une instruction à la ligne', async () => {
    mockFetch({
      'GET /projects/p1/compliance': checklist([
        exigence('r1', { ai: { status: 'a_valider', result_kind: 'instructions', result: '1. Ouvrir le guichet\n2. Déposer', refusal_reason: null } }),
      ]),
    });
    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText('Instructions à suivre')).toBeInTheDocument();
    const contenu = screen.getByText(/1\. Ouvrir le guichet/);
    expect(contenu.textContent).toBe('1. Ouvrir le guichet\n2. Déposer');
    expect(contenu).toHaveStyle({ whiteSpace: 'pre-wrap' });
  }, TIMEOUT);

  it('« J\'ai fait / J\'ai déposé » valide puis la case de l\'exigence est cochée', async () => {
    const { appels } = mockFetch({
      'GET /projects/p1/compliance': checklist([
        exigence('r1', { ai: { status: 'a_valider', result_kind: 'instructions', result: 'Étapes', refusal_reason: null } }),
      ]),
      'POST /projects/p1/compliance/r1/validate': { status: 200, body: ligne('r1', { status: 'valide', result_kind: 'instructions', result: 'Étapes' }) },
    });
    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} />);

    fireEvent.click(await screen.findByRole('button', { name: "J'ai fait / J'ai déposé" }));

    await waitFor(() => expect(appels).toContain('POST /projects/p1/compliance/r1/validate'));
    await waitFor(() => expect(screen.getByLabelText('Démarche r1')).toBeChecked());
    expect(screen.queryByRole('button', { name: "J'ai fait / J'ai déposé" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Faire faire : Démarche r1')).not.toBeInTheDocument();
  }, TIMEOUT);

  it('Refuser envoie le motif', async () => {
    const { appels, bodies } = mockFetch({
      'GET /projects/p1/compliance': checklist([
        exigence('r1', { ai: { status: 'a_valider', result_kind: 'livrable', result: 'Brouillon', refusal_reason: null } }),
      ]),
      'POST /projects/p1/compliance/r1/refuse': {
        status: 200,
        body: ligne('r1', { status: 'refuse', result: 'Brouillon', refusal_reason: 'Incomplet' }),
      },
    });
    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Refuser' }));
    fireEvent.change(screen.getByLabelText('Motif du refus (facultatif)'), { target: { value: 'Incomplet' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le refus' }));

    await waitFor(() => expect(appels).toContain('POST /projects/p1/compliance/r1/refuse'));
    expect(bodies['POST /projects/p1/compliance/r1/refuse']).toEqual({ reason: 'Incomplet' });
    expect(await screen.findByText(/Refusé/)).toBeInTheDocument();
    expect(screen.getByText(/Incomplet/)).toBeInTheDocument();
    expect(screen.getByLabelText('Faire faire : Démarche r1')).toBeInTheDocument();
  }, TIMEOUT);

  it('une démarche en échec propose « Réessayer »', async () => {
    const { appels } = mockFetch({
      'GET /projects/p1/compliance': checklist([
        exigence('r1', { ai: { status: 'echec', result_kind: null, result: null, refusal_reason: null } }),
        exigence('r2'),
      ]),
      'POST /projects/p1/compliance/r1/run': { status: 200, body: ligne('r1', { result: 'Réussi' }) },
    });
    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText("IGINI n'a pas pu préparer cette démarche")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('Réussi')).toBeInTheDocument();
    expect(appels.filter((a) => a.endsWith('/run'))).toEqual(['POST /projects/p1/compliance/r1/run']);
  }, TIMEOUT);

  it('en lecture seule : ni sélection, ni bouton, ni actions sur le résultat', async () => {
    mockFetch({
      'GET /projects/p1/compliance': checklist([
        exigence('r1'),
        exigence('r2', { ai: { status: 'a_valider', result_kind: 'livrable', result: 'X', refusal_reason: null } }),
      ]),
    });
    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} readOnly />);

    await screen.findByText('Démarche r1');
    expect(screen.queryByRole('button', { name: /Faire faire par IGINI/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Faire faire/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "J'ai fait / J'ai déposé" })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refuser' })).not.toBeInTheDocument();
  }, TIMEOUT);

  it('un 403 arrête le lot avec « Limite atteinte »', async () => {
    const { appels } = mockFetch({
      'GET /projects/p1/compliance': checklist([exigence('r1'), exigence('r2'), exigence('r3')]),
      'POST /projects/p1/compliance/r1/run': { status: 403, body: { message: 'Quota atteint.' } },
    });
    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Démarche r1');
    for (const id of ['r1', 'r2', 'r3']) fireEvent.click(screen.getByLabelText(`Faire faire : Démarche ${id}`));
    fireEvent.click(screen.getByRole('button', { name: /Faire faire par IGINI/ }));

    expect(await screen.findByText('Limite atteinte : 3 éléments non traités')).toBeInTheDocument();
    expect(appels.filter((a) => a.endsWith('/run'))).toHaveLength(1);
    expect(screen.getByLabelText('Faire faire : Démarche r3')).toBeChecked();
  }, TIMEOUT);


  it('Connexion perdue : le lot s arrête, rien n est marqué en échec, les cases restent cochées', async () => {
    const appels: string[] = [];
    mockFetch({
      'GET /projects/p1/compliance': checklist([exigence('r1'), exigence('r2'), exigence('r3')]),
    });
    const base = global.fetch as unknown as (u: string, o?: RequestInit) => Promise<unknown>;
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if ((options?.method ?? 'GET') === 'POST') {
        appels.push(new URL(url).pathname);
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return base(url, options);
    }) as unknown as typeof fetch;
    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Démarche r1');
    for (const id of ["r1","r2","r3"]) fireEvent.click(screen.getByLabelText('Faire faire : Démarche ' + id));
    fireEvent.click(screen.getByRole('button', { name: /Faire faire par IGINI/ }));

    expect(await screen.findByText('Connexion perdue : 3 éléments non traités')).toBeInTheDocument();
    expect(appels).toHaveLength(1);
    expect(screen.queryByText("IGINI n'a pas pu préparer cette démarche")).not.toBeInTheDocument();
    for (const id of ["r1","r2","r3"]) expect(screen.getByLabelText('Faire faire : Démarche ' + id)).toBeChecked();
  }, TIMEOUT);

  it("affiche le motif d'échec du serveur sous l'intitulé générique", async () => {
    mockFetch({
      'GET /projects/p1/compliance': checklist([exigence('r1'), exigence('r2'), exigence('r3')]),
      'POST /projects/p1/compliance/r1/run': { status: 500, body: { message: 'Le modèle a répondu hors format.' } },
    });
    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Démarche r1');
    fireEvent.click(screen.getByLabelText('Faire faire : Démarche r1'));
    fireEvent.click(screen.getByRole('button', { name: /Faire faire par IGINI/ }));

    expect(await screen.findByText("IGINI n'a pas pu préparer cette démarche")).toBeInTheDocument();
    expect(screen.getByText('Le modèle a répondu hors format.')).toBeInTheDocument();
  }, TIMEOUT);

  it('ne lance plus rien une fois le composant démonté', async () => {
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
      if (key === 'GET /projects/p1/compliance') return Promise.resolve(fabrique(checklist([exigence('r1'), exigence('r2')])));
      return new Promise((resolve) => {
        attente[key] = (rep) => resolve(fabrique(rep));
      });
    }) as unknown as typeof fetch;
    const { unmount } = render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Démarche r1');
    fireEvent.click(screen.getByLabelText('Faire faire : Démarche r1'));
    fireEvent.click(screen.getByLabelText('Faire faire : Démarche r2'));
    fireEvent.click(screen.getByRole('button', { name: /Faire faire par IGINI/ }));
    await waitFor(() => expect(appels.filter((a) => a.endsWith('/run'))).toHaveLength(1));

    unmount();
    attente['POST /projects/p1/compliance/r1/run']({ status: 200, body: ligne('r1') });
    await new Promise((r) => setTimeout(r, 50));

    expect(appels.filter((a) => a.endsWith('/run'))).toEqual(['POST /projects/p1/compliance/r1/run']);
  }, TIMEOUT);
});
