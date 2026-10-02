'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Brand } from '@/components/ignitux-mark';
import { api, ApiError, type IdentityVerification } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const LIBELLES_DOCUMENT: Record<string, string> = {
  carte_identite: "Carte d'identité",
  passeport: 'Passeport',
  titre_sejour: 'Titre de séjour',
};

/**
 * REVUE — la décision humaine qui rend une identité vérifiée.
 *
 * Réservée à `administrateur` côté serveur (RoleGuard + @RequireRole) : un
 * autre rôle reçoit un 403, affiché ici tel quel plutôt que comme une erreur
 * générique.
 */
export default function RevuePage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [enAttente, setEnAttente] = useState<IdentityVerification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const charger = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      setEnAttente(await api.getVerificationsEnAttente(token));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger la file de revue.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    void charger();
  }, [isReady, token, router, charger]);

  const trancher = async (id: string, decision: 'validee' | 'rejetee', motif?: string) => {
    if (!token) return;
    try {
      await api.revoirVerification(token, id, decision, motif);
      await charger();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible d’enregistrer la décision.');
    }
  };

  if (!isReady || !token) return null;

  return (
    <main className="page">
      <div className="top-bar">
        <Brand />
        <Link href="/projects" className="muted">
          ← Retour aux projets
        </Link>
      </div>

      <h1>Revue des vérifications d&apos;identité</h1>

      {error && <p className="error">{error}</p>}
      {isLoading && <p className="loading">Chargement…</p>}
      {!isLoading && enAttente.length === 0 && !error && (
        <p className="muted">Aucune vérification en attente.</p>
      )}

      {enAttente.map((v) => (
        <div key={v.id} className="card">
          <strong>{LIBELLES_DOCUMENT[v.document_type] ?? v.document_type}</strong>
          <p className="muted">Soumise le {new Date(v.created_at).toLocaleString('fr-FR')}</p>
          <button className="primary" type="button" onClick={() => trancher(v.id, 'validee')}>
            Valider
          </button>
          <button
            type="button"
            onClick={() => {
              const motif = window.prompt('Motif du rejet :');
              if (motif) void trancher(v.id, 'rejetee', motif);
            }}
          >
            Rejeter
          </button>
        </div>
      ))}
    </main>
  );
}
