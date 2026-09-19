'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';

type Status = 'loading' | 'success' | 'error';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('Ce lien est incomplet.');
      return;
    }
    let cancelled = false;
    api
      .verifyEmail(token)
      .then(() => {
        if (!cancelled) setStatus('success');
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus('error');
        setError(err instanceof ApiError ? err.message : "Impossible de vérifier l'email.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === 'loading') {
    return <p className="loading">Vérification…</p>;
  }

  if (status === 'success') {
    return (
      <>
        <p style={{ margin: '0 0 1rem' }}>Ton email est confirmé.</p>
        <Link href="/projects">
          <button className="primary" type="button">
            Aller à mes projets
          </button>
        </Link>
      </>
    );
  }

  return <p className="error" style={{ margin: 0 }}>{error}</p>;
}

export default function VerifyEmailPage() {
  return (
    <main className="page">
      <p className="brand">Ignitux</p>
      <h1>Vérification de l&apos;email</h1>
      <div className="card">
        <Suspense fallback={<p className="loading">Chargement…</p>}>
          <VerifyEmailContent />
        </Suspense>
      </div>
    </main>
  );
}
