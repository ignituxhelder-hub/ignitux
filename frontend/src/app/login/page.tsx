'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Brand } from '@/components/ignitux-mark';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const t = useTranslations('connexion');
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      // Le lanceur, pas une page : on arrive dans Ignitux, pas dans un outil.
      router.replace('/accueil');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('impossible'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page">
      <Brand />
      <h1>{t('titre')}</h1>
      <form className="card" onSubmit={handleSubmit}>
        {error && <p className="error">{error}</p>}
        <div className="field">
          <label htmlFor="email">{t('email')}</label>
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
          <label htmlFor="password">{t('motDePasse')}</label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('envoi') : t('titre')}
        </button>
      </form>
      {/* `lien-action` : ce lien est seul dans son paragraphe, donc c'est une
          action et non un mot dans une phrase. La classe lui donne une zone
          sensible qu'un doigt atteint. */}
      <p className="muted lien-action" style={{ marginTop: '1rem' }}>
        <Link href="/forgot-password">{t('oublie')}</Link>
      </p>
      <p className="muted" style={{ marginTop: '0.5rem' }}>
        {t('pasDeCompte')} <Link href="/signup">{t('inscrire')}</Link>
      </p>
    </main>
  );
}
