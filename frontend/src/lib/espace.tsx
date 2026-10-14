'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  api,
  MESSAGE_ESPACE_PERDU,
  setEspaceActif,
  setEspaceAVerifierHandler,
  type EspaceListe,
} from './api';
import { useAuth } from './auth';
import { ecrireEspaceChoisi, lireEspaceChoisi, type EspaceChoisi } from './espace-courant';
import { ecrireTaches, EVENEMENT_TACHES, stockageNavigateur } from './systeme';

/**
 * ÉQUIPE — l'espace dans lequel la personne travaille, pour toute l'interface.
 *
 * `courant` vaut null dans « Mon espace ». Changer d'espace pose l'espace
 * dans le module d'API (qui ajoute `X-Espace` aux routes d'argent), le
 * mémorise pour cette personne, et vide la barre des tâches : rouvrir une
 * facture d'un autre espace depuis la barre n'aurait aucun sens.
 *
 * Il ne garde aucune porte : les droits restent au serveur, route par route.
 */

interface EspaceState {
  /** Mes espaces (« Mon espace » d'abord), null tant qu'ils ne sont pas chargés. */
  espaces: EspaceListe[] | null;
  courant: EspaceChoisi | null;
  /** Un message à dire (accès perdu), jusqu'à ce que la personne le ferme. */
  message: string | null;
  choisir: (espace: EspaceListe | null) => void;
  recharger: () => Promise<void>;
  effacerMessage: () => void;
}

const PAR_DEFAUT: EspaceState = {
  espaces: null,
  courant: null,
  message: null,
  choisir: () => {},
  recharger: async () => {},
  effacerMessage: () => {},
};

const EspaceContext = createContext<EspaceState>(PAR_DEFAUT);

// Avant les effets des pages : une page qui charge ses données au montage
// doit partir dans le bon espace dès sa première requête.
const useEffetAvantLesPages = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function viderBarreDesTaches() {
  ecrireTaches(stockageNavigateur(), []);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENEMENT_TACHES));
}

export function EspaceProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const userId = user?.id ?? null;
  const [espaces, setEspaces] = useState<EspaceListe[] | null>(null);
  const [courant, setCourant] = useState<EspaceChoisi | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pourQui, setPourQui] = useState<string | null>(null);

  // Une autre personne (ou personne) : l'espace mémorisé est relu PENDANT le
  // rendu, pas dans un effet — sinon les pages, dont les effets passent avant
  // ceux de ce fournisseur, auraient déjà chargé dans le mauvais espace.
  if (pourQui !== userId) {
    setPourQui(userId);
    setCourant(userId ? lireEspaceChoisi(stockageNavigateur(), userId) : null);
    if (!userId) setEspaces(null);
  }

  // Et le module d'API suit, avant les effets des pages.
  useEffetAvantLesPages(() => {
    setEspaceActif(courant?.ownerId ?? null);
  }, [courant]);

  const allerChezMoi = useCallback(
    (raison: string | null) => {
      setEspaceActif(null);
      setCourant(null);
      if (userId) ecrireEspaceChoisi(stockageNavigateur(), userId, null);
      viderBarreDesTaches();
      setMessage(raison);
    },
    [userId],
  );

  const recharger = useCallback(async () => {
    if (!token || !userId) return;
    try {
      const liste = await api.mesEspaces(token);
      setEspaces(liste);
      const memorise = lireEspaceChoisi(stockageNavigateur(), userId);
      if (!memorise) return;
      const actuel = liste.find((e) => e.ownerId === memorise.ownerId);
      if (!actuel) {
        // L'appartenance a disparu pendant mon absence.
        allerChezMoi(MESSAGE_ESPACE_PERDU);
        return;
      }
      // Les rôles ont pu changer : on suit le serveur.
      const suivi: EspaceChoisi = {
        ownerId: actuel.ownerId,
        nom: actuel.nom,
        roles: [...actuel.roles],
      };
      ecrireEspaceChoisi(stockageNavigateur(), userId, suivi);
      setCourant(suivi);
    } catch {
      // Hors ligne ou serveur indisponible : on garde ce qu'on sait.
    }
  }, [token, userId, allerChezMoi]);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  // Une réponse a mis l'espace en doute (404 « Espace introuvable. ») : on
  // relit la liste des espaces, et c'est ELLE qui décide — retour chez soi
  // seulement si l'espace en a disparu, sinon on y reste et les rôles suivent
  // le serveur. Un 403 ne fait jamais quitter l'espace (c'est l'action qui
  // est refusée, pas l'accès). Plusieurs refus simultanés ne lancent qu'une
  // relecture.
  const verificationEnCours = useRef<Promise<void> | null>(null);
  useEffect(() => {
    setEspaceAVerifierHandler(() => {
      if (verificationEnCours.current) return;
      verificationEnCours.current = recharger().finally(() => {
        verificationEnCours.current = null;
      });
    });
    return () => setEspaceAVerifierHandler(null);
  }, [recharger]);

  const choisir = useCallback(
    (espace: EspaceListe | null) => {
      if (!userId) return;
      if (!espace || espace.ownerId === userId) {
        allerChezMoi(null);
        return;
      }
      const choisi: EspaceChoisi = {
        ownerId: espace.ownerId,
        nom: espace.nom,
        roles: [...espace.roles],
      };
      setEspaceActif(choisi.ownerId);
      ecrireEspaceChoisi(stockageNavigateur(), userId, choisi);
      setCourant(choisi);
      setMessage(null);
      viderBarreDesTaches();
    },
    [userId, allerChezMoi],
  );

  const effacerMessage = useCallback(() => setMessage(null), []);

  return (
    <EspaceContext.Provider value={{ espaces, courant, message, choisir, recharger, effacerMessage }}>
      {children}
    </EspaceContext.Provider>
  );
}

/** Sans fournisseur (tests d'une page seule), on est chez soi. */
export function useEspace(): EspaceState {
  return useContext(EspaceContext);
}
