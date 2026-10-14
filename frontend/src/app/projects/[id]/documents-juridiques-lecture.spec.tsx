import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApiRoutes } from '@/test-utils/mocks';
import { DocumentsJuridiquesLecture } from './documents-juridiques-lecture';

const STATUTS = {
  id: 'b1',
  legal_form: 'SASU',
  capital_cents: 100000,
  head_office: '1 rue du Four, 75011 Paris',
  duration_years: 99,
  content: 'Article 1 — Forme. Texte des statuts.',
  status: 'retenue',
  finalized_at: '2026-10-05T10:00:00Z',
  associates: [{ id: 'a1', full_name: 'Helder Simoes', share_basis_points: 10000 }],
};

const DOSSIER = {
  forme: 'SASU',
  pieces: [
    { id: 'statuts', titre: 'Statuts signés', etat: 'pret', detail: '', cochable: false },
    { id: 'domiciliation', titre: 'Justificatif de domiciliation', etat: 'a_faire', detail: '', cochable: true },
  ],
  etapes: [],
  frais: { miseAJour: '2026', lignes: [], avertissement: '', sources: [] },
  filing: { status: 'depose', checkedItems: [], depositedAt: '2026-10-06T10:00:00Z', filingReference: 'INPI-123' },
};

const IMMATRICULATION = {
  registration: {
    id: 'r1',
    projectId: 'p1',
    siren: '443061841',
    siret: null,
    vatNumber: null,
    legalName: 'Ma Boulangerie SASU',
    headOffice: '1 rue du Four, 75011 Paris',
    registeredOn: '2026-10-10',
    capitalEntryId: null,
    createdAt: '2026-10-10T10:00:00Z',
    updatedAt: '2026-10-10T10:00:00Z',
  },
  suggestion: null,
};

describe('DocumentsJuridiquesLecture', () => {
  it('montre les statuts, le dossier et l’immatriculation, sans aucune action qui écrive', async () => {
    mockApiRoutes({
      'GET /projects/p1/statuts': { status: 200, body: STATUTS },
      'GET /projects/p1/dossier-creation': { status: 200, body: DOSSIER },
      'GET /projects/p1/immatriculation': { status: 200, body: IMMATRICULATION },
    });
    render(<DocumentsJuridiquesLecture token="tok" projectId="p1" />);

    expect(await screen.findByText(/Statuts retenus/)).toBeInTheDocument();
    expect(screen.getByText(/Article 1 — Forme/)).toBeInTheDocument();
    expect(screen.getByText(/Helder Simoes/)).toBeInTheDocument();
    expect(await screen.findByText(/Déposé le/)).toBeInTheDocument();
    expect(screen.getByText(/INPI-123/)).toBeInTheDocument();
    expect(screen.getByText(/Justificatif de domiciliation/)).toBeInTheDocument();
    expect(await screen.findByText(/443061841/)).toBeInTheDocument();
    expect(screen.getByText(/Ma Boulangerie SASU/)).toBeInTheDocument();

    // Rien qui modifie : seulement les téléchargements.
    for (const bouton of screen.queryAllByRole('button')) {
      expect(bouton.textContent).toMatch(/Télécharger/);
    }
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('dit simplement ce qui n’existe pas encore', async () => {
    mockApiRoutes({
      'GET /projects/p1/statuts': { status: 200, body: null },
      'GET /projects/p1/dossier-creation': { status: 200, body: { ...DOSSIER, filing: { ...DOSSIER.filing, status: 'preparation', depositedAt: null, filingReference: null } } },
      'GET /projects/p1/immatriculation': { status: 200, body: { registration: null, suggestion: null } },
    });
    render(<DocumentsJuridiquesLecture token="tok" projectId="p1" />);

    expect(await screen.findByText(/Pas encore de statuts/)).toBeInTheDocument();
    expect(await screen.findByText(/En préparation/)).toBeInTheDocument();
    expect(await screen.findByText(/Pas encore immatriculée/)).toBeInTheDocument();
  });
});
