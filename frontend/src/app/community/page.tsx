'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { IginiMention } from '@/components/igini-mention';
import { api, ApiError, type PublicProject } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function CommunityPage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    api
      .listPublicProjects(token)
      .then((data) => {
        if (!cancelled) setProjects(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Impossible de charger la communauté.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isReady, token, router]);

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

      <h1>Communauté</h1>

      <IginiMention style={{ margin: '1.5rem 0' }}>
        te montre ici les projets que d&apos;autres porteurs d&apos;idée ont choisi de rendre
        publics — libre à toi de les encourager.
      </IginiMention>

      {isLoading && <p className="loading">Chargement…</p>}
      {error && <p className="error">{error}</p>}
      {!isLoading && !error && projects.length === 0 && (
        <p className="muted">
          Aucun projet public pour l&apos;instant — rends un de tes projets public depuis sa fiche
          pour être le premier.
        </p>
      )}

      <div className="project-list">
        {projects.map((project) => (
          <Link className="project-item" href={`/community/${project.id}`} key={project.id}>
            <h3>{project.title}</h3>
            {project.description && <p>{project.description}</p>}
          </Link>
        ))}
      </div>
    </main>
  );
}
