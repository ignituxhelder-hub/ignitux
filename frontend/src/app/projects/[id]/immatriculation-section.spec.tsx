import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, OfflineReadError } from '@/lib/api';
import { euros } from '@/lib/montants';
import { mockApiRoutes } from '@/test-utils/mocks';
import { ImmatriculationSection } from './immatriculation-section';

const TOKEN = 'tok123';
const PROJECT_ID = 'p1';
const ROUTE = '/projects/p1/immatriculation';
const AVIS = /Ces informations viennent de toi \(Kbis, avis de situation\)\. Ignitux ne les vérifie pas auprès de l.État\./;

function fiche(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    projectId: 'p1',
    siren: '732829320',
    siret: '73282932000074',
    vatNumber: 'FR44732829320',
    legalName: 'Moto École SAS',
    headOffice: '1 rue de la Piste, 75001 Paris',
    registeredOn: '2026-10-01',
    capitalEntryId: null,
    createdAt: '2026-10-10T08:00:00.000Z',
    updatedAt: '2026-10-10T08:00:00.000Z',
    ...overrides,
  };
}

/** 1 000 € tel que l'affiche le helper commun (séparateur des milliers compris). */
const MILLE = euros(100000);

const SUGGESTION = { legalName: 'École motocross', headOffice: '1 rue des Statuts, 75002 Paris' };

const SANS_FICHE = { proposition: null, dejaEnregistree: false, raison: 'Saisis d’abord la fiche d’immatriculation.' };

function proposition(dejaEnregistree = false) {
  return {
    proposition: {
      montantCents: 100000,
      libelle: 'Apport en capital — Moto École SAS',
      date: '2026-10-01',
      lignes: [
        { compte: '512', libelleCompte: 'Banque', natureCompte: 'actif', debitCents: 100000, creditCents: 0 },
        { compte: '101', libelleCompte: 'Capital social', natureCompte: 'capitaux_propres', debitCents: 0, creditCents: 100000 },
      ],
    },
    dejaEnregistree,
    raison: null,
  };
}

function appels(methode: string, suffixe = '') {
  const mock = global.fetch as unknown as ReturnType<typeof vi.fn>;
  return mock.mock.calls.filter(
    ([url, options]) => (options?.method ?? 'GET') === methode && new URL(String(url)).pathname === `${ROUTE}${suffixe}`,
  );
}

function rendre(onChanged?: () => void) {
  return render(<ImmatriculationSection token={TOKEN} projectId={PROJECT_ID} onChanged={onChanged} />);
}

