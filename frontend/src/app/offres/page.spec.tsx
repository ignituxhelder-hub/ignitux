import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRouterMock } from '@/test-utils/mocks';
import OffresPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({ useRouter: () => router }));

/**
 * L'ancienne page des offres : il n'y a plus d'abonnement (2026-10-25), les
 * actions IGINI se paient en crédits. Un favori ou une tâche du bureau qui
 * pointe encore ici mène à « Mes crédits ».
 */
describe('/offres', () => {
  beforeEach(() => router.replace.mockClear());

  it('renvoie vers « Mes crédits »', async () => {
    render(<OffresPage />);

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/credits'));
    expect(screen.getByRole('link', { name: 'Mes crédits' })).toHaveAttribute('href', '/credits');
    expect(document.body.textContent).not.toMatch(/Entrepreneur|\/ mois/);
  });
});
