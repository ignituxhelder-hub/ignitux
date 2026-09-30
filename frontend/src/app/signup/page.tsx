'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Brand } from '@/components/ignitux-mark';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedCgu, setAcceptedCgu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!acceptedCgu) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await signup(email, password);
      router.replace('/roles');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de créer le compte.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page">
      <Brand />
      <h1>Créer un compte</h1>
      <form className="card" onSubmit={handleSubmit}>
        {error && <p className="error">{error}</p>}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            aria-describedby="password-regle"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {/* La règle était appliquée mais jamais dite : on ne l'apprenait
              qu'en la heurtant, dans une bulle écrite par le navigateur, donc
              pas forcément en français. Elle est maintenant énoncée avant. */}
          <p className="muted" id="password-regle" style={{ margin: 0, fontSize: '0.8rem' }}>
            Huit caractères au minimum.
            {password.length > 0 && password.length < 8
              ? ` Il en manque ${8 - password.length}.`
              : ''}
          </p>
        </div>
        <div className="field" style={{ flexDirection: 'row', alignItems: 'baseline', gap: '0.5rem' }}>
          <input
            id="accepte-cgu"
            type="checkbox"
            checked={acceptedCgu}
            onChange={(e) => setAcceptedCgu(e.target.checked)}
            style={{ width: 'auto' }}
          />
          <label htmlFor="accepte-cgu" style={{ margin: 0 }}>
            J&apos;ai lu et j&apos;accepte les{' '}
            <Link href="/cgu">conditions d&apos;utilisation</Link> et la{' '}
            <Link href="/confidentialite">politique de confidentialité</Link>
          </label>
        </div>
        <button className="primary" type="submit" disabled={isSubmitting || !acceptedCgu}>
          {isSubmitting ? 'Création…' : 'Créer mon compte'}
        </button>
      </form>
      <p className="muted" style={{ marginTop: '1rem' }}>
        Déjà un compte ? <Link href="/login">Se connecter</Link>
      </p>
    </main>
  );
}
