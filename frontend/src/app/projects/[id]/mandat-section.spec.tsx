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
      { id: 'v1', documentType: 'passeport', status: 'validee', rejectionReason: null, createdAt: '2026-09-30T00:00:00.000Z' },
    ]);
    vi.mocked(api.getMesMandats).mockResolvedValue([]);
    render(<MandatSection token="tok" projectId="p1" />);
    expect(await screen.findByRole('button', { name: /signer/i })).toBeInTheDocument();
  });

  it('affiche un mandat déjà signé avec un bouton de révocation', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([
      { id: 'v1', documentType: 'passeport', status: 'validee', rejectionReason: null, createdAt: '2026-09-30T00:00:00.000Z' },
    ]);
    vi.mocked(api.getMesMandats).mockResolvedValue([
      {
        id: 'm1',
        projectId: 'p1',
        purpose: 'depot_creation_entreprise',
        mandateText: 'texte',
        signedFullName: 'Jean Dupont',
        signedAt: '2026-09-30T00:00:00.000Z',
        status: 'active',
      },
    ]);
    render(<MandatSection token="tok" projectId="p1" />);
    expect(await screen.findByRole('button', { name: /révoquer/i })).toBeInTheDocument();
  });
});
