'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  type Concept,
  type ConceptLink,
  type ConceptNeighbourhood,
  type Memory,
  type MemoryCategory,
  type ScoreCard,
  type ScoreSnapshot,
  type Task,
  type TaskStatus,
} from '@/lib/api';
import { executerEnSerie } from '@/lib/executer-en-serie';
import { ResultatIa } from './resultat-ia';

interface SectionProps {
  token: string | null;
  projectId: string;
  /**
   * Change de valeur après chaque génération réussie côté page projet. Ces
   * sections sont dérivées de ce que les générateurs produisent (score
   * recalculé, tâches créées/fermées par l'automatisation, concepts reliés) :
   * sans ce signal, elles resteraient figées jusqu'au rechargement complet.
   */
  refreshSignal?: number;
  /**
   * Appelé après une modification faite à la main dans cette section.
   *
   * Le serveur relance l'orchestration à chaque mutation manuelle, et les
   * scores sont calculés à la lecture : une tâche cochée change le score
   * Construction immédiatement côté serveur, mais l'écran ne le redemandait
   * pas. On voyait donc une tâche terminée au-dessus d'un score inchangé —
   * et c'est le score qu'on finissait par croire faux.
   */
  onChanged?: () => void;
}

interface ReadOnlySectionProps extends SectionProps {
  readOnly?: boolean;
}

const SCORE_LABELS: Record<keyof ScoreCard, string> = {
  etincelle: 'Étincelle',
  construction: 'Construction',
  evolution: 'Évolution',
  transmission: 'Transmission',
  confiance: 'Confiance',
};

function scoreColor(value: number | null): string {
  if (value === null) return 'var(--text-muted)';
  if (value >= 7) return 'var(--ok)';
  if (value >= 4) return 'var(--warn)';
  return 'var(--text-muted)';
}

