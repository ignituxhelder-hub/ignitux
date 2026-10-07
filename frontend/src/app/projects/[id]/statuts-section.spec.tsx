import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApiRoutes } from '@/test-utils/mocks';
import { StatutsSection } from './statuts-section';

const TOKEN = 'tok123';
const PROJECT_ID = 'p1';

function bylaws(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    legal_form: 'SASU',
    capital_cents: 100000,
    head_office: '1 rue de Paris',
    duration_years: 99,
    content: 'STATUTS',
    status: 'brouillon',
    finalized_at: null,
    associates: [],
    ...overrides,
  };
}

function appelsAvecMethode(methode: string) {
  const mock = global.fetch as unknown as ReturnType<typeof vi.fn>;
  return mock.mock.calls.filter(([, options]) => (options?.method ?? 'GET') === methode);
}

function remplirFormulaire() {
  fireEvent.change(screen.getByLabelText('Capital social (€)'), { target: { value: '1 000,50' } });
  fireEvent.change(screen.getByLabelText('Siège social'), { target: { value: '1 rue de Paris' } });
  fireEvent.change(screen.getByLabelText("Nom de l'associé 1"), { target: { value: 'Alice' } });
}

describe('StatutsSection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("explique pourquoi les statuts ne s'appliquent pas pour une micro-entreprise", async () => {
    mockApiRoutes({});
    render(
      <StatutsSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm="micro-entreprise" onFormConfirmed={vi.fn()} />,
    );
    expect(await screen.findByText(/n'ont pas de personne morale/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /générer/i })).not.toBeInTheDocument();
  });

  it("propose de confirmer une forme quand aucune n'est retenue, et l'enregistre", async () => {
    mockApiRoutes({
      'PATCH /projects/p1/forme-juridique': { status: 200, body: { id: 'p1', confirmed_legal_form: 'SAS' } },
    });
    const onFormConfirmed = vi.fn();
    render(<StatutsSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm={null} onFormConfirmed={onFormConfirmed} />);

    fireEvent.change(await screen.findByLabelText('Forme juridique'), { target: { value: 'SAS' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmer/i }));

    await waitFor(() => expect(onFormConfirmed).toHaveBeenCalledWith('SAS'));
    const [, options] = appelsAvecMethode('PATCH')[0];
    expect(JSON.parse(options.body)).toEqual({ legalForm: 'SAS' });
  });

  it('affiche le formulaire de génération pour une forme à personne morale sans statuts existants', async () => {
    mockApiRoutes({ 'GET /projects/p1/statuts': { status: 200, body: null } });
    render(<StatutsSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm="SASU" onFormConfirmed={vi.fn()} />);
    expect(await screen.findByLabelText('Capital social (€)')).toBeInTheDocument();
    expect(screen.getByText(/brouillon à relire/i)).toBeInTheDocument();
  });

  it('envoie le capital en centimes et les parts en points de base', async () => {
    mockApiRoutes({
      'GET /projects/p1/statuts': { status: 200, body: null },
      'POST /projects/p1/statuts': { status: 201, body: bylaws() },
    });
    render(<StatutsSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm="SAS" onFormConfirmed={vi.fn()} />);
    await screen.findByLabelText('Capital social (€)');

    remplirFormulaire();
    fireEvent.change(screen.getByLabelText('Part de l\'associé 1 (%)'), { target: { value: '66,67' } });
    fireEvent.click(screen.getByRole('button', { name: /ajouter un associé/i }));
    fireEvent.change(screen.getByLabelText("Nom de l'associé 2"), { target: { value: 'Bob' } });
    fireEvent.change(screen.getByLabelText('Part de l\'associé 2 (%)'), { target: { value: '33,33' } });
    fireEvent.click(screen.getByRole('button', { name: /générer les statuts/i }));

    await waitFor(() => expect(appelsAvecMethode('POST')).toHaveLength(1));
    const [, options] = appelsAvecMethode('POST')[0];
    expect(JSON.parse(options.body)).toEqual({
      capitalCents: 100050,
      headOffice: '1 rue de Paris',
      durationYears: 99,
      associates: [
        { fullName: 'Alice', shareBasisPoints: 6667 },
        { fullName: 'Bob', shareBasisPoints: 3333 },
      ],
    });
  });

  it("refuse d'appeler l'API quand les parts ne totalisent pas 100 %", async () => {
    mockApiRoutes({ 'GET /projects/p1/statuts': { status: 200, body: null } });
    render(<StatutsSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm="SAS" onFormConfirmed={vi.fn()} />);
    await screen.findByLabelText('Capital social (€)');

    remplirFormulaire();
    fireEvent.change(screen.getByLabelText("Part de l'associé 1 (%)"), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: /générer les statuts/i }));

    expect(await screen.findByText(/100 %/)).toBeInTheDocument();
    expect(appelsAvecMethode('POST')).toHaveLength(0);
  });

  it("affiche le message d'erreur renvoyé par l'API", async () => {
    mockApiRoutes({
      'GET /projects/p1/statuts': { status: 200, body: null },
      'POST /projects/p1/statuts': { status: 400, body: { message: 'Le capital doit être strictement positif.' } },
    });
    render(<StatutsSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm="SAS" onFormConfirmed={vi.fn()} />);
    await screen.findByLabelText('Capital social (€)');

    remplirFormulaire();
    fireEvent.click(screen.getByRole('button', { name: /générer les statuts/i }));

    expect(await screen.findByText('Le capital doit être strictement positif.')).toBeInTheDocument();
  });

  it('signale une saisie de capital illisible sans appeler l\'API', async () => {
    mockApiRoutes({ 'GET /projects/p1/statuts': { status: 200, body: null } });
    render(<StatutsSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm="SAS" onFormConfirmed={vi.fn()} />);
    await screen.findByLabelText('Capital social (€)');

    remplirFormulaire();
    fireEvent.change(screen.getByLabelText('Capital social (€)'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: /générer les statuts/i }));

    expect(await screen.findByText(/capital/i, { selector: 'p' })).toBeInTheDocument();
    expect(appelsAvecMethode('POST')).toHaveLength(0);
  });
});
