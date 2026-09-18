import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import ProjectDetailPage from './page';

const replace = vi.fn();
// Le vrai useRouter() de Next.js renvoie une référence stable entre les
// rendus ; un objet recréé à chaque appel casse les effets qui l'ont en
// dépendance (re-render → nouvelle référence → effet relancé en boucle).
const router = { replace };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useParams: () => ({ id: 'p1' }),
}));

const PROJECT = {
  id: 'p1',
  owner_id: 'u1',
  title: 'École motocross',
  description: 'École de motocross avec suivi des élèves en compétition',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function signInAs(token: string, user: { id: string; email: string }) {
  window.localStorage.setItem('ignitux.auth', JSON.stringify({ token, user }));
}

/**
 * Simule l'API par route (méthode + chemin), avec une liste vide par défaut
 * pour tout endpoint non explicitement décrit — utile car la page déclenche
 * six requêtes en parallèle au montage (le projet + les 5 historiques de plans).
 */
function mockApiRoutes(routes: Record<string, { status: number; body: unknown }>) {
  global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    const path = new URL(url).pathname;
    const key = `${options?.method ?? 'GET'} ${path}`;
    const resp = routes[key] ?? { status: 200, body: [] };
    return Promise.resolve({
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      json: () => Promise.resolve(resp.body),
    });
  }) as unknown as typeof fetch;
}

describe('ProjectDetailPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('charge le projet et affiche les 5 sections vides', async () => {
    mockApiRoutes({ 'GET /projects/p1': { status: 200, body: PROJECT } });

    render(
      <AuthProvider>
        <ProjectDetailPage />
      </AuthProvider>,
    );

    expect(await screen.findByDisplayValue('École motocross')).toBeInTheDocument();
    expect(screen.getByText("Aucune analyse pour l'instant.")).toBeInTheDocument();
    expect(screen.getByText("Aucun plan pour l'instant.")).toBeInTheDocument();
    expect(screen.getByText("Aucun plan de financement pour l'instant.")).toBeInTheDocument();
    expect(screen.getByText("Aucun plan de développement pour l'instant.")).toBeInTheDocument();
    expect(screen.getByText("Aucun plan de transmission pour l'instant.")).toBeInTheDocument();
  });

  it('génère une analyse et l\'affiche sans appeler la vraie API Claude (tout est simulé)', async () => {
    mockApiRoutes({
      'GET /projects/p1': { status: 200, body: PROJECT },
      'POST /projects/p1/analyze': {
        status: 201,
        body: {
          id: 'a1',
          project_id: 'p1',
          summary: 'Idée solide pour un premier lancement local.',
          feasibility_score: 7,
          strengths: ['Marché de niche identifié'],
          risks: ['Dépendance à un nombre limité de compétitions'],
          next_steps: ['Valider avec 10 élèves potentiels'],
          created_at: '2026-01-02T00:00:00.000Z',
        },
      },
    });

    render(
      <AuthProvider>
        <ProjectDetailPage />
      </AuthProvider>,
    );

    await screen.findByDisplayValue('École motocross');
    fireEvent.click(screen.getByRole('button', { name: /analyser ce projet/i }));

    expect(await screen.findByText('Idée solide pour un premier lancement local.')).toBeInTheDocument();
    expect(screen.getByText('Score de faisabilité : 7/10')).toBeInTheDocument();
  });

  it('sauvegarde les modifications du projet', async () => {
    mockApiRoutes({
      'GET /projects/p1': { status: 200, body: PROJECT },
      'PATCH /projects/p1': {
        status: 200,
        body: { ...PROJECT, title: 'École motocross avancée' },
      },
    });

    render(
      <AuthProvider>
        <ProjectDetailPage />
      </AuthProvider>,
    );

    const titleInput = await screen.findByDisplayValue('École motocross');
    fireEvent.change(titleInput, { target: { value: 'École motocross avancée' } });
    fireEvent.click(screen.getByRole('button', { name: /^sauvegarder$/i }));

    await waitFor(() => expect(screen.getByDisplayValue('École motocross avancée')).toBeInTheDocument());
  });

  it('supprime le projet et redirige vers /projects', async () => {
    mockApiRoutes({
      'GET /projects/p1': { status: 200, body: PROJECT },
      'DELETE /projects/p1': { status: 204, body: null },
    });

    render(
      <AuthProvider>
        <ProjectDetailPage />
      </AuthProvider>,
    );

    await screen.findByDisplayValue('École motocross');
    fireEvent.click(screen.getByRole('button', { name: /supprimer le projet/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/projects'));
  });
});
