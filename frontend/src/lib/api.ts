import { cacheResponse, readCached, type IterableStorage } from './offline-cache';
import {
  dismissRejected,
  enqueue,
  readState,
  replay,
  type OfflineState,
} from './offline-queue';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Un token expiré ou invalide renvoie 401 sur n'importe quel endpoint protégé.
// Plutôt que de laisser chaque page afficher un message d'erreur générique et
// rester bloquée, on notifie un gestionnaire centralisé (branché par
// AuthProvider) qui déconnecte l'utilisateur et le renvoie vers /login.
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

/**
 * Levée quand une lecture n'a pu être servie que depuis le cache local.
 * C'est volontairement une erreur distincte et non un succès silencieux :
 * l'appelant doit décider quoi afficher, et surtout signaler la date de la
 * donnée. Servir du cache comme si c'était frais serait présenter comme
 * réelle une information périmée.
 */
export class OfflineReadError extends Error {
  constructor(
    public readonly data: unknown,
    public readonly cachedAt: string,
  ) {
    super('Données hors ligne.');
    this.name = 'OfflineReadError';
  }
}

/**
 * Levée quand une écriture a été mise en file d'attente faute de réseau.
 * Ce n'est PAS un succès : rien ne garantit que le serveur l'acceptera.
 */
export class OfflineQueuedError extends Error {
  constructor(public readonly mutationId: string) {
    super("Pas de réseau : l'action est enregistrée et sera envoyée à la reconnexion.");
    this.name = 'OfflineQueuedError';
  }
}

/**
 * Une panne réseau (fetch qui rejette) n'est pas une réponse HTTP d'erreur.
 * La distinction est tout l'intérêt du mode hors ligne : un 422 doit être
 * montré à l'utilisateur, une coupure doit déclencher la mise en file.
 */
function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch (error) {
    if (!isNetworkFailure(error)) throw error;
    return handleOffline<T>(path, options);
  }

  const body = await res.json().catch(() => null);

  if (res.ok && (options.method ?? 'GET') === 'GET' && offlineStorage) {
    cacheResponse(offlineStorage, path, body);
  }

  if (!res.ok) {
    // Ne déclenche la déconnexion que pour une requête qui portait un token
    // (401 = session expirée/invalide) — pas pour un 401 renvoyé par
    // /auth/login sur un mauvais mot de passe, où il n'y a pas de session à
    // perdre.
    const hadAuthHeader = Boolean((options.headers as Record<string, string> | undefined)?.Authorization);
    if (res.status === 401 && hadAuthHeader) {
      onUnauthorized?.();
    }

    const message =
      body && typeof body.message === 'string'
        ? body.message
        : Array.isArray(body?.message)
          ? body.message.join(' ')
          : 'Une erreur est survenue.';
    throw new ApiError(message, res.status);
  }

  return body as T;
}

/**
 * Le stockage utilisé pour le cache et la file d'attente. Injecté par
 * AuthProvider au montage plutôt que lu depuis `window` : ce module est
 * importé côté serveur par Next.js, où `localStorage` n'existe pas.
 */
let offlineStorage: IterableStorage | null = null;

export function setOfflineStorage(storage: IterableStorage | null) {
  offlineStorage = storage;
}

/**
 * Notifie l'interface qu'une écriture vient d'être mise en file, pour que
 * le bandeau hors ligne se mette à jour sans attendre un rechargement.
 */
type OfflineChangeHandler = () => void;
let onOfflineChange: OfflineChangeHandler | null = null;

export function setOfflineChangeHandler(handler: OfflineChangeHandler | null) {
  onOfflineChange = handler;
}

