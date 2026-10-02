import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MandatSection } from './mandat-section.js';
import { api } from '@/lib/api.js';

vi.mock('@/lib/api.js');

describe('MandatSection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('invite à vérifier son identité quand aucune vérification n’est validée', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([]);
    vi.mocked(api.getMesMandats).mockResolvedValue([]);
    render(<MandatSection token="tok" projectId="p1" />);
    expect(await screen.findByText(/vérifier ton identité/i)).toBeInTheDocument();
  });

  it('propose de signer un mandat quand une vérification est validée', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([
      { id: 'v1', document_type: 'passeport', status: 'validee', rejection_reason: null, created_at: '2026-09-30T00:00:00.000Z' },
    ]);
    vi.mocked(api.getMesMandats).mockResolvedValue([]);
    render(<MandatSection token="tok" projectId="p1" />);
    expect(await screen.findByRole('button', { name: /signer/i })).toBeInTheDocument();
  });

  it('affiche un mandat déjà signé avec un bouton de révocation', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([
      { id: 'v1', document_type: 'passeport', status: 'validee', rejection_reason: null, created_at: '2026-09-30T00:00:00.000Z' },
    ]);
    vi.mocked(api.getMesMandats).mockResolvedValue([
      {
        id: 'm1',
        project_id: 'p1',
        purpose: 'depot_creation_entreprise',
        mandate_text: 'texte',
        signed_full_name: 'Jean Dupont',
        signed_at: '2026-09-30T00:00:00.000Z',
        status: 'active',
      },
    ]);
    render(<MandatSection token="tok" projectId="p1" />);
    expect(await screen.findByRole('button', { name: /révoquer/i })).toBeInTheDocument();
  });

  it("propose de signer (pas de révoquer) un mandat existant mais pas encore signé", async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([
      { id: 'v1', document_type: 'passeport', status: 'validee', rejection_reason: null, created_at: '2026-09-30T00:00:00.000Z' },
    ]);
    vi.mocked(api.getMesMandats).mockResolvedValue([
      {
        id: 'm1',
        project_id: 'p1',
        purpose: 'depot_creation_entreprise',
        mandate_text: 'texte',
        // Un mandat créé mais pas encore signé : `status` vaut déjà 'active'
        // (voir Task 6), seul `signed_at` distingue les deux états.
        signed_full_name: null,
        signed_at: null,
        status: 'active',
      },
    ]);
    render(<MandatSection token="tok" projectId="p1" />);
    expect(await screen.findByRole('button', { name: /signer/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /révoquer/i })).not.toBeInTheDocument();
  });
});
