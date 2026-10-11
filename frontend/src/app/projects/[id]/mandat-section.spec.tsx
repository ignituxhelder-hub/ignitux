import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MandatSection } from './mandat-section.js';
import { api, type IdentityVerification, type Mandate } from '@/lib/api.js';

vi.mock('@/lib/api.js');

const TEXTE = 'Par la présente, je mandate Ignitux pour préparer et déposer les démarches de ce projet.';

const VERIFICATION_VALIDEE: IdentityVerification = {
  id: 'v1',
  document_type: 'passeport',
  status: 'validee',
  rejection_reason: null,
  created_at: '2026-09-30T00:00:00.000Z',
};

function mandat(overrides: Partial<Mandate> = {}): Mandate {
  return {
    id: 'm1',
    project_id: 'p1',
    purpose: 'depot_creation_entreprise',
    mandate_text: TEXTE,
    signed_full_name: 'Jean Dupont',
    signed_at: '2026-09-30T00:00:00.000Z',
    status: 'active',
    ...overrides,
  };
}

describe('MandatSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getTexteMandat).mockResolvedValue({ texte: TEXTE, signatureSuspendue: false });
  });

  it('invite à vérifier son identité quand aucune vérification n’est validée', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([]);
    vi.mocked(api.getMesMandats).mockResolvedValue([]);
    render(<MandatSection token="tok" projectId="p1" />);
    expect(await screen.findByText(/vérifier ton identité/i)).toBeInTheDocument();
  });

  it('propose de signer un mandat quand une vérification est validée', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([VERIFICATION_VALIDEE]);
    vi.mocked(api.getMesMandats).mockResolvedValue([]);
    render(<MandatSection token="tok" projectId="p1" />);
    expect(await screen.findByRole('button', { name: /signer/i })).toBeInTheDocument();
  });

  it('affiche le texte intégral du mandat avant la signature', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([VERIFICATION_VALIDEE]);
    vi.mocked(api.getMesMandats).mockResolvedValue([]);
    render(<MandatSection token="tok" projectId="p1" />);
    expect(await screen.findByText(TEXTE)).toBeInTheDocument();
    expect(api.getTexteMandat).toHaveBeenCalledWith('tok');
  });

  it('garde « Signer » désactivé tant que la case de consentement n’est pas cochée', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([VERIFICATION_VALIDEE]);
    vi.mocked(api.getMesMandats).mockResolvedValue([]);
    render(<MandatSection token="tok" projectId="p1" />);

    const bouton = await screen.findByRole('button', { name: /signer/i });
    expect(bouton).toBeDisabled();

    // Nom seul : toujours désactivé.
    fireEvent.change(screen.getByLabelText('Nom complet'), { target: { value: 'Jean Dupont' } });
    expect(bouton).toBeDisabled();

    // Nom + case cochée : activé.
    fireEvent.click(screen.getByRole('checkbox', { name: /j’ai lu/i }));
    expect(bouton).toBeEnabled();

    // Case cochée mais nom vidé : de nouveau désactivé.
    fireEvent.change(screen.getByLabelText('Nom complet'), { target: { value: '  ' } });
    expect(bouton).toBeDisabled();
  });

  it('envoie accepte: true avec la signature', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([VERIFICATION_VALIDEE]);
    vi.mocked(api.getMesMandats).mockResolvedValue([]);
    vi.mocked(api.creerMandat).mockResolvedValue(mandat({ signed_at: null, signed_full_name: null }));
    vi.mocked(api.signerMandat).mockResolvedValue(mandat());
    render(<MandatSection token="tok" projectId="p1" />);

    fireEvent.change(await screen.findByLabelText('Nom complet'), { target: { value: 'Jean Dupont' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /j’ai lu/i }));
    fireEvent.click(screen.getByRole('button', { name: /signer/i }));

    await waitFor(() => expect(api.signerMandat).toHaveBeenCalledWith('tok', 'm1', 'Jean Dupont', true));
  });

  it('affiche un mandat déjà signé avec un bouton de révocation', async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([VERIFICATION_VALIDEE]);
    vi.mocked(api.getMesMandats).mockResolvedValue([mandat()]);
    render(<MandatSection token="tok" projectId="p1" />);
    expect(await screen.findByRole('button', { name: /révoquer/i })).toBeInTheDocument();
  });

  it("propose de signer (pas de révoquer) un mandat existant mais pas encore signé", async () => {
    vi.mocked(api.getMesVerifications).mockResolvedValue([VERIFICATION_VALIDEE]);
    vi.mocked(api.getMesMandats).mockResolvedValue([
      // Un mandat créé mais pas encore signé : `status` vaut déjà 'active'
      // (voir Task 6), seul `signed_at` distingue les deux états.
      mandat({ signed_full_name: null, signed_at: null }),
    ]);
    render(<MandatSection token="tok" projectId="p1" />);
    expect(await screen.findByRole('button', { name: /signer/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /révoquer/i })).not.toBeInTheDocument();
  });

  describe('après une révocation', () => {
    it('propose de signer un nouveau mandat, avec une note sur le précédent', async () => {
      vi.mocked(api.getMesVerifications).mockResolvedValue([VERIFICATION_VALIDEE]);
      vi.mocked(api.getMesMandats).mockResolvedValue([mandat({ status: 'revoquee' })]);
      render(<MandatSection token="tok" projectId="p1" />);

      expect(await screen.findByRole('button', { name: /signer/i })).toBeInTheDocument();
      expect(screen.getByText(/mandat précédent.*révoqué/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /révoquer/i })).not.toBeInTheDocument();
    });

    it('crée un nouveau mandat plutôt que de signer le mandat révoqué', async () => {
      vi.mocked(api.getMesVerifications).mockResolvedValue([VERIFICATION_VALIDEE]);
      vi.mocked(api.getMesMandats).mockResolvedValue([mandat({ status: 'revoquee' })]);
      vi.mocked(api.creerMandat).mockResolvedValue(
        mandat({ id: 'm2', signed_at: null, signed_full_name: null }),
      );
      vi.mocked(api.signerMandat).mockResolvedValue(mandat({ id: 'm2' }));
      render(<MandatSection token="tok" projectId="p1" />);

      fireEvent.change(await screen.findByLabelText('Nom complet'), { target: { value: 'Jean Dupont' } });
      fireEvent.click(screen.getByRole('checkbox', { name: /j’ai lu/i }));
      fireEvent.click(screen.getByRole('button', { name: /signer/i }));

      await waitFor(() => expect(api.signerMandat).toHaveBeenCalledWith('tok', 'm2', 'Jean Dupont', true));
      expect(api.creerMandat).toHaveBeenCalledWith('tok', 'p1', 'depot_creation_entreprise');
    });

    it('privilégie un mandat actif plus récent sur un ancien mandat révoqué', async () => {
      vi.mocked(api.getMesVerifications).mockResolvedValue([VERIFICATION_VALIDEE]);
      // Liste servie du plus récent au plus ancien (listerMesMandats).
      vi.mocked(api.getMesMandats).mockResolvedValue([
        mandat({ id: 'm2' }),
        mandat({ id: 'm1', status: 'revoquee' }),
      ]);
      render(<MandatSection token="tok" projectId="p1" />);

      expect(await screen.findByRole('button', { name: /révoquer/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^signer$/i })).not.toBeInTheDocument();
    });

    it('rouvre le formulaire de signature juste après avoir révoqué', async () => {
      vi.mocked(api.getMesVerifications).mockResolvedValue([VERIFICATION_VALIDEE]);
      vi.mocked(api.getMesMandats).mockResolvedValue([mandat()]);
      vi.mocked(api.revoquerMandat).mockResolvedValue(mandat({ status: 'revoquee' }));
      render(<MandatSection token="tok" projectId="p1" />);

      fireEvent.click(await screen.findByRole('button', { name: /révoquer/i }));

      expect(await screen.findByRole('button', { name: /^signer$/i })).toBeInTheDocument();
      expect(screen.getByText(/mandat précédent.*révoqué/i)).toBeInTheDocument();
    });
  });

  describe('quand le serveur dit que la signature est suspendue', () => {
    beforeEach(() => {
      vi.mocked(api.getTexteMandat).mockResolvedValue({ texte: TEXTE, signatureSuspendue: true });
    });

    it('affiche une note neutre à la place du formulaire de signature', async () => {
      vi.mocked(api.getMesVerifications).mockResolvedValue([VERIFICATION_VALIDEE]);
      vi.mocked(api.getMesMandats).mockResolvedValue([]);
      render(<MandatSection token="tok" projectId="p1" />);

      expect(await screen.findByText(/suspendue en attendant un avis juridique/i)).toBeInTheDocument();
      expect(screen.getByText(/rien n’est déposé à ta place/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^signer$/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Nom complet')).not.toBeInTheDocument();
      expect(screen.queryByText(TEXTE)).not.toBeInTheDocument();
      expect(api.creerMandat).not.toHaveBeenCalled();
    });

    it("n'invite pas à vérifier son identité pour signer un mandat qu'on ne peut pas signer", async () => {
      vi.mocked(api.getMesVerifications).mockResolvedValue([]);
      vi.mocked(api.getMesMandats).mockResolvedValue([]);
      render(<MandatSection token="tok" projectId="p1" />);

      expect(await screen.findByText(/suspendue en attendant un avis juridique/i)).toBeInTheDocument();
      expect(screen.queryByText(/avant de pouvoir signer un mandat/i)).not.toBeInTheDocument();
    });

    it('laisse voir et révoquer un mandat déjà signé', async () => {
      vi.mocked(api.getMesVerifications).mockResolvedValue([VERIFICATION_VALIDEE]);
      vi.mocked(api.getMesMandats).mockResolvedValue([mandat()]);
      vi.mocked(api.revoquerMandat).mockResolvedValue(mandat({ status: 'revoquee' }));
      render(<MandatSection token="tok" projectId="p1" />);

      expect(await screen.findByText(/signé par jean dupont/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /révoquer/i }));
      await waitFor(() => expect(api.revoquerMandat).toHaveBeenCalledWith('tok', 'm1'));

      // Après la révocation, pas de formulaire qui rouvre : la note reste.
      expect(await screen.findByText(/suspendue en attendant un avis juridique/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^signer$/i })).not.toBeInTheDocument();
    });
  });
});
