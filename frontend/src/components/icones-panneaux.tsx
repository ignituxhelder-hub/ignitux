'use client';

import { useState, type ReactNode } from 'react';
import { Icone } from '@/components/icones';

export interface PanneauIcone {
  id: string;
  nom: string;
  /** L'id du dessin dans components/icones.tsx. */
  glyphe: string;
  /** Famille de couleur (voir .icone__glyphe[data-categorie] dans globals.css). */
  categorie: string;
  contenu: ReactNode;
}

/**
 * UNE RANGÉE D'ICÔNES, UN SEUL PANNEAU OUVERT.
 *
 * Plutôt que d'empiler des cartes qu'il faut faire défiler, chaque partie de
 * la page a son icône ; on ouvre celle qu'on veut lire. Recliquer sur
 * l'icône ouverte referme le panneau.
 */
export function IconesPanneaux({
  titre,
  panneaux,
  ouvertParDefaut = null,
}: {
  titre: string;
  panneaux: readonly PanneauIcone[];
  ouvertParDefaut?: string | null;
}) {
  const [ouvert, setOuvert] = useState<string | null>(ouvertParDefaut);
  const courant = panneaux.find((p) => p.id === ouvert) ?? null;

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <ul className="accueil-page" aria-label={titre}>
        {panneaux.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="icone"
              aria-expanded={ouvert === p.id}
              onClick={() => setOuvert(ouvert === p.id ? null : p.id)}
            >
              <span className="icone__glyphe" data-categorie={p.categorie} aria-hidden="true">
                <Icone id={p.glyphe} />
              </span>
              <span className="icone__nom">{p.nom}</span>
            </button>
          </li>
        ))}
      </ul>
      {courant && <div>{courant.contenu}</div>}
    </div>
  );
}
