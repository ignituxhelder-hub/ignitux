'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type Project } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function ProjectsPage() {
  const { token, user, isReady, logout } = useAuth();
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadProjects = useCallback(async (activeToken: string) => {
    setIsLoading(true);
    setListError(null);
    try {
      const data = await api.listProjects(activeToken);
      setProjects(data);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Impossible de charger les projets.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    void loadProjects(token);
  }, [isReady, token, router, loadProjects]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setFormError(null);
    setIsSubmitting(true);
    try {
      const created = await api.createProject(token, title, description);
      setProjects((prev) => [created, ...prev]);
      setTitle('');
      setDescription('');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Impossible de créer le projet.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isReady || !token) {
    return null;
  }

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <div>
          <p className="brand">Ignitux</p>
          <p className="muted">{user?.email}</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link href="/community">Communauté</Link>
          <Link href="/marketplace">Mentors &amp; investisseurs</Link>
          <Link href="/crm">Relations</Link>
          <Link href="/constitution">Constitution</Link>
          <Link href="/account">Mon compte</Link>
          <button
            className="secondary"
            type="button"
            onClick={() => {
              logout();
              router.replace('/login');
            }}
          >
            Se déconnecter
          </button>
        </div>
      </div>

      <form className="card" onSubmit={handleCreate}>
        <h2 style={{ marginTop: 0 }}>Nouvelle idée</h2>
        {formError && <p className="error">{formError}</p>}
        <div className="field">
          <label htmlFor="title">Titre</label>
          <input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="description">Description (optionnelle)</label>
          <textarea
            id="description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <button className="primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Création…' : 'Créer le projet'}
        </button>
      </form>

      <div className="project-list">
        {isLoading && <p className="loading">Chargement…</p>}
        {listError && <p className="error">{listError}</p>}
        {!isLoading && !listError && projects.length === 0 && (
          <p className="muted">Aucun projet pour l&apos;instant — crée le premier ci-dessus.</p>
        )}
        {projects.map((project) => (
          <Link className="project-item" href={`/projects/${project.id}`} key={project.id}>
            <h3>{project.title}</h3>
            {project.description && <p>{project.description}</p>}
          </Link>
        ))}
      </div>
    </main>
  );
}
