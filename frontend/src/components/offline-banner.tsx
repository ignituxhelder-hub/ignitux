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

const EMPTY: OfflineState = { pending: [], rejected: [], nextId: 1 };

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
  /**
   * Le stockage ne retient plus rien alors qu'une écriture vient de partir.
   * C'est le pire cas de la file : l'action est peut-être arrivée au
   * serveur, mais rien ne permet de s'en souvenir — donc elle risque de
   * repartir au prochain essai. La personne doit le savoir ; la file le
   * signalait déjà, personne ne l'écoutait.
   */
  const [storageStalled, setStorageStalled] = useState(false);

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
  /** Vrai dès qu'un rejeu a réellement fait partir quelque chose. */
  const [envoiReussi, setEnvoiReussi] = useState(false);

  useEffect(() => {
    if (!isOnline || !token || state.pending.length === 0 || syncing.current) return;

    syncing.current = true;
    setIsSyncing(true);
    replayOfflineQueue(token)
      .then((outcome) => {
        setState(readOfflineState());
        setStorageStalled(outcome.storageStalled === true);
        setEnvoiReussi(outcome.sent > 0);
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
    !isOnline ||
    state.pending.length > 0 ||
    state.rejected.length > 0 ||
    lastSync !== null ||
    storageStalled;
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

      {storageStalled && (
        <p className="error" style={{ marginTop: '0.5rem' }}>
          Le stockage de ton navigateur est saturé : Ignitux n&apos;arrive plus à noter ce
          qu&apos;il a déjà envoyé. Une action est peut-être arrivée sur le serveur sans qu&apos;on
          puisse s&apos;en souvenir — elle risque donc de repartir une seconde fois. Libère de
          l&apos;espace, puis recharge la page.
        </p>
      )}

      {isSyncing && <p className="loading">Envoi en cours…</p>}
      {/*
        Ce que l'écran ne montre pas tout seul.

        Le rejeu réussit et la file se vide, mais rien ne prévient les pages
        de relire leurs données : elles se sont chargées avant la coupure et
        n'ont aucune raison de recommencer. Vérifié de bout en bout — une
        tâche écrite hors ligne arrive bien en base à la reconnexion, reste
        invisible à l'écran, et apparaît après un rechargement.

        Pour la personne, la séquence est trompeuse : « 1 action en attente »
        disparaît, sa tâche n'est toujours pas là. La conclusion raisonnable
        est qu'elle a été perdue — alors elle la ressaisit, et se retrouve
        avec un doublon qu'elle n'a pas demandé.

        On ne recharge pas à sa place : un rechargement d'office effacerait
        un formulaire à demi rempli, et le moment où l'on retrouve le réseau
        est précisément celui où l'on était en train d'écrire. On dit ce qui
        s'est passé, on dit que l'écran est en retard, et on met le geste à
        portée de clic.
      */}
      {!isSyncing && lastSync && state.pending.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          {lastSync}
          {envoiReussi && (
            <>
              {' '}
              Cet écran date d&apos;avant la coupure et ne les montre pas encore.{' '}
              <button
                className="secondary"
                type="button"
                onClick={() => window.location.reload()}
              >
                Rafraîchir l&apos;affichage
              </button>
            </>
          )}
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
