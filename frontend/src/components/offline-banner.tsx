'use client';

import { useEffect, useRef, useState } from 'react';
import {
  dismissRejectedMutation,
  readOfflineState,
  replayOfflineQueue,
  setOfflineChangeHandler,
  setOfflineStorage,
} from '@/lib/api';
import type { OfflineState } from '@/lib/offline-queue';
import { useAuth } from '@/lib/auth';

const EMPTY: OfflineState = { pending: [], rejected: [] };

/**
 * Bandeau d'état hors ligne.
 *
 * Il affiche trois choses, et refuse d'en cacher une seule :
 * — que la connexion est coupée ;
 * — combien d'actions attendent d'être envoyées (elles ne sont PAS
 *   enregistrées côté serveur, et le texte le dit) ;
 * — celles que le serveur a refusées au moment du rejeu, avec son motif.
 *
 * Ce dernier point est le plus important : une action refusée qu'on ferait
 * disparaître discrètement laisserait l'utilisateur croire que son travail
 * est enregistré alors qu'il est perdu.
 */
export function OfflineBanner() {
  const { token } = useAuth();
  const [isOnline, setIsOnline] = useState(true);
  const [state, setState] = useState<OfflineState>(EMPTY);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    // Le stockage est injecté ici et pas dans le module API : celui-ci est
    // aussi évalué côté serveur par Next.js, où localStorage n'existe pas.
    try {
      setOfflineStorage(window.localStorage);
    } catch {
      setOfflineStorage(null);
    }
    setState(readOfflineState());
    setIsOnline(window.navigator.onLine);

    const refresh = () => setState(readOfflineState());
    setOfflineChangeHandler(refresh);

    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      setOfflineChangeHandler(null);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Le verrou de synchronisation est une ref et non un état : mis dans les
  // dépendances de l'effet, `isSyncing` le relançait aussitôt après son
  // propre `setIsSyncing(true)`, et le nettoyage de ce relancement annulait
  // le rejeu en cours — la file partait, mais le résultat n'arrivait jamais
  // à l'écran. Une ref ne provoque pas de rendu, donc pas de relancement.
  const syncing = useRef(false);

  useEffect(() => {
    if (!isOnline || !token || state.pending.length === 0 || syncing.current) return;

    syncing.current = true;
    setIsSyncing(true);
    replayOfflineQueue(token)
      .then((outcome) => {
        setState(readOfflineState());
        setLastSync(
          `${outcome.sent} action(s) envoyée(s)` +
            (outcome.rejected > 0 ? `, ${outcome.rejected} refusée(s)` : '') +
            (outcome.remaining > 0 ? `, ${outcome.remaining} encore en attente` : '') +
            '.',
        );
      })
      .catch(() => {})
      .finally(() => {
        syncing.current = false;
        setIsSyncing(false);
      });
  }, [isOnline, token, state.pending.length]);

  const hasSomethingToSay =
    !isOnline || state.pending.length > 0 || state.rejected.length > 0 || lastSync !== null;
  if (!hasSomethingToSay) return null;

  return (
    <div className="card" role="status" style={{ marginBottom: '1rem' }}>
      {!isOnline && (
        <p style={{ margin: 0 }}>
          <strong>Hors ligne.</strong> Tu peux continuer à consulter ce qui a déjà été chargé, et
          tes actions seront envoyées à la reconnexion.
        </p>
      )}

      {state.pending.length > 0 && (
        <div style={{ marginTop: !isOnline ? '0.5rem' : 0 }}>
          <p style={{ margin: 0 }}>
            {state.pending.length} action(s) en attente d&apos;envoi.{' '}
            <span className="muted">
              Elles ne sont pas encore enregistrées sur le serveur : rien ne garantit
              qu&apos;il les acceptera.
            </span>
          </p>
          <ul className="muted" style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
            {state.pending.map((mutation) => (
              <li key={mutation.id}>{mutation.label}</li>
            ))}
          </ul>
        </div>
      )}

      {isSyncing && <p className="loading">Envoi en cours…</p>}
      {!isSyncing && lastSync && state.pending.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          {lastSync}
        </p>
      )}

      {state.rejected.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <p className="error" style={{ margin: 0 }}>
            {state.rejected.length} action(s) refusée(s) par le serveur. Elles ne seront pas
            réessayées : à toi de décider quoi en faire.
          </p>
          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
            {state.rejected.map((mutation) => (
              <li key={mutation.id}>
                {mutation.label} — {mutation.reason}
                <button
                  className="secondary"
                  type="button"
                  onClick={() => setState(dismissRejectedMutation(mutation.id))}
                  style={{ marginLeft: '0.5rem' }}
                >
                  Écarter
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
