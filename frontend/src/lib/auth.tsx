'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setEspaceActif, setUnauthorizedHandler, setUtilisateurActif, type User } from './api';
import { oublierEspaceChoisi } from './espace-courant';

interface AuthState {
  token: string | null;
  user: User | null;
  isReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, captchaToken: string, acceptCgu: true) => Promise<void>;
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
        // Avant le jeton : aucune requête ne part sans savoir pour qui
        // ranger son cache hors ligne.
        setUtilisateurActif(parsed.user?.id ?? null);
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
    setUtilisateurActif(nextUser.id);
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

  async function signup(email: string, password: string, captchaToken: string, acceptCgu: true) {
    await api.signup(email, password, captchaToken, acceptCgu);
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
    // L'espace choisi part avec la session : la personne suivante sur cet
    // appareil commence chez elle, et aucune requête ne garde l'en-tête.
    setEspaceActif(null);
    setUtilisateurActif(null);
    try {
      oublierEspaceChoisi(window.localStorage);
    } catch {
      // Idem.
    }
  }

  // Branche la déconnexion automatique sur les 401 renvoyés par l'API (token
  // expiré ou invalide) — voir setUnauthorizedHandler dans lib/api.ts. Les
  // pages qui dépendent de `token` dans leurs effets redirigent alors
  // naturellement vers /login.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
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