describe('ImmatriculationSection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sans fiche : formulaire étiqueté, pré-rempli depuis la suggestion et marqué « à confirmer », avis permanent', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: { registration: null, suggestion: SUGGESTION } },
      [`GET ${ROUTE}/capital`]: { status: 200, body: SANS_FICHE },
    });
    rendre();

    expect(await screen.findByLabelText('SIREN (9 chiffres, obligatoire)')).toHaveValue('');
    expect(screen.getByText(AVIS)).toBeInTheDocument();
    expect(screen.getByLabelText('SIRET du siège (14 chiffres, facultatif)')).toHaveValue('');
    expect(screen.getByLabelText('Numéro de TVA intracommunautaire (facultatif)')).toHaveValue('');
    expect(screen.getByLabelText('Date d’immatriculation (obligatoire)')).toHaveAttribute('type', 'date');

    const denomination = screen.getByLabelText('Dénomination (obligatoire)');
    expect(denomination).toHaveValue('École motocross');
    expect(denomination).toHaveAccessibleDescription(/à confirmer/);
    const siege = screen.getByLabelText('Adresse du siège (obligatoire)');
    expect(siege).toHaveValue('1 rue des Statuts, 75002 Paris');
    expect(siege).toHaveAccessibleDescription(/à confirmer/);
    expect(screen.getByText(/pré-remplis : à confirmer avec ton Kbis/)).toBeInTheDocument();

    // Une valeur modifiée n'est plus présentée comme une proposition.
    fireEvent.change(siege, { target: { value: '9 avenue du Kbis' } });
    expect(siege).not.toHaveAccessibleDescription(/à confirmer/);

    // Pas de proposition de capital : la raison du serveur, pas de bouton.
    expect(screen.getByText('Saisis d’abord la fiche d’immatriculation.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enregistrer cette écriture/i })).not.toBeInTheDocument();
  });

  it('sans suggestion : rien n’est pré-rempli ni marqué « à confirmer »', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: { registration: null, suggestion: null } },
      [`GET ${ROUTE}/capital`]: { status: 200, body: SANS_FICHE },
    });
    rendre();

    expect(await screen.findByLabelText('Dénomination (obligatoire)')).toHaveValue('');
    expect(screen.getByLabelText('Adresse du siège (obligatoire)')).toHaveValue('');
    expect(screen.queryByText(/à confirmer/)).not.toBeInTheDocument();
  });

  it('enregistre la fiche (champs nettoyés, facultatifs vides à null), affiche la réponse et prévient la page', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: { registration: null, suggestion: null } },
      [`GET ${ROUTE}/capital`]: { status: 200, body: SANS_FICHE },
      [`PUT ${ROUTE}`]: {
        status: 200,
        body: { registration: fiche({ siret: null, vatNumber: null }), suggestion: null },
      },
    });
    const onChanged = vi.fn();
    rendre(onChanged);

    fireEvent.change(await screen.findByLabelText('SIREN (9 chiffres, obligatoire)'), {
      target: { value: ' 732 829 320 ' },
    });
    fireEvent.change(screen.getByLabelText('SIRET du siège (14 chiffres, facultatif)'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('Dénomination (obligatoire)'), { target: { value: ' Moto École SAS ' } });
    fireEvent.change(screen.getByLabelText('Adresse du siège (obligatoire)'), {
      target: { value: '1 rue de la Piste, 75001 Paris' },
    });
    fireEvent.change(screen.getByLabelText('Date d’immatriculation (obligatoire)'), {
      target: { value: '2026-10-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la fiche' }));

    expect(await screen.findByText('Fiche enregistrée.')).toBeInTheDocument();
    const [, options] = appels('PUT')[0];
    expect(options.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(options.body)).toEqual({
      siren: '732 829 320',
      siret: null,
      vatNumber: null,
      legalName: 'Moto École SAS',
      headOffice: '1 rue de la Piste, 75001 Paris',
      registeredOn: '2026-10-01',
    });
    // Ce que le serveur a enregistré, en toutes lettres.
    expect(screen.getByText('Immatriculée')).toBeInTheDocument();
    expect(screen.getByText('732829320')).toBeInTheDocument();
    expect(screen.getAllByText('Non renseigné')).toHaveLength(2);
    expect(screen.queryByLabelText('SIREN (9 chiffres, obligatoire)')).not.toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
    // L'écriture de capital proposée dépend de la fiche : relue.
    await waitFor(() => expect(appels('GET', '/capital')).toHaveLength(2));
  });

  it('montre toutes les erreurs de validation du serveur, et rien comme enregistré', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: { registration: null, suggestion: null } },
      [`GET ${ROUTE}/capital`]: { status: 200, body: SANS_FICHE },
      [`PUT ${ROUTE}`]: {
        status: 400,
        body: { message: ['Le SIREN doit compter 9 chiffres.', 'La date d’immatriculation est invalide.'] },
      },
    });
    const onChanged = vi.fn();
    rendre(onChanged);

    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer la fiche' }));

    const alerte = await screen.findByRole('alert');
    expect(within(alerte).getByText('Le SIREN doit compter 9 chiffres.')).toBeInTheDocument();
    expect(within(alerte).getByText('La date d’immatriculation est invalide.')).toBeInTheDocument();
    expect(screen.getByLabelText('SIREN (9 chiffres, obligatoire)')).toBeInTheDocument();
    expect(screen.queryByText('Immatriculée')).not.toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('montre le conflit (409) du serveur : SIREN déjà utilisé ailleurs', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: { registration: null, suggestion: null } },
      [`GET ${ROUTE}/capital`]: { status: 200, body: SANS_FICHE },
      [`PUT ${ROUTE}`]: {
        status: 409,
        body: { message: 'Ce SIREN est déjà enregistré sur un autre de tes projets.' },
      },
    });
    rendre();

    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer la fiche' }));

    expect(await screen.findByText('Ce SIREN est déjà enregistré sur un autre de tes projets.')).toBeInTheDocument();
  });

  it('avec une fiche : la montre, et « Modifier » part de la fiche, jamais de la suggestion', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: { registration: fiche(), suggestion: SUGGESTION } },
      [`GET ${ROUTE}/capital`]: { status: 200, body: proposition() },
    });
    rendre();

    expect(await screen.findByText('Moto École SAS')).toBeInTheDocument();
    expect(screen.getByText('73282932000074')).toBeInTheDocument();
    expect(screen.getByText('FR44732829320')).toBeInTheDocument();
    expect(screen.getAllByText(/01\/10\/2026/).length).toBeGreaterThan(0);
    expect(screen.getByText(AVIS)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Modifier la fiche' }));

    expect(screen.getByLabelText('Dénomination (obligatoire)')).toHaveValue('Moto École SAS');
    expect(screen.getByLabelText('Adresse du siège (obligatoire)')).toHaveValue('1 rue de la Piste, 75001 Paris');
    expect(screen.getByLabelText('Date d’immatriculation (obligatoire)')).toHaveValue('2026-10-01');
    expect(screen.queryByText(/à confirmer/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByLabelText('SIREN (9 chiffres, obligatoire)')).not.toBeInTheDocument();
  });

  it('supprimer demande confirmation : refusée, rien n’est envoyé', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: { registration: fiche(), suggestion: null } },
      [`GET ${ROUTE}/capital`]: { status: 200, body: proposition() },
    });
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(false);
    rendre();

    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer la fiche' }));

    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(appels('DELETE')).toHaveLength(0);
    expect(screen.getByText('Moto École SAS')).toBeInTheDocument();
  });

  it('supprimer, une fois confirmé, revient au formulaire et prévient la page', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: { registration: fiche(), suggestion: null } },
      [`GET ${ROUTE}/capital`]: { status: 200, body: proposition() },
      [`DELETE ${ROUTE}`]: { status: 200, body: { registration: null, suggestion: SUGGESTION } },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onChanged = vi.fn();
    rendre(onChanged);

    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer la fiche' }));

    expect(await screen.findByText('Fiche supprimée.')).toBeInTheDocument();
    expect(appels('DELETE')[0][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(screen.getByLabelText('SIREN (9 chiffres, obligatoire)')).toHaveValue('');
    expect(screen.getByLabelText('Dénomination (obligatoire)')).toHaveValue('École motocross');
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('montre le refus (409) de suppression du serveur', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: { registration: fiche(), suggestion: null } },
      [`GET ${ROUTE}/capital`]: { status: 200, body: proposition() },
      [`DELETE ${ROUTE}`]: {
        status: 409,
        body: { message: 'La fiche vient de changer (écriture de capital enregistrée ?). Recharge la page.' },
      },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    rendre();

    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer la fiche' }));

    expect(
      await screen.findByText('La fiche vient de changer (écriture de capital enregistrée ?). Recharge la page.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Moto École SAS')).toBeInTheDocument();
  });

  it('une fiche avec une écriture de capital ne propose plus la suppression, et dit pourquoi', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: { registration: fiche({ capitalEntryId: 'e1' }), suggestion: null } },
      [`GET ${ROUTE}/capital`]: { status: 200, body: proposition(true) },
    });
    rendre();

    expect(await screen.findByText(/elle ne peut plus être supprimée/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer la fiche' })).not.toBeInTheDocument();
  });

  it('montre l’écriture de capital proposée : comptes, débit et crédit en euros', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: { registration: fiche(), suggestion: null } },
      [`GET ${ROUTE}/capital`]: { status: 200, body: proposition() },
    });
    rendre();

    const tableau = await screen.findByRole('table');
    const lignes = within(tableau).getAllByRole('row');
    expect(within(lignes[1]).getByText('512')).toBeInTheDocument();
    expect(within(lignes[1]).getByText('Banque')).toBeInTheDocument();
    expect(within(lignes[1]).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '512',
      'Banque',
      MILLE,
      '—',
    ]);
    expect(within(lignes[2]).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '101',
      'Capital social',
      '—',
      MILLE,
    ]);
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === `Écriture proposée : Apport en capital — Moto École SAS, le 01/10/2026, pour ${MILLE}.`),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer cette écriture dans ma comptabilité' })).toBeEnabled();
  });

  it('n’enregistre jamais l’écriture de capital sans confirmation', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: { registration: fiche(), suggestion: null } },
      [`GET ${ROUTE}/capital`]: { status: 200, body: proposition() },
    });
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(false);
    rendre();

    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer cette écriture dans ma comptabilité' }));

    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(String(confirmer.mock.calls[0][0])).toContain(MILLE);
    expect(String(confirmer.mock.calls[0][0])).toContain('512');
    expect(String(confirmer.mock.calls[0][0])).toContain('101');
    expect(appels('POST', '/capital')).toHaveLength(0);
  });

  it('enregistre l’écriture de capital une fois confirmée, puis la montre « déjà enregistrée »', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: { registration: fiche(), suggestion: null } },
      [`GET ${ROUTE}/capital`]: { status: 200, body: proposition() },
      [`POST ${ROUTE}/capital`]: { status: 201, body: { entryId: 'e1', ...proposition(true) } },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    rendre();

    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer cette écriture dans ma comptabilité' }));

    expect(await screen.findByText('Écriture de capital enregistrée dans ta comptabilité.')).toBeInTheDocument();
    expect(appels('POST', '/capital')).toHaveLength(1);
    expect(appels('POST', '/capital')[0][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(screen.getByText(/Déjà enregistrée/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enregistrer cette écriture/i })).not.toBeInTheDocument();
    // La fiche porte maintenant l'écriture : plus de suppression.
    expect(screen.queryByRole('button', { name: 'Supprimer la fiche' })).not.toBeInTheDocument();
  });

  it('une écriture déjà enregistrée : l’état en toutes lettres, sans bouton', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: { registration: fiche({ capitalEntryId: 'e1' }), suggestion: null } },
      [`GET ${ROUTE}/capital`]: { status: 200, body: proposition(true) },
    });
    rendre();

    expect(await screen.findByText(/Déjà enregistrée/)).toBeInTheDocument();
    expect(screen.getByText(/L’écriture de capital est déjà dans ta comptabilité/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enregistrer cette écriture/i })).not.toBeInTheDocument();
  });

  it('un double enregistrement (409) montre le message du serveur et relit l’état réel', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: { registration: fiche(), suggestion: null } },
      [`GET ${ROUTE}/capital`]: { status: 200, body: proposition() },
      [`POST ${ROUTE}/capital`]: {
        status: 409,
        body: { message: 'L’écriture de capital a déjà été enregistrée pour cette fiche.' },
      },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    rendre();

    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer cette écriture dans ma comptabilité' }));

    expect(
      await screen.findByText('L’écriture de capital a déjà été enregistrée pour cette fiche.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(appels('GET', '/capital')).toHaveLength(2));
  });

  it('pas de proposition (micro-entreprise) : la raison du serveur', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: { registration: fiche(), suggestion: null } },
      [`GET ${ROUTE}/capital`]: {
        status: 200,
        body: {
          proposition: null,
          dejaEnregistree: false,
          raison: 'Cette forme juridique n’a pas de capital social : aucune écriture de capital à proposer.',
        },
      },
    });
    rendre();

    expect(await screen.findByText(/n’a pas de capital social/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('un chargement échoué montre l’erreur et « Réessayer », jamais un formulaire vide', async () => {
    let n = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      n += 1;
      const capital = new URL(String(url)).pathname.endsWith('/capital');
      return Promise.resolve(
        n <= 2
          ? { ok: false, status: 500, json: () => Promise.resolve({ message: 'Serveur indisponible.' }) }
          : { ok: true, status: 200, json: () => Promise.resolve(capital ? SANS_FICHE : { registration: null, suggestion: null }) },
      );
    }) as unknown as typeof fetch;
    rendre();

    expect(await screen.findByText('Serveur indisponible.')).toBeInTheDocument();
    expect(screen.queryByLabelText('SIREN (9 chiffres, obligatoire)')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByLabelText('SIREN (9 chiffres, obligatoire)')).toBeInTheDocument();
    expect(screen.queryByText('Serveur indisponible.')).not.toBeInTheDocument();
  });

  it('hors ligne, n’affiche pas la copie en cache : erreur et « Réessayer »', async () => {
    vi.spyOn(api, 'getImmatriculation').mockRejectedValue(
      new OfflineReadError({ registration: fiche(), suggestion: null }, '2026-10-01T10:00:00.000Z'),
    );
    vi.spyOn(api, 'getCapitalImmatriculation').mockResolvedValue(SANS_FICHE);
    rendre();

    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.getByText(/pas de réseau/i)).toBeInTheDocument();
    expect(screen.queryByText('Moto École SAS')).not.toBeInTheDocument();
  });

  it('une réponse illisible est traitée comme un échec', async () => {
    mockApiRoutes({ [`GET ${ROUTE}`]: { status: 200, body: [] }, [`GET ${ROUTE}/capital`]: { status: 200, body: SANS_FICHE } });
    rendre();

    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.queryByLabelText('SIREN (9 chiffres, obligatoire)')).not.toBeInTheDocument();
  });

  it('ignore une réponse de chargement périmée qui arrive après la plus récente', async () => {
    const resolveurs = new Map<string, Array<(r: unknown) => void>>();
    global.fetch = vi.fn().mockImplementation(
      (url: string) =>
        new Promise((resolve) => {
          const chemin = new URL(String(url)).pathname;
          resolveurs.set(chemin, [...(resolveurs.get(chemin) ?? []), resolve]);
        }),
    ) as unknown as typeof fetch;
    const reponse = (corps: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(corps) });

    const { rerender } = render(<ImmatriculationSection token={TOKEN} projectId="p1" />);
    await waitFor(() => expect(resolveurs.get('/projects/p1/immatriculation')).toHaveLength(1));
    rerender(<ImmatriculationSection token={TOKEN} projectId="p2" />);
    await waitFor(() => expect(resolveurs.get('/projects/p2/immatriculation')).toHaveLength(1));

    // Le projet le plus récent (p2) répond d'abord, l'ancien (p1) ensuite.
    await act(async () => {
      resolveurs.get('/projects/p2/immatriculation')![0](
        reponse({ registration: fiche({ projectId: 'p2', legalName: 'Société P2' }), suggestion: null }),
      );
      resolveurs.get('/projects/p2/immatriculation/capital')![0](reponse(proposition()));
    });
    expect(await screen.findByText('Société P2')).toBeInTheDocument();
    await act(async () => {
      resolveurs.get('/projects/p1/immatriculation')![0](
        reponse({ registration: fiche({ legalName: 'Société P1' }), suggestion: null }),
      );
      resolveurs.get('/projects/p1/immatriculation/capital')![0](reponse(proposition()));
    });

    expect(screen.getByText('Société P2')).toBeInTheDocument();
    expect(screen.queryByText('Société P1')).not.toBeInTheDocument();
  });
});
