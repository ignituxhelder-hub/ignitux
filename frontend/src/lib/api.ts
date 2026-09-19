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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const body = await res.json().catch(() => null);

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
