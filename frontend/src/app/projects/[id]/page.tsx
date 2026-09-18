'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  useEffect,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  api,
  ApiError,
  type Analysis,
  type BuildPlan,
  type DevelopmentPlan,
  type FinancingPlan,
  type Project,
  type TransmissionPlan,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Charge la liste d'un type de plan (analyse, financement, …) pour le projet courant. */
function usePlanList<T>(
  token: string | null,
  id: string,
  list: (token: string, id: string) => Promise<T[]>,
) {
  const [items, setItems] = useState<T[]>([]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    // Repart de zéro à chaque changement de projet, pour ne pas laisser
    // apparaître les éléments du projet précédent le temps du nouveau fetch.
    setItems([]);

    list(token, id)
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch(() => {
        // Pas bloquant : l'historique de ce plan est secondaire à la fiche projet.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  return [items, setItems] as const;
}

/** Génère un nouveau plan (bouton "Analyser", "Générer un plan", …) et le préfixe à la liste. */
function useGeneration<T>(
  token: string | null,
  id: string,
  create: (token: string, id: string) => Promise<T>,
  setItems: Dispatch<SetStateAction<T[]>>,
  failureMessage: string,
) {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!token) return;
    setError(null);
    setIsBusy(true);
    try {
      const created = await create(token, id);
      setItems((prev) => [created, ...prev]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : failureMessage);
    } finally {
      setIsBusy(false);
    }
  }

  return { isBusy, error, generate };
}

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

  const [analyses, setAnalyses] = usePlanList<Analysis>(token, id, api.listAnalyses);
  const analysis = useGeneration(token, id, api.analyzeProject, setAnalyses, "Impossible d'analyser le projet.");

  const [buildPlans, setBuildPlans] = usePlanList<BuildPlan>(token, id, api.listBuildPlans);
  const plan = useGeneration(token, id, api.createBuildPlan, setBuildPlans, 'Impossible de générer le plan.');

  const [financingPlans, setFinancingPlans] = usePlanList<FinancingPlan>(token, id, api.listFinancingPlans);
  const financing = useGeneration(
    token,
    id,
    api.createFinancingPlan,
    setFinancingPlans,
    'Impossible de générer le plan de financement.',
  );

  const [developmentPlans, setDevelopmentPlans] = usePlanList<DevelopmentPlan>(
    token,
    id,
    api.listDevelopmentPlans,
  );
  const development = useGeneration(
    token,
    id,
    api.createDevelopmentPlan,
    setDevelopmentPlans,
    'Impossible de générer le plan de développement.',
  );

  const [transmissionPlans, setTransmissionPlans] = usePlanList<TransmissionPlan>(
    token,
    id,
    api.listTransmissionPlans,
  );
  const transmission = useGeneration(
    token,
    id,
    api.createTransmissionPlan,
    setTransmissionPlans,
    'Impossible de générer le plan de transmission.',
  );

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

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
        <p className="muted" style={{ marginBottom: '1.5rem' }}>
          <strong style={{ color: 'var(--accent)' }}>Igini</strong>, l&apos;intelligence
          d&apos;Ignitux, t&apos;accompagne à travers les 5 étapes ci-dessous pour transformer
          cette idée en réalité.
        </p>
      )}

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
        <GenerationSection
          title="Analyse"
          buttonLabel="Analyser ce projet"
          buttonBusyLabel="Analyse en cours…"
          emptyLabel="Aucune analyse pour l'instant."
          items={analyses}
          isBusy={analysis.isBusy}
          error={analysis.error}
          onGenerate={analysis.generate}
          renderItem={(item) => <AnalysisCard analysis={item} key={item.id} />}
        />
      )}

      {project && (
        <GenerationSection
          title="Plan de construction"
          buttonLabel="Générer un plan"
          buttonBusyLabel="Génération…"
          emptyLabel="Aucun plan pour l'instant."
          items={buildPlans}
          isBusy={plan.isBusy}
          error={plan.error}
          onGenerate={plan.generate}
          renderItem={(item) => <BuildPlanCard plan={item} key={item.id} />}
        />
      )}

      {project && (
        <GenerationSection
          title="Financement"
          buttonLabel="Générer un plan de financement"
          buttonBusyLabel="Génération…"
          emptyLabel="Aucun plan de financement pour l'instant."
          items={financingPlans}
          isBusy={financing.isBusy}
          error={financing.error}
          onGenerate={financing.generate}
          renderItem={(item) => <FinancingPlanCard plan={item} key={item.id} />}
        />
      )}

      {project && (
        <GenerationSection
          title="Développement"
          buttonLabel="Générer un plan de développement"
          buttonBusyLabel="Génération…"
          emptyLabel="Aucun plan de développement pour l'instant."
          items={developmentPlans}
          isBusy={development.isBusy}
          error={development.error}
          onGenerate={development.generate}
          renderItem={(item) => <DevelopmentPlanCard plan={item} key={item.id} />}
        />
      )}

      {project && (
        <GenerationSection
          title="Transmission"
          buttonLabel="Générer un plan de transmission"
          buttonBusyLabel="Génération…"
          emptyLabel="Aucun plan de transmission pour l'instant."
          items={transmissionPlans}
          isBusy={transmission.isBusy}
          error={transmission.error}
          onGenerate={transmission.generate}
          renderItem={(item) => <TransmissionPlanCard plan={item} key={item.id} />}
        />
      )}
    </main>
  );
}

