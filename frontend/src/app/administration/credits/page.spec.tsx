import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import CreditsAdministrationPage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function compte(id: string, email: string, solde: number, bienvenueVersee = true) {
  return { id, email, creeLe: '2026-10-01T00:00:00.000Z', solde, bienvenueVersee };
}

const PAGE_1 = {
  page: 1,
  parPage: 50,
  total: 60,
  comptes: [compte('u1', 'alice@exemple.fr', 26), compte('u2', 'bruno@exemple.fr', 0, false)],
};

function afficher() {
  render(
    <AuthProvider>
      <CreditsAdministrationPage />
    </AuthProvider>,
  );
}

function appels(methode: string) {
  return (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
    ([, options]) => ((options as RequestInit | undefined)?.method ?? 'GET') === methode,
  ) as Array<[string, RequestInit | undefined]>;
}

async function ligne(email: string) {
  return (await screen.findByText(email)).closest('li') as HTMLElement;
}

describe('Administration — crédits des comptes', () => {
  beforeEach(() => {
    window.localStorage.clear();
    signInAs('jeton', { id: 'admin', email: 'admin@ignitux.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('liste les comptes : adresse, solde en or, bienvenue versée ou non', async () => {
    mockApiRoutes({ 'GET /admin/credits': { status: 200, body: PAGE_1 } });
    afficher();

    expect(await screen.findByRole('heading', { level: 1, name: 'Crédits des comptes' })).toBeInTheDocument();
    const alice = await ligne('alice@exemple.fr');
    expect(within(alice).getByText('26 crédits')).toHaveClass('credits-montant');
    expect(alice).toHaveTextContent('Bienvenue versée');
    const bruno = await ligne('bruno@exemple.fr');
    expect(bruno).toHaveTextContent('Bienvenue pas encore versée');
    expect(screen.getByText('60 comptes · page 1 sur 2')).toBeInTheDocument();
  });

  it('cherche une adresse et pagine', async () => {
    mockApiRoutes({ 'GET /admin/credits': { status: 200, body: PAGE_1 } });
    afficher();
    await ligne('alice@exemple.fr');

    fireEvent.change(screen.getByLabelText('Rechercher une adresse'), { target: { value: 'alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    await waitFor(() =>
      expect(appels('GET').some(([url]) => new URL(url).searchParams.get('recherche') === 'alice')).toBe(true),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await waitFor(() =>
      expect(appels('GET').some(([url]) => new URL(url).searchParams.get('page') === '2')).toBe(true),
    );
  });

  it('ajoute des crédits avec un motif, et montre le nouveau solde', async () => {
    mockApiRoutes({
      'GET /admin/credits': { status: 200, body: PAGE_1 },
      'POST /admin/credits/u2': { status: 201, body: { id: 'c1', solde: 40 } },
    });
    afficher();

    fireEvent.click(within(await ligne('bruno@exemple.fr')).getByRole('button', { name: 'Ajuster' }));
    fireEvent.change(screen.getByLabelText('Crédits (négatif pour retirer)'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Motif (obligatoire)'), { target: { value: 'geste commercial' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter 10 crédits' }));

    expect(await screen.findByText('Fait : bruno@exemple.fr a maintenant 40 crédits.')).toBeInTheDocument();
    const [, options] = appels('POST')[0];
    expect(JSON.parse(options?.body as string)).toEqual({ credits: 10, motif: 'geste commercial' });
    const bruno = await ligne('bruno@exemple.fr');
    expect(within(bruno).getByText('40 crédits')).toBeInTheDocument();
    expect(bruno).toHaveTextContent('Bienvenue versée');
  });

  it('demande confirmation avant de retirer ; refusée, rien ne part', async () => {
    mockApiRoutes({
      'GET /admin/credits': { status: 200, body: PAGE_1 },
      'POST /admin/credits/u1': { status: 201, body: { id: 'c2', solde: 21 } },
    });
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(false);
    afficher();

    fireEvent.click(within(await ligne('alice@exemple.fr')).getByRole('button', { name: 'Ajuster' }));
    fireEvent.change(screen.getByLabelText('Crédits (négatif pour retirer)'), { target: { value: '-5' } });
    fireEvent.change(screen.getByLabelText('Motif (obligatoire)'), { target: { value: 'test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retirer 5 crédits' }));

    expect(confirmer).toHaveBeenCalledWith('Retirer 5 crédits à alice@exemple.fr ? Motif : test');
    expect(appels('POST')).toHaveLength(0);

    confirmer.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retirer 5 crédits' }));
    expect(await screen.findByText('Fait : alice@exemple.fr a maintenant 21 crédits.')).toBeInTheDocument();
    expect(JSON.parse(appels('POST')[0][1]?.body as string)).toEqual({ credits: -5, motif: 'test' });
  });

  it('montre le refus du serveur quand le retrait rendrait le solde négatif', async () => {
    mockApiRoutes({
      'GET /admin/credits': { status: 200, body: PAGE_1 },
      'POST /admin/credits/u1': {
        status: 409,
        body: { message: 'Ce retrait rendrait le solde négatif : ce compte a 26 crédits.' },
      },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    afficher();

    fireEvent.click(within(await ligne('alice@exemple.fr')).getByRole('button', { name: 'Ajuster' }));
    fireEvent.change(screen.getByLabelText('Crédits (négatif pour retirer)'), { target: { value: '-100' } });
    fireEvent.change(screen.getByLabelText('Motif (obligatoire)'), { target: { value: 'erreur de saisie' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retirer 100 crédits' }));

    expect(
      await screen.findByText('Ce retrait rendrait le solde négatif : ce compte a 26 crédits.'),
    ).toHaveClass('error');
  });

  it('refuse un motif trop court ou un nombre invalide sans rien envoyer', async () => {
    mockApiRoutes({ 'GET /admin/credits': { status: 200, body: PAGE_1 } });
    afficher();

    fireEvent.click(within(await ligne('alice@exemple.fr')).getByRole('button', { name: 'Ajuster' }));
    fireEvent.change(screen.getByLabelText('Crédits (négatif pour retirer)'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Motif (obligatoire)'), { target: { value: 'ok' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter 10 crédits' }));
    expect(await screen.findByText('Le motif est obligatoire (3 à 200 caractères).')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Crédits (négatif pour retirer)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Motif (obligatoire)'), { target: { value: 'test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(
      await screen.findByText('Indique un nombre entier de crédits, non nul, entre -10000 et 10000.'),
    ).toBeInTheDocument();
    expect(appels('POST')).toHaveLength(0);
  });

  it('dit que la page est réservée aux administrateurs sur un 403', async () => {
    mockApiRoutes({ 'GET /admin/credits': { status: 403, body: { message: 'Forbidden resource' } } });
    afficher();

    expect(await screen.findByText('Réservé aux administrateurs d’Ignitux.')).toBeInTheDocument();
  });
});
