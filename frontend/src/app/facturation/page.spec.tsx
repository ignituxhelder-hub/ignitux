import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import BillingPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const DISCLAIMER =
  "Ignitux t'aide à tenir tes documents, mais ce n'est pas pour autant un logiciel de facturation certifié.";

function document(overrides: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    type: 'facture',
    number: 'FAC-2026-0001',
    status: 'brouillon',
    client_name: 'Dupont',
    client_details: null,
    notes: null,
    issued_at: null,
    due_at: null,
    corrects_id: null,
    lines: [
      {
        id: 'l1',
        position: 0,
        label: 'Prestation',
        quantity_milli: 1000,
        unit_price_cents: 10000,
        vat_rate_basis_points: 2000,
      },
    ],
    payments: [],
    totals: { subtotalCents: 10000, vatCents: 2000, totalCents: 12000 },
    remainingCents: 12000,
    ...overrides,
  };
}

function routes(overrides: Record<string, { status: number; body: unknown }> = {}) {
  return {
    'GET /billing/documents': { status: 200, body: { disclaimer: DISCLAIMER, documents: [document()] } },
    'GET /billing/legal-notice': {
      status: 200,
      body: {
        disclaimer: DISCLAIMER,
        enforcedRules: ['La numérotation est séquentielle et sans trou.'],
      },
    },
    ...overrides,
  };
}

