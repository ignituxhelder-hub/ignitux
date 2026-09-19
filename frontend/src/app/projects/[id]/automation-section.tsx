'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, type AutomationRun } from '@/lib/api';

interface AutomationSectionProps {
  token: string | null;
  projectId: string;
  readOnly?: boolean;
  /**
   * Change après chaque génération réussie. Indispensable ici : chaque
   * génération déclenche une exécution d'automatisation côté serveur, et sans
   * rechargement cette section affichait encore l'état d'avant — au point de
   * laisser croire que l'automatisation automatique ne faisait rien.
   */
  refreshSignal?: number;
}

export function AutomationSection({
  token,
  projectId,
  readOnly = false,
  refreshSignal,
}: AutomationSectionProps) {
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResultMessage, setLastResultMessage] = useState<string | null>(null);

  function load() {
    if (!token) return;
    setIsLoading(true);
    api
      .listAutomationRuns(token, projectId)
      .then(setRuns)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, projectId, refreshSignal]);

  async function handleRun() {
    if (!token || readOnly) return;
    setError(null);
    setIsRunning(true);
    try {
      const result = await api.runAutomation(token, projectId);
      setRuns((prev) => [result.run, ...prev]);
      setLastResultMessage(
        `${result.tasksCreated.length} tâche(s) créée(s), ${result.tasksClosed.length} fermée(s), ` +
          `${result.conceptLinksCreated.length} lien(s) de concept créé(s).`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de lancer l'automatisation.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <div className="top-bar" style={{ marginBottom: '0.5rem' }}>
        <h2 style={{ margin: 0 }}>Automatisation</h2>
        {!readOnly && (
          <button className="secondary" type="button" onClick={handleRun} disabled={isRunning}>
            {isRunning ? 'En cours…' : "Lancer l'automatisation"}
          </button>
        )}
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        IGINI agit ici sans confirmation préalable : il crée/ferme des tâches et relie des concepts
        tout seul, dès qu&apos;une génération a lieu ou quand tu lances une exécution manuellement.
        Il n&apos;appelle jamais l&apos;IA de lui-même — chaque exécution est journalisée ci-dessous,
        pour que tu puisses voir ce qu&apos;il a fait après coup.
      </p>
      {error && <p className="error">{error}</p>}
      {lastResultMessage && <p className="muted">{lastResultMessage}</p>}
      {isLoading && <p className="loading">Chargement…</p>}
      {!isLoading && runs.length === 0 && <p className="muted">Aucune exécution pour l&apos;instant.</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {runs.map((run) => (
          <li key={run.id} className="project-item" style={{ cursor: 'default', marginBottom: '0.5rem' }}>
            <span className="muted">{new Date(run.created_at).toLocaleString('fr-FR')}</span>
            <p style={{ margin: '0.25rem 0 0' }}>
              {run.tasks_created_count} tâche(s) créée(s), {run.tasks_closed_count} fermée(s),{' '}
              {run.concept_links_created_count} lien(s) de concept créé(s).
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
