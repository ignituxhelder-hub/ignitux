'use client';

import { useState } from 'react';

interface ResultatIaProps {
  kind: 'livrable' | 'instructions';
  contenu: string;
  /** Libellé du bouton d'acceptation : « Valider », « J'ai fait », « J'ai déposé »… */
  libelleValider: string;
  onValider: () => void;
  onRefuser: (motif?: string) => void;
  disabled?: boolean;
}

/**
 * Résultat produit par IGINI, à relire avant de l'accepter. Partagé entre les
 * tâches et la conformité : rien n'est pris en compte tant que l'humain n'a pas
 * validé ou refusé.
 */
export function ResultatIa({ kind, contenu, libelleValider, onValider, onRefuser, disabled }: ResultatIaProps) {
  const [refus, setRefus] = useState(false);
  const [motif, setMotif] = useState('');

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <p className="muted" style={{ margin: '0 0 0.25rem' }}>
        {kind === 'instructions' ? 'Instructions à suivre' : 'Livrable proposé par IGINI'}
      </p>
      <div style={{ whiteSpace: 'pre-wrap' }}>{contenu}</div>
      {refus ? (
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <input
            aria-label="Motif du refus (facultatif)"
            placeholder="Motif (facultatif)"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            className="secondary"
            type="button"
            disabled={disabled}
            onClick={() => onRefuser(motif.trim() || undefined)}
          >
            Confirmer le refus
          </button>
          <button className="secondary" type="button" onClick={() => setRefus(false)}>
            Annuler
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
          <button type="button" disabled={disabled} onClick={onValider}>
            {libelleValider}
          </button>
          <button className="secondary" type="button" disabled={disabled} onClick={() => setRefus(true)}>
            Refuser
          </button>
        </div>
      )}
    </div>
  );
}