describe('BillingPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("affiche l'avertissement légal sans l'enterrer", async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <BillingPage />
      </AuthProvider>,
    );

    expect(
      await screen.findByText(/pas pour autant un logiciel de facturation certifié/),
    ).toBeInTheDocument();
  });

  it('énumère les règles réellement appliquées', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <BillingPage />
      </AuthProvider>,
    );

    expect(
      await screen.findByText('La numérotation est séquentielle et sans trou.'),
    ).toBeInTheDocument();
  });

  it('affiche les montants en euros à partir des centimes', async () => {
    mockApiRoutes(routes());

    const { container } = render(
      <AuthProvider>
        <BillingPage />
      </AuthProvider>,
    );

    await screen.findByText(/FAC-2026-0001/);
    expect(container.textContent).toContain('100,00 € HT');
    expect(container.textContent).toContain('120,00 €');
  });

  it("dit qu'un document émis ne peut plus être modifié", async () => {
    mockApiRoutes(
      routes({
        'GET /billing/documents': {
          status: 200,
          body: { disclaimer: DISCLAIMER, documents: [document({ status: 'emis' })] },
        },
      }),
    );

    render(
      <AuthProvider>
        <BillingPage />
      </AuthProvider>,
    );

    expect(
      await screen.findByText(/ne peut plus être modifié ni supprimé/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
  });

  it("ne propose la suppression que sur un brouillon", async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <BillingPage />
      </AuthProvider>,
    );

    expect(await screen.findByRole('button', { name: 'Supprimer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Émettre' })).toBeInTheDocument();
  });

  it('convertit un montant saisi en euros vers des centimes', async () => {
    const bodies: string[] = [];
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      const path = new URL(url).pathname;
      if (options?.method === 'POST' && typeof options.body === 'string') {
        bodies.push(options.body);
      }
      const body =
        path === '/billing/legal-notice'
          ? { disclaimer: DISCLAIMER, enforcedRules: [] }
          : { disclaimer: DISCLAIMER, documents: [] };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    }) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <BillingPage />
      </AuthProvider>,
    );

    await screen.findByText("Aucun document pour l'instant.");
    fireEvent.change(screen.getByLabelText('Nom du client'), { target: { value: 'Dupont' } });
    fireEvent.change(screen.getByLabelText('Désignation'), { target: { value: 'Prestation' } });
    fireEvent.change(screen.getByLabelText('Montant hors taxes en euros'), {
      target: { value: '123,45' },
    });
    fireEvent.change(screen.getByLabelText('Taux de TVA en pourcentage'), {
      target: { value: '5,5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));

    await waitFor(() => expect(bodies.length).toBeGreaterThan(0));
    const payload = JSON.parse(bodies[0]) as {
      lines: Array<{ unitPriceCents: number; vatRateBasisPoints: number }>;
    };
    expect(payload.lines[0].unitPriceCents).toBe(12345);
    // 5,5 % exprimé en points de base.
    expect(payload.lines[0].vatRateBasisPoints).toBe(550);
  });

  it('remonte le refus du serveur au lieu d\'échouer en silence', async () => {
    mockApiRoutes(
      routes({
        'PATCH /billing/documents/d1/status': {
          status: 400,
          body: { message: 'Passage impossible.' },
        },
      }),
    );

    render(
      <AuthProvider>
        <BillingPage />
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Émettre' }));

    expect(await screen.findByText('Passage impossible.')).toBeInTheDocument();
  });

  // La règle « une facture émise ne se corrige que par un avoir » était
  // affichée en haut de page sans qu'aucun geste ne permette de l'appliquer.
  describe('correction par avoir', () => {
    const EMISE = document({ status: 'emis', issued_at: '2026-09-01T00:00:00.000Z' });

    it("n'offre pas l'avoir sur un brouillon : un brouillon se modifie", async () => {
      mockApiRoutes(routes());

      render(
        <AuthProvider>
          <BillingPage />
        </AuthProvider>,
      );

      await screen.findByText(/FAC-2026-0001/);
      expect(screen.queryByRole('button', { name: 'Corriger par un avoir' })).toBeNull();
    });

    it("émet un avoir qui référence la facture et reprend son taux de TVA", async () => {
      mockApiRoutes(
        routes({
          'GET /billing/documents': {
            status: 200,
            body: { disclaimer: DISCLAIMER, documents: [EMISE] },
          },
          'POST /billing/documents': { status: 201, body: EMISE },
        }),
      );

      render(
        <AuthProvider>
          <BillingPage />
        </AuthProvider>,
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Corriger par un avoir' }));

      // Le montant est pré-rempli au total HT de la facture corrigée.
      const montant = screen.getByLabelText('Montant hors taxes à créditer en euros');
      expect((montant as HTMLInputElement).value).toBe('100.00');

      fireEvent.click(screen.getByRole('button', { name: 'Émettre l’avoir' }));

      await waitFor(() => {
        const envoi = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
          (call) => (call[1]?.method ?? 'GET') === 'POST',
        );
        expect(envoi).toBeDefined();
        const corps = JSON.parse(String(envoi![1].body));
        expect(corps.type).toBe('avoir');
        expect(corps.correctsId).toBe('d1');
        expect(corps.lines[0].vatRateBasisPoints).toBe(2000);
        expect(corps.lines[0].unitPriceCents).toBe(10000);
      });
    });

    it("refuse un montant illisible sans rien envoyer", async () => {
      mockApiRoutes(
        routes({
          'GET /billing/documents': {
            status: 200,
            body: { disclaimer: DISCLAIMER, documents: [EMISE] },
          },
        }),
      );

      render(
        <AuthProvider>
          <BillingPage />
        </AuthProvider>,
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Corriger par un avoir' }));
      fireEvent.change(screen.getByLabelText('Montant hors taxes à créditer en euros'), {
        target: { value: 'beaucoup' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Émettre l’avoir' }));

      expect(await screen.findByText(/Montant de l’avoir illisible/)).toBeInTheDocument();
    });

    it('dit de quel document un avoir se déduit', async () => {
      mockApiRoutes(
        routes({
          'GET /billing/documents': {
            status: 200,
            body: {
              disclaimer: DISCLAIMER,
              documents: [
                EMISE,
                document({
                  id: 'd2',
                  type: 'avoir',
                  number: 'AV-2026-0001',
                  status: 'brouillon',
                  corrects_id: 'd1',
                }),
              ],
            },
          },
        }),
      );

      render(
        <AuthProvider>
          <BillingPage />
        </AuthProvider>,
      );

      expect(await screen.findByText(/À déduire de FAC-2026-0001/)).toBeInTheDocument();
    });
  });

  it('redirige vers la connexion sans jeton', async () => {
    window.localStorage.clear();
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <BillingPage />
      </AuthProvider>,
    );

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  });
});
