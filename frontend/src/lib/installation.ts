'use client';

import { useEffect, useState } from 'react';

/**
 * INSTALLER IGNITUX — trois systèmes, deux façons de faire.
 *
 * **Android et Windows** (Chrome, Edge, Samsung Internet) : le navigateur
 * émet `beforeinstallprompt` quand l'application remplit les conditions
 * (manifeste, icônes, service worker). On garde l'événement, et c'est la
 * personne qui décide du moment en appuyant sur « Installer » — jamais une
 * fenêtre qui surgit à l'ouverture.
 *
 * **iPhone et iPad** : Safari n'émet rien et n'offre aucune API. La seule
 * voie est le menu Partager, puis « Sur l'écran d'accueil ». On ne peut que
 * l'expliquer, et on ne l'explique qu'à Safari sur iOS : ailleurs, ces
 * instructions seraient fausses.
 *
 * **Déjà installée** : on ne propose rien. Une application qui demande à
 * être installée alors qu'elle l'est déjà a l'air de ne pas savoir où elle
 * est.
 *
 * L'écoute démarre au niveau racine (`service-worker.tsx`) et non dans la
 * page qui affiche le bouton : Chrome émet l'événement une fois, souvent
 * avant que cette page ne soit chargée, et un événement sans écouteur est
 * perdu.
 */

/** L'événement de Chromium. Absent des types du DOM, car non standard. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type ModeInstallation =
  /** Déjà ouverte comme application : rien à proposer. */
  | 'installee'
  /** Le navigateur sait installer : un bouton suffit. */
  | 'bouton'
  /** Safari sur iPhone ou iPad : il faut passer par Partager. */
  | 'ios'
  /** Navigateur qui ne sait pas installer (Firefox bureau, etc.). */
  | 'indisponible';

let proposition: BeforeInstallPromptEvent | null = null;
let installeeCetteSession = false;
const abonnes = new Set<() => void>();
let ecouteDemarree = false;

function prevenir() {
  for (const abonne of abonnes) abonne();
}

/** À appeler une fois, le plus tôt possible, côté client. */
export function demarrerEcouteInstallation() {
  if (ecouteDemarree || typeof window === 'undefined') return;
  ecouteDemarree = true;
  window.addEventListener('beforeinstallprompt', (evenement) => {
    // Empêche la mini-barre automatique de Chrome sur Android : c'est
    // notre bouton qui la remplace, au moment choisi par la personne.
    evenement.preventDefault();
    proposition = evenement as BeforeInstallPromptEvent;
    prevenir();
  });
  window.addEventListener('appinstalled', () => {
    proposition = null;
    installeeCetteSession = true;
    prevenir();
  });
}

function estOuverteCommeApplication(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // Safari iOS ne connaît pas `display-mode` dans les vieilles versions :
  // il expose sa propre propriété.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * Safari sur iOS ou iPadOS. Un iPad récent se présente comme un Mac ; on le
 * reconnaît à l'écran tactile. Chrome et Firefox sur iOS sont exclus : ils
 * savent aussi ajouter à l'écran d'accueil, mais leur menu n'est pas le même,
 * et des instructions fausses sont pires que pas d'instructions.
 */
export function estSafariIos(ua: string, pointsTactiles: number): boolean {
  const appareilIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && pointsTactiles > 1);
  if (!appareilIos) return false;
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export function modeInstallation(): ModeInstallation {
  if (installeeCetteSession || estOuverteCommeApplication()) return 'installee';
  if (proposition) return 'bouton';
  if (typeof navigator !== 'undefined' && estSafariIos(navigator.userAgent, navigator.maxTouchPoints ?? 0)) {
    return 'ios';
  }
  return 'indisponible';
}

/** Ouvre la fenêtre d'installation du navigateur. Vrai si la personne accepte. */
export async function installer(): Promise<boolean> {
  const evenement = proposition;
  if (!evenement) return false;
  // Un événement ne sert qu'une fois : Chrome refuse un second `prompt()`.
  proposition = null;
  await evenement.prompt();
  const { outcome } = await evenement.userChoice;
  prevenir();
  return outcome === 'accepted';
}

export function useInstallation(): ModeInstallation {
  // Rendu serveur puis premier rendu client : « indisponible », pour que
  // les deux coïncident. La vraie valeur arrive juste après.
  const [mode, setMode] = useState<ModeInstallation>('indisponible');
  useEffect(() => {
    demarrerEcouteInstallation();
    const maj = () => setMode(modeInstallation());
    maj();
    abonnes.add(maj);
    return () => {
      abonnes.delete(maj);
    };
  }, []);
  return mode;
}
