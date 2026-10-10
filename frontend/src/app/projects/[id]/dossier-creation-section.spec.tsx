import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, OfflineReadError } from '@/lib/api';
import { mockApiRoutes } from '@/test-utils/mocks';
import { DossierCreationSection } from './dossier-creation-section';

const TOKEN = 'tok123';
const PROJECT_ID = 'p1';
const ROUTE = '/projects/p1/dossier-creation';

function dossier(overrides: Record<string, unknown> = {}, filing: Record<string, unknown> = {}) {
  return {
    forme: 'SAS',
    pieces: [
      { id: 'forme_confirmee', titre: 'Forme juridique confirmée', etat: 'pret', detail: 'SAS', cochable: false },
      { id: 'statuts', titre: 'Statuts retenus', etat: 'a_faire', detail: 'Statuts en brouillon.', cochable: false },
      {
        id: 'justificatif_siege',
        titre: 'Justificatif de siège',
        etat: 'a_faire',
        detail: 'Bail, facture ou contrat de domiciliation.',
        cochable: true,
      },
      { id: 'capital_depose', titre: 'Attestation de dépôt du capital', etat: 'a_faire', detail: '', cochable: true },
    ],
    etapes: [
      {
        id: 'statuts',
        titre: 'Rédiger et retenir les statuts',
        texte: 'Relis le brouillon.',
        lien: 'https://entreprendre.service-public.fr',
        lienLibelle: 'Entreprendre.Service-Public.fr',
      },
      {
        id: 'depot',
        titre: 'Déposer le dossier au guichet unique',
        texte: 'Dépose toi-même.',
        lien: 'https://formalites.entreprises.gouv.fr',
        lienLibelle: 'Guichet unique',
      },
    ],
    frais: {
      miseAJour: 'octobre 2026',
      lignes: ['Annonce légale de constitution : tarif réglementé.'],
      avertissement: 'Vérifie les montants sur les sites officiels avant de payer.',
      sources: [{ libelle: 'Guichet unique (formalites.entreprises.gouv.fr)', url: 'https://formalites.entreprises.gouv.fr' }],
    },
    filing: { status: 'preparation', checkedItems: [], depositedAt: null, filingReference: null, ...filing },
    ...overrides,
  };
}

function appels(methode: string, suffixe = '') {
  const mock = global.fetch as unknown as ReturnType<typeof vi.fn>;
  return mock.mock.calls.filter(
    ([url, options]) => (options?.method ?? 'GET') === methode && new URL(String(url)).pathname === `${ROUTE}${suffixe}`,
  );
}

function rendre(forme: string | null = 'SAS') {
  return render(<DossierCreationSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm={forme} />);
}