function handleOffline<T>(path: string, options: RequestInit): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();

  if (!offlineStorage) {
    // Sans stockage, on ne peut ni servir du cache ni mettre en file. Dire
    // « hors ligne » sans rien avoir conservé serait trompeur.
    throw new ApiError('Pas de réseau, et aucun stockage local disponible.', 0);
  }

  if (method === 'GET') {
    const cached = readCached<T>(offlineStorage, path);
    if (!cached) {
      throw new ApiError("Pas de réseau, et cette donnée n'a jamais été chargée ici.", 0);
    }
    throw new OfflineReadError(cached.data, cached.cachedAt);
  }

  if (method !== 'POST' && method !== 'PATCH' && method !== 'DELETE') {
    throw new ApiError('Pas de réseau.', 0);
  }

  const queued = enqueue(offlineStorage, {
    path,
    method,
    body: typeof options.body === 'string' ? options.body : null,
    label: describeMutation(method, path),
  });
  onOfflineChange?.();
  throw new OfflineQueuedError(queued.id);
}

/**
 * Libellé lisible d'une écriture en attente. Volontairement grossier :
 * mieux vaut « Écriture sur /projects/p1/tasks » qu'une phrase élégante
 * qui se désynchroniserait des routes réelles.
 */
function describeMutation(method: string, path: string): string {
  const verbs: Record<string, string> = {
    POST: 'Création',
    PATCH: 'Modification',
    DELETE: 'Suppression',
  };
  return `${verbs[method] ?? method} sur ${path}`;
}

/**
 * Rejoue la file d'attente. Le jeton est passé par l'appelant : la file ne
 * stocke jamais d'identifiant d'authentification, pour qu'un vol du
 * stockage local ne livre pas aussi la session.
 */
export function replayOfflineQueue(token: string) {
  if (!offlineStorage) return Promise.resolve({ sent: 0, rejected: 0, remaining: 0 });

  return replay(offlineStorage, async (mutation) => {
    try {
      const res = await fetch(`${API_URL}${mutation.path}`, {
        method: mutation.method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: mutation.body ?? undefined,
      });
      if (res.ok) return { ok: true as const };

      const body: unknown = await res.json().catch(() => null);
      const reason =
        body && typeof (body as { message?: unknown }).message === 'string'
          ? ((body as { message: string }).message)
          : 'Refusée par le serveur.';

      // 5xx : le serveur a un problème, l'écriture reste valable et sera
      // retentée. 4xx : le serveur l'a jugée invalide, la retenter en
      // boucle ne ferait que bloquer tout ce qui suit dans la file.
      return { ok: false as const, retryable: res.status >= 500, status: res.status, reason };
    } catch {
      return { ok: false as const, retryable: true, status: 0, reason: 'Réseau indisponible.' };
    }
  });
}

export function readOfflineState(): OfflineState {
  return offlineStorage ? readState(offlineStorage) : { pending: [], rejected: [] };
}

export function dismissRejectedMutation(id: string): OfflineState {
  if (!offlineStorage) return { pending: [], rejected: [] };
  const next = dismissRejected(offlineStorage, id);
  onOfflineChange?.();
  return next;
}

export interface User {
  id: string;
  email: string;
}

