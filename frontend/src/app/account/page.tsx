'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Brand } from '@/components/ignitux-mark';
import { api, ApiError, type DeletionPreview } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function AccountPage() {
  const { token, user, isReady, logout } = useAuth();
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
      <Brand />
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

      <ExportSection token={token} />
      <DeleteAccountSection
        token={token}
        onDeleted={() => {
          logout();
          router.replace('/');
        }}
      />
    </main>
  );
}

/** Droit d'accès : récupérer une copie de tout ce qu'Ignitux détient. */
function ExportSection({ token }: { token: string }) {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    setIsBusy(true);
    try {
      const data = await api.exportMyData(token);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ignitux-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de préparer tes données.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Mes données</h2>
      <p className="muted">
        Télécharge une copie de tout ce qu&apos;Ignitux détient à ton sujet, au format JSON. Le
        fichier dit aussi ce qu&apos;il ne contient pas, et pourquoi.
      </p>
      {error && <p className="error">{error}</p>}
      <p className="notice">
        <span>
          Ce fichier contiendra les coordonnées des <strong>tiers</strong> que tu as saisis
          (contacts, clients). Une fois téléchargé, c&apos;est toi qui en réponds.
        </span>
      </p>
      <button className="secondary" type="button" onClick={handleExport} disabled={isBusy}>
        {isBusy ? 'Préparation…' : 'Télécharger mes données'}
      </button>
    </div>
  );
}

/**
 * Droit à l'effacement, en deux temps.
 *
 * On ne propose jamais « supprimer » comme un bouton de plus : l'article 8
 * de la Constitution interdit d'engager une action irréversible sans que la
 * personne ait vu ce qu'elle engage. Elle lit donc d'abord ce qui va
 * disparaître — y compris ce qu'elle pourrait être légalement tenue de
 * conserver — puis saisit son mot de passe.
 */
function DeleteAccountSection({ token, onDeleted }: { token: string; onDeleted: () => void }) {
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPreview() {
    setError(null);
    setIsLoading(true);
    try {
      setPreview(await api.getDeletionPreview(token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de préparer l'aperçu.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsDeleting(true);
    try {
      await api.deleteMyAccount(token, password);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de supprimer le compte.');
      setIsDeleting(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Supprimer mon compte</h2>

      {!preview && (
        <>
          <p className="muted">
            La suppression est définitive et Ignitux n&apos;en garde aucune copie. Avant de
            décider, regarde ce qui disparaîtra.
          </p>
          {error && <p className="error">{error}</p>}
          <button className="secondary" type="button" onClick={loadPreview} disabled={isLoading}>
            {isLoading ? 'Calcul…' : 'Voir ce qui sera supprimé'}
          </button>
        </>
      )}

      {preview && (
        <>
          <ul>
            {Object.entries(preview.resume)
              .filter(([, count]) => count > 0)
              .map(([label, count]) => (
                <li key={label}>
                  {count} {label.replaceAll('_', ' ')}
                </li>
              ))}
          </ul>
          {Object.values(preview.resume).every((count) => count === 0) && (
            <p className="muted">Ton compte ne contient aucune donnée à perdre.</p>
          )}

          {preview.avertissements.map((warning) => (
            <p className="notice" key={warning}>
              <span>{warning}</span>
            </p>
          ))}

          <p className="muted">{preview.journal_constitutionnel}</p>

          {error && <p className="error">{error}</p>}

          <form onSubmit={handleDelete}>
            <div className="field">
              <label htmlFor="deletePassword">
                Confirme avec ton mot de passe
              </label>
              <input
                id="deletePassword"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button className="primary" type="submit" disabled={isDeleting}>
              {isDeleting ? 'Suppression…' : 'Supprimer définitivement mon compte'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
