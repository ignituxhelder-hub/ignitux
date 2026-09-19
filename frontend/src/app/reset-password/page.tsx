'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.resetPassword(token, newPassword);
      setIsDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de réinitialiser le mot de passe.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <p className="error" style={{ margin: 0 }}>
        Ce lien est incomplet — demande un nouveau lien de réinitialisation.
      </p>
    );
  }

  if (isDone) {
    return (
      <>
        <p style={{ margin: '0 0 1rem' }}>Ton mot de passe a été changé.</p>
        <Link href="/login">
          <button className="primary" type="button">
            Se connecter
          </button>
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="error">{error}</p>}
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
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="page">
      <p className="brand">Ignitux</p>
      <h1>Nouveau mot de passe</h1>
      <div className="card">
        <Suspense fallback={<p className="loading">Chargement…</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
      <p className="muted" style={{ marginTop: '1rem' }}>
        <Link href="/login">← Retour à la connexion</Link>
      </p>
    </main>
  );
}
