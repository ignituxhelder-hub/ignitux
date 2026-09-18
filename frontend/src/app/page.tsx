'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';

export default function HomePage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isReady && token) {
      router.replace('/projects');
    }
  }, [isReady, token, router]);

  return (
    <main className="page">
      <p className="brand">Ignitux</p>
      <h1>Transformer une idée en réalité</h1>
      <p className="muted">
        Analyser, construire, financer, développer, transmettre — depuis un seul endroit.
      </p>
      <div className="card" style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Link href="/signup">
          <button className="primary" type="button">
            Créer un compte
          </button>
        </Link>
        <Link href="/login" className="muted">
          J&apos;ai déjà un compte
        </Link>
      </div>
    </main>
  );
}
