'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function AccountPage() {
  const { token, user, isReady } = useAuth();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    if (isReady && !token) {
      router.replace('/login');
    }
  }, [isReady, token, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setIsDone(false);
    setIsSubmitting(true);
    try {
      await api.changePassword(token, currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setIsDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de changer le mot de passe.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isReady || !token) {
    return null;
  }

  return (
    <main className="page">
      <div className="top-bar">
        <Link href="/projects" className="muted">
          ← Retour aux projets
        </Link>
      </div>
      <p className="brand">Ignitux</p>
      <h1>Mon compte</h1>
      <p className="muted">{user?.email}</p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Changer le mot de passe</h2>
        {error && <p className="error">{error}</p>}
        {isDone && <p style={{ color: 'var(--ok)' }}>Mot de passe changé.</p>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="currentPassword">Mot de passe actuel</label>
            <input
              id="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="newPassword">Nouveau mot de passe</label>
            <input
              id="newPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <button className="primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Enregistrement…' : 'Changer le mot de passe'}
          </button>
        </form>
      </div>
    </main>
  );
}
