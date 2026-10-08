import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import IdentitePage from './page.js';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.js';
import { createRouterMock } from '@/test-utils/mocks';

vi.mock('@/lib/api.js');
vi.mock('@/lib/auth.js');

// Référence stable entre les rendus, comme le vrai useRouter() de Next.js :
// un objet recréé à chaque appel casserait l'effet de chargement, qui a
// `router` en dépendance (re-render → nouvelle référence → effet relancé en
// boucle). Voir frontend/src/test-utils/mocks.ts.
const router = createRouterMock();
vi.mock('next/navigation', () => ({ useRouter: () => router }));

describe('IdentitePage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ token: 'tok', isReady: true } as any);
  });

  it('affiche « Aucune vérification » quand la liste est vide', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([]);
    render(<IdentitePage />);
    expect(await screen.findByText(/aucune vérification/i)).toBeInTheDocument();
  });

  it('affiche le statut d’une vérification existante', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([
      { id: 'v1', document_type: 'passeport', status: 'en_attente', rejection_reason: null, created_at: '2026-09-30T00:00:00.000Z' },
    ]);
    render(<IdentitePage />);
    expect(await screen.findByText(/en attente/i)).toBeInTheDocument();
  });

  it('affiche le motif de rejet quand une vérification est rejetée', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([
      { id: 'v1', document_type: 'passeport', status: 'rejetee', rejection_reason: 'photo illisible', created_at: '2026-09-30T00:00:00.000Z' },
    ]);
    render(<IdentitePage />);
    expect(await screen.findByText(/photo illisible/i)).toBeInTheDocument();
  });

  it('n’envoie pas un verso choisi avant de passer au passeport', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([]);
    vi.mocked(api.soumettreDocumentIdentite).mockResolvedValue({
      id: 'v2',
      document_type: 'passeport',
      status: 'en_attente',
      rejection_reason: null,
      created_at: '2026-10-01T00:00:00.000Z',
    });
    render(<IdentitePage />);
    await screen.findByText(/aucune vérification/i);

    const recto = new File(['r'], 'recto.png', { type: 'image/png' });
    const verso = new File(['v'], 'verso.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Recto'), { target: { files: [recto] } });
    fireEvent.change(screen.getByLabelText('Verso'), { target: { files: [verso] } });
    // Le champ verso disparaît en passant au passeport : le fichier choisi
    // ne doit pas partir en douce avec la soumission suivante.
    fireEvent.change(screen.getByLabelText('Type de document'), { target: { value: 'passeport' } });
    expect(screen.queryByLabelText('Verso')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));

    await waitFor(() =>
      expect(api.soumettreDocumentIdentite).toHaveBeenCalledWith('tok', 'passeport', recto, null),
    );
  });
});