interface GenerationSectionProps<T> {
  title: string;
  buttonLabel: string;
  buttonBusyLabel: string;
  emptyLabel: string;
  items: T[];
  isBusy: boolean;
  error: string | null;
  onGenerate: () => void;
  renderItem: (item: T) => ReactNode;
}

function GenerationSection<T>({
  title,
  buttonLabel,
  buttonBusyLabel,
  emptyLabel,
  items,
  isBusy,
  error,
  onGenerate,
  renderItem,
}: GenerationSectionProps<T>) {
  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <div className="top-bar" style={{ marginBottom: items.length ? '1rem' : 0 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <button className="secondary" type="button" onClick={onGenerate} disabled={isBusy}>
          {isBusy ? buttonBusyLabel : buttonLabel}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {items.length === 0 && !isBusy && <p className="muted">{emptyLabel}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {items.map(renderItem)}
      </div>
    </div>
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
      <ItemList title="Points forts" items={analysis.strengths} />
      <ItemList title="Risques" items={analysis.risks} />
      <ItemList title="Prochaines étapes" items={analysis.next_steps} />
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
      <ItemList title="Jalons" items={plan.milestones} />
      <ItemList title="Ressources clés" items={plan.key_resources} />
    </div>
  );
}

function FinancingPlanCard({ plan }: { plan: FinancingPlan }) {
  return (
    <div className="project-item" style={{ cursor: 'default' }}>
      <div className="top-bar" style={{ marginBottom: '0.5rem' }}>
        <strong>Budget estimé : {plan.estimated_budget}</strong>
        <span className="muted">{new Date(plan.created_at).toLocaleString('fr-FR')}</span>
      </div>
      <p>{plan.summary}</p>
      <ItemList title="Sources de financement" items={plan.funding_sources} />
      <ItemList title="Postes de dépense" items={plan.budget_breakdown} />
    </div>
  );
}

function DevelopmentPlanCard({ plan }: { plan: DevelopmentPlan }) {
  return (
    <div className="project-item" style={{ cursor: 'default' }}>
      <div className="top-bar" style={{ marginBottom: '0.5rem' }}>
        <strong>Plan de croissance</strong>
        <span className="muted">{new Date(plan.created_at).toLocaleString('fr-FR')}</span>
      </div>
      <p>{plan.summary}</p>
      <ItemList title="Leviers de croissance" items={plan.growth_levers} />
      <ItemList title="Indicateurs clés" items={plan.key_metrics} />
      <ItemList title="Risques de passage à l'échelle" items={plan.scaling_risks} />
    </div>
  );
}

function TransmissionPlanCard({ plan }: { plan: TransmissionPlan }) {
  return (
    <div className="project-item" style={{ cursor: 'default' }}>
      <div className="top-bar" style={{ marginBottom: '0.5rem' }}>
        <strong>Plan de transmission</strong>
        <span className="muted">{new Date(plan.created_at).toLocaleString('fr-FR')}</span>
      </div>
      <p>{plan.summary}</p>
      <ItemList title="Options de transmission" items={plan.transfer_options} />
      <ItemList title="À documenter" items={plan.key_documentation} />
      <ItemList title="Check-list de préparation" items={plan.readiness_checklist} />
    </div>
  );
}

function ItemList({ title, items }: { title: string; items: string[] }) {
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
