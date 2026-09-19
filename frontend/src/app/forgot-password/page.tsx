'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.forgotPassword(email);
    } catch {
      // Ignoré volontairement : on affiche le même message que l'email
      // existe ou non, pour ne jamais révéler quels comptes sont inscrits.
    } finally {
      setIsSubmitting(false);
      setIsSubmitted(true);
    }
  }

  return (
    <main className="page">
      <p className="brand">Ignitux</p>
      <h1>Mot de passe oublié</h1>
      <div className="card">
        {isSubmitted ? (
          <p style={{ margin: 0 }}>
            Si un compte existe avec cet email, un lien de réinitialisation vient d&apos;être
            envoyé. Il est valable une heure.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
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
            <button className="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Envoi…' : 'Envoyer le lien'}
            </button>
          </form>
        )}
      </div>
      <p className="muted" style={{ marginTop: '1rem' }}>
        <Link href="/login">← Retour à la connexion</Link>
      </p>
    </main>
  );
}
