import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApiRoutes } from '@/test-utils/mocks';
import { ComplianceSection } from './compliance-section';

const TOKEN = 'tok123';
const PROJECT_ID = 'p1';

afterEach(() => {
  vi.restoreAllMocks();
});

const REQUIREMENT = {
  id: 'r1',
  country: 'FR',
  category: 'Création',
  title: 'Choisir un statut juridique',
  description: 'Description.',
  source_name: 'service-public.fr',
  source_url: 'https://entreprendre.service-public.fr',
  completed: false,
};

describe('ComplianceSection', () => {
  it('affiche le disclaimer et les exigences groupées par catégorie', async () => {
    mockApiRoutes({
      'GET /projects/p1/compliance': {
        status: 200,
        body: { disclaimer: 'Ceci ne remplace pas un avis juridique.', requirements: [REQUIREMENT] },
      },
    });

    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText(/ne remplace pas un avis juridique/)).toBeInTheDocument();
    expect(screen.getByText('Choisir un statut juridique')).toBeInTheDocument();
    expect(screen.getByText('Création')).toBeInTheDocument();
  });

  it('coche une exigence et appelle l\'API de validation', async () => {
    mockApiRoutes({
      'GET /projects/p1/compliance': {
        status: 200,
        body: { disclaimer: 'd', requirements: [REQUIREMENT] },
      },
      'POST /projects/p1/compliance/r1/check': { status: 204, body: null },
    });

    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} />);

    const checkbox = await screen.findByLabelText('Choisir un statut juridique');
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);

    expect(await screen.findByLabelText('Choisir un statut juridique')).toBeChecked();
  });

  it('masque les cases à cocher en lecture seule', async () => {
    mockApiRoutes({
      'GET /projects/p1/compliance': {
        status: 200,
        body: { disclaimer: 'd', requirements: [REQUIREMENT] },
      },
    });

    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} readOnly />);

    const checkbox = await screen.findByLabelText('Choisir un statut juridique');
    expect(checkbox).toBeDisabled();
  });
});

describe('le pays des démarches', () => {
  // Le champ « Pays d'activité » promet d'ouvrir cette section. Tant que
  // l'écran demandait `?country=FR`, la promesse n'était pas tenue.
  it('dit pour quel pays les démarches valent', async () => {
    mockApiRoutes({
      'GET /projects/p1/compliance': {
        status: 200,
        body: {
          disclaimer: 'Info générale.',
          country: 'FR',
          countryDeclared: true,
          requirements: [],
        },
      },
    });

    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText(/Démarches pour\s?: France/)).toBeInTheDocument();
  });

  // Afficher des obligations françaises à quelqu'un qui n'a rien déclaré
  // n'est pas faux en soi — le taire l'est.
  it('annonce la France comme une supposition quand rien n’est déclaré', async () => {
    mockApiRoutes({
      'GET /projects/p1/compliance': {
        status: 200,
        body: {
          disclaimer: 'Info générale.',
          country: 'FR',
          countryDeclared: false,
          requirements: [],
        },
      },
    });

    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText(/par défaut/)).toBeInTheDocument();
    expect(screen.getByText(/Renseigne le pays d’activité dans ton profil/)).toBeInTheDocument();
  });

  it("n'interroge plus le serveur en forçant la France", async () => {
    mockApiRoutes({
      'GET /projects/p1/compliance': {
        status: 200,
        body: {
          disclaimer: 'Info générale.',
          country: 'FR',
          countryDeclared: true,
          requirements: [],
        },
      },
    });

    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} />);
    await screen.findByText(/Démarches pour/);

    const appels = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const urls = appels.map((appel) => String(appel[0]));
    expect(urls.some((url) => url.includes('country='))).toBe(false);
  });
});

const EXIGENCE = (id, title, category = 'Création') => ({
  id,
  country: 'FR',
  category,
  title,
  description: 'Description de la démarche.',
  source_name: 'service-public.gouv.fr',
  source_url: 'https://entreprendre.service-public.gouv.fr/vosdroits/F23844',
  completed: false,
});

const CHECKLIST = (extra) => ({
  disclaimer: 'Info générale.',
  country: 'FR',
  countryDeclared: true,
  sector: null,
  requirements: [],
  groupes: [],
  ...extra,
});

