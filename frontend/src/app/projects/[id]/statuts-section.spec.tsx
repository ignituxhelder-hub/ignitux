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

  describe('répartition des parts', () => {
    async function remplirTroisAssocies(parts: [string, string, string]) {
      await screen.findByLabelText('Capital social (€)');
      remplirFormulaire();
      fireEvent.change(screen.getByLabelText("Part de l'associé 1 (%)"), { target: { value: parts[0] } });
      for (const n of [2, 3]) {
        fireEvent.click(screen.getByRole('button', { name: /ajouter un associé/i }));
        fireEvent.change(screen.getByLabelText(`Nom de l'associé ${n}`), { target: { value: `Associé ${n}` } });
        fireEvent.change(screen.getByLabelText(`Part de l'associé ${n} (%)`), { target: { value: parts[n - 1] } });
      }
      fireEvent.click(screen.getByRole('button', { name: /générer les statuts/i }));
    }

    it('accepte 33,33 / 33,33 / 33,34 (total exact) et envoie 3333 / 3333 / 3334', async () => {
      mockApiRoutes({
        'GET /projects/p1/statuts': { status: 200, body: null },
        'POST /projects/p1/statuts': { status: 201, body: bylaws() },
      });
      render(<StatutsSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm="SAS" onFormConfirmed={vi.fn()} />);
      await remplirTroisAssocies(['33,33', '33,33', '33,34']);

      await waitFor(() => expect(appelsAvecMethode('POST')).toHaveLength(1));
      const [, options] = appelsAvecMethode('POST')[0];
      expect(JSON.parse(options.body).associates.map((a: { shareBasisPoints: number }) => a.shareBasisPoints)).toEqual([
        3333, 3333, 3334,
      ]);
    });

    it('refuse 33,33 x 3 (99,99 %) avec le message français, sans appel POST', async () => {
      mockApiRoutes({ 'GET /projects/p1/statuts': { status: 200, body: null } });
      render(<StatutsSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm="SAS" onFormConfirmed={vi.fn()} />);
      await remplirTroisAssocies(['33,33', '33,33', '33,33']);

      expect(await screen.findByText('Les parts des associés doivent totaliser exactement 100 %.')).toBeInTheDocument();
      expect(appelsAvecMethode('POST')).toHaveLength(0);
    });
  });

  describe('avec des statuts existants', () => {
    const associes = [
      { id: 'a1', full_name: 'Alice', share_basis_points: 6667 },
      { id: 'a2', full_name: 'Bob', share_basis_points: 3333 },
    ];
    const brouillon = () => bylaws({ content: 'Article 1 — Forme', associates: associes });

    function rendre(forme = 'SASU') {
      return render(
        <StatutsSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm={forme} onFormConfirmed={vi.fn()} />,
      );
    }

    it('affiche un brouillon : texte, avertissement et actions', async () => {
      mockApiRoutes({ 'GET /projects/p1/statuts': { status: 200, body: brouillon() } });
      rendre();

      expect(await screen.findByDisplayValue('Article 1 — Forme')).not.toHaveAttribute('readonly');
      expect(screen.getByText(/brouillon à relire/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /enregistrer les modifications/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Régénérer' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retenir cette version/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /télécharger en pdf/i })).toBeInTheDocument();
      expect(screen.queryByLabelText('Capital social (€)')).not.toBeInTheDocument();
    });

    it('affiche une version retenue en lecture seule, sans action, avec sa date', async () => {
      mockApiRoutes({
        'GET /projects/p1/statuts': {
          status: 200,
          body: { ...brouillon(), status: 'retenue', finalized_at: '2026-10-03T10:00:00.000Z' },
        },
      });
      rendre();

      expect(await screen.findByDisplayValue('Article 1 — Forme')).toHaveAttribute('readonly');
      expect(screen.getByText('Version retenue le 03/10/2026')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /retenir cette version/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /enregistrer les modifications/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Régénérer' })).not.toBeInTheDocument();
      expect(screen.queryByText(/brouillon à relire/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /télécharger en pdf/i })).toBeInTheDocument();
    });

    it('avertit quand la forme confirmée a changé depuis la génération', async () => {
      mockApiRoutes({ 'GET /projects/p1/statuts': { status: 200, body: brouillon() } });
      rendre('SARL');
      expect(await screen.findByText(/n'a pas suivi ce changement/i)).toBeInTheDocument();
    });

    it("n'avertit pas quand la forme confirmée correspond toujours", async () => {
      mockApiRoutes({ 'GET /projects/p1/statuts': { status: 200, body: brouillon() } });
      rendre('SASU');
      await screen.findByDisplayValue('Article 1 — Forme');
      expect(screen.queryByText(/n'a pas suivi ce changement/i)).not.toBeInTheDocument();
    });

    it('enregistre le texte modifié par un PATCH { content }', async () => {
      mockApiRoutes({
        'GET /projects/p1/statuts': { status: 200, body: brouillon() },
        'PATCH /projects/p1/statuts': { status: 200, body: { ...brouillon(), content: 'Texte revu' } },
      });
      rendre();
      fireEvent.change(await screen.findByLabelText('Texte des statuts'), { target: { value: 'Texte revu' } });
      fireEvent.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));

      await waitFor(() => expect(appelsAvecMethode('PATCH')).toHaveLength(1));
      const [, options] = appelsAvecMethode('PATCH')[0];
      expect(JSON.parse(options.body)).toEqual({ content: 'Texte revu' });
    });

    it('retient la version : POST retenir puis passage en lecture seule', async () => {
      mockApiRoutes({
        'GET /projects/p1/statuts': { status: 200, body: brouillon() },
        'POST /projects/p1/statuts/retenir': {
          status: 201,
          body: { ...brouillon(), status: 'retenue', finalized_at: '2026-10-03T10:00:00.000Z' },
        },
      });
      rendre();
      fireEvent.click(await screen.findByRole('button', { name: /retenir cette version/i }));

      expect(await screen.findByText(/Version retenue le/)).toBeInTheDocument();
      expect(appelsAvecMethode('POST')).toHaveLength(1);
      expect(screen.getByLabelText('Texte des statuts')).toHaveAttribute('readonly');
      expect(screen.queryByRole('button', { name: /retenir cette version/i })).not.toBeInTheDocument();
    });

    it('préremplit le formulaire pour régénérer, avertit, puis envoie le corps de régénération', async () => {
      mockApiRoutes({
        'GET /projects/p1/statuts': { status: 200, body: brouillon() },
        'POST /projects/p1/statuts/regenerer': { status: 201, body: { ...brouillon(), content: 'Nouveau texte' } },
      });
      rendre();
      fireEvent.click(await screen.findByRole('button', { name: 'Régénérer' }));

      expect(screen.getByText(/seront perdues/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Capital social (€)')).toHaveValue('1000');
      expect(screen.getByLabelText('Siège social')).toHaveValue('1 rue de Paris');
      expect(screen.getByLabelText('Durée de la société (années)')).toHaveValue('99');
      expect(screen.getByLabelText("Nom de l'associé 1")).toHaveValue('Alice');
      expect(screen.getByLabelText("Part de l'associé 1 (%)")).toHaveValue('66,67');
      expect(screen.getByLabelText("Part de l'associé 2 (%)")).toHaveValue('33,33');

      fireEvent.click(screen.getByRole('button', { name: /régénérer les statuts/i }));

      expect(await screen.findByDisplayValue('Nouveau texte')).toBeInTheDocument();
      const [url, options] = appelsAvecMethode('POST')[0];
      expect(String(url)).toMatch(/\/projects\/p1\/statuts\/regenerer$/);
      expect(JSON.parse(options.body)).toEqual({
        capitalCents: 100000,
        headOffice: '1 rue de Paris',
        durationYears: 99,
        associates: [
          { fullName: 'Alice', shareBasisPoints: 6667 },
          { fullName: 'Bob', shareBasisPoints: 3333 },
        ],
      });
    });

    it('permet d’annuler la régénération sans rien envoyer', async () => {
      mockApiRoutes({ 'GET /projects/p1/statuts': { status: 200, body: brouillon() } });
      rendre();
      fireEvent.click(await screen.findByRole('button', { name: 'Régénérer' }));
      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

      expect(await screen.findByDisplayValue('Article 1 — Forme')).toBeInTheDocument();
      expect(appelsAvecMethode('POST')).toHaveLength(0);
    });

    it('affiche le texte généré juste après une génération', async () => {
      mockApiRoutes({
        'GET /projects/p1/statuts': { status: 200, body: null },
        'POST /projects/p1/statuts': { status: 201, body: bylaws({ content: 'Texte tout juste généré' }) },
      });
      rendre();
      await screen.findByLabelText('Capital social (€)');
      remplirFormulaire();
      fireEvent.click(screen.getByRole('button', { name: /générer les statuts/i }));

      expect(await screen.findByDisplayValue('Texte tout juste généré')).toBeInTheDocument();
    });

    it('télécharge le PDF avec l’en-tête Authorization, via un lien blob temporaire', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        const pdf = String(url).endsWith('/statuts/pdf');
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(pdf ? null : brouillon()),
          blob: () => Promise.resolve(new Blob(['%PDF'])),
        });
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      const createObjectURL = vi.fn().mockReturnValue('blob:statuts');
      const revokeObjectURL = vi.fn();
      Object.assign(URL, { createObjectURL, revokeObjectURL });
      const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

      rendre();
      fireEvent.click(await screen.findByRole('button', { name: /télécharger en pdf/i }));

      await waitFor(() => expect(clic).toHaveBeenCalledTimes(1));
      const appelPdf = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/projects/p1/statuts/pdf'));
      expect(appelPdf?.[1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      // Jamais révoquée de façon synchrone : le téléchargement n'a pas encore démarré.
      expect(revokeObjectURL).not.toHaveBeenCalled();
    });

    it("montre l'erreur de l'API quand l'enregistrement échoue", async () => {
      mockApiRoutes({
        'GET /projects/p1/statuts': { status: 200, body: brouillon() },
        'PATCH /projects/p1/statuts': { status: 400, body: { message: 'Contenu trop long.' } },
      });
      rendre();
      fireEvent.click(await screen.findByRole('button', { name: /enregistrer les modifications/i }));
      expect(await screen.findByText('Contenu trop long.')).toBeInTheDocument();
    });

    it("montre l'erreur de l'API quand la rétention échoue", async () => {
      mockApiRoutes({
        'GET /projects/p1/statuts': { status: 200, body: brouillon() },
        'POST /projects/p1/statuts/retenir': { status: 409, body: { message: 'Déjà retenue.' } },
      });
      rendre();
      fireEvent.click(await screen.findByRole('button', { name: /retenir cette version/i }));
      expect(await screen.findByText('Déjà retenue.')).toBeInTheDocument();
    });

    it("montre l'erreur de la régénération", async () => {
      mockApiRoutes({
        'GET /projects/p1/statuts': { status: 200, body: brouillon() },
        'POST /projects/p1/statuts/regenerer': { status: 400, body: { message: 'Régénération refusée.' } },
      });
      rendre();
      fireEvent.click(await screen.findByRole('button', { name: 'Régénérer' }));
      fireEvent.click(screen.getByRole('button', { name: /régénérer les statuts/i }));
      expect(await screen.findByText('Régénération refusée.')).toBeInTheDocument();
    });

    it('montre une erreur quand le téléchargement du PDF échoue', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
          String(url).endsWith('/statuts/pdf')
            ? { ok: false, status: 500, json: () => Promise.resolve(null) }
            : { ok: true, status: 200, json: () => Promise.resolve(brouillon()) },
        ),
      ) as unknown as typeof fetch;
      rendre();
      fireEvent.click(await screen.findByRole('button', { name: /télécharger en pdf/i }));
      expect(await screen.findByText('Impossible de télécharger le PDF.')).toBeInTheDocument();
    });

    it('désactive les actions pendant un enregistrement (pas de double envoi)', async () => {
      let resoudre: (r: unknown) => void = () => undefined;
      global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (options?.method === 'PATCH') {
          return new Promise((resolve) => {
            resoudre = resolve;
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(brouillon()) });
      }) as unknown as typeof fetch;
      rendre();
      fireEvent.click(await screen.findByRole('button', { name: /enregistrer les modifications/i }));

      expect(await screen.findByRole('button', { name: /enregistrement…/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /retenir cette version/i })).toBeDisabled();
      resoudre({ ok: true, status: 200, json: () => Promise.resolve(brouillon()) });
      await waitFor(() => expect(screen.getByRole('button', { name: /retenir cette version/i })).toBeEnabled());
    });

    it('ne montre jamais le formulaire vide quand la forme est confirmée et que des statuts existent', async () => {
      mockApiRoutes({ 'GET /projects/p1/statuts': { status: 200, body: brouillon() } });
      const { rerender } = render(
        <StatutsSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm={null} onFormConfirmed={vi.fn()} />,
      );
      await screen.findByLabelText('Forme juridique');

      rerender(
        <StatutsSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm="SASU" onFormConfirmed={vi.fn()} />,
      );
      // Dès le rendu qui suit la confirmation : chargement, pas de formulaire.
      expect(screen.queryByLabelText('Capital social (€)')).not.toBeInTheDocument();
      expect(screen.getByText('Chargement…')).toBeInTheDocument();
      expect(await screen.findByDisplayValue('Article 1 — Forme')).toBeInTheDocument();
      expect(screen.queryByLabelText('Capital social (€)')).not.toBeInTheDocument();
    });
  });
});
