'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import {
  applicationDe,
  applicationParId,
  BUREAU,
  CLE_TACHES,
  ecrireTaches,
  EVENEMENT_TACHES,
  fermer,
  lireTaches,
  monogramme,
  ouvrir,
  stockageNavigateur,
  type Tache,
} from '@/lib/systeme';

/**
 * LE SYSTÈME — la barre de l'application en haut, la barre des tâches en bas.
 *
 * Monté une seule fois, autour de toutes les pages : les applications ne se
 * connaissent plus entre elles. Aucune ne porte de lien vers les autres ;
 * c'est le système qui ramène au bureau et passe de l'une à l'autre, comme
 * sur un ordinateur.
 *
 * Il ne s'affiche que pour une personne connectée, et seulement sur le
 * bureau ou dans une application. Connexion, inscription, pages d'erreur :
 * pas de barre — on n'est pas encore « dans » Ignitux.
 *
 * Il ne garde aucune porte : les droits restent au serveur.
 */
export function Systeme({ children }: { children: ReactNode }) {
  const chemin = usePathname() ?? '';
  const router = useRouter();
  const { token, isReady } = useAuth();
  const [taches, setTaches] = useState<Tache[]>([]);

  const app = applicationDe(chemin);
  const surBureau = chemin === BUREAU;
  const connecte = isReady && !!token;

  // Retenir où on en est dans l'application ouverte. L'adresse complète,
  // paramètres compris : rouvrir une facture, pas la liste des factures.
  useEffect(() => {
    if (!connecte) return;
    const stockage = stockageNavigateur();
    let suivantes = lireTaches(stockage);
    if (app) suivantes = ouvrir(suivantes, app.id, chemin + window.location.search);
    ecrireTaches(stockage, suivantes);
    setTaches(suivantes);
  }, [connecte, app, chemin]);

  // Le bureau peut fermer une tâche (application retirée) ; un autre onglet
  // aussi. Dans les deux cas on relit la mémoire.
  useEffect(() => {
    const relire = () => setTaches(lireTaches(stockageNavigateur()));
    const surStockage = (e: StorageEvent) => {
      if (e.key === CLE_TACHES) relire();
    };
    window.addEventListener(EVENEMENT_TACHES, relire);
    window.addEventListener('storage', surStockage);
    return () => {
      window.removeEventListener(EVENEMENT_TACHES, relire);
      window.removeEventListener('storage', surStockage);
    };
  }, []);

  // À la déconnexion, la barre part avec la session : la personne suivante
  // sur le même appareil ne doit pas voir où la précédente travaillait.
  useEffect(() => {
    if (isReady && !token) {
      ecrireTaches(stockageNavigateur(), []);
      setTaches([]);
    }
  }, [isReady, token]);

  if (!connecte || (!app && !surBureau)) return <>{children}</>;

  function fermerApplication(id: string) {
    const suivantes = fermer(taches, id);
    ecrireTaches(stockageNavigateur(), suivantes);
    setTaches(suivantes);
    if (app?.id === id) router.push(BUREAU);
  }

  return (
    <>
      {app && (
        <header className="barre-app">
          <Link href={BUREAU} className="barre-app__bureau">
            <span aria-hidden="true">←</span> Bureau
          </Link>
          <span className="barre-app__titre">
            <span className="barre-app__glyphe" aria-hidden="true">
              {monogramme(app.nom)}
            </span>
            {app.nom}
          </span>
          <button
            type="button"
            className="barre-app__fermer"
            onClick={() => fermerApplication(app.id)}
            aria-label={`Fermer ${app.nom}`}
            title="Fermer"
          >
            ✕
          </button>
        </header>
      )}

      {children}

      {/* Réserve la hauteur de la barre : sans lui, le bas de chaque page
          passait dessous. */}
      <div className="barre-taches-espace" aria-hidden="true" />

      <nav className="barre-taches" aria-label="Barre des tâches">
        <Link
          href={BUREAU}
          className="barre-taches__item barre-taches__item--bureau"
          aria-current={surBureau ? 'page' : undefined}
        >
          <span className="barre-taches__glyphe" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="1" y="1" width="6" height="6" rx="1.5" />
              <rect x="9" y="1" width="6" height="6" rx="1.5" />
              <rect x="1" y="9" width="6" height="6" rx="1.5" />
              <rect x="9" y="9" width="6" height="6" rx="1.5" />
            </svg>
          </span>
          <span className="barre-taches__nom">Bureau</span>
        </Link>

        <div className="barre-taches__ouvertes">
          {taches.map((tache) => {
            const ouverte = applicationParId(tache.id);
            if (!ouverte) return null;
            return (
              <Link
                key={tache.id}
                href={tache.url}
                className="barre-taches__item"
                aria-current={app?.id === tache.id ? 'page' : undefined}
                title={ouverte.nom}
              >
                <span className="barre-taches__glyphe" aria-hidden="true">
                  {monogramme(ouverte.nom)}
                </span>
                <span className="barre-taches__nom">{ouverte.nom}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