describe('le secteur du projet', () => {
  // Posée ici parce que c'est ici que la réponse change quelque chose.
  it('demande le secteur quand il manque, en disant à quoi il sert', async () => {
    mockApiRoutes({
      'GET /projects/p1/compliance': {
        status: 200,
        body: CHECKLIST({ requirements: [EXIGENCE('r1', 'Choisir un statut')] }),
      },
    });

    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(
      await screen.findByLabelText('Dans quel secteur ce projet exerce-t-il ?'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Rien ne sera masqué/)).toBeInTheDocument();
  });

  it('ne redemande pas un secteur déjà déclaré', async () => {
    mockApiRoutes({
      'GET /projects/p1/compliance': {
        status: 200,
        body: CHECKLIST({
          sector: 'Restauration',
          requirements: [EXIGENCE('r1', 'Choisir un statut')],
        }),
      },
    });

    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Choisir un statut');
    expect(
      screen.queryByLabelText('Dans quel secteur ce projet exerce-t-il ?'),
    ).not.toBeInTheDocument();
  });

  // Un collaborateur consulte, il ne décide pas du secteur du projet.
  it('ne demande rien en lecture seule', async () => {
    mockApiRoutes({
      'GET /projects/p1/compliance': {
        status: 200,
        body: CHECKLIST({ requirements: [EXIGENCE('r1', 'Choisir un statut')] }),
      },
    });

    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} readOnly />);

    await screen.findByText('Choisir un statut');
    expect(
      screen.queryByLabelText('Dans quel secteur ce projet exerce-t-il ?'),
    ).not.toBeInTheDocument();
  });

  it('enregistre le secteur choisi puis recharge la liste', async () => {
    mockApiRoutes({
      'GET /projects/p1/compliance': {
        status: 200,
        body: CHECKLIST({ requirements: [EXIGENCE('r1', 'Choisir un statut')] }),
      },
      'PATCH /projects/p1/secteur': { status: 200, body: {} },
    });

    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} />);

    fireEvent.change(await screen.findByLabelText('Dans quel secteur ce projet exerce-t-il ?'), {
      target: { value: 'Restauration' },
    });

    await waitFor(() => {
      const appels = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const secteur = appels.find((a) => String(a[0]).endsWith('/secteur'));
      expect(secteur).toBeTruthy();
      expect(JSON.parse(String((secteur?.[1] as RequestInit)?.body))).toEqual({
        sector: 'Restauration',
      });
    });
  });
});

describe('le tri par pertinence', () => {
  const GROUPES = {
    sector: 'Restauration',
    requirements: [
      EXIGENCE('r1', 'Hygiène alimentaire', 'Activité'),
      EXIGENCE('r2', 'Choisir un statut'),
      EXIGENCE('r3', 'Capacité de transport', 'Activité'),
    ],
    groupes: [
      {
        cle: 'secteur',
        titre: 'Propre à ton secteur',
        precision: 'Ces démarches visent explicitement ton activité.',
        requirementIds: ['r1'],
      },
      {
        cle: 'toute-activite',
        titre: 'Pour toute activité',
        precision: 'Quel que soit le secteur, ces points se posent.',
        requirementIds: ['r2'],
      },
      {
        cle: 'autres-secteurs',
        titre: 'Rattachées à d’autres secteurs',
        precision: 'Ce n’est pas un avis juridique sur ton cas.',
        requirementIds: ['r3'],
      },
    ],
  };

  it('affiche les groupes dans l’ordre, avec leur précision', async () => {
    mockApiRoutes({
      'GET /projects/p1/compliance': { status: 200, body: CHECKLIST(GROUPES) },
    });

    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText('Propre à ton secteur')).toBeInTheDocument();
    expect(screen.getByText('Pour toute activité')).toBeInTheDocument();
    expect(screen.getByText('Rattachées à d’autres secteurs')).toBeInTheDocument();
    expect(screen.getByText(/pas un avis juridique/)).toBeInTheDocument();
  });

  // LA propriété de l'écran. Un tri qui perd une ligne devient un filtre,
  // et un filtre sur des obligations légales fabrique des faux négatifs.
  it('affiche toutes les démarches, y compris celles d’autres secteurs', async () => {
    mockApiRoutes({
      'GET /projects/p1/compliance': { status: 200, body: CHECKLIST(GROUPES) },
    });

    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText('Hygiène alimentaire')).toBeInTheDocument();
    expect(screen.getByText('Choisir un statut')).toBeInTheDocument();
    expect(screen.getByText('Capacité de transport')).toBeInTheDocument();
  });

  // Un serveur plus ancien ne renvoie pas de groupes : la section doit
  // rester lisible plutôt que de se vider.
  it('retombe sur les catégories quand le serveur n’envoie pas de groupes', async () => {
    mockApiRoutes({
      'GET /projects/p1/compliance': {
        status: 200,
        body: CHECKLIST({
          sector: 'Restauration',
          requirements: [EXIGENCE('r1', 'Choisir un statut', 'Création')],
        }),
      },
    });

    render(<ComplianceSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText('Choisir un statut')).toBeInTheDocument();
    expect(screen.getByText('Création')).toBeInTheDocument();
  });
});