export function ScoreSection({ token, projectId, refreshSignal }: SectionProps) {
  const [score, setScore] = useState<ScoreCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  function load() {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    api
      .getScoreCard(token, projectId)
      .then(setScore)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Impossible de charger le score.'))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, projectId, refreshSignal]);

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <div className="top-bar" style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Score IGNITUX</h2>
        <button className="secondary" type="button" onClick={load} disabled={isLoading}>
          {isLoading ? 'Actualisation…' : 'Actualiser'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {isLoading && !score && <p className="loading">Chargement…</p>}
      {score && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '1rem',
          }}
        >
          {(Object.keys(SCORE_LABELS) as Array<keyof ScoreCard>).map((key) => (
            <div
              className="project-item"
              style={{
                cursor: 'default',
                textAlign: 'center',
                borderTop: `2px solid ${scoreColor(score[key])}`,
              }}
              key={key}
            >
              <div className="muted">{SCORE_LABELS[key]}</div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: '1.75rem',
                  fontWeight: 600,
                  color: scoreColor(score[key]),
                }}
              >
                {score[key] === null ? '—' : `${score[key]}/10`}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="muted" style={{ marginTop: '1rem', marginBottom: 0 }}>
        Ces scores sont calculés à partir de ce qu&apos;IGINI sait déjà du projet — « — » veut dire
        qu&apos;aucune donnée n&apos;existe encore pour le calculer, pas un score fabriqué.
      </p>
    </div>
  );
}

// L'acier, pas le feu : ces courbes rapportent une mesure, elles ne
// déclenchent rien — la même règle que `scoreColor` ci-dessus.
const HISTORY_COLORS: Record<keyof ScoreCard, string> = {
  etincelle: 'var(--north)',
  construction: 'var(--ok)',
  evolution: 'var(--warn)',
  transmission: 'var(--danger)',
  confiance: 'var(--steel)',
};

function ScoreHistoryChart({ history }: { history: ScoreSnapshot[] }) {
  const width = 560;
  const height = 220;
  const marginLeft = 26;
  const marginRight = 10;
  const marginTop = 10;
  const marginBottom = 20;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;

  const keys = Object.keys(SCORE_LABELS) as Array<keyof ScoreCard>;

  function x(index: number) {
    return history.length === 1
      ? marginLeft + plotWidth / 2
      : marginLeft + (index / (history.length - 1)) * plotWidth;
  }

  function y(value: number) {
    return marginTop + plotHeight - (value / 10) * plotHeight;
  }

  // Un relevé manquant coupe le tracé plutôt que de le combler : voir le
  // commentaire de `historique()` côté backend, aucune interpolation.
  function pathFor(key: keyof ScoreCard) {
    let d = '';
    let drawing = false;
    history.forEach((snapshot, index) => {
      const value = snapshot[key];
      if (value === null) {
        drawing = false;
        return;
      }
      d += `${drawing ? 'L' : 'M'}${x(index)},${y(value)} `;
      drawing = true;
    });
    return d.trim();
  }

  return (
    <>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Évolution des scores dans le temps"
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        {[0, 5, 10].map((tick) => (
          <g key={tick}>
            <line
              x1={marginLeft}
              y1={y(tick)}
              x2={width - marginRight}
              y2={y(tick)}
              style={{ stroke: 'var(--border)', strokeWidth: 1 }}
            />
            <text
              x={marginLeft - 6}
              y={y(tick) + 3}
              textAnchor="end"
              style={{ fill: 'var(--text-muted)', fontSize: 9 }}
            >
              {tick}
            </text>
          </g>
        ))}
        {keys.map((key) => {
          const d = pathFor(key);
          return (
            <g key={key}>
              {d && <path d={d} style={{ fill: 'none', stroke: HISTORY_COLORS[key], strokeWidth: 2 }} />}
              {history.map((snapshot, index) => {
                const value = snapshot[key];
                if (value === null) return null;
                return (
                  <circle
                    key={`${key}-${snapshot.jour}`}
                    cx={x(index)}
                    cy={y(value)}
                    r={2.5}
                    style={{ fill: HISTORY_COLORS[key] }}
                  />
                );
              })}
            </g>
          );
        })}
        <text x={marginLeft} y={height - 4} textAnchor="start" style={{ fill: 'var(--text-muted)', fontSize: 9 }}>
          {history[0].jour}
        </text>
        <text
          x={width - marginRight}
          y={height - 4}
          textAnchor="end"
          style={{ fill: 'var(--text-muted)', fontSize: 9 }}
        >
          {history[history.length - 1].jour}
        </text>
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
        {keys.map((key) => (
          <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: HISTORY_COLORS[key],
              }}
            />
            {SCORE_LABELS[key]}
          </span>
        ))}
      </div>
    </>
  );
}

export function ScoreHistorySection({ token, projectId, refreshSignal }: SectionProps) {
  const [history, setHistory] = useState<ScoreSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  function load() {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    api
      .getScoreHistory(token, projectId)
      .then(setHistory)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Impossible de charger l'historique des scores."),
      )
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, projectId, refreshSignal]);

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <div className="top-bar" style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Historique des scores</h2>
        <button className="secondary" type="button" onClick={load} disabled={isLoading}>
          {isLoading ? 'Actualisation…' : 'Actualiser'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {isLoading && history.length === 0 && !error && <p className="loading">Chargement…</p>}
      {!isLoading && !error && history.length === 0 && (
        <p className="muted">
          Pas encore d&apos;historique : reviens après quelques jours d&apos;activité sur ce projet.
        </p>
      )}
      {history.length > 0 && <ScoreHistoryChart history={history} />}
      {history.length > 0 && (
        <p className="muted" style={{ marginTop: '1rem', marginBottom: 0 }}>
          Un point par jour où au moins un score a changé — sans interpolation entre deux relevés, un
          projet qu&apos;on n&apos;a pas ouvert pendant plusieurs semaines n&apos;a pas « progressé
          régulièrement », il n&apos;a simplement pas été mesuré.
        </p>
      )}
    </div>
  );
}

