import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import ConstitutionPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const ENFORCED_ARTICLE = {
  id: 'a1',
  slug: 'pas-de-score-invente',
  version: 'principes-fondateurs',
  number: 10,
  title: 'Pas de score inventé',
  text: "Aucune note ne peut être affichée si elle ne repose pas sur une donnée réelle.",
  principle: 'pas_de_score_invente',
  enforcement: 'enforced',
};

const DECLARED_ARTICLE = {
  id: 'a2',
  slug: 'mission-nous-servir',
  version: 'principes-fondateurs',
  number: 1,
  title: 'Mission — Nous servir',
  text: 'Ignitux existe pour servir réellement la personne qui utilise le produit.',
  principle: 'mission',
  enforcement: 'declared',
};

function routes(overrides: Record<string, { status: number; body: unknown }> = {}) {
  return {
    'GET /constitution/preamble': { status: 200, body: { version: 'v1', preamble: 'Préambule.' } },
    'GET /constitution/articles': { status: 200, body: [DECLARED_ARTICLE, ENFORCED_ARTICLE] },
    'GET /constitution/rules': { status: 200, body: [] },
    'GET /constitution/audit': { status: 200, body: [] },
    'GET /constitution/violations': { status: 200, body: [] },
    ...overrides,
  };
}

describe('ConstitutionPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('affiche les articles avec leur numéro et leur texte', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <ConstitutionPage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/Article 1 — Mission/)).toBeInTheDocument();
    expect(screen.getByText(/Article 10 — Pas de score inventé/)).toBeInTheDocument();
  });

  it("distingue visiblement un article vérifié par le code d'un simple énoncé", async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <ConstitutionPage />
      </AuthProvider>,
    );

    expect(await screen.findByText('Vérifié par le code')).toBeInTheDocument();
    expect(screen.getByText('Énoncé, non vérifiable')).toBeInTheDocument();
  });

  it("dit explicitement qu'aucune donnée ne permet de mesurer un article, plutôt que d'afficher un chiffre", async () => {
    mockApiRoutes(
      routes({
        'GET /constitution/audit': {
          status: 200,
          body: [
            {
              slug: 'mission-nous-servir',
              title: 'Mission',
              enforcement: 'declared',
              measured: null,
              violationsLast30Days: 0,
            },
          ],
        },
      }),
    );

    render(
      <AuthProvider>
        <ConstitutionPage />
      </AuthProvider>,
    );

    // Les deux articles affichent le message : l'un parce que son entrée
    // d'audit a `measured: null`, l'autre parce qu'il n'a pas d'entrée du
    // tout. Les deux cas se lisent « non mesurable », et c'est voulu.
    const messages = await screen.findAllByText(
      'Aucune donnée en base ne permet de mesurer cet article.',
    );
    expect(messages).toHaveLength(2);
  });

  it("affiche la mesure réelle quand l'audit en fournit une", async () => {
    mockApiRoutes(
      routes({
        'GET /constitution/audit': {
          status: 200,
          body: [
            {
              slug: 'pas-de-score-invente',
              title: 'Pas de score inventé',
              enforcement: 'enforced',
              measured: '8/10 contenus générés nomment leur modèle.',
              violationsLast30Days: 3,
            },
          ],
        },
      }),
    );

    render(
      <AuthProvider>
        <ConstitutionPage />
      </AuthProvider>,
    );

    expect(await screen.findByText('8/10 contenus générés nomment leur modèle.')).toBeInTheDocument();
    expect(
      screen.getByText('3 violation(s) relevée(s) sur les 30 derniers jours.'),
    ).toBeInTheDocument();
  });

  it('affiche le préambule de la Constitution V1', async () => {
    mockApiRoutes(
      routes({
        'GET /constitution/preamble': {
          status: 200,
          body: {
            version: 'v1',
            preamble:
              'IGNITUX existe pour aider chaque être humain à découvrir, construire et transmettre son potentiel.',
          },
        },
      }),
    );

    const { container } = render(
      <AuthProvider>
        <ConstitutionPage />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(container.textContent).toContain('découvrir, construire et transmettre'),
    );
  });

  it("distingue le constat technique du texte constitutionnel lui-même", async () => {
    // « Vérifié par le code » n'est pas dans la Constitution : c'est ce
    // que notre moteur contrôle réellement. Confondre les deux ferait
    // passer une limite d'implémentation pour une règle fondatrice.
    mockApiRoutes(routes());

    const { container } = render(
      <AuthProvider>
        <ConstitutionPage />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(container.textContent).toContain("n'est pas dans la Constitution"),
    );
  });

  it('affiche les règles exécutables rattachées à un article', async () => {
    mockApiRoutes(
      routes({
        'GET /constitution/rules': {
          status: 200,
          body: [
            {
              id: 'score-sans-source',
              articleSlug: 'pas-de-score-invente',
              severity: 'blocking',
              description: 'Un score chiffré doit reposer sur une donnée réelle.',
            },
          ],
        },
      }),
    );

    const { container } = render(
      <AuthProvider>
        <ConstitutionPage />
      </AuthProvider>,
    );

    await waitFor(() => expect(container.textContent).toContain('score-sans-source'));
    expect(container.textContent).toContain('bloquant');
  });

  it('affiche le journal des violations quand il y en a', async () => {
    mockApiRoutes(
      routes({
        'GET /constitution/violations': {
          status: 200,
          body: [
            {
              id: 'v1',
              article_slug: 'pas-de-score-invente',
              rule_id: 'score-sans-source',
              severity: 'blocking',
              action: 'publish_score',
              detail: 'Le score « confiance » vaut 0 sans donnée source.',
              created_at: '2026-09-01T10:00:00.000Z',
            },
          ],
        },
      }),
    );

    render(
      <AuthProvider>
        <ConstitutionPage />
      </AuthProvider>,
    );

    expect(
      await screen.findByText('Le score « confiance » vaut 0 sans donnée source.'),
    ).toBeInTheDocument();
  });

  it('redirige vers la connexion si aucun jeton', async () => {
    window.localStorage.clear();
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <ConstitutionPage />
      </AuthProvider>,
    );

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  });
});
