import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import ProjectsPage from './page';

const replace = vi.fn();
// Le vrai useRouter() de Next.js renvoie une référence stable entre les
// rendus ; un objet recréé à chaque appel casse les effets qui l'ont en
// dépendance (re-render → nouvelle référence → effet relancé en boucle).
const router = { replace };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

function signInAs(token: string, user: { id: string; email: string }) {
  window.localStorage.setItem('ignitux.auth', JSON.stringify({ token, user }));
}

/** Simule les réponses successives de fetch, dans l'ordre des appels. */
function mockFetchSequence(...responses: Array<{ status: number; body: unknown }>) {
  let call = 0;
  global.fetch = vi.fn().mockImplementation(() => {
    const { status, body } = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
  }) as unknown as typeof fetch;
}

describe('ProjectsPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    replace.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redirige vers /login quand personne n\'est connecté', async () => {
    mockFetchSequence({ status: 200, body: [] });

    render(
      <AuthProvider>
        <ProjectsPage />
      </AuthProvider>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
  });

  it('affiche les projets du propriétaire connecté', async () => {
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
    mockFetchSequence({
      status: 200,
      body: [{ id: 'p1', owner_id: 'u1', title: 'École motocross', description: null }],
    });

    render(
      <AuthProvider>
        <ProjectsPage />
      </AuthProvider>,
    );

    expect(await screen.findByText('École motocross')).toBeInTheDocument();
    expect(screen.getByText('a@b.com')).toBeInTheDocument();
  });

  it("affiche un message quand aucun projet n'existe encore", async () => {
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
    mockFetchSequence({ status: 200, body: [] });

    render(
      <AuthProvider>
        <ProjectsPage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/aucun projet pour l'instant/i)).toBeInTheDocument();
  });

  it('crée un projet et l\'ajoute en tête de liste', async () => {
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
    mockFetchSequence(
      { status: 200, body: [] },
      { status: 201, body: { id: 'p1', owner_id: 'u1', title: 'Nouvelle idée', description: null } },
    );

    render(
      <AuthProvider>
        <ProjectsPage />
      </AuthProvider>,
    );

    await screen.findByText(/aucun projet pour l'instant/i);

    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Nouvelle idée' } });
    fireEvent.click(screen.getByRole('button', { name: /créer le projet/i }));

    expect(await screen.findByText('Nouvelle idée')).toBeInTheDocument();
  });
});
