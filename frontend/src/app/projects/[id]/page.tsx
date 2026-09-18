'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type Analysis, type BuildPlan, type Project } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [buildPlans, setBuildPlans] = useState<BuildPlan[]>([]);
  const [isPlanning, setIsPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    setAnalyses([]);
    setBuildPlans([]);

    api
      .getProject(token, id)
      .then((data) => {
        if (cancelled) return;
        setProject(data);
        setTitle(data.title);
        setDescription(data.description ?? '');
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : 'Impossible de charger le projet.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    api
      .listAnalyses(token, id)
      .then((data) => {
        if (cancelled) return;
        setAnalyses(data);
      })
      .catch(() => {
        // Pas bloquant : l'historique des analyses est secondaire à la fiche projet.
      });

    api
      .listBuildPlans(token, id)
      .then((data) => {
        if (cancelled) return;
        setBuildPlans(data);
      })
      .catch(() => {
        // Pas bloquant : l'historique des plans est secondaire à la fiche projet.
      });

    return () => {
      cancelled = true;
    };
  }, [isReady, token, id, router]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setFormError(null);
    setIsSaving(true);
    try {
      const updated = await api.updateProject(token, id, title, description);
      setProject(updated);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Impossible de sauvegarder.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAnalyze() {
    if (!token) return;
    setAnalysisError(null);
    setIsAnalyzing(true);
    try {
      const analysis = await api.analyzeProject(token, id);
      setAnalyses((prev) => [analysis, ...prev]);
    } catch (err) {
      setAnalysisError(err instanceof ApiError ? err.message : "Impossible d'analyser le projet.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handlePlan() {
    if (!token) return;
    setPlanError(null);
    setIsPlanning(true);
    try {
      const plan = await api.createBuildPlan(token, id);
      setBuildPlans((prev) => [plan, ...prev]);
    } catch (err) {
      setPlanError(err instanceof ApiError ? err.message : 'Impossible de générer le plan.');
    } finally {
      setIsPlanning(false);
    }
  }

  async function handleDelete() {
    if (!token) return;
    setIsDeleting(true);
    try {
      await api.deleteProject(token, id);
      router.replace('/projects');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Impossible de supprimer.');
      setIsDeleting(false);
    }
  }

  if (!isReady || !token) {
    return null;
  }

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <Link href="/projects" className="muted">
          ← Retour aux projets
        </Link>
      </div>

      {isLoading && <p className="muted">Chargement…</p>}
      {loadError && <p className="error">{loadError}</p>}

      {project && (
        <form className="card" onSubmit={handleSave}>
          {formError && <p className="error">{formError}</p>}
          <div className="field">
            <label htmlFor="title">Titre</label>
            <input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="primary" type="submit" disabled={isSaving}>
              {isSaving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
            <button
              className="secondary"
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Suppression…' : 'Supprimer le projet'}
            </button>
          </div>
        </form>
      )}

      {project && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="top-bar" style={{ marginBottom: analyses.length ? '1rem' : 0 }}>
            <h2 style={{ margin: 0 }}>Analyse</h2>
            <button className="secondary" type="button" onClick={handleAnalyze} disabled={isAnalyzing}>
              {isAnalyzing ? 'Analyse en cours…' : 'Analyser ce projet'}
            </button>
          </div>
          {analysisError && <p className="error">{analysisError}</p>}
          {analyses.length === 0 && !isAnalyzing && (
            <p className="muted">Aucune analyse pour l&apos;instant.</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {analyses.map((analysis) => (
              <AnalysisCard analysis={analysis} key={analysis.id} />
            ))}
          </div>
        </div>
      )}

      {project && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="top-bar" style={{ marginBottom: buildPlans.length ? '1rem' : 0 }}>
            <h2 style={{ margin: 0 }}>Plan de construction</h2>
            <button className="secondary" type="button" onClick={handlePlan} disabled={isPlanning}>
              {isPlanning ? 'Génération…' : 'Générer un plan'}
            </button>
          </div>
          {planError && <p className="error">{planError}</p>}
          {buildPlans.length === 0 && !isPlanning && (
            <p className="muted">Aucun plan pour l&apos;instant.</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {buildPlans.map((plan) => (
              <BuildPlanCard plan={plan} key={plan.id} />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

function AnalysisCard({ analysis }: { analysis: Analysis }) {
  return (
    <div className="project-item" style={{ cursor: 'default' }}>
      <div className="top-bar" style={{ marginBottom: '0.5rem' }}>
        <strong>Score de faisabilité : {analysis.feasibility_score}/10</strong>
        <span className="muted">{new Date(analysis.created_at).toLocaleString('fr-FR')}</span>
      </div>
      <p>{analysis.summary}</p>
      <AnalysisList title="Points forts" items={analysis.strengths} />
      <AnalysisList title="Risques" items={analysis.risks} />
      <AnalysisList title="Prochaines étapes" items={analysis.next_steps} />
    </div>
  );
}

function BuildPlanCard({ plan }: { plan: BuildPlan }) {
  return (
    <div className="project-item" style={{ cursor: 'default' }}>
      <div className="top-bar" style={{ marginBottom: '0.5rem' }}>
        <strong>Délai estimé : {plan.estimated_timeline}</strong>
        <span className="muted">{new Date(plan.created_at).toLocaleString('fr-FR')}</span>
      </div>
      <p>{plan.summary}</p>
      <AnalysisList title="Jalons" items={plan.milestones} />
      <AnalysisList title="Ressources clés" items={plan.key_resources} />
    </div>
  );
}

function AnalysisList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: '0.5rem' }}>
      <strong>{title}</strong>
      <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
