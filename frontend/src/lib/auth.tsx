'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler, type User } from './api';

interface AuthState {
  token: string | null;
  user: User | null;
  isReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEY = 'ignitux.auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Chargé uniquement côté client : localStorage n'existe pas côté serveur,
  // et le contenu est propre à ce navigateur.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { token: string; user: User };
        setToken(parsed.token);
        setUser(parsed.user);
      }
    } catch {
      // Stockage indisponible ou corrompu : on démarre déconnecté.
    } finally {
      setIsReady(true);
    }
  }, []);

  function persist(nextToken: string, nextUser: User) {
    setToken(nextToken);
    setUser(nextUser);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: nextToken, user: nextUser }));
    } catch {
      // Tant pis pour la persistance ; la session reste valide en mémoire.
    }
  }

  async function login(email: string, password: string) {
    const { accessToken, user: loggedInUser } = await api.login(email, password);
    persist(accessToken, loggedInUser);
  }

  async function signup(email: string, password: string) {
    await api.signup(email, password);
    await login(email, password);
  }

  function logout() {
    setToken(null);
    setUser(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Rien à faire si le stockage est inaccessible.
    }
  }

  // Branche la déconnexion automatique sur les 401 renvoyés par l'API (token
  // expiré ou invalide) — voir setUnauthorizedHandler dans lib/api.ts. Les
  // pages qui dépendent de `token` dans leurs effets redirigent alors
  // naturellement vers /login.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, isReady, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth doit être utilisé sous AuthProvider.');
  }
  return ctx;
}
