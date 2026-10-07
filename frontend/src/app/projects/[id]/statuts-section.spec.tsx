import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

    beforeEach(() => {
      // Retenir demande confirmation (irréversible) : accordée par défaut ici.
      vi.spyOn(window, 'confirm').mockReturnValue(true);
    });

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

    it('télécharge le PDF avec l’en-tête Authorization, et ne révoque l’URL blob qu’après un délai', async () => {
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
      // jsdom n'a pas ces fonctions : on les définit, puis on les espionne
      // (vi.restoreAllMocks les remet à l'état de départ après chaque test).
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: () => '' });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: () => undefined });
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:statuts');
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

      rendre();
      const bouton = await screen.findByRole('button', { name: /télécharger en pdf/i });
      // Seul setTimeout est simulé : les promesses (fetch simulé) restent réelles.
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      try {
        fireEvent.click(bouton);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });

        expect(clic).toHaveBeenCalledTimes(1);
        const appelPdf = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/projects/p1/statuts/pdf'));
        expect(appelPdf?.[1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
        expect(createObjectURL).toHaveBeenCalledTimes(1);
        // Pas de révocation synchrone : le téléchargement n'a pas encore démarré.
        expect(revokeObjectURL).not.toHaveBeenCalled();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(4000);
        });
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:statuts');
      } finally {
        vi.useRealTimers();
        delete (URL as unknown as Record<string, unknown>).createObjectURL;
        delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
      }
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

    it('forme exacte des réponses du serveur : Régénérer préremplit après génération, enregistrement et rétention', async () => {
      // Les routes de mutation rendent la même forme que le GET (associés
      // compris) ; ces corps reprennent les colonnes réelles de la ligne.
      const reponse = (overrides: Record<string, unknown> = {}) => ({
        id: 'b1',
        owner_id: 'u1',
        project_id: 'p1',
        legal_form: 'SASU',
        capital_cents: 250000,
        head_office: '5 avenue Foch',
        duration_years: 50,
        content: 'Texte serveur',
        status: 'brouillon',
        finalized_at: null,
        generated_by: 'igini',
        generated_model: 'claude-x',
        created_at: '2026-10-03T10:00:00.000Z',
        updated_at: '2026-10-03T10:00:00.000Z',
        associates: [{ id: 'a1', bylaws_id: 'b1', full_name: 'Carole', share_basis_points: 10000 }],
        ...overrides,
      });
      mockApiRoutes({
        'GET /projects/p1/statuts': { status: 200, body: null },
        'POST /projects/p1/statuts': { status: 201, body: reponse() },
        'PATCH /projects/p1/statuts': { status: 200, body: reponse({ content: 'Texte serveur revu' }) },
      });
      rendre();
      await screen.findByLabelText('Capital social (€)');
      remplirFormulaire();
      fireEvent.click(screen.getByRole('button', { name: /générer les statuts/i }));
      await screen.findByDisplayValue('Texte serveur');

      fireEvent.change(screen.getByLabelText('Texte des statuts'), { target: { value: 'Texte serveur revu' } });
      fireEvent.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Régénérer' })).toBeEnabled());
      await waitFor(() => expect(screen.queryByText('Modifications non enregistrées')).not.toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Régénérer' }));
      expect(screen.getByLabelText('Capital social (€)')).toHaveValue('2500');
      expect(screen.getByLabelText('Siège social')).toHaveValue('5 avenue Foch');
      expect(screen.getByLabelText('Durée de la société (années)')).toHaveValue('50');
      expect(screen.getByLabelText("Nom de l'associé 1")).toHaveValue('Carole');
    });

    it('ne plante pas si une réponse arrive sans associés : Régénérer ouvre un formulaire avec un associé vide', async () => {
      mockApiRoutes({
        'GET /projects/p1/statuts': { status: 200, body: null },
        'POST /projects/p1/statuts': {
          status: 201,
          body: { ...bylaws({ content: 'Texte sans associés' }), associates: undefined },
        },
      });
      rendre();
      await screen.findByLabelText('Capital social (€)');
      remplirFormulaire();
      fireEvent.click(screen.getByRole('button', { name: /générer les statuts/i }));
      await screen.findByDisplayValue('Texte sans associés');

      fireEvent.click(screen.getByRole('button', { name: 'Régénérer' }));
      expect(screen.getByLabelText('Capital social (€)')).toHaveValue('1000');
      expect(screen.getByLabelText("Nom de l'associé 1")).toHaveValue('');
    });

    it('bloque Retenir et le PDF tant que le texte modifié n’est pas enregistré', async () => {
      mockApiRoutes({
        'GET /projects/p1/statuts': { status: 200, body: brouillon() },
        'PATCH /projects/p1/statuts': { status: 200, body: { ...brouillon(), content: 'Texte revu' } },
      });
      rendre();
      expect(await screen.findByRole('button', { name: /retenir cette version/i })).toBeEnabled();
      expect(screen.queryByText('Modifications non enregistrées')).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Texte des statuts'), { target: { value: 'Texte revu' } });
      expect(screen.getByText('Modifications non enregistrées')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retenir cette version/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /télécharger en pdf/i })).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));
      await waitFor(() => expect(screen.queryByText('Modifications non enregistrées')).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: /retenir cette version/i })).toBeEnabled();
      expect(screen.getByRole('button', { name: /télécharger en pdf/i })).toBeEnabled();
    });

    it('avertit en brouillon comme en retenue : texte généré par IA, à faire relire par un professionnel', async () => {
      mockApiRoutes({ 'GET /projects/p1/statuts': { status: 200, body: brouillon() } });
      const { unmount } = rendre();
      await screen.findByDisplayValue('Article 1 — Forme');
      expect(screen.getByText(/généré par IA.*avocat, expert-comptable/i)).toBeInTheDocument();
      unmount();

      mockApiRoutes({
        'GET /projects/p1/statuts': {
          status: 200,
          body: { ...brouillon(), status: 'retenue', finalized_at: '2026-10-03T10:00:00.000Z' },
        },
      });
      rendre();
      await screen.findByText(/Version retenue le/);
      expect(screen.getByText(/généré par IA.*avocat, expert-comptable/i)).toBeInTheDocument();
    });

    it('la confirmation de Retenir dit que ce n’est pas une validation juridique', async () => {
      mockApiRoutes({ 'GET /projects/p1/statuts': { status: 200, body: brouillon() } });
      const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(false);
      rendre();
      fireEvent.click(await screen.findByRole('button', { name: /retenir cette version/i }));

      expect(confirmer).toHaveBeenCalledWith(expect.stringMatching(/pas une validation juridique/));
      expect(confirmer).toHaveBeenCalledWith(expect.stringMatching(/avocat, expert-comptable/));
    });

    it('repasse en « Chargement… » quand un rechargement démarre, au lieu de garder l’ancien contenu', async () => {
      mockApiRoutes({ 'GET /projects/p1/statuts': { status: 200, body: brouillon() } });
      const { rerender } = rendre();
      await screen.findByDisplayValue('Article 1 — Forme');

      // Un nouveau jeton relance le chargement ; la réponse n'arrive jamais ici.
      global.fetch = vi.fn().mockReturnValue(new Promise(() => undefined)) as unknown as typeof fetch;
      rerender(
        <StatutsSection token="tok-nouveau" projectId={PROJECT_ID} confirmedLegalForm="SASU" onFormConfirmed={vi.fn()} />,
      );

      expect(await screen.findByText('Chargement…')).toBeInTheDocument();
      expect(screen.queryByDisplayValue('Article 1 — Forme')).not.toBeInTheDocument();
    });

    it('ne retient rien si la confirmation est refusée', async () => {
      mockApiRoutes({ 'GET /projects/p1/statuts': { status: 200, body: brouillon() } });
      const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(false);
      rendre();
      fireEvent.click(await screen.findByRole('button', { name: /retenir cette version/i }));

      expect(confirmer).toHaveBeenCalledWith(expect.stringMatching(/définitivement/));
      expect(appelsAvecMethode('POST')).toHaveLength(0);
      expect(screen.getByRole('button', { name: /retenir cette version/i })).toBeEnabled();
    });

    it('retient après confirmation, en appelant POST /statuts/retenir', async () => {
      mockApiRoutes({
        'GET /projects/p1/statuts': { status: 200, body: brouillon() },
        'POST /projects/p1/statuts/retenir': {
          status: 201,
          body: { ...brouillon(), status: 'retenue', finalized_at: '2026-10-03T10:00:00.000Z' },
        },
      });
      rendre();
      fireEvent.click(await screen.findByRole('button', { name: /retenir cette version/i }));

      await screen.findByText(/Version retenue le/);
      const [url] = appelsAvecMethode('POST')[0];
      expect(String(url)).toMatch(/\/projects\/p1\/statuts\/retenir$/);
    });

    it('retire un associé à la régénération, et garde au moins une ligne', async () => {
      mockApiRoutes({
        'GET /projects/p1/statuts': { status: 200, body: brouillon() },
        'POST /projects/p1/statuts/regenerer': { status: 201, body: brouillon() },
      });
      rendre();
      fireEvent.click(await screen.findByRole('button', { name: 'Régénérer' }));

      fireEvent.click(screen.getByRole('button', { name: "Retirer l'associé 1" }));
      expect(screen.queryByLabelText("Nom de l'associé 2")).not.toBeInTheDocument();
      // Il reste Bob, devenu le premier : ses valeurs ont suivi la ligne.
      expect(screen.getByLabelText("Nom de l'associé 1")).toHaveValue('Bob');
      expect(screen.queryByRole('button', { name: /retirer l'associé/i })).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Part de l'associé 1 (%)"), { target: { value: '100' } });
      fireEvent.click(screen.getByRole('button', { name: /régénérer les statuts/i }));
      await waitFor(() => expect(appelsAvecMethode('POST')).toHaveLength(1));
      const [, options] = appelsAvecMethode('POST')[0];
      expect(JSON.parse(options.body).associates).toEqual([{ fullName: 'Bob', shareBasisPoints: 10000 }]);
    });

    it('sur une version retenue, l’avertissement de forme ne propose pas de régénérer', async () => {
      mockApiRoutes({
        'GET /projects/p1/statuts': {
          status: 200,
          body: { ...brouillon(), status: 'retenue', finalized_at: '2026-10-03T10:00:00.000Z' },
        },
      });
      rendre('SARL');
      expect(await screen.findByText(/verrouillée et ne peut plus être régénérée/i)).toBeInTheDocument();
      expect(screen.queryByText(/régénère si tu veux/i)).not.toBeInTheDocument();
    });

    it('n’affiche jamais le formulaire de génération quand le chargement échoue, et permet de réessayer', async () => {
      let appels = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        appels += 1;
        return Promise.resolve(
          appels === 1
            ? { ok: false, status: 500, json: () => Promise.resolve({ message: 'Serveur indisponible.' }) }
            : { ok: true, status: 200, json: () => Promise.resolve(brouillon()) },
        );
      }) as unknown as typeof fetch;
      rendre();

      expect(await screen.findByText('Serveur indisponible.')).toBeInTheDocument();
      expect(screen.queryByLabelText('Capital social (€)')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /générer les statuts/i })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
      expect(await screen.findByDisplayValue('Article 1 — Forme')).toBeInTheDocument();
      expect(screen.queryByText('Serveur indisponible.')).not.toBeInTheDocument();
    });

    it('permet de changer la forme confirmée, prérempli avec la forme actuelle', async () => {
      mockApiRoutes({
        'GET /projects/p1/statuts': { status: 200, body: brouillon() },
        'PATCH /projects/p1/forme-juridique': { status: 200, body: { id: 'p1', confirmed_legal_form: 'SARL' } },
      });
      const onFormConfirmed = vi.fn();
      render(<StatutsSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm="SASU" onFormConfirmed={onFormConfirmed} />);
      await screen.findByDisplayValue('Article 1 — Forme');
      expect(screen.queryByLabelText('Forme juridique')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /modifier la forme/i }));
      const select = screen.getByLabelText('Forme juridique');
      expect(select).toHaveValue('SASU');
      fireEvent.change(select, { target: { value: 'SARL' } });
      fireEvent.click(screen.getByRole('button', { name: /confirmer cette forme/i }));

      await waitFor(() => expect(onFormConfirmed).toHaveBeenCalledWith('SARL'));
      const [, options] = appelsAvecMethode('PATCH')[0];
      expect(JSON.parse(options.body)).toEqual({ legalForm: 'SARL' });
    });

    it('ne change pas la forme si on annule', async () => {
      mockApiRoutes({ 'GET /projects/p1/statuts': { status: 200, body: brouillon() } });
      rendre();
      await screen.findByDisplayValue('Article 1 — Forme');
      fireEvent.click(screen.getByRole('button', { name: /modifier la forme/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
      expect(screen.queryByLabelText('Forme juridique')).not.toBeInTheDocument();
      expect(appelsAvecMethode('PATCH')).toHaveLength(0);
    });

    it('ne montre jamais le formulaire vide quand la forme est confirmée et que des statuts existent', async () => {
      mockApiRoutes({ 'GET /projects/p1/statuts': { status: 200, body: brouillon() } });
      const { rerender, container } = render(
        <StatutsSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm={null} onFormConfirmed={vi.fn()} />,
      );
      await screen.findByLabelText('Forme juridique');

      // On enregistre tout nœud ajouté au DOM à partir de maintenant, même
      // s'il est retiré juste après : un clignotement d'un seul rendu serait
      // invisible à une vérification faite après coup, pas à un observateur.
      const champsAjoutes: string[] = [];
      const observateur = new MutationObserver((mutations) => {
        for (const m of mutations) {
          m.addedNodes.forEach((n) => {
            if (n instanceof Element && (n.id === 'statuts-capital' || n.querySelector('#statuts-capital'))) {
              champsAjoutes.push('statuts-capital');
            }
          });
        }
      });
      observateur.observe(container, { childList: true, subtree: true });

      rerender(
        <StatutsSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm="SASU" onFormConfirmed={vi.fn()} />,
      );
      expect(screen.getByText('Chargement…')).toBeInTheDocument();
      expect(await screen.findByDisplayValue('Article 1 — Forme')).toBeInTheDocument();
      observateur.disconnect();
      expect(champsAjoutes).toEqual([]);
    });
  });

  describe('forme juridique à confirmer', () => {
    it('présélectionne la dernière recommandation de Former', async () => {
      mockApiRoutes({
        'GET /projects/p1/legal-forms': {
          status: 200,
          body: [{ id: 'r2', recommended_form: 'SARL' }, { id: 'r1', recommended_form: 'SAS' }],
        },
      });
      render(<StatutsSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm={null} onFormConfirmed={vi.fn()} />);

      await waitFor(() => expect(screen.getByLabelText('Forme juridique')).toHaveValue('SARL'));
      expect(screen.getByRole('button', { name: /confirmer cette forme/i })).toBeEnabled();
    });

    it('sans recommandation : aucune présélection, et Confirmer reste désactivé tant qu’aucune forme n’est choisie', async () => {
      mockApiRoutes({ 'GET /projects/p1/legal-forms': { status: 200, body: [] } });
      render(<StatutsSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm={null} onFormConfirmed={vi.fn()} />);

      const select = await screen.findByLabelText('Forme juridique');
      expect(select).toHaveValue('');
      expect(screen.getByRole('button', { name: /confirmer cette forme/i })).toBeDisabled();

      fireEvent.change(select, { target: { value: 'EURL' } });
      expect(screen.getByRole('button', { name: /confirmer cette forme/i })).toBeEnabled();
    });
  });
});
