import { fireEvent, render, screen } from '@testing-library/react';
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
