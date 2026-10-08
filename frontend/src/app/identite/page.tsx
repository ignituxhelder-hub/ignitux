'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Brand } from '@/components/ignitux-mark';
import { api, ApiError, type IdentityVerification } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const LIBELLES_STATUT: Record<string, string> = {
  en_attente: 'En attente',
  validee: 'Validée',
  rejetee: 'Rejetée',
};

const LIBELLES_DOCUMENT: Record<string, string> = {
  carte_identite: "Carte d'identité",
  passeport: 'Passeport',
  titre_sejour: 'Titre de séjour',
};

/**
 * IDENTITÉ — la pièce qui rend un mandat possible.
 *
 * Bandeau honnête, même esprit que Banque/Caisse : les contrôles
 * automatiques réduisent le travail de revue, ils ne remplacent jamais la
 * personne qui valide avant qu'une identité compte comme vérifiée.
 */
export default function IdentitePage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [verifications, setVerifications] = useState<IdentityVerification[]>([]);
  const [documentType, setDocumentType] = useState<'carte_identite' | 'passeport' | 'titre_sejour'>(
    'carte_identite',
  );
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      setVerifications(await api.getMesVerifications(token));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger tes vérifications.');
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

  const soumettre = async (evenement: React.FormEvent) => {
    evenement.preventDefault();
    if (!token || !front) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await api.soumettreDocumentIdentite(token, documentType, front, back);
      setFront(null);
      setBack(null);
      await charger();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'envoyer ton document.");
    } finally {
      setIsSubmitting(false);
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

      <h1>Vérification d&apos;identité</h1>
      <p className="notice">
        Ta pièce est lue automatiquement pour détecter les incohérences évidentes, mais c&apos;est
        une personne qui valide avant que ton identité compte comme vérifiée.
      </p>

      {error && <p className="error">{error}</p>}

      <form onSubmit={soumettre} className="card">
        <label>
          Type de document
          <select
            aria-label="Type de document"
            value={documentType}
            onChange={(e) => {
              const type = e.target.value as typeof documentType;
              setDocumentType(type);
              // Le champ verso disparaît pour un passeport : un verso choisi
              // auparavant ne doit pas partir en douce avec la soumission.
              if (type === 'passeport') setBack(null);
            }}
          >
            <option value="carte_identite">Carte d&apos;identité</option>
            <option value="passeport">Passeport</option>
            <option value="titre_sejour">Titre de séjour</option>
          </select>
        </label>

        <label>
          Recto
          <input
            aria-label="Recto"
            type="file"
            accept="image/jpeg,image/png"
            onChange={(e) => setFront(e.target.files?.[0] ?? null)}
          />
        </label>

        {documentType !== 'passeport' && (
          <label>
            Verso
            <input
              aria-label="Verso"
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => setBack(e.target.files?.[0] ?? null)}
            />
          </label>
        )}

        <button className="primary" type="submit" disabled={!front || isSubmitting}>
          {isSubmitting ? 'Envoi…' : 'Envoyer'}
        </button>
      </form>

      <h2>Mes vérifications</h2>
      {isLoading && <p className="loading">Chargement…</p>}
      {!isLoading && verifications.length === 0 && (
        <p className="muted">Aucune vérification pour l&apos;instant.</p>
      )}
      {verifications.map((v) => (
        <div key={v.id} className="card">
          <strong>{LIBELLES_DOCUMENT[v.document_type] ?? v.document_type}</strong>
          <p>{LIBELLES_STATUT[v.status] ?? v.status}</p>
          {v.status === 'rejetee' && v.rejection_reason && (
            <p className="error">{v.rejection_reason}</p>
          )}
        </div>
      ))}
    </main>
  );
}
