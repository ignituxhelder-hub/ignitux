'use client';

import { useEffect, useState } from 'react';
import {
  api,
  ApiError,
  type WorkflowDefinition,
  type WorkflowRun,
  type WorkflowStep,
  type WorkflowTemplate,
} from '@/lib/api';

interface WorkflowSectionProps {
  token: string | null;
  projectId: string;
  readOnly?: boolean;
  /**
   * Chaque génération peut faire avancer les processus en cours côté
   * serveur (voir ProjectsService). Sans ce signal, cette section montrerait
   * un processus figé alors qu'il a déjà progressé.
   */
  refreshSignal?: number;
}

const STATUS_LABELS: Record<string, string> = {
  running: 'en cours',
  blocked: 'en attente',
  completed: 'terminé',
};

const CONDITION_LABELS: Record<string, string> = {
  always: 'sans condition',
  stage_exists: 'quand une étape existe',
  tasks_done: 'quand des tâches sont terminées',
  manual: 'sur ta validation',
};

function activeRun(workflow: WorkflowDefinition): WorkflowRun | undefined {
  return workflow.runs.find((run) => run.status === 'running' || run.status === 'blocked');
}

export function WorkflowSection({
  token,
  projectId,
  readOnly = false,
  refreshSignal,
}: WorkflowSectionProps) {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  function load() {
    if (!token) return;
    setIsLoading(true);
    Promise.all([api.listWorkflows(token, projectId), api.listWorkflowTemplates(token)])
      .then(([workflowList, templateList]) => {
        setWorkflows(workflowList);
        setTemplates(templateList);
        if (templateList.length > 0) {
          setSelectedTemplate((current) => current || templateList[0].slug);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, projectId, refreshSignal]);

  async function run(action: () => Promise<unknown>, failureMessage: string) {
    if (!token) return;
    setError(null);
    setIsBusy(true);
    try {
      await action();
      const workflowList = await api.listWorkflows(token, projectId);
      setWorkflows(workflowList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : failureMessage);
    } finally {
      setIsBusy(false);
    }
  }

  function handleCreateFromTemplate() {
    if (!token || !selectedTemplate) return;
    setLastMessage(null);
    void run(
      () => api.createWorkflowFromTemplate(token, projectId, selectedTemplate),
      "Impossible de créer ce processus.",
    );
  }

  function handleStart(workflowId: string) {
    if (!token) return;
    void run(async () => {
      const result = await api.startWorkflowRun(token, workflowId);
      setLastMessage(describeResult(result.stepsCompleted.length, result.blockedReason));
    }, "Impossible de démarrer ce processus.");
  }

  function handleAdvance(runId: string) {
    if (!token) return;
    void run(async () => {
      const result = await api.advanceWorkflowRun(token, runId);
      setLastMessage(describeResult(result.stepsCompleted.length, result.blockedReason));
    }, "Impossible de faire avancer ce processus.");
  }

  function handleConfirm(runId: string, position: number) {
    if (!token) return;
    void run(async () => {
      const result = await api.confirmWorkflowStep(token, runId, position);
      setLastMessage(describeResult(result.stepsCompleted.length, result.blockedReason));
    }, "Impossible de valider cette étape.");
  }

  function handleDelete(workflowId: string) {
    if (!token) return;
    setLastMessage(null);
    void run(() => api.deleteWorkflow(token, workflowId), 'Impossible de supprimer ce processus.');
  }

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Processus</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Un processus enchaîne des étapes dont les conditions sont évaluées sur l&apos;état réel du
        projet. Il ne franchit jamais une étape dont il ne sait pas vérifier la condition : dans ce
        cas il s&apos;arrête et dit pourquoi.
      </p>

      {error && <p className="error">{error}</p>}
      {lastMessage && <p className="muted">{lastMessage}</p>}

      {!readOnly && templates.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <select
            aria-label="Modèle de processus"
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
          >
            {templates.map((template) => (
              <option key={template.slug} value={template.slug}>
                {template.name} ({template.stepCount} étapes)
              </option>
            ))}
          </select>
          <button
            className="secondary"
            type="button"
            onClick={handleCreateFromTemplate}
            disabled={isBusy}
          >
            Créer depuis ce modèle
          </button>
        </div>
      )}

      {isLoading && <p className="loading">Chargement…</p>}
      {!isLoading && workflows.length === 0 && (
        <p className="muted">
          Aucun processus pour ce projet. Ignitux n&apos;en impose aucun : c&apos;est à toi de
          choisir si tu veux en suivre un.
        </p>
      )}

      {workflows.map((workflow) => {
        const current = activeRun(workflow);
        const lastRun = current ?? workflow.runs[0];

        return (
          <div
            key={workflow.id}
            className="project-item"
            style={{ cursor: 'default', marginBottom: '0.75rem' }}
          >
            <div className="top-bar" style={{ marginBottom: '0.25rem' }}>
              <strong>{workflow.name}</strong>
              {lastRun && (
                <span className="muted">
                  {STATUS_LABELS[lastRun.status] ?? lastRun.status} — étape{' '}
                  {Math.min(lastRun.current_position + 1, workflow.steps.length)} sur{' '}
                  {workflow.steps.length}
                </span>
              )}
            </div>
            {workflow.description && (
              <p className="muted" style={{ margin: '0 0 0.5rem' }}>
                {workflow.description}
              </p>
            )}

            <ol style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem' }}>
              {workflow.steps.map((step: WorkflowStep) => {
                const done = lastRun ? step.position < lastRun.current_position : false;
                const isCurrent = lastRun ? step.position === lastRun.current_position : false;
                return (
                  <li
                    key={step.id}
                    style={{ color: done ? 'var(--ok)' : undefined }}
                  >
                    {step.title}{' '}
                    <span className="muted">
                      ({CONDITION_LABELS[step.condition_type] ?? step.condition_type}
                      {step.condition_value ? ` : ${step.condition_value}` : ''})
                    </span>
                    {done && <span className="muted"> — franchie</span>}
                    {isCurrent && lastRun?.status !== 'completed' && (
                      <span className="muted"> — en attente</span>
                    )}
                  </li>
                );
              })}
            </ol>

            {!readOnly && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {!current && (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => handleStart(workflow.id)}
                    disabled={isBusy}
                  >
                    Démarrer
                  </button>
                )}
                {current && (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => handleAdvance(current.id)}
                    disabled={isBusy}
                  >
                    Réévaluer
                  </button>
                )}
                {current &&
                  workflow.steps[current.current_position]?.condition_type === 'manual' && (
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => handleConfirm(current.id, current.current_position)}
                      disabled={isBusy}
                    >
                      Valider cette étape
                    </button>
                  )}
                <button
                  className="secondary"
                  type="button"
                  onClick={() => handleDelete(workflow.id)}
                  disabled={isBusy}
                >
                  Supprimer
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function describeResult(stepsCompleted: number, blockedReason: string | null): string {
  if (stepsCompleted === 0 && blockedReason) {
    return `Aucune étape franchie. ${blockedReason}`;
  }
  const franchies = `${stepsCompleted} étape(s) franchie(s).`;
  return blockedReason ? `${franchies} ${blockedReason}` : `${franchies} Processus terminé.`;
}
