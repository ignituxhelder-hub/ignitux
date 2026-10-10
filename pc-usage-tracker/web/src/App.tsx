import { useEffect, useState } from 'react';
import { fetchDashboard, fetchSessions } from './api';
import Dashboard from './components/Dashboard';
import SessionHistoryTable from './components/SessionHistoryTable';
import type { DashboardStats, SessionRecord } from './types';

const REFRESH_INTERVAL_MS = 5000;

export default function App(): JSX.Element {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = async (): Promise<void> => {
      try {
        const [dashboard, history] = await Promise.all([fetchDashboard(), fetchSessions()]);
        if (cancelled) return;
        setStats(dashboard);
        setSessions(history);
        setError(null);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    };

    void refresh();
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <main className="app">
      <h1>Comptabilisation du serveur IGNITUX</h1>
      {error && <p className="error">Impossible de contacter l&apos;API : {error}</p>}
      {stats ? <Dashboard stats={stats} /> : <p>Chargement…</p>}
      <h2>Historique des sessions</h2>
      <SessionHistoryTable sessions={sessions} />
    </main>
  );
}
