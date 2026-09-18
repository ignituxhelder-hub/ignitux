'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type Collaborator } from '@/lib/api';

interface CollaboratorsSectionProps {
  token: string | null;
  projectId: string;
}

export function CollaboratorsSection({ token, projectId }: CollaboratorsSectionProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setIsLoading(true);
    api
      .listCollaborators(token, projectId)
      .then((data) => {
        if (!cancelled) setCollaborators(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, projectId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!token || !email.trim()) return;
    setError(null);
    setIsAdding(true);
    try {
      const collaborator = await api.addCollaborator(token, projectId, email.trim());
      setCollaborators((prev) => [...prev, collaborator]);
      setEmail('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'ajouter ce collaborateur.");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!token) return;
    setError(null);
    setRemovingId(userId);
    try {
      await api.removeCollaborator(token, projectId, userId);
      setCollaborators((prev) => prev.filter((c) => c.user_id !== userId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de retirer ce collaborateur.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Collaborateurs</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Un collaborateur peut consulter ce projet et l&apos;historique généré par IGINI, mais pas le
        modifier ni générer de nouveaux plans.
      </p>
      {error && <p className="error">{error}</p>}
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
        <input
          type="email"
          aria-label="Email du collaborateur à ajouter"
          placeholder="email@exemple.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1 }}
        />
        <button className="secondary" type="submit" disabled={isAdding}>
          {isAdding ? 'Ajout…' : 'Inviter'}
        </button>
      </form>
      {!isLoading && collaborators.length === 0 && (
        <p className="muted">Aucun collaborateur pour l&apos;instant.</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {collaborators.map((c) => (
          <div className="top-bar" key={c.id} style={{ marginBottom: 0 }}>
            <span>{c.user.email}</span>
            <button
              className="secondary"
              type="button"
              onClick={() => handleRemove(c.user_id)}
              disabled={removingId === c.user_id}
            >
              {removingId === c.user_id ? 'Retrait…' : 'Retirer'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