describe('DossierCreationSection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('affiche les pièces avec leur état en toutes lettres, le guide, les frais et l’avis permanent', async () => {
    mockApiRoutes({ [`GET ${ROUTE}`]: { status: 200, body: dossier() } });
    rendre();

    expect(await screen.findByRole('heading', { name: 'Pièces du dossier' })).toBeInTheDocument();
    expect(screen.getByText(/c'est toi qui le déposes sur le guichet unique/i)).toBeInTheDocument();
    expect(screen.getByText(/rien n'est payé ni déposé par ignitux/i)).toBeInTheDocument();
    expect(screen.getByText(/pas un conseil juridique/i)).toBeInTheDocument();

    // L'état se lit en texte, pas seulement en couleur.
    const forme = screen.getByText('Forme juridique confirmée').closest('li') as HTMLElement;
    expect(within(forme).getByText('Prêt')).toBeInTheDocument();
    const statuts = screen.getByText('Statuts retenus').closest('li') as HTMLElement;
    expect(within(statuts).getByText('À faire')).toBeInTheDocument();
    expect(within(statuts).getByText('Statuts en brouillon.')).toBeInTheDocument();

    // Le guide : étapes numérotées, liens externes ouverts sans fuite d'opener.
    const etapes = screen.getByRole('heading', { name: 'Déposer pas à pas' }).nextElementSibling as HTMLElement;
    expect(etapes.tagName).toBe('OL');
    expect(within(etapes).getAllByRole('listitem')).toHaveLength(2);
    const lien = within(etapes).getByRole('link', { name: /guichet unique/i });
    expect(lien).toHaveAttribute('href', 'https://formalites.entreprises.gouv.fr');
    expect(lien).toHaveAttribute('target', '_blank');
    expect(lien).toHaveAttribute('rel', 'noopener noreferrer');

    expect(screen.getByText('Annonce légale de constitution : tarif réglementé.')).toBeInTheDocument();
    expect(screen.getByText('Vérifie les montants sur les sites officiels avant de payer.')).toBeInTheDocument();
    const source = screen.getByRole('link', { name: /formalites\.entreprises\.gouv\.fr/i });
    expect(source).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('button', { name: 'Télécharger le récapitulatif (PDF)' })).toBeInTheDocument();
  });

  it('ne propose une case à cocher que pour les pièces cochables, chacune avec son étiquette', async () => {
    mockApiRoutes({ [`GET ${ROUTE}`]: { status: 200, body: dossier() } });
    rendre();

    expect(await screen.findByLabelText('Justificatif de siège')).toHaveAttribute('type', 'checkbox');
    expect(screen.getByLabelText('Attestation de dépôt du capital')).not.toBeChecked();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.queryByLabelText('Statuts retenus')).not.toBeInTheDocument();
  });

  it('cocher envoie la liste complète et affiche la réponse du serveur', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: dossier({}, { checkedItems: ['capital_depose'] }) },
      [`PATCH ${ROUTE}`]: {
        status: 200,
        body: dossier({}, { checkedItems: ['capital_depose', 'justificatif_siege'] }),
      },
    });
    rendre();

    fireEvent.click(await screen.findByLabelText('Justificatif de siège'));

    await waitFor(() => expect(screen.getByLabelText('Justificatif de siège')).toBeChecked());
    const [, options] = appels('PATCH')[0];
    expect(JSON.parse(options.body)).toEqual({ checkedItems: ['capital_depose', 'justificatif_siege'] });
    expect(options.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('décocher retire la pièce de la liste envoyée', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: dossier({}, { checkedItems: ['capital_depose', 'justificatif_siege'] }) },
      [`PATCH ${ROUTE}`]: { status: 200, body: dossier({}, { checkedItems: ['capital_depose'] }) },
    });
    rendre();

    fireEvent.click(await screen.findByLabelText('Justificatif de siège'));

    await waitFor(() => expect(appels('PATCH')).toHaveLength(1));
    expect(JSON.parse(appels('PATCH')[0][1].body)).toEqual({ checkedItems: ['capital_depose'] });
    await waitFor(() => expect(screen.getByLabelText('Justificatif de siège')).not.toBeChecked());
  });

  it("n'affiche pas la case cochée tant que le serveur ne l'a pas enregistrée, et montre son erreur", async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: dossier() },
      [`PATCH ${ROUTE}`]: { status: 400, body: { message: 'checkedItems contient un identifiant inconnu.' } },
    });
    rendre();

    fireEvent.click(await screen.findByLabelText('Justificatif de siège'));

    expect(await screen.findByText('checkedItems contient un identifiant inconnu.')).toBeInTheDocument();
    expect(screen.getByLabelText('Justificatif de siège')).not.toBeChecked();
  });

  it('marque comme déposé avec la référence saisie, puis montre la date, la référence et « Rouvrir »', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: dossier() },
      [`POST ${ROUTE}/depose`]: {
        status: 201,
        body: dossier({}, { status: 'depose', depositedAt: '2026-10-08T10:00:00.000Z', filingReference: 'GU-123' }),
      },
    });
    rendre();

    const champ = await screen.findByLabelText('Référence du dépôt (facultatif)');
    expect(champ).toHaveAttribute('maxLength', '100');
    fireEvent.change(champ, { target: { value: '  GU-123  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Marquer comme déposé' }));

    expect(await screen.findByText(/marqué comme déposé le 08\/10\/2026/i)).toBeInTheDocument();
    expect(screen.getByText(/Référence : GU-123/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rouvrir' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marquer comme déposé' })).not.toBeInTheDocument();
    expect(JSON.parse(appels('POST', '/depose')[0][1].body)).toEqual({ filingReference: 'GU-123' });
  });

  it('marque comme déposé sans référence : corps vide', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: dossier() },
      [`POST ${ROUTE}/depose`]: {
        status: 201,
        body: dossier({}, { status: 'depose', depositedAt: '2026-10-08T10:00:00.000Z' }),
      },
    });
    rendre();

    fireEvent.click(await screen.findByRole('button', { name: 'Marquer comme déposé' }));

    expect(await screen.findByRole('button', { name: 'Rouvrir' })).toBeInTheDocument();
    expect(JSON.parse(appels('POST', '/depose')[0][1].body)).toEqual({});
    expect(screen.queryByText(/Référence :/)).not.toBeInTheDocument();
  });

  it("montre l'erreur du serveur quand le dossier est déjà déposé (409)", async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: dossier() },
      [`POST ${ROUTE}/depose`]: { status: 409, body: { message: 'Ce dossier est déjà marqué comme déposé.' } },
    });
    rendre();

    fireEvent.click(await screen.findByRole('button', { name: 'Marquer comme déposé' }));

    expect(await screen.findByText('Ce dossier est déjà marqué comme déposé.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marquer comme déposé' })).toBeInTheDocument();
  });

  it('rouvre un dossier déposé', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: {
        status: 200,
        body: dossier({}, { status: 'depose', depositedAt: '2026-10-08T10:00:00.000Z', filingReference: 'GU-123' }),
      },
      [`POST ${ROUTE}/rouvrir`]: { status: 201, body: dossier() },
    });
    rendre();

    fireEvent.click(await screen.findByRole('button', { name: 'Rouvrir' }));

    expect(await screen.findByRole('button', { name: 'Marquer comme déposé' })).toBeInTheDocument();
    expect(appels('POST', '/rouvrir')).toHaveLength(1);
    expect(screen.queryByText(/GU-123/)).not.toBeInTheDocument();
  });

  it('sans forme confirmée, ne montre qu’un court message', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: {
        status: 200,
        body: dossier({
          forme: null,
          pieces: [{ id: 'forme_confirmee', titre: 'Forme juridique confirmée', etat: 'a_faire', detail: '', cochable: false }],
        }),
      },
    });
    rendre(null);

    expect(await screen.findByText(/confirme d'abord la forme juridique/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pièces du dossier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /marquer comme déposé/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /télécharger/i })).not.toBeInTheDocument();
  });

  it('immatriculée : bandeau avec la date (jour de Paris) et le SIREN, lien vers la fiche', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: {
        status: 200,
        body: dossier({ immatriculee: true, registration: { siren: '732829320', registeredOn: '2026-10-01' } }),
      },
    });
    rendre();

    expect(await screen.findByText(/Immatriculée le 01\/10\/2026 — SIREN 732829320/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir la fiche d’immatriculation' })).toHaveAttribute(
      'href',
      '#section-immatriculation',
    );
    expect(screen.queryByText(/quand tu l'as reçu/)).not.toBeInTheDocument();
  });

  it('pas encore immatriculée : invitation à saisir le SIREN une fois reçu', async () => {
    mockApiRoutes({ [`GET ${ROUTE}`]: { status: 200, body: dossier({ immatriculee: false, registration: null }) } });
    rendre();

    expect(await screen.findByText(/Saisis ton SIREN dans la section/)).toBeInTheDocument();
    expect(screen.getByText(/quand tu l'as reçu/)).toBeInTheDocument();
    expect(screen.queryByText(/Immatriculée le/)).not.toBeInTheDocument();
  });

  it('recharge le dossier quand la forme confirmée change', async () => {
    mockApiRoutes({ [`GET ${ROUTE}`]: { status: 200, body: dossier() } });
    const { rerender } = rendre(null);
    await screen.findByRole('heading', { name: 'Pièces du dossier' });
    expect(appels('GET')).toHaveLength(1);

    rerender(<DossierCreationSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm="SAS" />);

    await waitFor(() => expect(appels('GET')).toHaveLength(2));
  });

  it('après un passage SAS → micro-entreprise, une case restante ne verrouille pas les autres', async () => {
    // Un serveur qui renverrait encore `capital_depose` (plus cochable pour
    // une micro-entreprise) : le PATCH ne doit envoyer que des pièces cochables.
    const micro = (checkedItems: string[]) =>
      dossier(
        {
          forme: 'micro-entreprise',
          pieces: [
            { id: 'forme_confirmee', titre: 'Forme juridique confirmée', etat: 'pret', detail: '', cochable: false },
            { id: 'justificatif_siege', titre: 'Justificatif de siège', etat: 'a_faire', detail: '', cochable: true },
            { id: 'capital_depose', titre: 'Attestation de dépôt du capital', etat: 'non_concerne', detail: '', cochable: false },
          ],
        },
        { checkedItems },
      );
    mockApiRoutes({
      [`GET ${ROUTE}`]: { status: 200, body: micro(['capital_depose']) },
      [`PATCH ${ROUTE}`]: { status: 200, body: micro(['justificatif_siege']) },
    });
    rendre('micro-entreprise');

    fireEvent.click(await screen.findByLabelText('Justificatif de siège'));

    await waitFor(() => expect(screen.getByLabelText('Justificatif de siège')).toBeChecked());
    expect(JSON.parse(appels('PATCH')[0][1].body)).toEqual({ checkedItems: ['justificatif_siege'] });
  });

  it('affiche la date du dépôt au jour de Paris, comme le PDF', async () => {
    mockApiRoutes({
      [`GET ${ROUTE}`]: {
        status: 200,
        body: dossier({}, { status: 'depose', depositedAt: '2026-10-08T23:30:00.000Z' }),
      },
    });
    rendre();

    expect(await screen.findByText(/marqué comme déposé le 09\/10\/2026/i)).toBeInTheDocument();
  });

  it('se recharge quand refreshSignal change (statuts générés ou retenus au-dessus)', async () => {
    mockApiRoutes({ [`GET ${ROUTE}`]: { status: 200, body: dossier() } });
    const { rerender } = render(
      <DossierCreationSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm="SAS" refreshSignal={0} />,
    );
    await screen.findByRole('heading', { name: 'Pièces du dossier' });
    expect(appels('GET')).toHaveLength(1);

    rerender(<DossierCreationSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm="SAS" refreshSignal={1} />);

    await waitFor(() => expect(appels('GET')).toHaveLength(2));
    expect(await screen.findByRole('heading', { name: 'Pièces du dossier' })).toBeInTheDocument();
  });

  it('ignore une réponse de chargement périmée qui arrive après la plus récente', async () => {
    const resolveurs: Array<(r: unknown) => void> = [];
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveurs.push(resolve);
        }),
    ) as unknown as typeof fetch;
    const reponse = (corps: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(corps) });

    const { rerender } = render(
      <DossierCreationSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm="SAS" />,
    );
    await waitFor(() => expect(resolveurs).toHaveLength(1));
    rerender(<DossierCreationSection token={TOKEN} projectId={PROJECT_ID} confirmedLegalForm="SASU" />);
    await waitFor(() => expect(resolveurs).toHaveLength(2));

    // La plus récente (SASU) répond d'abord, l'ancienne (SAS) ensuite.
    await act(async () => {
      resolveurs[1](reponse(dossier({ forme: 'SASU' })));
    });
    expect(await screen.findByText('Forme juridique : SASU.')).toBeInTheDocument();
    await act(async () => {
      resolveurs[0](reponse(dossier({ forme: 'SAS' })));
    });

    expect(screen.getByText('Forme juridique : SASU.')).toBeInTheDocument();
    expect(screen.queryByText('Forme juridique : SAS.')).not.toBeInTheDocument();
  });

  it('un chargement échoué montre l’erreur et « Réessayer », jamais une liste vide', async () => {
    let n = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      n += 1;
      return Promise.resolve(
        n === 1
          ? { ok: false, status: 500, json: () => Promise.resolve({ message: 'Serveur indisponible.' }) }
          : { ok: true, status: 200, json: () => Promise.resolve(dossier()) },
      );
    }) as unknown as typeof fetch;
    rendre();

    expect(await screen.findByText('Serveur indisponible.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pièces du dossier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /marquer comme déposé/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByRole('heading', { name: 'Pièces du dossier' })).toBeInTheDocument();
    expect(screen.queryByText('Serveur indisponible.')).not.toBeInTheDocument();
  });

  it('hors ligne, n’affiche pas la copie en cache comme l’état réel : erreur et « Réessayer »', async () => {
    vi.spyOn(api, 'getDossierCreation').mockRejectedValue(
      new OfflineReadError(dossier({}, { checkedItems: ['capital_depose'] }), '2026-10-01T10:00:00.000Z'),
    );
    rendre();

    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.getByText(/pas de réseau : le dossier ne s’affiche pas hors ligne/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pièces du dossier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('une réponse illisible est traitée comme un échec, pas comme un dossier vide', async () => {
    mockApiRoutes({ [`GET ${ROUTE}`]: { status: 200, body: [] } });
    rendre();

    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pièces du dossier' })).not.toBeInTheDocument();
  });

  it('télécharge le récapitulatif PDF avec le jeton', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).endsWith('/dossier-creation/pdf')
          ? { ok: true, status: 200, blob: () => Promise.resolve(new Blob(['%PDF'])) }
          : { ok: true, status: 200, json: () => Promise.resolve(dossier()) },
      ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    // jsdom n'a pas ces fonctions : on les définit, puis on les espionne.
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: () => '' });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: () => undefined });
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:dossier');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    rendre();
    const bouton = await screen.findByRole('button', { name: 'Télécharger le récapitulatif (PDF)' });
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      fireEvent.click(bouton);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(clic).toHaveBeenCalledTimes(1);
      const appelPdf = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/dossier-creation/pdf'));
      expect(appelPdf?.[1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:dossier');
    } finally {
      vi.useRealTimers();
      delete (URL as unknown as Record<string, unknown>).createObjectURL;
      delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
    }
  });

  it('montre une erreur quand le téléchargement du PDF échoue', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).endsWith('/dossier-creation/pdf')
          ? { ok: false, status: 500, json: () => Promise.resolve(null) }
          : { ok: true, status: 200, json: () => Promise.resolve(dossier()) },
      ),
    ) as unknown as typeof fetch;
    rendre();

    fireEvent.click(await screen.findByRole('button', { name: 'Télécharger le récapitulatif (PDF)' }));

    expect(await screen.findByText('Impossible de télécharger le récapitulatif.')).toBeInTheDocument();
  });

  it('désactive les cases pendant un enregistrement (pas de double envoi)', async () => {
    let resoudre: (r: unknown) => void = () => undefined;
    global.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === 'PATCH') {
        return new Promise((resolve) => {
          resoudre = resolve;
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(dossier()) });
    }) as unknown as typeof fetch;
    rendre();

    fireEvent.click(await screen.findByLabelText('Justificatif de siège'));

    await waitFor(() => expect(screen.getByLabelText('Attestation de dépôt du capital')).toBeDisabled());
    expect(screen.getByRole('button', { name: /enregistrement/i })).toBeDisabled();
    await act(async () => {
      resoudre({
        ok: true,
        status: 200,
        json: () => Promise.resolve(dossier({}, { checkedItems: ['justificatif_siege'] })),
      });
    });
    await waitFor(() => expect(screen.getByLabelText('Justificatif de siège')).toBeChecked());
    expect(screen.getByLabelText('Attestation de dépôt du capital')).toBeEnabled();
  });
});
