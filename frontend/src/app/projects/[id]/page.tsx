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
import { IginiMention } from '@/components/igini-mention';
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
import { AutomationSection } from './automation-section';
import { WorkflowSection } from './workflow-section';
import { FinancingSection } from './financing-section';
import { CollaboratorsSection } from './collaborators-section';
import { ComplianceSection } from './compliance-section';
import { KnowledgeSection, MemorySection, ScoreSection, TasksSection } from './engine-sections';

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

/**
 * Génère un nouveau plan (bouton "Analyser", "Générer un plan", …) et le préfixe à la liste.
 *
 * `onGenerated` est appelé après un succès : côté backend, chaque génération déclenche aussi
 * l'automatisation (tâches d'étape créées/fermées, concepts reliés) et fait bouger le score.
 * Sans ce signal, ces sections resteraient figées jusqu'au rechargement de la page, ce qui
 * donnait l'impression que l'automatisation ne faisait rien.
 */
function useGeneration<T>(
  token: string | null,
  id: string,
  create: (token: string, id: string) => Promise<T>,
  setItems: Dispatch<SetStateAction<T[]>>,
  failureMessage: string,
  onGenerated?: () => void,
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
      onGenerated?.();
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
  const { token, user, isReady } = useAuth();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTogglingVisibility, setIsTogglingVisibility] = useState(false);

  // Incrémenté après chaque génération réussie : signale aux sections dérivées
  // (score, tâches, automatisation, connaissance) qu'elles doivent se recharger.
  const [refreshSignal, setRefreshSignal] = useState(0);
  const onGenerated = () => setRefreshSignal((n) => n + 1);

  const [analyses, setAnalyses] = usePlanList<Analysis>(token, id, api.listAnalyses);
  const analysis = useGeneration(
    token,
    id,
    api.analyzeProject,
    setAnalyses,
    "Impossible d'analyser le projet.",
    onGenerated,
  );

  const [buildPlans, setBuildPlans] = usePlanList<BuildPlan>(token, id, api.listBuildPlans);
  const plan = useGeneration(
    token,
    id,
    api.createBuildPlan,
    setBuildPlans,
    'Impossible de générer le plan.',
    onGenerated,
  );

  const [financingPlans, setFinancingPlans] = usePlanList<FinancingPlan>(token, id, api.listFinancingPlans);
  const financing = useGeneration(
    token,
    id,
    api.createFinancingPlan,
    setFinancingPlans,
    'Impossible de générer le plan de financement.',
    onGenerated,
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
    onGenerated,
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
    onGenerated,
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

  async function handleToggleVisibility() {
    if (!token || !project) return;
    setFormError(null);
    setIsTogglingVisibility(true);
    try {
      const updated = await api.updateProjectVisibility(token, id, !project.is_public);
      setProject(updated);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Impossible de changer la visibilité.');
    } finally {
      setIsTogglingVisibility(false);
    }
  }

  if (!isReady || !token) {
    return null;
  }

  const isOwner = project ? project.owner_id === user?.id : false;

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <Link href="/projects" className="muted">
          ← Retour aux projets
        </Link>
      </div>

      {isLoading && <p className="loading">Chargement…</p>}
      {loadError && <p className="error">{loadError}</p>}

      {project && (
        <>
          <IginiMention style={{ marginBottom: '1.5rem' }}>
            t&apos;accompagne à travers les 5 étapes ci-dessous pour transformer cette idée en
            réalité.
          </IginiMention>

          {isOwner ? (
            <form className="card" onSubmit={handleSave}>
              {formError && <p className="error">{formError}</p>}
              <div className="field">
                <label htmlFor="title">Titre</label>
                <input
                  id="title"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
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
                <button
                  className="secondary"
                  type="button"
                  onClick={handleToggleVisibility}
                  disabled={isTogglingVisibility}
                >
                  {isTogglingVisibility
                    ? 'Mise à jour…'
                    : project.is_public
                      ? 'Rendre privé'
                      : 'Rendre public'}
                </button>
              </div>
              <p className="muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                {project.is_public
                  ? 'Ce projet est visible dans la communauté.'
                  : "Ce projet n'est visible que par toi."}
              </p>
            </form>
          ) : (
            <div className="card">
              <h1 style={{ marginTop: 0 }}>{project.title}</h1>
              {project.description && <p style={{ marginBottom: 0 }}>{project.description}</p>}
              <p className="muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                Projet partagé avec toi — tu peux consulter son historique, mais seul le
                propriétaire peut le modifier ou générer de nouveaux plans.
              </p>
            </div>
          )}
        </>
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
          readOnly={!isOwner}
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
          readOnly={!isOwner}
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
          readOnly={!isOwner}
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
          readOnly={!isOwner}
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
          readOnly={!isOwner}
        />
      )}

      {/* Les 4 moteurs transverses sont en lecture seule pour un collaborateur
          (readOnly). La gestion des collaborateurs et le déclenchement manuel
          de l'automatisation restent réservés au propriétaire. */}
      {project && <ScoreSection token={token} projectId={id} refreshSignal={refreshSignal} />}
      {project && (
        <TasksSection token={token} projectId={id} readOnly={!isOwner} refreshSignal={refreshSignal} />
      )}
      {project && <MemorySection token={token} projectId={id} readOnly={!isOwner} />}
      {project && (
        <KnowledgeSection token={token} projectId={id} readOnly={!isOwner} refreshSignal={refreshSignal} />
      )}
      {project && <ComplianceSection token={token} projectId={id} readOnly={!isOwner} />}
      {project && (
        <AutomationSection token={token} projectId={id} readOnly={!isOwner} refreshSignal={refreshSignal} />
      )}
      {project && (
        <WorkflowSection token={token} projectId={id} readOnly={!isOwner} refreshSignal={refreshSignal} />
      )}
      {project && <FinancingSection token={token} projectId={id} readOnly={!isOwner} />}
      {project && isOwner && <CollaboratorsSection token={token} projectId={id} />}
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
  /** Un collaborateur peut consulter l'historique, mais pas en générer de nouveau. */
  readOnly?: boolean;
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
  readOnly = false,
}: GenerationSectionProps<T>) {
  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <div className="top-bar" style={{ marginBottom: items.length ? '1rem' : 0 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        {!readOnly && (
          <button className="secondary" type="button" onClick={onGenerate} disabled={isBusy}>
            {isBusy ? buttonBusyLabel : buttonLabel}
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {items.length === 0 && !isBusy && <p className="muted">{emptyLabel}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {items.map(renderItem)}
      </div>
    </div>
  );
}

/**
 * Marqueur de provenance affiché sur chaque contenu produit par un
 * générateur IGINI.
 *
 * La Charte IGINI promet qu'« aucun contenu généré ne soit présenté comme
 * une donnée vérifiée » et qu'il reste « identifiable comme tel dans
 * l'historique du projet ». La provenance existait en base depuis que les
 * colonnes generated_by/generated_model ont été ajoutées, mais rien ne
 * l'affichait : la promesse n'était donc tenue qu'à moitié. Ce marqueur
 * la rend vraie à l'écran.
 *
 * Un modèle inconnu se dit « modèle non tracé » et non « écrit par un
 * humain » : ce sont deux choses différentes, et confondre les deux serait
 * exactement l'erreur que l'article 12 interdit.
 */
function ProvenanceBadge({
  generatedBy,
  generatedModel,
}: {
  generatedBy?: string;
  generatedModel?: string | null;
}) {
  if (generatedBy === 'human') {
    return <span className="muted">Saisi par un humain</span>;
  }
  return (
    <span className="muted" title={generatedModel ?? 'Modèle non tracé'}>
      Généré par IGINI{generatedModel ? '' : ' (modèle non tracé)'}
    </span>
  );
}

function AnalysisCard({ analysis }: { analysis: Analysis }) {
  return (
    <div className="project-item" style={{ cursor: 'default' }}>
      <div className="top-bar" style={{ marginBottom: '0.5rem' }}>
        <strong>Score de faisabilité : {analysis.feasibility_score}/10</strong>
        <span className="muted">{new Date(analysis.created_at).toLocaleString('fr-FR')}</span>
      </div>
      <p style={{ margin: '0 0 0.5rem' }}>
        <ProvenanceBadge
          generatedBy={analysis.generated_by}
          generatedModel={analysis.generated_model}
        />
      </p>
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
      <p style={{ margin: '0 0 0.5rem' }}>
        <ProvenanceBadge generatedBy={plan.generated_by} generatedModel={plan.generated_model} />
      </p>
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
      <p style={{ margin: '0 0 0.5rem' }}>
        <ProvenanceBadge generatedBy={plan.generated_by} generatedModel={plan.generated_model} />
      </p>
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
      <p style={{ margin: '0 0 0.5rem' }}>
        <ProvenanceBadge generatedBy={plan.generated_by} generatedModel={plan.generated_model} />
      </p>
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
      <p style={{ margin: '0 0 0.5rem' }}>
        <ProvenanceBadge generatedBy={plan.generated_by} generatedModel={plan.generated_model} />
      </p>
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
