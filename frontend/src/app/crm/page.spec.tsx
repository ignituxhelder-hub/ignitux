import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import type { CrmStage } from '@/lib/api';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import CrmPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const CONTACT = {
  id: 'c1',
  owner_id: 'u1',
  company_id: null,
  project_id: null,
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@exemple.fr',
  phone: null,
  role: null,
  kind: 'prospect' as const,
  stage: 'nouveau' as CrmStage,
  notes: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

const PIPELINE = {
  total: 1,
  stages: [
    { stage: 'nouveau' as CrmStage, label: 'Nouveau', count: 1 },
    { stage: 'gagne' as CrmStage, label: 'Gagné', count: 0 },
  ],
};

const COMPANY = {
  id: 'co1',
  owner_id: 'u1',
  name: 'Acme SARL',
  sector: 'Bâtiment',
  website: null,
  notes: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function routes(overrides: Record<string, { status: number; body: unknown }> = {}) {
  return {
    'GET /crm/contacts': { status: 200, body: [CONTACT] },
    'GET /crm/pipeline': { status: 200, body: PIPELINE },
    'GET /crm/companies': { status: 200, body: [] as unknown[] },
    ...overrides,
  };
}

describe('CrmPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('liste les contacts', async () => {
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <CrmPage />
      </AuthProvider>,
    );

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@exemple.fr')).toBeInTheDocument();
  });

  it('affiche le pipeline comme un comptage, en disant que ce ne sont pas des prévisions', async () => {
    mockApiRoutes(routes());

    const { container } = render(
      <AuthProvider>
        <CrmPage />
      </AuthProvider>,
    );

    await screen.findByText('Ada Lovelace');
    await waitFor(() =>
      expect(container.textContent).toContain(
        "Ignitux n'affiche aucun chiffre d'affaires prévisionnel",
      ),
    );
  });

  it('dit que le carnet est personnel et non partagé avec les collaborateurs', async () => {
    mockApiRoutes(routes());

    const { container } = render(
      <AuthProvider>
        <CrmPage />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(container.textContent).toContain("n'y a pas accès"),
    );
  });

  it("transmet la recherche et le filtre d'étape à l'API", async () => {
    const calls: string[] = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      const parsed = new URL(url);
      calls.push(parsed.pathname + parsed.search);
      const body = parsed.pathname === '/crm/pipeline' ? PIPELINE : [CONTACT];
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    }) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <CrmPage />
      </AuthProvider>,
    );

    await screen.findByText('Ada Lovelace');
    fireEvent.change(screen.getByLabelText('Rechercher un contact'), {
      target: { value: 'ada' },
    });
    fireEvent.change(screen.getByLabelText('Filtrer par étape'), {
      target: { value: 'qualifie' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));

    await waitFor(() => {
      const searched = calls.filter((call) => call.startsWith('/crm/contacts?'));
      expect(searched.length).toBeGreaterThan(0);
      expect(searched[searched.length - 1]).toContain('stage=qualifie');
    });
  });

  it("change l'étape d'un contact", async () => {
    const routeMap = routes({
      'PATCH /crm/contacts/c1': { status: 200, body: { ...CONTACT, stage: 'qualifie' } },
    });
    mockApiRoutes(routeMap);

    render(
      <AuthProvider>
        <CrmPage />
      </AuthProvider>,
    );

    await screen.findByText('Ada Lovelace');
    routeMap['GET /crm/contacts'] = {
      status: 200,
      body: [{ ...CONTACT, stage: 'qualifie' }],
    };
    fireEvent.change(screen.getByLabelText('Étape de Ada Lovelace'), {
      target: { value: 'qualifie' },
    });

    await waitFor(() =>
      expect(
        (screen.getByLabelText('Étape de Ada Lovelace') as HTMLSelectElement).value,
      ).toBe('qualifie'),
    );
  });

  it("affiche l'historique d'un contact avec la date réelle de l'échange", async () => {
    mockApiRoutes(
      routes({
        'GET /crm/contacts/c1': {
          status: 200,
          body: {
            ...CONTACT,
            interactions: [
              {
                id: 'i1',
                contact_id: 'c1',
                channel: 'appel',
                summary: 'Premier échange téléphonique.',
                occurred_at: '2026-09-10T14:00:00.000Z',
                created_at: '2026-09-11T09:00:00.000Z',
              },
            ],
          },
        },
      }),
    );

    render(
      <AuthProvider>
        <CrmPage />
      </AuthProvider>,
    );

    await screen.findByText('Ada Lovelace');
    fireEvent.click(screen.getByRole('button', { name: 'Historique' }));

    expect(await screen.findByText('Premier échange téléphonique.')).toBeInTheDocument();
  });

  it('ajoute un contact', async () => {
    const routeMap = routes({
      'POST /crm/contacts': { status: 201, body: CONTACT },
      'GET /crm/contacts': { status: 200, body: [] },
    });
    mockApiRoutes(routeMap);

    render(
      <AuthProvider>
        <CrmPage />
      </AuthProvider>,
    );

    await screen.findByText('Aucun contact ne correspond.');
    routeMap['GET /crm/contacts'] = { status: 200, body: [CONTACT] };

    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Lovelace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    const list = await screen.findByRole('list', { name: 'Liste des contacts' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
  });

  it('redirige vers la connexion sans jeton', async () => {
    window.localStorage.clear();
    mockApiRoutes(routes());

    render(
      <AuthProvider>
        <CrmPage />
      </AuthProvider>,
    );

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  });

  // Les routes d'entreprises existaient côté API sans aucun appelant côté
  // client : ni liste, ni création, ni lien contact → entreprise.
  describe('entreprises', () => {
    it('liste les entreprises existantes', async () => {
      mockApiRoutes(routes({ 'GET /crm/companies': { status: 200, body: [COMPANY] } }));

      render(
        <AuthProvider>
          <CrmPage />
        </AuthProvider>,
      );

      expect(await screen.findByText('Acme SARL', { selector: 'strong' })).toBeInTheDocument();
      expect(screen.getByText(/Bâtiment/)).toBeInTheDocument();
    });

    it('crée une entreprise avec son nom, secteur et site web', async () => {
      const bodies: string[] = [];
      global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        const path = new URL(url).pathname;
        if (options?.method === 'POST' && path === '/crm/companies') {
          bodies.push(String(options.body));
        }
        const body =
          path === '/crm/pipeline'
            ? PIPELINE
            : path === '/crm/companies'
              ? []
              : path === '/crm/contacts'
                ? [CONTACT]
                : {};
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
      }) as unknown as typeof fetch;

      render(
        <AuthProvider>
          <CrmPage />
        </AuthProvider>,
      );

      await screen.findByText('Ada Lovelace');
      fireEvent.change(screen.getByLabelText("Nom de l'entreprise"), {
        target: { value: 'Acme SARL' },
      });
      fireEvent.change(screen.getByLabelText("Secteur d'activité"), {
        target: { value: 'Bâtiment' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Ajouter une entreprise' }));

      await waitFor(() => expect(bodies.length).toBeGreaterThan(0));
      const payload = JSON.parse(bodies[0]) as { name: string; sector?: string };
      expect(payload).toEqual({ name: 'Acme SARL', sector: 'Bâtiment' });
    });

    it('modifie une entreprise via le formulaire en ligne', async () => {
      const routeMap = routes({
        'GET /crm/companies': { status: 200, body: [COMPANY] },
        'PATCH /crm/companies/co1': {
          status: 200,
          body: { ...COMPANY, name: 'Acme SAS' },
        },
      });
      mockApiRoutes(routeMap);

      render(
        <AuthProvider>
          <CrmPage />
        </AuthProvider>,
      );

      await screen.findByText('Acme SARL', { selector: 'strong' });
      fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
      fireEvent.change(screen.getByLabelText('Nom de Acme SARL'), {
        target: { value: 'Acme SAS' },
      });
      routeMap['GET /crm/companies'] = {
        status: 200,
        body: [{ ...COMPANY, name: 'Acme SAS' }],
      };
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

      expect(await screen.findByText('Acme SAS', { selector: 'strong' })).toBeInTheDocument();
    });

    it('supprime une entreprise directement, sans boîte de confirmation', async () => {
      const routeMap = routes({
        'GET /crm/companies': { status: 200, body: [COMPANY] },
        'DELETE /crm/companies/co1': { status: 204, body: null },
      });
      mockApiRoutes(routeMap);

      render(
        <AuthProvider>
          <CrmPage />
        </AuthProvider>,
      );

      const companyName = await screen.findByText('Acme SARL', { selector: 'strong' });
      const companyItem = companyName.closest('li') as HTMLElement;
      routeMap['GET /crm/companies'] = { status: 200, body: [] };
      fireEvent.click(within(companyItem).getByRole('button', { name: 'Supprimer' }));

      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/crm/companies/co1'),
        expect.objectContaining({ method: 'DELETE' }),
      ));
    });

    it('associe un contact à une entreprise existante dès sa création', async () => {
      const bodies: string[] = [];
      global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        const path = new URL(url).pathname;
        if (options?.method === 'POST' && path === '/crm/contacts') {
          bodies.push(String(options.body));
        }
        const body =
          path === '/crm/pipeline'
            ? PIPELINE
            : path === '/crm/companies'
              ? [COMPANY]
              : path === '/crm/contacts'
                ? [CONTACT]
                : {};
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
      }) as unknown as typeof fetch;

      render(
        <AuthProvider>
          <CrmPage />
        </AuthProvider>,
      );

      await screen.findByText('Ada Lovelace');
      fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Bob' } });
      fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Martin' } });
      fireEvent.change(screen.getByLabelText('Entreprise du contact'), {
        target: { value: 'co1' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

      await waitFor(() => expect(bodies.length).toBeGreaterThan(0));
      const payload = JSON.parse(bodies[0]) as { companyId?: string };
      expect(payload.companyId).toBe('co1');
    });

    it("affiche le nom de l'entreprise sous chaque contact rattaché", async () => {
      mockApiRoutes(
        routes({
          'GET /crm/companies': { status: 200, body: [COMPANY] },
          'GET /crm/contacts': {
            status: 200,
            body: [{ ...CONTACT, company_id: 'co1' }],
          },
        }),
      );

      render(
        <AuthProvider>
          <CrmPage />
        </AuthProvider>,
      );

      await screen.findByText('Ada Lovelace');
      const list = await screen.findByRole('list', { name: 'Liste des contacts' });
      expect(within(list).getByText('Acme SARL')).toBeInTheDocument();
    });
  });
});
