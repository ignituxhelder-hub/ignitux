'use client';

import type { LegalFormRecommendation } from '@/lib/api';

/**
 * LA RECOMMANDATION, AVEC SES HYPOTHÈSES ÉCRITES NOIR SUR BLANC.
 *
 * IGINI ne bloque jamais faute d'information : il suppose, et le dit. Cet
 * écran doit donc montrer les hypothèses aussi clairement que la
 * recommandation elle-même — les cacher reviendrait à transformer une
 * hypothèse déclarée en fait tacite, exactement ce que le générateur a été
 * conçu pour éviter.
 */
export function FormeJuridiqueResultat({ recommandation }: { recommandation: LegalFormRecommendation }) {
  return (
    <div className="project-item" style={{ cursor: 'default' }}>
      <div className="top-bar" style={{ marginBottom: '0.5rem' }}>
        <strong>Forme recommandée : {recommandation.recommended_form}</strong>
        <span className="muted">{new Date(recommandation.created_at).toLocaleString('fr-FR')}</span>
      </div>
      <p>{recommandation.rationale}</p>

      {recommandation.assumptions.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <strong>Ce qu&apos;IGINI a supposé, faute d&apos;information</strong>
          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
            {recommandation.assumptions.map((a, index) => (
              <li key={index} style={{ marginBottom: '0.35rem' }}>
                <strong>{a.subject}</strong> : {a.assumption}
                <br />
                <span className="muted">Pas ton cas ? {a.how_to_correct}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recommandation.alternatives.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <strong>Alternatives envisagées</strong>
          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
            {recommandation.alternatives.map((alt, index) => (
              <li key={index} style={{ marginBottom: '0.35rem' }}>
                <strong>{alt.form}</strong> : {alt.why_not_chosen}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recommandation.points_to_check.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <strong>À vérifier avant de trancher</strong>
          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
            {recommandation.points_to_check.map((point, index) => (
              <li key={index}>{point}</li>
            ))}
          </ul>
        </div>
      )}

      {recommandation.sources.length > 0 ? (
        <div style={{ marginTop: '0.75rem' }}>
          <strong>Sources consultées</strong>
          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
            {recommandation.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
          Aucune recherche en ligne n&apos;a été nécessaire pour cette recommandation.
        </p>
      )}

      <p className="muted" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
        IGINI recommande, il ne décide pas — dans les cas ambigus, vérifie auprès d&apos;un comptable ou d&apos;un
        avocat avant de trancher.
      </p>
    </div>
  );
}
