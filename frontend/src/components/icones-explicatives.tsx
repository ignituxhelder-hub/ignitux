'use client';

import { useState } from 'react';
import { Icone } from '@/components/icones';

export interface IconeExplicative {
  id: string;
  nom: string;
  /** L'id du dessin dans components/icones.tsx. */
  glyphe: string;
  /** Famille de couleur (voir .icone__glyphe[data-categorie] dans globals.css). */
  categorie: string;
  /** Le texte qui ne s'affiche qu'au clic. */
  texte: string;
}

/**
 * DES ICÔNES AU LIEU D'UN MUR DE TEXTE.
 *
 * Chaque icône porte un nom court ; le paragraphe qui l'explique n'apparaît
 * qu'au clic, dans une seule bulle partagée. On peut tout parcourir sans
 * faire défiler une page de texte, et lire seulement ce qui nous intéresse.
 * Recliquer sur l'icône ouverte referme la bulle.
 */
export function IconesExplicatives({
  titre,
  icones,
}: {
  titre: string;
  icones: readonly IconeExplicative[];
}) {
  const [ouverte, setOuverte] = useState<string | null>(null);
  const courante = icones.find((i) => i.id === ouverte) ?? null;

  return (
    <div>
      <ul className="accueil-page" aria-label={titre}>
        {icones.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              className="icone"
              aria-expanded={ouverte === i.id}
              onClick={() => setOuverte(ouverte === i.id ? null : i.id)}
            >
              <span className="icone__glyphe" data-categorie={i.categorie} aria-hidden="true">
                <Icone id={i.glyphe} />
              </span>
              <span className="icone__nom">{i.nom}</span>
            </button>
          </li>
        ))}
      </ul>
      {courante && (
        <div className="card" role="status">
          <p style={{ margin: 0 }}>
            <strong>{courante.nom}</strong> — {courante.texte}
          </p>
        </div>
      )}
    </div>
  );
}
