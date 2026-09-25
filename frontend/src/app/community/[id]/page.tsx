'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type CommunityComment, type PublicProject } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function CommunityProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [project, setProject] = useState<PublicProject | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [content, setContent] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    Promise.all([api.getPublicProject(token, id), api.listCommunityComments(token, id)])
      .then(([projectData, commentsData]) => {
        if (cancelled) return;
        setProject(projectData);
        setComments(commentsData);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : 'Impossible de charger ce projet.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isReady, token, id, router]);

  async function handlePost(e: FormEvent) {
    e.preventDefault();
    if (!token || !content.trim()) return;
    setPostError(null);
    setIsPosting(true);
    try {
      const comment = await api.addCommunityComment(token, id, content.trim());
      setComments((prev) => [comment, ...prev]);
      setContent('');
    } catch (err) {
      setPostError(err instanceof ApiError ? err.message : "Impossible d'envoyer ce message.");
    } finally {
      setIsPosting(false);
    }
  }

  if (!isReady || !token) {
    return null;
  }

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <Link href="/community" className="muted">
          ← Retour à la communauté
        </Link>
      </div>

      {isLoading && <p className="loading">Chargement…</p>}
      {loadError && <p className="error">{loadError}</p>}

      {project && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h1 style={{ marginTop: 0 }}>{project.title}</h1>
          {/* Article 21 : les créateurs conservent la reconnaissance de leurs
              idées. Le nom d'affichage seulement — l'adresse reste privée. */}
          <p className="muted" style={{ marginTop: 0 }}>
            {project.porteur ? `Porté par ${project.porteur}` : 'Porteur sans nom affiché'}
          </p>
          {project.description && <p>{project.description}</p>}
        </div>
      )}

      {project && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h2 style={{ marginTop: 0 }}>Encouragements</h2>
          {postError && <p className="error">{postError}</p>}
          <form onSubmit={handlePost} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
            <input
              aria-label="Ton message"
              placeholder="Laisse un mot d'encouragement…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="secondary" type="submit" disabled={isPosting}>
              {isPosting ? 'Envoi…' : 'Envoyer'}
            </button>
          </form>
          {comments.length === 0 && <p className="muted">Aucun message pour l&apos;instant.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {comments.map((comment) => (
              <div className="project-item" style={{ cursor: 'default' }} key={comment.id}>
                <p style={{ margin: 0 }}>{comment.content}</p>
                {/* Avant, un encouragement n'était signé que d'une date : son
                    auteur partait sous forme d'identifiant technique, que
                    personne ne peut lire. Un mot de soutien anonyme soutient
                    moins bien. */}
                <span className="muted">
                  {comment.auteur ?? 'Sans nom affiché'} —{' '}
                  {new Date(comment.created_at).toLocaleString('fr-FR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
