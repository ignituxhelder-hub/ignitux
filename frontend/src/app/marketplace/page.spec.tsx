import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import MarketplacePage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const MENTOR_PROFILE = {
  id: 'm1',
  user_id: 'u2',
  role: 'mentor' as const,
  headline: 'Mentor produit SaaS',
  bio: '10 ans en growth.',
  expertise: ['growth', 'saas'],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  user: { id: 'u2', email: 'mentor@b.com' },
};

describe('MarketplacePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("liste les profils de l'annuaire", async () => {
    mockApiRoutes({
      'GET /marketplace/profiles': { status: 200, body: [MENTOR_PROFILE] },
      'GET /marketplace/profile': { status: 200, body: null },
      'GET /marketplace/contacts': { status: 200, body: [] },
    });

    render(
      <AuthProvider>
        <MarketplacePage />
      </AuthProvider>,
    );

    expect(await screen.findByText('Mentor produit SaaS')).toBeInTheDocument();
    expect(screen.getByText('10 ans en growth.')).toBeInTheDocument();
  });

  it('permet de créer son propre profil', async () => {
    mockApiRoutes({
      'GET /marketplace/profiles': { status: 200, body: [] },
      'GET /marketplace/profile': { status: 200, body: null },
      'GET /marketplace/contacts': { status: 200, body: [] },
      'POST /marketplace/profile': { status: 201, body: MENTOR_PROFILE },
    });

    render(
      <AuthProvider>
        <MarketplacePage />
      </AuthProvider>,
    );

    await screen.findByText('Créer mon profil');
    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Mentor produit SaaS' } });
    fireEvent.click(screen.getByRole('button', { name: /publier mon profil/i }));

    expect(await screen.findByText('Mon profil')).toBeInTheDocument();
  });

  it('envoie un message de contact à un autre profil', async () => {
    mockApiRoutes({
      'GET /marketplace/profiles': { status: 200, body: [MENTOR_PROFILE] },
      'GET /marketplace/profile': { status: 200, body: null },
      'GET /marketplace/contacts': { status: 200, body: [] },
      'POST /marketplace/profiles/m1/contact': {
        status: 201,
        body: { id: 'c1', from_user_id: 'u1', to_profile_id: 'm1', message: 'Bonjour', created_at: '2026-01-01T00:00:00.000Z' },
      },
    });

    render(
      <AuthProvider>
        <MarketplacePage />
      </AuthProvider>,
    );

    const input = await screen.findByLabelText('Message pour Mentor produit SaaS');
    fireEvent.change(input, { target: { value: 'Bonjour, intéressé par votre profil.' } });
    fireEvent.click(screen.getByRole('button', { name: /^contacter$/i }));

    await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
  });

  it('affiche les messages reçus', async () => {
    mockApiRoutes({
      'GET /marketplace/profiles': { status: 200, body: [] },
      'GET /marketplace/profile': { status: 200, body: MENTOR_PROFILE },
      'GET /marketplace/contacts': {
        status: 200,
        body: [
          {
            id: 'c1',
            from_user_id: 'u3',
            to_profile_id: 'm1',
            message: 'Intéressé par un échange.',
            created_at: '2026-01-01T00:00:00.000Z',
            from_user: { id: 'u3', email: 'porteur@b.com' },
          },
        ],
      },
    });

    render(
      <AuthProvider>
        <MarketplacePage />
      </AuthProvider>,
    );

    expect(await screen.findByText('Intéressé par un échange.')).toBeInTheDocument();
  });
});
