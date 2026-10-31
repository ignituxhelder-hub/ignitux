'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Icone } from '@/components/icones';
import { ChatIgini } from './chat-igini';
import { useAuth } from '@/lib/auth';
import { domaineDeLApplication, libelleRoles } from '@/lib/domaines';
import { useEspace } from '@/lib/espace';
import { nomDansPhrase } from '@/lib/espace-courant';
import {
  applicationDe,
  applicationParId,
  BUREAU,
  CLE_TACHES,
  ecrireTaches,
  EVENEMENT_TACHES,
  fermer,
  lireTaches,
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
 * bureau ou dans une application. Connexion, inscription : pas de barre — on
 * n'est pas encore « dans » Ignitux. Seule exception : la barre de l'espace
 * (bandeau chez un autre, sélecteur) est sur TOUTE page connectée.
 *
 * Il ne garde aucune porte : les droits restent au serveur.
 */
export function Systeme({ children }: { children: ReactNode }) {
  const chemin = usePathname() ?? '';
  const router = useRouter();
  const { token, isReady, user } = useAuth();
  const { espaces, courant, message, choisir, effacerMessage } = useEspace();
  const [taches, setTaches] = useState<Tache[]>([]);
  const [chatOuvert, setChatOuvert] = useState(false);

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

  // L'accès à l'espace a disparu : on rentre au bureau, chez soi.
  useEffect(() => {
    if (message) router.push(BUREAU);
  }, [message, router]);

  if (!connecte) return <>{children}</>;

  const plusieursEspaces = !!espaces && espaces.length > 1;

  // Le bandeau de l'espace d'un autre (et le sélecteur, dès qu'il y a le
  // choix) est sur TOUTES les pages connectées, y compris celles qui ne sont
  // pas une application (identité, administration, évaluations…) : on ne
  // doit jamais oublier chez qui l'on est.
  const barreEspace = (courant || message || plusieursEspaces) && (
    <section className="barre-espace" aria-label="Espace de travail">
      {courant && (
        <p className="barre-espace__bandeau" role="status">
          Tu travailles dans {nomDansPhrase(courant.nom)} (facturation, comptabilité, banque, caisse) — rôle : {libelleRoles(courant.roles)}
        </p>
      )}
      {message && (
        <p className="error barre-espace__message" role="alert">
          <span>{message} Tu es revenu dans ton espace.</span>
          <button type="button" className="secondary" onClick={effacerMessage}>
            OK
          </button>
        </p>
      )}
      {plusieursEspaces && espaces && (
        <div className="barre-espace__choix">
          <label htmlFor="selecteur-espace">Espace</label>
          <select
            id="selecteur-espace"
            value={courant?.ownerId ?? user?.id ?? ''}
            onChange={(e) => {
              const cible = espaces.find((espace) => espace.ownerId === e.target.value) ?? null;
              choisir(cible && cible.ownerId !== user?.id ? cible : null);
              // Les données affichées sont celles de l'ancien espace : on
              // repart du bureau, qui se recalcule pour le nouveau.
              router.push(BUREAU);
            }}
          >
            {espaces.map((espace) => (
              <option key={espace.ownerId} value={espace.ownerId}>
                {espace.ownerId === user?.id
                  ? 'Mon espace'
                  : `${espace.nom} (${libelleRoles(espace.roles)})`}
              </option>
            ))}
          </select>
        </div>
      )}
    </section>
  );

  // Page connectée hors bureau et hors application : ni barre d'application
  // ni barre des tâches, mais l'espace reste dit.
  if (!app && !surBureau) {
    return (
      <>
        {barreEspace}
        {children}
      </>
    );
  }

  // Dans l'espace d'un autre, seules les applications d'argent s'affichent :
  // les requêtes des autres partiraient sans en-tête et montreraient MES
  // données sous le bandeau de l'autre.
  const horsArgent = !!courant && !!app && domaineDeLApplication(app.id) !== 'argent';

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
              <Icone id={app.id} />
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

      {barreEspace}

      {horsArgent && app && courant ? (
        <main className="page">
          <div className="card">
            <p style={{ marginTop: 0 }}>
              {`${app.nom} n’est pas partagée dans ${nomDansPhrase(courant.nom)} : seules la facturation, la comptabilité, la banque et la caisse le sont.`}
            </p>
            <button
              type="button"
              className="primary"
              onClick={() => {
                choisir(null);
                router.push(BUREAU);
              }}
            >
              Revenir à mon espace
            </button>
          </div>
        </main>
      ) : (
        children
      )}

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
                  <Icone id={ouverte.id} />
                </span>
                <span className="barre-taches__nom">{ouverte.nom}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {!chatOuvert && (
        <button
          type="button"
          className="bouton-chat-igini"
          onClick={() => setChatOuvert(true)}
          aria-label="Discuter avec IGINI"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M2 3h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H8l-4 4v-4H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          </svg>
        </button>
      )}

      {chatOuvert && <ChatIgini onClose={() => setChatOuvert(false)} />}
    </>
  );
}
