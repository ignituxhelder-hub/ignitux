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
  created_at: string;
  updated_at: string;
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
  confiance: number;
}

export const api = {
  signup: (email: string, password: string) =>
    request<User>('/users/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),

  login: (email: string, password: string) =>
    request<{ accessToken: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

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

  createMemory: (token: string, projectId: string, category: MemoryCategory, content: string) =>
    request<Memory>('/memory', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ projectId, category, content }),
    }),

  listMemories: (token: string, projectId: string) =>
    request<Memory[]>(`/memory?projectId=${projectId}`, {
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
};
