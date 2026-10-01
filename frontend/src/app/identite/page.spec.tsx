import { render, screen } from '@testing-library/react';
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
      { id: 'v1', documentType: 'passeport', status: 'en_attente', rejectionReason: null, createdAt: '2026-09-30T00:00:00.000Z' },
    ]);
    render(<IdentitePage />);
    expect(await screen.findByText(/en attente/i)).toBeInTheDocument();
  });

  it('affiche le motif de rejet quand une vérification est rejetée', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([
      { id: 'v1', documentType: 'passeport', status: 'rejetee', rejectionReason: 'photo illisible', createdAt: '2026-09-30T00:00:00.000Z' },
    ]);
    render(<IdentitePage />);
    expect(await screen.findByText(/photo illisible/i)).toBeInTheDocument();
  });
});
