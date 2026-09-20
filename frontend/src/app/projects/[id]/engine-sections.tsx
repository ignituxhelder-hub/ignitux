'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  type Concept,
  type ConceptLink,
  type Memory,
  type MemoryCategory,
  type ScoreCard,
  type Task,
  type TaskStatus,
} from '@/lib/api';

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

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Tâches</h2>
      {error && <p className="error">{error}</p>}
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
              <span>{task.title}</span>
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
          </div>
        ))}
      </div>
    </div>
  );
}

const MEMORY_CATEGORIES: MemoryCategory[] = ['decision', 'preference', 'learning', 'fact'];
const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  decision: 'Décision',
  preference: 'Préférence',
  learning: 'Apprentissage',
  fact: 'Fait',
};

export function MemorySection({ token, projectId, readOnly = false }: ReadOnlySectionProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
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

function ConceptGraphView({ concepts, edges }: { concepts: Concept[]; edges: ConceptLink[] }) {
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
            <circle cx={pos.x} cy={pos.y} r={7} style={{ fill: 'var(--accent)' }} />
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

  function loadGraph() {
    if (!token) return;
    setIsLoading(true);
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
      <ConceptGraphView concepts={concepts} edges={edges} />
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
