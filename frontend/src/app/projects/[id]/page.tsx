'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type Project } from '@/lib/api';
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
    </main>
  );
}