const TASK_STATUSES: TaskStatus[] = ['pending', 'in_progress', 'done', 'blocked'];
const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'À faire',
  in_progress: 'En cours',
  done: 'Terminée',
  blocked: 'Bloquée',
};
const SOURCE_LABELS: Record<string, string> = {
  manual: 'Ajoutée manuellement',
  analysis: "Suggérée par l'analyse",
  build_plan: 'Suggérée par le plan de construction',
};

export function TasksSection({
  token,
  projectId,
  readOnly = false,
  refreshSignal,
  onChanged,
}: ReadOnlySectionProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<{ courant: number; total: number } | null>(null);
  const [limite, setLimite] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setIsLoading(true);
    api
      .listTasks(token, projectId)
      .then((data) => {
        if (!cancelled) setTasks(data);
      })
      .catch(() => {
        // Pas bloquant : la liste des tâches est secondaire à la fiche projet.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, projectId, refreshSignal]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!token || !title.trim()) return;
    setError(null);
    setIsCreating(true);
    try {
      const task = await api.createTask(token, projectId, title.trim());
      setTasks((prev) => [task, ...prev]);
      setTitle('');
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de créer la tâche.');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleStatusChange(taskId: string, status: TaskStatus) {
    if (!token) return;
    setError(null);
    try {
      const updated = await api.updateTaskStatus(token, taskId, status);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de mettre à jour la tâche.');
    }
  }

  function remplacer(updated: Task) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  function basculer(taskId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  async function lancerLot(ids: string[]) {
    if (!token || ids.length === 0) return;
    setError(null);
    setLimite(null);
    setIsRunning(true);
    setProgress({ courant: 0, total: ids.length });
    let rang = 0;
    try {
      const bilan = await executerEnSerie(
        ids,
        (id) => api.runTask(token, projectId, id),
        (info) => {
          if (info.etat === 'en_cours') {
            rang += 1;
            setProgress({ courant: rang, total: ids.length });
          } else if (info.etat === 'ok' && info.resultat) {
            remplacer(info.resultat);
            setSelected((prev) => {
              const next = new Set(prev);
              next.delete(info.id);
              return next;
            });
          } else if (info.etat === 'echec') {
            setTasks((prev) => prev.map((t) => (t.id === info.id ? { ...t, ai_status: 'echec' } : t)));
            setSelected((prev) => {
              const next = new Set(prev);
              next.delete(info.id);
              return next;
            });
          } else if (info.etat === 'arret' && info.message) {
            setError(info.message);
          }
        },
      );
      if (bilan.arretePourLimite) {
        const n = bilan.restants.length;
        setLimite(`Limite atteinte : ${n} élément${n > 1 ? 's' : ''} non traité${n > 1 ? 's' : ''}`);
      }
      onChanged?.();
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  }

  async function handleValider(taskId: string) {
    if (!token) return;
    setError(null);
    setBusyId(taskId);
    try {
      remplacer(await api.validateTask(token, projectId, taskId));
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de valider ce résultat.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRefuser(taskId: string, motif?: string) {
    if (!token) return;
    setError(null);
    setBusyId(taskId);
    try {
      remplacer(await api.refuseTask(token, projectId, taskId, motif));
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de refuser ce résultat.');
    } finally {
      setBusyId(null);
    }
  }

  // Une tâche à valider a déjà son résultat : on ne la relance pas dans un lot.
  const lancable = (t: Task) => t.status !== 'done' && t.ai_status !== 'a_valider';
  const coches = tasks.filter((t) => selected.has(t.id) && lancable(t)).map((t) => t.id);

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Tâches</h2>
      {error && <p className="error">{error}</p>}
      {limite && <p className="error">{limite}</p>}
      {!readOnly && (
        <div style={{ marginBottom: '1rem' }}>
          <button type="button" disabled={coches.length === 0 || isRunning} onClick={() => lancerLot(coches)}>
            Faire faire par IGINI
          </button>{' '}
          {isRunning && progress ? (
            <span className="muted">
              {progress.courant} / {progress.total}
            </span>
          ) : (
            coches.length > 0 && (
              <span className="muted">
                {`${coches.length} élément${coches.length > 1 ? 's' : ''}, ~${coches.length} appel${coches.length > 1 ? 's' : ''} IA`}
              </span>
            )
          )}
        </div>
      )}
      {!readOnly && (
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
          <input
            aria-label="Nouvelle tâche"
            placeholder="Ajouter une tâche…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="secondary" type="submit" disabled={isCreating}>
            {isCreating ? 'Ajout…' : 'Ajouter'}
          </button>
        </form>
      )}
      {isLoading && <p className="loading">Chargement…</p>}
      {!isLoading && tasks.length === 0 && <p className="muted">Aucune tâche pour l&apos;instant.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {tasks.map((task) => (
          <div className="project-item" style={{ cursor: 'default' }} key={task.id}>
            <div className="top-bar">
              {!readOnly && lancable(task) ? (
                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    aria-label={`Faire faire : ${task.title}`}
                    checked={selected.has(task.id)}
                    disabled={isRunning}
                    onChange={() => basculer(task.id)}
                  />
                  <span>{task.title}</span>
                </label>
              ) : (
                <span>{task.title}</span>
              )}
              {readOnly ? (
                <span className="muted">{STATUS_LABELS[task.status]}</span>
              ) : (
                <select
                  aria-label={`Statut de ${task.title}`}
                  value={task.status}
                  onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                >
                  {TASK_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <span className="muted">{SOURCE_LABELS[task.source] ?? task.source}</span>
            {!readOnly && task.ai_status === 'a_valider' && task.ai_result && task.ai_result_kind && (
              <ResultatIa
                kind={task.ai_result_kind}
                contenu={task.ai_result}
                libelleValider="Valider"
                disabled={busyId === task.id}
                onValider={() => handleValider(task.id)}
                onRefuser={(motif) => handleRefuser(task.id, motif)}
              />
            )}
            {!readOnly && task.ai_status === 'echec' && (
              <p style={{ margin: '0.5rem 0 0' }}>
                IGINI n&apos;a pas pu faire cette tâche{' '}
                <button
                  className="secondary"
                  type="button"
                  disabled={isRunning}
                  onClick={() => lancerLot([task.id])}
                >
                  Réessayer
                </button>
              </p>
            )}
            {task.ai_status === 'refuse' && (
              <p className="muted" style={{ margin: '0.5rem 0 0' }}>
                Refusé{task.ai_refusal_reason ? ` : ${task.ai_refusal_reason}` : ''}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const MEMORY_CATEGORIES: MemoryCategory[] = ['decision', 'preference', 'learning', 'fact', 'error'];
const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  decision: 'Décision',
  preference: 'Préférence',
  learning: 'Apprentissage',
  fact: 'Fait',
  error: 'Erreur à ne pas refaire',
};

export function MemorySection({ token, projectId, readOnly = false }: ReadOnlySectionProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [recalled, setRecalled] = useState<Memory[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [category, setCategory] = useState<MemoryCategory>('decision');
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtres de recherche. `query` est appliqué à la soumission du formulaire
  // et non à chaque frappe : une requête par caractère tapé inonderait
  // l'API pour un confort que personne n'a demandé.
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<MemoryCategory | ''>('');
  const [filterTag, setFilterTag] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      api
        .listMemories(token, projectId, {
          query: appliedQuery || undefined,
          category: filterCategory || undefined,
          tags: filterTag ? [filterTag] : undefined,
        })
        .then((data) => {
          if (!cancelled) setMemories(data);
        }),
      api.getMemorySummary(token, projectId).then((res) => {
        if (!cancelled) setSummary(res.summary);
      }),
      api.listMemoryTags(token, projectId).then((tags) => {
        if (!cancelled) setAvailableTags(tags);
      }),
      api.recallMemories(token, projectId).then((data) => {
        if (!cancelled) setRecalled(data);
      }),
    ])
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, projectId, appliedQuery, filterCategory, filterTag]);

  async function refreshSummaryAndTags() {
    if (!token) return;
    const [res, tags] = await Promise.all([
      api.getMemorySummary(token, projectId),
      api.listMemoryTags(token, projectId),
    ]);
    setSummary(res.summary);
    setAvailableTags(tags);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!token || !content.trim()) return;
    setError(null);
    setIsCreating(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      const memory = await api.createMemory(token, projectId, category, content.trim(), tags);
      setMemories((prev) => [memory, ...prev]);
      setContent('');
      setTagsInput('');
      await refreshSummaryAndTags();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'enregistrer ce souvenir.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleForget(id: string) {
    if (!token) return;
    setError(null);
    try {
      await api.forgetMemory(token, id);
      setMemories((prev) => prev.filter((memory) => memory.id !== id));
      await refreshSummaryAndTags();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'oublier ce souvenir.");
    }
  }

  const hasFilters = Boolean(appliedQuery || filterCategory || filterTag);

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Mémoire</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Ce qui est enregistré ici est relu par IGINI avant chaque génération : les décisions
        d&apos;abord, puis les apprentissages, les faits et les préférences.
      </p>
      {summary && (
        <p className="muted" style={{ whiteSpace: 'pre-line' }}>
          {summary}
        </p>
      )}
      {error && <p className="error">{error}</p>}

      {recalled.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <strong>Ce dont IGINI se souvient en priorité</strong>
          <p className="muted" style={{ margin: '0.25rem 0 0.5rem' }}>
            Ce qu&apos;IGINI relit avant de générer quoi que ce soit sur ce projet — les décisions
            d&apos;abord, le reste ensuite.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {recalled.map((m) => (
              <div className="project-item" style={{ cursor: 'default' }} key={`recall-${m.id}`}>
                <div className="top-bar" style={{ marginBottom: '0.25rem' }}>
                  <strong>{CATEGORY_LABELS[m.category]}</strong>
                  <span className="muted">{new Date(m.created_at).toLocaleString('fr-FR')}</span>
                </div>
                <p style={{ margin: 0 }}>{m.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setAppliedQuery(query.trim());
        }}
        style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}
      >
        <input
          aria-label="Rechercher dans les souvenirs"
          placeholder="Rechercher (tous les mots)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Filtrer par catégorie"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as MemoryCategory | '')}
        >
          <option value="">Toutes les catégories</option>
          {MEMORY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        {availableTags.length > 0 && (
          <select
            aria-label="Filtrer par étiquette"
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
          >
            <option value="">Toutes les étiquettes</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        )}
        <button className="secondary" type="submit">
          Rechercher
        </button>
      </form>

      {!readOnly && (
        <form
          onSubmit={handleCreate}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}
        >
          <select
            aria-label="Catégorie du souvenir"
            value={category}
            onChange={(e) => setCategory(e.target.value as MemoryCategory)}
          >
            {MEMORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <textarea
            aria-label="Contenu du souvenir"
            rows={2}
            placeholder="Qu'est-ce qu'IGINI doit retenir ?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <input
            aria-label="Étiquettes du souvenir"
            placeholder="Étiquettes, séparées par des virgules (facultatif)"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
          />
          <button className="secondary" type="submit" disabled={isCreating} style={{ alignSelf: 'flex-start' }}>
            {isCreating ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      )}
      {isLoading && <p className="loading">Chargement…</p>}
      {!isLoading && memories.length === 0 && (
        <p className="muted">
          {hasFilters
            ? 'Aucun souvenir ne correspond à cette recherche.'
            : "Aucun souvenir pour l'instant."}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {memories.map((m) => (
          <div className="project-item" style={{ cursor: 'default' }} key={m.id}>
            <div className="top-bar" style={{ marginBottom: '0.25rem' }}>
              <strong>{CATEGORY_LABELS[m.category]}</strong>
              <span className="muted">{new Date(m.created_at).toLocaleString('fr-FR')}</span>
            </div>
            <p style={{ margin: 0 }}>{m.content}</p>
            {/* Garde défensive : une réponse mise en cache par un client
                antérieur aux étiquettes ne porte pas encore ce champ, et
                une section entière qui plante pour un tableau absent est
                un prix disproportionné. */}
            {(m.tags ?? []).length > 0 && (
              <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                {(m.tags ?? []).map((tag) => `#${tag}`).join(' ')}
              </p>
            )}
            {!readOnly && (
              <button
                className="secondary"
                type="button"
                onClick={() => void handleForget(m.id)}
                style={{ marginTop: '0.5rem' }}
              >
                Oublier
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConceptGraphView({
  concepts,
  edges,
  onSelectConcept,
}: {
  concepts: Concept[];
  edges: ConceptLink[];
  onSelectConcept?: (id: string) => void;
}) {
  if (concepts.length === 0) return null;

  const size = 280;
  const center = size / 2;
  const radius = concepts.length === 1 ? 0 : center - 44;

  const positions = new Map<string, { x: number; y: number }>();
  concepts.forEach((concept, index) => {
    const angle = (index / concepts.length) * 2 * Math.PI - Math.PI / 2;
    positions.set(concept.id, {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
    });
  });

  function truncate(label: string) {
    return label.length > 14 ? `${label.slice(0, 13)}…` : label;
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Graphe des concepts et de leurs relations"
      style={{ width: '100%', maxWidth: 340, height: 'auto', display: 'block', margin: '0.75rem auto' }}
    >
      {edges.map((edge) => {
        const from = positions.get(edge.from_concept_id);
        const to = positions.get(edge.to_concept_id);
        if (!from || !to) return null;
        return (
          <line
            key={edge.id}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            style={{ stroke: 'var(--border)', strokeWidth: 1.5 }}
          />
        );
      })}
      {concepts.map((concept) => {
        const pos = positions.get(concept.id);
        if (!pos) return null;
        return (
          <g key={concept.id}>
            <circle
              cx={pos.x}
              cy={pos.y}
              r={7}
              role={onSelectConcept ? 'button' : undefined}
              aria-label={onSelectConcept ? `Centrer sur ${concept.name}` : undefined}
              tabIndex={onSelectConcept ? 0 : undefined}
              onClick={onSelectConcept ? () => onSelectConcept(concept.id) : undefined}
              style={{ fill: 'var(--accent)', cursor: onSelectConcept ? 'pointer' : 'default' }}
            />
            <text
              x={pos.x}
              y={pos.y + 18}
              textAnchor="middle"
              style={{ fill: 'var(--text)', fontSize: 9 }}
            >
              {truncate(concept.name)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function KnowledgeSection({
  token,
  projectId,
  readOnly = false,
  refreshSignal,
  onChanged,
}: ReadOnlySectionProps) {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [edges, setEdges] = useState<ConceptLink[]>([]);
  const [isolated, setIsolated] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [relationType, setRelationType] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Recherche : le graphe complet reste la source des relations affichées,
  // la recherche ne filtre que la liste des concepts. Filtrer aussi les
  // arêtes donnerait l'impression que des liens ont disparu.
  const [conceptQuery, setConceptQuery] = useState('');
  const [matchedIds, setMatchedIds] = useState<string[] | null>(null);
  const [pathMessage, setPathMessage] = useState<string | null>(null);

  // Voisinage : centrer le graphe sur un concept et ses voisins directs
  // plutôt que de forcer à lire un graphe entier trop dense pour qu'on y
  // distingue quoi que ce soit.
  const [focusId, setFocusId] = useState<string | null>(null);
  const [neighbourhood, setNeighbourhood] = useState<ConceptNeighbourhood | null>(null);

  function loadGraph() {
    if (!token) return;
    setIsLoading(true);
    setFocusId(null);
    setNeighbourhood(null);
    api
      .getConceptGraph(token, projectId)
      .then((graph) => {
        setConcepts(Array.isArray(graph?.nodes) ? graph.nodes : []);
        setEdges(Array.isArray(graph?.edges) ? graph.edges : []);
        setIsolated(Array.isArray(graph?.isolated) ? graph.isolated : []);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }

  async function handleFocusConcept(conceptId: string) {
    if (!token) return;
    setError(null);
    try {
      const result = await api.getConceptNeighbourhood(token, conceptId);
      setFocusId(conceptId);
      setNeighbourhood(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger le voisinage de ce concept.');
    }
  }

  function clearFocus() {
    setFocusId(null);
    setNeighbourhood(null);
  }

  useEffect(() => {
    loadGraph();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, projectId, refreshSignal]);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const query = conceptQuery.trim();
    if (!query) {
      setMatchedIds(null);
      return;
    }
    setError(null);
    try {
      const found = await api.searchConcepts(token, projectId, { query });
      setMatchedIds(found.map((concept) => concept.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de chercher parmi les concepts.');
    }
  }

  async function handleFindPath() {
    if (!token || !fromId || !toId) return;
    setError(null);
    setPathMessage(null);
    try {
      const result = await api.findConceptPath(token, fromId, toId);
      setPathMessage(
        result.path
          ? `Chemin : ${result.path.map((concept) => concept.name).join(' → ')}`
          : "Aucun lien connu entre ces deux concepts. Ce n'est pas une erreur : rien ne les relie pour l'instant.",
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de chercher un chemin.');
    }
  }

  async function handleDeleteConcept(conceptId: string) {
    if (!token) return;
    setError(null);
    try {
      await api.deleteConcept(token, conceptId);
      loadGraph();
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de supprimer ce concept.');
    }
  }

  async function handleUnlink(linkId: string) {
    if (!token) return;
    setError(null);
    try {
      await api.unlinkConcepts(token, linkId);
      loadGraph();
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de supprimer ce lien.');
    }
  }

  const visibleConcepts =
    matchedIds === null ? concepts : concepts.filter((concept) => matchedIds.includes(concept.id));

  async function handleCreateConcept(e: FormEvent) {
    e.preventDefault();
    if (!token || !name.trim()) return;
    setError(null);
    setIsCreating(true);
    try {
      const concept = await api.createConcept(token, projectId, name.trim(), description.trim() || undefined);
      setConcepts((prev) => [concept, ...prev]);
      setName('');
      setDescription('');
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de créer ce concept.');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleLink(e: FormEvent) {
    e.preventDefault();
    if (!token || !fromId || !toId || !relationType.trim()) return;
    setError(null);
    setIsLinking(true);
    try {
      const link = await api.linkConcepts(token, fromId, toId, relationType.trim());
      setEdges((prev) => [link, ...prev]);
      setRelationType('');
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de relier ces concepts.');
    } finally {
      setIsLinking(false);
    }
  }

  function conceptName(id: string) {
    return concepts.find((c) => c.id === id)?.name ?? id;
  }

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Connaissance</h2>
      {error && <p className="error">{error}</p>}
      {!readOnly && (
        <form
          onSubmit={handleCreateConcept}
          style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}
        >
          <input
            aria-label="Nom du concept"
            placeholder="Nouveau concept…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: '1 1 160px' }}
          />
          <input
            aria-label="Description du concept"
            placeholder="Description (optionnel)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ flex: '1 1 160px' }}
          />
          <button className="secondary" type="submit" disabled={isCreating}>
            {isCreating ? 'Ajout…' : 'Ajouter'}
          </button>
        </form>
      )}

      <form
        onSubmit={handleSearch}
        style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}
      >
        <input
          aria-label="Rechercher un concept"
          placeholder="Rechercher (nom ou description)"
          value={conceptQuery}
          onChange={(e) => setConceptQuery(e.target.value)}
        />
        <button className="secondary" type="submit">
          Rechercher
        </button>
        {matchedIds !== null && (
          <button
            className="secondary"
            type="button"
            onClick={() => {
              setConceptQuery('');
              setMatchedIds(null);
            }}
          >
            Tout afficher
          </button>
        )}
      </form>

      {isLoading && <p className="loading">Chargement…</p>}
      {!isLoading && concepts.length === 0 && <p className="muted">Aucun concept pour l&apos;instant.</p>}
      {!isLoading && concepts.length > 0 && visibleConcepts.length === 0 && (
        <p className="muted">Aucun concept ne correspond à cette recherche.</p>
      )}
      <ConceptGraphView
        concepts={focusId && neighbourhood ? neighbourhood.nodes : concepts}
        edges={focusId && neighbourhood ? neighbourhood.edges : edges}
        onSelectConcept={(id) => void handleFocusConcept(id)}
      />
      {focusId && (
        <p className="muted">
          Voisinage de {conceptName(focusId)}.{' '}
          <button className="secondary" type="button" onClick={clearFocus}>
            Centrer sur tout le graphe
          </button>
        </p>
      )}
      {isolated.length > 0 && (
        <p className="muted">
          {isolated.length} concept(s) ne sont reliés à rien pour l&apos;instant. Ce n&apos;est pas
          un défaut : souvent, ce sont des idées pas encore rattachées au reste.
        </p>
      )}
      {/* Nommée : le même libellé de concept apparaît aussi dans le graphe
          SVG et dans les listes déroulantes de liaison, donc un test (comme
          un lecteur d'écran) a besoin de pouvoir désigner cette liste-ci. */}
      <ul aria-label="Concepts du projet" style={{ margin: 0, paddingLeft: '1.25rem' }}>
        {visibleConcepts.map((c) => (
          <li key={c.id}>
            {c.name}
            {c.description ? ` — ${c.description}` : ''}
            {!readOnly && (
              <button
                className="secondary"
                type="button"
                onClick={() => void handleDeleteConcept(c.id)}
                style={{ marginLeft: '0.5rem' }}
              >
                Supprimer
              </button>
            )}
          </li>
        ))}
      </ul>

      {!readOnly && concepts.length >= 2 && (
        <form
          onSubmit={handleLink}
          style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}
        >
          <select aria-label="Concept de départ" value={fromId} onChange={(e) => setFromId(e.target.value)}>
            <option value="">Concept de départ…</option>
            {concepts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select aria-label="Concept d'arrivée" value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">Concept d&apos;arrivée…</option>
            {concepts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            aria-label="Type de relation"
            placeholder="Type de relation (ex : dépend de)"
            value={relationType}
            onChange={(e) => setRelationType(e.target.value)}
          />
          <button className="secondary" type="submit" disabled={isLinking}>
            {isLinking ? 'Liaison…' : 'Relier'}
          </button>
          <button className="secondary" type="button" onClick={() => void handleFindPath()}>
            Chercher un chemin
          </button>
        </form>
      )}
      {pathMessage && <p className="muted">{pathMessage}</p>}

      {edges.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <strong>Relations</strong>
          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
            {edges.map((edge) => (
              <li key={edge.id}>
                {conceptName(edge.from_concept_id)} → {conceptName(edge.to_concept_id)} ({edge.relation_type})
                {!readOnly && (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => void handleUnlink(edge.id)}
                    style={{ marginLeft: '0.5rem' }}
                  >
                    Délier
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
