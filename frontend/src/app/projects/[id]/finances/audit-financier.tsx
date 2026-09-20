'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, type FinanceAudit, type FinanceAuditFinding } from '@/lib/api';

/**
 * LES CONTRÔLES DE COHÉRENCE, ENFIN VISIBLES.
 *
 * Le moteur d'audit existait, testé, avec une route — et aucun écran pour
 * l'appeler. Personne ne pouvait donc savoir si les chiffres de cette page
 * tenaient debout entre eux.
 *
 * ## Pourquoi les contrôles à zéro s'affichent aussi
 *
 * Un audit qui ne montre que ses trouvailles ne dit pas ce qu'il a
 * regardé : « rien à signaler » et « ce contrôle n'existe pas » y ont
 * exactement la même apparence, et seule la première mérite la confiance
 * qu'on accorde à une page verte. Le serveur renvoie donc chaque contrôle
 * avec son compte, y compris zéro, et l'écran les rend tous.
 *
 * C'est aussi pour cela qu'on n'affiche pas de « tout va bien » tout seul :
 * la liste des contrôles passés EST le message.
 */
function Controle({ finding }: { finding: FinanceAuditFinding }) {
  const probleme = finding.count > 0;

  return (
    <li
      className="project-item"
      style={{
        cursor: 'default',
        marginBottom: '0.5rem',
        borderLeft: probleme ? '3px solid var(--warn, #b45309)' : '3px solid var(--ok, #15803d)',
      }}
    >
      <div className="top-bar" style={{ gap: '1rem', alignItems: 'flex-start' }}>
        <span style={{ fontWeight: probleme ? 600 : 400 }}>{finding.label}</span>
        <span
          className="muted"
          style={{
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
            color: probleme ? 'var(--warn, #b45309)' : undefined,
          }}
        >
          {probleme ? `${finding.count} à regarder` : 'rien à signaler'}
        </span>
      </div>
      {/* Le « pourquoi » n'apparaît que sur un défaut : le lire douze fois
          sur une page sans problème noierait la seule ligne qui compte. */}
      {probleme && (
        <>
          <p className="muted" style={{ margin: '0.35rem 0 0' }}>
            {finding.why}
          </p>
          {finding.sample.length > 0 && (
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem' }}>
              Exemples : {finding.sample.join(', ')}
              {finding.count > finding.sample.length
                ? ` (et ${finding.count - finding.sample.length} autre(s))`
                : ''}
            </p>
          )}
        </>
      )}
    </li>
  );
}

export function AuditFinancier({ token, projectId }: { token: string; projectId: string }) {
  const [audit, setAudit] = useState<FinanceAudit | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    setIsLoading(true);
    api
      .getProjectFinanceAudit(token, projectId)
      .then((resultat) => {
        // Une réponse qui n'a pas la forme attendue ne doit pas emporter
        // l'écran : cette section est la dernière d'une page qui montre
        // l'argent reçu et versé, et la faire tomber ferait disparaître
        // tout le reste avec elle.
        if (annule) return;
        setAudit(Array.isArray(resultat?.findings) ? resultat : null);
      })
      .catch((err) => {
        if (!annule) {
          setError(err instanceof ApiError ? err.message : 'Impossible de lancer les contrôles.');
        }
      })
      .finally(() => {
        if (!annule) setIsLoading(false);
      });
    return () => {
      annule = true;
    };
  }, [token, projectId]);

  const defauts = audit?.findings.filter((f) => f.count > 0) ?? [];

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Contrôles de cohérence</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Ces contrôles relisent ce qui est réellement enregistré, pas ce que les formulaires ont
        accepté. Une reprise de données, un script lancé à la main ou une version antérieure du
        code ne passent par aucun contrôle de saisie — ceux-ci les voient quand même.
      </p>

      {error && <p className="error">{error}</p>}
      {isLoading && <p className="loading">Contrôles en cours…</p>}

      {audit && (
        <>
          <p style={{ marginBottom: '0.75rem' }}>
            {audit.clean ? (
              <>
                <strong>{audit.findings.length} contrôles passés, aucun écart.</strong> Ce
                n&apos;est pas une certification comptable : ces contrôles vérifient la
                cohérence interne des données, pas la justesse des montants saisis.
              </>
            ) : (
              <>
                <strong>
                  {defauts.length} contrôle{defauts.length > 1 ? 's' : ''} sur{' '}
                  {audit.findings.length} {defauts.length > 1 ? 'signalent' : 'signale'} un
                  écart.
                </strong>{' '}
                Rien n&apos;a été corrigé automatiquement : une écriture financière se rectifie
                par une écriture, jamais en silence.
              </>
            )}
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {audit.findings.map((finding) => (
              <Controle key={finding.code} finding={finding} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
