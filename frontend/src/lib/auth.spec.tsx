import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { AuthProvider, useAuth } from './auth';

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

/** Simule les réponses successives de fetch, dans l'ordre des appels. */
function mockFetchSequence(...responses: Array<{ status: number; body: unknown }>) {
  let call = 0;
  global.fetch = vi.fn().mockImplementation(() => {
    const { status, body } = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
  }) as unknown as typeof fetch;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("commence déconnecté quand rien n'est en localStorage", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.token).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it("login persiste le token et l'utilisateur", async () => {
    mockFetchSequence({
      status: 200,
      body: { accessToken: 'tok123', user: { id: 'u1', email: 'a@b.com' } },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));

    await act(async () => {
      await result.current.login('a@b.com', 'motdepasse');
    });

    expect(result.current.token).toBe('tok123');
    expect(result.current.user).toEqual({ id: 'u1', email: 'a@b.com' });
    expect(JSON.parse(window.localStorage.getItem('ignitux.auth')!).token).toBe('tok123');
  });

  it('logout efface le token, l\'utilisateur et le stockage', async () => {
    mockFetchSequence({
      status: 200,
      body: { accessToken: 'tok123', user: { id: 'u1', email: 'a@b.com' } },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    await act(async () => {
      await result.current.login('a@b.com', 'motdepasse');
    });

    act(() => {
      result.current.logout();
    });

    expect(result.current.token).toBeNull();
    expect(result.current.user).toBeNull();
    expect(window.localStorage.getItem('ignitux.auth')).toBeNull();
  });

  it('se déconnecte automatiquement quand une requête authentifiée reçoit un 401', async () => {
    mockFetchSequence(
      { status: 200, body: { accessToken: 'tok123', user: { id: 'u1', email: 'a@b.com' } } },
      { status: 401, body: { message: 'Unauthorized' } },
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    await act(async () => {
      await result.current.login('a@b.com', 'motdepasse');
    });
    expect(result.current.token).toBe('tok123');

    // Simule un appel authentifié qui échoue parce que le token a expiré.
    await act(async () => {
      await api.listProjects(result.current.token!).catch(() => {});
    });

    await waitFor(() => expect(result.current.token).toBeNull());
    expect(window.localStorage.getItem('ignitux.auth')).toBeNull();
  });
});
