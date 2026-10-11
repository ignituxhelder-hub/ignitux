'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type Collaborator } from '@/lib/api';
import {
  ROLE_EQUIPE_DESCRIPTION,
  ROLE_EQUIPE_LABEL,
  ROLES_EQUIPE,
  type RoleEquipe,
} from '@/lib/equipe';

interface CollaboratorsSectionProps {
  token: string | null;
  projectId: string;
  /** Le propriétaire gère l'équipe ; un membre la voit seulement. */
  peutGerer?: boolean;
}

/**
 * L'ÉQUIPE DU PROJET — inviter avec un rôle, changer un rôle, retirer.
 *
 * Le serveur revérifie chaque action : cette section n'affiche les commandes
 * qu'au propriétaire, par confort.
 */
export function CollaboratorsSection({ token, projectId, peutGerer = true }: CollaboratorsSectionProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<RoleEquipe>('observateur');
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
      const collaborator = await api.addCollaborator(token, projectId, email.trim(), role);
      setCollaborators((prev) => [...prev, collaborator]);
      setEmail('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'ajouter ce collaborateur.");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRole(userId: string, nouveau: RoleEquipe) {
    if (!token) return;
    setError(null);
    const avant = collaborators;
    setCollaborators((prev) => prev.map((c) => (c.user_id === userId ? { ...c, role: nouveau } : c)));
    try {
      await api.changerRoleCollaborateur(token, projectId, userId, nouveau);
    } catch (err) {
      setCollaborators(avant);
      setError(err instanceof ApiError ? err.message : 'Impossible de changer ce rôle.');
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
      <h2 style={{ marginTop: 0 }}>Équipe</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Chacun voit ce qu&apos;il doit voir. Ce qui engage l&apos;entreprise (actes juridiques, équipe,
        suppression du projet) reste au propriétaire.
      </p>
      {error && <p className="error">{error}</p>}

      {peutGerer && (
        <form onSubmit={handleAdd} style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <input
              type="email"
              aria-label="Email du collaborateur à ajouter"
              placeholder="email@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ flex: 1, minWidth: '12rem' }}
            />
            <select
              aria-label="Rôle de la personne invitée"
              value={role}
              onChange={(e) => setRole(e.target.value as RoleEquipe)}
            >
              {ROLES_EQUIPE.map((r) => (
                <option key={r} value={r}>
                  {ROLE_EQUIPE_LABEL[r]}
                </option>
              ))}
            </select>
            <button className="secondary" type="submit" disabled={isAdding}>
              {isAdding ? 'Ajout…' : 'Inviter'}
            </button>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            {ROLE_EQUIPE_DESCRIPTION[role]} La personne doit déjà avoir un compte Ignitux ; elle
            reçoit un email.
          </p>
        </form>
      )}

      {isLoading && <p className="loading">Chargement…</p>}
      {!isLoading && collaborators.length === 0 && (
        <p className="muted">Aucun collaborateur pour l&apos;instant.</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {collaborators.map((c) => (
          <div className="top-bar" key={c.id} style={{ marginBottom: 0, gap: '0.75rem', flexWrap: 'wrap' }}>
            <span>{c.user.email}</span>
            {peutGerer ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select
                  aria-label={`Rôle de ${c.user.email}`}
                  value={c.role ?? 'observateur'}
                  onChange={(e) => void handleRole(c.user_id, e.target.value as RoleEquipe)}
                >
                  {ROLES_EQUIPE.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_EQUIPE_LABEL[r]}
                    </option>
                  ))}
                </select>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => handleRemove(c.user_id)}
                  disabled={removingId === c.user_id}
                >
                  {removingId === c.user_id ? 'Retrait…' : 'Retirer'}
                </button>
              </div>
            ) : (
              <span className="muted">{ROLE_EQUIPE_LABEL[c.role ?? 'observateur']}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
