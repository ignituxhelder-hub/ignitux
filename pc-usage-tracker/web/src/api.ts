import type { DashboardStats, SessionRecord } from './types';

// Vide en dev (le serveur Vite proxifie /api vers l'API — voir vite.config.ts).
// Gravé au build en production (voir web/Dockerfile) : une fois le frontend
// et l'API servis depuis des origines différentes, l'URL relative /api ne
// suffit plus.
const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}/api${path}`);
  if (!response.ok) {
    throw new Error(`Requête échouée (${response.status}) : ${path}`);
  }
  return (await response.json()) as T;
}

export function fetchDashboard(): Promise<DashboardStats> {
  return getJson<DashboardStats>('/stats/dashboard');
}

export function fetchSessions(limit = 20): Promise<SessionRecord[]> {
  return getJson<SessionRecord[]>(`/sessions?limit=${limit}`);
}
