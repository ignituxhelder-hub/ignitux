import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import CaissePage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const ENTRY = {
  id: 'r1',
  owner_id: 'u1',
  occurred_on: '2026-10-01T00:00:00.000Z',
  cash_cents: 5000,
  card_cents: 3000,
  vat_cents: 1300,
  note: 'Journée normale',
  source: 'manuel',
  ledger_entry_id: 'e1',
  created_at: '2026-10-01T20:00:00.000Z',
};

function routes(overrides: Record<string, { status: number; body: unknown }> = {}) {
  return {
    'GET /caisse/journees': { status: 200, body: [ENTRY] },
    ...overrides,
  };
}

describe('CaissePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('liste les relevés déjà saisis, montants en euros', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <CaissePage />
      </AuthProvider>,
    );

    expect(await screen.findByText('01/10/2026')).toBeInTheDocument();
    expect(screen.getByText(/50,00 €/)).toBeInTheDocument();
    expect(screen.getByText(/30,00 €/)).toBeInTheDocument();
    expect(screen.getByText(/13,00 €/)).toBeInTheDocument();
    expect(screen.getByText('Journée normale')).toBeInTheDocument();
  });

  it("propose un lien vers l'écriture comptable quand le relevé en a une", async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <CaissePage />
      </AuthProvider>,
    );

    const lien = await screen.findByRole('link', { name: "Voir l'écriture" });
    expect(lien).toHaveAttribute('href', '/comptabilite');
  });

  it('enregistre un relevé, montants convertis en centimes', async () => {
    const routeMap = routes({
      'POST /caisse/journees': { status: 201, body: ENTRY },
      'GET /caisse/journees': { status: 200, body: [] },
    });
    mockApiRoutes(routeMap);

    render(
      <AuthProvider>
        <CaissePage />
      </AuthProvider>,
    );

    await screen.findByText("Aucun relevé enregistré pour l'instant.");
    routeMap['GET /caisse/journees'] = { status: 200, body: [ENTRY] };

    fireEvent.change(screen.getByLabelText('Total espèces en euros'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Total carte en euros'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('TVA collectée en euros'), { target: { value: '13' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      const appel = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([, options]) => options?.method === 'POST',
      );
      expect(appel).toBeDefined();
      const corps = JSON.parse((appel as [string, RequestInit])[1].body as string);
      expect(corps).toEqual(
        expect.objectContaining({ cashCents: 5000, cardCents: 3000, vatCents: 1300 }),
      );
    });
  });

  it('refuse un montant illisible sans appeler le serveur', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <CaissePage />
      </AuthProvider>,
    );

    await screen.findByText('01/10/2026');
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();

    fireEvent.change(screen.getByLabelText('Total espèces en euros'), {
      target: { value: 'pas un nombre' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Les montants doivent être des nombres.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('redirige vers la connexion sans jeton', async () => {
    window.localStorage.clear();
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <CaissePage />
      </AuthProvider>,
    );

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  });
});
