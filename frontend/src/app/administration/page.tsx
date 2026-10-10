'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Brand } from '@/components/ignitux-mark';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * ADMINISTRATION — l'entrée des files de revue, réservée aux administrateurs.
 *
 * Chaque file vérifie le rôle côté serveur ; cette page ne fait que compter
 * ce qui attend et y mener. Un compteur illisible s'affiche « ? » plutôt que
 * zéro : zéro voudrait dire « rien à faire », ce qui serait faux.
 */
export default function AdministrationPage() {
  const { token, isReady } = useAuth();
  const router = useRouter();
  const [evaluations, setEvaluations] = useState<number | null>(null);
  const [identites, setIdentites] = useState<number | null>(null);
  const [interdit, setInterdit] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    const compter = async (lire: () => Promise<unknown[]>, poser: (n: number | null) => void) => {
      try {
        const liste = await lire();
        poser(Array.isArray(liste) ? liste.length : null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) setInterdit(true);
        poser(null);
      }
    };
    void compter(() => api.getEvaluationsEnRevue(token), setEvaluations);
    void compter(() => api.getVerificationsEnAttente(token), setIdentites);
  }, [isReady, token, router]);

  if (!isReady || !token) return null;

  const nombre = (n: number | null) => (n === null ? '?' : String(n));

  return (
    <main className="page">
      <div className="top-bar">
        <Brand />
        <Link href="/accueil">Bureau</Link>
      </div>
      <h1>Administration</h1>

      {interdit ? (
        <p className="error">Réservé aux administrateurs d’Ignitux.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li className="card" style={{ marginTop: '0.75rem' }}>
            <Link href="/evaluations/revue">Évaluations de financement à revoir ({nombre(evaluations)})</Link>
          </li>
          <li className="card" style={{ marginTop: '0.75rem' }}>
            <Link href="/identite/revue">Pièces d’identité à revoir ({nombre(identites)})</Link>
          </li>
        </ul>
      )}
    </main>
  );
}
