import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { signInAs } from '@/test-utils/mocks';
import { OfflineBanner } from './offline-banner';

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

function seedQueue(entries: unknown[], rejected: unknown[] = []) {
  window.localStorage.setItem(
    'ignitux.offline',
    JSON.stringify({ pending: entries, rejected }),
  );
}

const PENDING = {
  id: 'q1',
  path: '/projects/p1/tasks',
  method: 'POST',
  body: '{"title":"Relire"}',
  label: 'Création sur /projects/p1/tasks',
  queuedAt: '2026-09-19T10:00:00.000Z',
};

describe('OfflineBanner', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setOnline(true);
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

it('prévient quand le stockage ne retient plus ce qui a été envoyé', async () => {
    // Le pire cas de la file : l'écriture est partie au serveur, mais le
    // navigateur ne peut plus enregistrer qu'elle est partie — elle risque
    // donc de repartir une seconde fois. La file produisait déjà ce signal
    // et personne ne l'écoutait : le message n'existait nulle part.
    seedQueue([PENDING]);
    setOnline(true);

    // Le stockage accepte la lecture et avale les écritures, sans lever.
    const vraiSetItem = window.localStorage.setItem.bind(window.localStorage);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((cle, valeur) => {
      if (cle === 'ignitux.offline') return;
      vraiSetItem(cle, valeur);
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <OfflineBanner />
      </AuthProvider>,
    );

    expect(await screen.findByText(/stockage de ton navigateur est saturé/)).toBeInTheDocument();
    expect(screen.getByText(/repartir une seconde fois/)).toBeInTheDocument();
  });

  it("ne s'affiche pas quand tout va bien", () => {
    const { container } = render(
      <AuthProvider>
        <OfflineBanner />
      </AuthProvider>,
    );

    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('annonce la coupure réseau', async () => {
    setOnline(false);

    render(
      <AuthProvider>
        <OfflineBanner />
      </AuthProvider>,
    );

    expect(await screen.findByText(/Hors ligne\./)).toBeInTheDocument();
  });

  it("dit explicitement que les actions en attente ne sont PAS enregistrées", async () => {
    // C'est le cœur de l'honnêteté du mode hors ligne : ne jamais laisser
    // croire qu'une action en file est acquise.
    setOnline(false);
    seedQueue([PENDING]);

    render(
      <AuthProvider>
        <OfflineBanner />
      </AuthProvider>,
    );

    expect(
      await screen.findByText(/Elles ne sont pas encore enregistrées sur le serveur/),
    ).toBeInTheDocument();
    expect(screen.getByText('Création sur /projects/p1/tasks')).toBeInTheDocument();
  });

  it('montre les actions refusées avec le motif du serveur', async () => {
    setOnline(false);
    seedQueue([], [
      {
        ...PENDING,
        rejectedAt: '2026-09-19T11:00:00.000Z',
        status: 422,
        reason: 'Action refusée par la Constitution IGNITUX.',
      },
    ]);

    render(
      <AuthProvider>
        <OfflineBanner />
      </AuthProvider>,
    );

    expect(await screen.findByText(/1 action\(s\) refusée\(s\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/Action refusée par la Constitution IGNITUX\./),
    ).toBeInTheDocument();
  });

  it("permet d'écarter une action refusée", async () => {
    setOnline(false);
    seedQueue([], [
      {
        ...PENDING,
        rejectedAt: '2026-09-19T11:00:00.000Z',
        status: 422,
        reason: 'Invalide.',
      },
    ]);

    render(
      <AuthProvider>
        <OfflineBanner />
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Écarter' }));

    await waitFor(() =>
      expect(screen.queryByText(/1 action\(s\) refusée\(s\)/)).not.toBeInTheDocument(),
    );
  });

  it('rejoue la file à la reconnexion et rend compte du résultat', async () => {
    seedQueue([PENDING]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <OfflineBanner />
      </AuthProvider>,
    );

    expect(await screen.findByText(/1 action\(s\) envoyée\(s\)/)).toBeInTheDocument();
  });

  it('dit que l’écran est en retard, et met le rafraîchissement à portée de clic', async () => {
    // Vérifié de bout en bout au navigateur : une tâche écrite hors ligne
    // arrive bien en base à la reconnexion, reste invisible à l'écran, et
    // apparaît après un rechargement. Pour la personne, la séquence est
    // trompeuse — « 1 action en attente » disparaît et sa tâche n'est
    // toujours pas là. Elle conclut qu'elle est perdue, la ressaisit, et
    // se retrouve avec un doublon.
    seedQueue([PENDING]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <OfflineBanner />
      </AuthProvider>,
    );

    expect(await screen.findByText(/ne les montre pas encore/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rafraîchir/i })).toBeInTheDocument();
  });

  it('ne propose pas de rafraîchir quand rien n’est parti', async () => {
    // Sinon le bouton deviendrait un décor qu'on n'aperçoit plus, et il
    // n'aurait rien à montrer.
    seedQueue([]);

    render(
      <AuthProvider>
        <OfflineBanner />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /rafraîchir/i })).not.toBeInTheDocument();
    });
  });

  it('range en « refusée » une action que le serveur rejette au rejeu', async () => {
    seedQueue([PENDING]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ message: 'Titre déjà utilisé.' }),
    }) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <OfflineBanner />
      </AuthProvider>,
    );

    expect(await screen.findByText(/Titre déjà utilisé\./)).toBeInTheDocument();
  });

  it('laisse en attente une action qu\'une panne serveur empêche d\'envoyer', async () => {
    // 5xx : l'écriture reste valable, la perdre serait injustifié.
    seedQueue([PENDING]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ message: 'Indisponible.' }),
    }) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <OfflineBanner />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText(/1 action\(s\) en attente/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/refusée\(s\)/)).not.toBeInTheDocument();
  });
});
