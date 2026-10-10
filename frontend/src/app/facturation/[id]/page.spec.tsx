import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import BillingDocumentPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useParams: () => ({ id: 'd1' }),
}));

function document(overrides: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    type: 'facture',
    number: 'FAC-2026-0001',
    status: 'emis',
    client_name: 'Dupont',
    client_details: null,
    issuer_details: null,
    notes: null,
    issued_at: '2026-10-10T10:00:00.000Z',
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

function rendre() {
  return render(
    <AuthProvider>
      <BillingDocumentPage />
    </AuthProvider>,
  );
}

describe('BillingDocumentPage — émetteur', () => {
  beforeEach(() => {
    window.localStorage.clear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('affiche le bloc « Émetteur » en gardant les retours à la ligne', async () => {
    const mentions = 'Moto École SAS\nSAS au capital de 1 000,00 €\n1 rue de la Piste, 75001 Paris\nSIREN 732829320';
    mockApiRoutes({ 'GET /billing/documents/d1': { status: 200, body: document({ issuer_details: mentions }) } });
    rendre();

    expect(await screen.findByText('Émetteur')).toBeInTheDocument();
    const bloc = screen.getByText(/Moto École SAS/);
    expect(bloc.textContent).toBe(mentions);
    expect(bloc).toHaveStyle({ whiteSpace: 'pre-line' });
  });

  it('sans mentions d’émetteur, aucun bloc « Émetteur »', async () => {
    mockApiRoutes({ 'GET /billing/documents/d1': { status: 200, body: document() } });
    rendre();

    expect(await screen.findByText('Dupont')).toBeInTheDocument();
    expect(screen.queryByText('Émetteur')).not.toBeInTheDocument();
  });
});
