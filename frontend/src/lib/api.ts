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
};
