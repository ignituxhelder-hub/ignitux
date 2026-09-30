'use client';

import { useEffect, useState } from 'react';
import { installer, useInstallation } from '@/lib/installation';

/**
 * « Installe Ignitux sur cet appareil » — sur le lanceur, et nulle part ailleurs.
 *
 * Elle ne s'affiche que si l'installation est possible et pas déjà faite,
 * et « Plus tard » la fait taire sur cet appareil. Une invitation qu'on ne
 * peut pas refuser devient une publicité.
 */

const CLE_MASQUEE = 'ignitux.installation.masquee';

function lireMasquee(): boolean {
  try {
    return window.localStorage.getItem(CLE_MASQUEE) === '1';
  } catch {
    return false;
  }
}

export function InvitationInstallation() {
  const mode = useInstallation();
  // Masquée par défaut jusqu'à la lecture du stockage : mieux vaut
  // apparaître une fraction de seconde en retard que clignoter.
  const [masquee, setMasquee] = useState(true);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    setMasquee(lireMasquee());
  }, []);

  function plusTard() {
    setMasquee(true);
    try {
      window.localStorage.setItem(CLE_MASQUEE, '1');
    } catch {
      // Sans stockage, elle reviendra à la prochaine ouverture ; rien de grave.
    }
  }

  if (masquee || mode === 'installee' || mode === 'indisponible') return null;

  return (
    <section className="card install-invite" aria-labelledby="installation-titre">
      <div>
        <h2 id="installation-titre" className="install-invite__titre">
          Installe Ignitux sur cet appareil
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          Une icône sur ton écran, une fenêtre à part, et un démarrage même sans réseau.
        </p>
        {mode === 'ios' && (
          <ol className="install-invite__etapes">
            <li>
              Touche <strong>Partager</strong>{' '}
              <span className="install-invite__glyphe" aria-hidden="true">
                <svg width="14" height="18" viewBox="0 0 14 18" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M7 1v11M3.5 4.5 7 1l3.5 3.5M4.5 7.5H2v9.5h10V7.5H9.5" />
                </svg>
              </span>{' '}
              dans la barre de Safari.
            </li>
            <li>
              Choisis <strong>Sur l&apos;écran d&apos;accueil</strong>, puis <strong>Ajouter</strong>.
            </li>
          </ol>
        )}
      </div>
      <div className="install-invite__actions">
        {mode === 'bouton' && (
          <button
            className="primary"
            type="button"
            disabled={enCours}
            onClick={async () => {
              setEnCours(true);
              try {
                await installer();
              } finally {
                setEnCours(false);
              }
            }}
          >
            Installer
          </button>
        )}
        <button className="secondary" type="button" onClick={plusTard}>
          Plus tard
        </button>
      </div>
    </section>
  );
}