export interface Project {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface Collaborator {
  id: string;
  project_id: string;
  user_id: string;
  created_at: string;
  user: { id: string; email: string };
}

export interface PublicProject {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
}

export interface CommunityComment {
  id: string;
  project_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

export interface Analysis {
  id: string;
  project_id: string;
  summary: string;
  feasibility_score: number;
  strengths: string[];
  risks: string[];
  next_steps: string[];
  created_at: string;
}

export interface BuildPlan {
  id: string;
  project_id: string;
  summary: string;
  estimated_timeline: string;
  milestones: string[];
  key_resources: string[];
  created_at: string;
}

export interface FinancingPlan {
  id: string;
  project_id: string;
  summary: string;
  estimated_budget: string;
  funding_sources: string[];
  budget_breakdown: string[];
  created_at: string;
}

export interface DevelopmentPlan {
  id: string;
  project_id: string;
  summary: string;
  growth_levers: string[];
  key_metrics: string[];
  scaling_risks: string[];
  created_at: string;
}

export interface TransmissionPlan {
  id: string;
  project_id: string;
  summary: string;
  transfer_options: string[];
  key_documentation: string[];
  readiness_checklist: string[];
  created_at: string;
}

export type MemoryCategory = 'decision' | 'preference' | 'learning' | 'fact';

export interface Memory {
  id: string;
  user_id: string;
  project_id: string | null;
  category: MemoryCategory;
  content: string;
  tags: string[];
  created_at: string;
}

export interface Concept {
  id: string;
  user_id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  category: string | null;
  created_at: string;
}

export interface ConceptLink {
  id: string;
  from_concept_id: string;
  to_concept_id: string;
  relation_type: string;
  created_at: string;
}

export interface ConceptGraph {
  nodes: Concept[];
  edges: ConceptLink[];
  /** Concepts qu'aucun lien ne relie — pas une anomalie, une information. */
  isolated: string[];
}

export interface ConceptPath {
  from: Concept;
  to: Concept;
  /** null = aucun lien connu entre les deux, ce qui est une réponse en soi. */
  path: Concept[] | null;
}

export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'blocked';
export type TaskAssignee = 'human' | 'igini';

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignee: TaskAssignee;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface ScoreCard {
  etincelle: number | null;
  construction: number | null;
  evolution: number | null;
  transmission: number | null;
  // null tant qu'aucune étape n'a démarré : un 0 affiché se lirait
  // « fiabilité nulle » alors qu'il n'y a simplement rien à mesurer.
  confiance: number | null;
}

export interface ConstitutionArticle {
  id: string;
  slug: string;
  version: string;
  number: number;
  title: string;
  text: string;
  principle: string;
  /** 'enforced' = une règle du moteur le vérifie ; 'declared' = énoncé seul. */
  enforcement: string;
}

export interface ConstitutionRule {
  id: string;
  articleSlug: string;
  severity: string;
  description: string;
}

export interface ConstitutionAuditEntry {
  slug: string;
  title: string;
  enforcement: string;
  /** null = rien en base ne permet de se prononcer sur cet article. */
  measured: string | null;
  violationsLast30Days: number;
}

export interface ConstitutionViolation {
  id: string;
  article_slug: string;
  rule_id: string;
  severity: string;
  action: string;
  detail: string;
  created_at: string;
}

export interface ComplianceRequirement {
  id: string;
  country: string;
  category: string;
  title: string;
  description: string;
  source_name: string;
  source_url: string;
  completed: boolean;
}

export interface ComplianceChecklist {
  disclaimer: string;
  requirements: ComplianceRequirement[];
}

export type MarketplaceRole = 'mentor' | 'investisseur';

export interface MarketplaceProfile {
  id: string;
  user_id: string;
  role: MarketplaceRole;
  headline: string;
  bio: string | null;
  expertise: string[];
  created_at: string;
  updated_at: string;
  user?: { id: string; email: string };
}

export interface MarketplaceContact {
  id: string;
  from_user_id: string;
  to_profile_id: string;
  message: string;
  created_at: string;
  from_user?: { id: string; email: string };
}

export interface AutomationRun {
  id: string;
  project_id: string;
  tasks_created_count: number;
  tasks_closed_count: number;
  concept_links_created_count: number;
  created_at: string;
}

export type BillingType = 'devis' | 'facture' | 'avoir';
export type BillingStatus = 'brouillon' | 'emis' | 'paye' | 'annule' | 'refuse';
export type BillingMethod = 'virement' | 'especes' | 'carte' | 'cheque' | 'autre';

export interface BillingLine {
  id: string;
  position: number;
  label: string;
  quantity_milli: number;
  unit_price_cents: number;
  /** Points de base : 2000 = 20 %, 550 = 5,5 %. */
  vat_rate_basis_points: number;
}

export interface BillingPayment {
  id: string;
  amount_cents: number;
  method: BillingMethod;
  received_at: string;
  note: string | null;
}

export interface BillingDocument {
  id: string;
  type: BillingType;
  number: string;
  status: BillingStatus;
  client_name: string;
  client_details: string | null;
  notes: string | null;
  issued_at: string | null;
  due_at: string | null;
  corrects_id: string | null;
  lines: BillingLine[];
  payments?: BillingPayment[];
  totals: { subtotalCents: number; vatCents: number; totalCents: number };
  remainingCents: number;
}

export interface BillingList {
  disclaimer: string;
  documents: BillingDocument[];
}

export interface BillingLegalNotice {
  disclaimer: string;
  enforcedRules: string[];
}

export type CrmStage = 'nouveau' | 'contacte' | 'qualifie' | 'proposition' | 'gagne' | 'perdu';
export type CrmKind = 'prospect' | 'client' | 'partenaire' | 'autre';
export type CrmChannel = 'appel' | 'email' | 'rendez_vous' | 'note';

export interface CrmCompany {
  id: string;
  owner_id: string;
  name: string;
  sector: string | null;
  website: string | null;
  notes: string | null;
  contacts?: CrmContact[];
}

export interface CrmContact {
  id: string;
  owner_id: string;
  company_id: string | null;
  project_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  kind: CrmKind;
  stage: CrmStage;
  notes: string | null;
  created_at: string;
  company?: CrmCompany | null;
  interactions?: CrmInteraction[];
}

export interface CrmInteraction {
  id: string;
  contact_id: string;
  channel: CrmChannel;
  summary: string;
  occurred_at: string;
  created_at: string;
}

export interface CrmPipeline {
  total: number;
  stages: Array<{ stage: CrmStage; label: string; count: number }>;
}

export type WorkflowConditionType = 'always' | 'stage_exists' | 'tasks_done' | 'manual';
export type WorkflowActionType = 'none' | 'create_task';

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  position: number;
  title: string;
  description: string | null;
  condition_type: WorkflowConditionType;
  condition_value: string | null;
  action_type: WorkflowActionType;
  action_value: string | null;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  project_id: string;
  status: 'running' | 'blocked' | 'completed';
  current_position: number;
  started_at: string;
  completed_at: string | null;
}

export interface WorkflowDefinition {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  created_at: string;
  steps: WorkflowStep[];
  runs: WorkflowRun[];
}

export interface WorkflowTemplate {
  slug: string;
  name: string;
  description: string;
  stepCount: number;
}

export interface WorkflowEvent {
  id: string;
  run_id: string;
  step_position: number;
  type: string;
  detail: string;
  created_at: string;
}

export interface WorkflowAdvanceResult {
  run: { id: string; status: string; current_position: number };
  stepsCompleted: Array<{ position: number; title: string; reason: string }>;
  blockedReason: string | null;
  tasksCreated: Array<{ id: string; title: string }>;
}

export interface AutomationRunResult {
  run: AutomationRun;
  tasksCreated: Task[];
  tasksClosed: Task[];
  conceptLinksCreated: ConceptLink[];
}

export const api = {
  signup: (email: string, password: string) =>
    request<User>('/users/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),

  login: (email: string, password: string) =>
    request<{ accessToken: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  forgotPassword: async (email: string) => {
    await request<void>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  resetPassword: async (token: string, newPassword: string) => {
    await request<{ success: boolean }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  },

  verifyEmail: async (token: string) => {
    await request<{ success: boolean }>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },

  resendVerification: async (email: string) => {
    await request<void>('/auth/verify-email/resend', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  changePassword: async (token: string, currentPassword: string, newPassword: string) => {
    await request<void>('/auth/me/password', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  listProjects: (token: string) =>
    request<Project[]>('/projects', {
      headers: { Authorization: `Bearer ${token}` },
    }),

  getProject: (token: string, id: string) =>
    request<Project>(`/projects/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  createProject: (token: string, title: string, description: string) =>
    request<Project>('/projects', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title, description: description || undefined }),
    }),

  updateProject: (token: string, id: string, title: string, description: string) =>
    request<Project>(`/projects/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title, description: description || undefined }),
    }),

  deleteProject: async (token: string, id: string) => {
    await request<void>(`/projects/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  analyzeProject: (token: string, id: string) =>
    request<Analysis>(`/projects/${id}/analyze`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }),

  listAnalyses: (token: string, id: string) =>
    request<Analysis[]>(`/projects/${id}/analyses`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  createBuildPlan: (token: string, id: string) =>
    request<BuildPlan>(`/projects/${id}/plan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }),

  listBuildPlans: (token: string, id: string) =>
    request<BuildPlan[]>(`/projects/${id}/plans`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  createFinancingPlan: (token: string, id: string) =>
    request<FinancingPlan>(`/projects/${id}/financing-plan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }),

  listFinancingPlans: (token: string, id: string) =>
    request<FinancingPlan[]>(`/projects/${id}/financing-plans`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  createDevelopmentPlan: (token: string, id: string) =>
    request<DevelopmentPlan>(`/projects/${id}/development-plan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }),

  listDevelopmentPlans: (token: string, id: string) =>
    request<DevelopmentPlan[]>(`/projects/${id}/development-plans`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  createTransmissionPlan: (token: string, id: string) =>
    request<TransmissionPlan>(`/projects/${id}/transmission-plan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }),

  listTransmissionPlans: (token: string, id: string) =>
    request<TransmissionPlan[]>(`/projects/${id}/transmission-plans`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  createMemory: (
    token: string,
    projectId: string,
    category: MemoryCategory,
    content: string,
    tags: string[] = [],
  ) =>
    request<Memory>('/memory', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ projectId, category, content, tags }),
    }),

  listMemories: (
    token: string,
    projectId: string,
    filters: { query?: string; category?: MemoryCategory; tags?: string[] } = {},
  ) => {
    const params = new URLSearchParams({ projectId });
    if (filters.query) params.set('q', filters.query);
    if (filters.category) params.set('category', filters.category);
    if (filters.tags?.length) params.set('tags', filters.tags.join(','));
    return request<Memory[]>(`/memory?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  listMemoryTags: (token: string, projectId: string) =>
    request<string[]>(`/memory/tags?projectId=${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  forgetMemory: (token: string, id: string) =>
    request<void>(`/memory/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }),

  getMemorySummary: (token: string, projectId: string) =>
    request<{ summary: string }>(`/memory/summary?projectId=${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  createConcept: (token: string, projectId: string, name: string, description?: string) =>
    request<Concept>('/knowledge/concepts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ projectId, name, description: description || undefined }),
    }),

  listConcepts: (token: string, projectId: string) =>
    request<Concept[]>(`/knowledge/concepts?projectId=${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  linkConcepts: (token: string, fromConceptId: string, toConceptId: string, relationType: string) =>
    request<ConceptLink>(`/knowledge/concepts/${fromConceptId}/links`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ toConceptId, relationType }),
    }),

  getConceptGraph: (token: string, projectId: string) =>
    request<ConceptGraph>(`/knowledge/graph?projectId=${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  createTask: (token: string, projectId: string, title: string) =>
    request<Task>(`/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title }),
    }),

  listTasks: (token: string, projectId: string) =>
    request<Task[]>(`/projects/${projectId}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  updateTaskStatus: (token: string, taskId: string, status: TaskStatus) =>
    request<Task>(`/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    }),

  getScoreCard: (token: string, projectId: string) =>
    request<ScoreCard>(`/projects/${projectId}/scores`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  updateProjectVisibility: (token: string, id: string, isPublic: boolean) =>
    request<Project>(`/projects/${id}/visibility`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ isPublic }),
    }),

  listCollaborators: (token: string, id: string) =>
    request<Collaborator[]>(`/projects/${id}/collaborators`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  addCollaborator: (token: string, id: string, email: string) =>
    request<Collaborator>(`/projects/${id}/collaborators`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email }),
    }),

  removeCollaborator: async (token: string, id: string, collaboratorUserId: string) => {
    await request<void>(`/projects/${id}/collaborators/${collaboratorUserId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  listPublicProjects: (token: string) =>
    request<PublicProject[]>('/community/projects', {
      headers: { Authorization: `Bearer ${token}` },
    }),

  getPublicProject: (token: string, id: string) =>
    request<PublicProject>(`/community/projects/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  listCommunityComments: (token: string, id: string) =>
    request<CommunityComment[]>(`/community/projects/${id}/comments`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  addCommunityComment: (token: string, id: string, content: string) =>
    request<CommunityComment>(`/community/projects/${id}/comments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content }),
    }),

  getProjectCompliance: (token: string, projectId: string) =>
    request<ComplianceChecklist>(`/projects/${projectId}/compliance?country=FR`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  markComplianceChecked: async (token: string, projectId: string, requirementId: string) => {
    await request<void>(`/projects/${projectId}/compliance/${requirementId}/check`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  unmarkComplianceChecked: async (token: string, projectId: string, requirementId: string) => {
    await request<void>(`/projects/${projectId}/compliance/${requirementId}/check`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  runAutomation: (token: string, projectId: string) =>
    request<AutomationRunResult>(`/projects/${projectId}/automation/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }),

  listAutomationRuns: (token: string, projectId: string) =>
    request<AutomationRun[]>(`/projects/${projectId}/automation/runs`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  searchConcepts: (
    token: string,
    projectId: string,
    filters: { query?: string; category?: string } = {},
  ) => {
    const params = new URLSearchParams({ projectId });
    if (filters.query) params.set('q', filters.query);
    if (filters.category) params.set('category', filters.category);
    return request<Concept[]>(`/knowledge/concepts/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  listConceptCategories: (token: string, projectId: string) =>
    request<string[]>(`/knowledge/categories?projectId=${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  findConceptPath: (token: string, fromId: string, toId: string) =>
    request<ConceptPath>(`/knowledge/path?from=${fromId}&to=${toId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  deleteConcept: (token: string, conceptId: string) =>
    request<void>(`/knowledge/concepts/${conceptId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }),

  unlinkConcepts: (token: string, linkId: string) =>
    request<void>(`/knowledge/links/${linkId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }),

  getBillingLegalNotice: (token: string) =>
    request<BillingLegalNotice>('/billing/legal-notice', {
      headers: { Authorization: `Bearer ${token}` },
    }),

  listBillingDocuments: (token: string, filters: { type?: BillingType; status?: BillingStatus } = {}) => {
    const params = new URLSearchParams();
    if (filters.type) params.set('type', filters.type);
    if (filters.status) params.set('status', filters.status);
    const suffix = params.toString();
    return request<BillingList>(`/billing/documents${suffix ? `?${suffix}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  createBillingDocument: (
    token: string,
    document: {
      type: BillingType;
      clientName: string;
      clientDetails?: string;
      notes?: string;
      correctsId?: string;
      lines: Array<{
        label: string;
        quantityMilli: number;
        unitPriceCents: number;
        vatRateBasisPoints?: number;
      }>;
    },
  ) =>
    request<BillingDocument>('/billing/documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(document),
    }),

  changeBillingStatus: (token: string, id: string, status: BillingStatus) =>
    request<BillingDocument>(`/billing/documents/${id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    }),

  deleteBillingDraft: (token: string, id: string) =>
    request<void>(`/billing/documents/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }),

  addBillingPayment: (
    token: string,
    id: string,
    amountCents: number,
    method: BillingMethod,
  ) =>
    request<BillingPayment>(`/billing/documents/${id}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amountCents, method }),
    }),

  createCrmContact: (
    token: string,
    contact: {
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      role?: string;
      kind?: CrmKind;
      stage?: CrmStage;
      companyId?: string;
      projectId?: string;
    },
  ) =>
    request<CrmContact>('/crm/contacts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(contact),
    }),

  listCrmContacts: (
    token: string,
    filters: { query?: string; stage?: CrmStage; kind?: CrmKind; projectId?: string } = {},
  ) => {
    const params = new URLSearchParams();
    if (filters.query) params.set('q', filters.query);
    if (filters.stage) params.set('stage', filters.stage);
    if (filters.kind) params.set('kind', filters.kind);
    if (filters.projectId) params.set('projectId', filters.projectId);
    const suffix = params.toString();
    return request<CrmContact[]>(`/crm/contacts${suffix ? `?${suffix}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  getCrmContact: (token: string, id: string) =>
    request<CrmContact>(`/crm/contacts/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  updateCrmContact: (token: string, id: string, data: { stage?: CrmStage; kind?: CrmKind }) =>
    request<CrmContact>(`/crm/contacts/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    }),

  deleteCrmContact: (token: string, id: string) =>
    request<void>(`/crm/contacts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }),

  getCrmPipeline: (token: string, projectId?: string) =>
    request<CrmPipeline>(`/crm/pipeline${projectId ? `?projectId=${projectId}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  logCrmInteraction: (
    token: string,
    contactId: string,
    channel: CrmChannel,
    summary: string,
    occurredAt?: string,
  ) =>
    request<CrmInteraction>(`/crm/contacts/${contactId}/interactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel, summary, occurredAt }),
    }),

  listWorkflowTemplates: (token: string) =>
    request<WorkflowTemplate[]>('/workflows/templates', {
      headers: { Authorization: `Bearer ${token}` },
    }),

  listWorkflows: (token: string, projectId: string) =>
    request<WorkflowDefinition[]>(`/projects/${projectId}/workflows`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  createWorkflowFromTemplate: (token: string, projectId: string, slug: string) =>
    request<WorkflowDefinition>(`/projects/${projectId}/workflows/from-template`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ slug }),
    }),

  deleteWorkflow: (token: string, workflowId: string) =>
    request<void>(`/workflows/${workflowId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }),

  startWorkflowRun: (token: string, workflowId: string) =>
    request<WorkflowAdvanceResult>(`/workflows/${workflowId}/runs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }),

  advanceWorkflowRun: (token: string, runId: string) =>
    request<WorkflowAdvanceResult>(`/workflow-runs/${runId}/advance`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }),

  confirmWorkflowStep: (token: string, runId: string, position: number) =>
    request<WorkflowAdvanceResult>(`/workflow-runs/${runId}/steps/${position}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }),

  listWorkflowEvents: (token: string, runId: string) =>
    request<WorkflowEvent[]>(`/workflow-runs/${runId}/events`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  listConstitutionArticles: (token: string) =>
    request<ConstitutionArticle[]>('/constitution/articles', {
      headers: { Authorization: `Bearer ${token}` },
    }),

  listConstitutionRules: (token: string) =>
    request<ConstitutionRule[]>('/constitution/rules', {
      headers: { Authorization: `Bearer ${token}` },
    }),

  getConstitutionAudit: (token: string) =>
    request<ConstitutionAuditEntry[]>('/constitution/audit', {
      headers: { Authorization: `Bearer ${token}` },
    }),

  listConstitutionViolations: (token: string) =>
    request<ConstitutionViolation[]>('/constitution/violations', {
      headers: { Authorization: `Bearer ${token}` },
    }),

  listMarketplaceProfiles: (token: string, role?: MarketplaceRole) =>
    request<MarketplaceProfile[]>(`/marketplace/profiles${role ? `?role=${role}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  getOwnMarketplaceProfile: (token: string) =>
    request<MarketplaceProfile | null>('/marketplace/profile', {
      headers: { Authorization: `Bearer ${token}` },
    }),

  upsertMarketplaceProfile: (
    token: string,
    role: MarketplaceRole,
    headline: string,
    bio: string,
    expertise: string[],
  ) =>
    request<MarketplaceProfile>('/marketplace/profile', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role, headline, bio: bio || undefined, expertise }),
    }),

  removeOwnMarketplaceProfile: async (token: string) => {
    await request<void>('/marketplace/profile', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  contactMarketplaceProfile: (token: string, profileId: string, message: string) =>
    request<MarketplaceContact>(`/marketplace/profiles/${profileId}/contact`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message }),
    }),

  listReceivedMarketplaceContacts: (token: string) =>
    request<MarketplaceContact[]>('/marketplace/contacts', {
      headers: { Authorization: `Bearer ${token}` },
    }),
};
