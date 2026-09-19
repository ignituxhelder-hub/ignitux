'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  type CapTable,
  type DividendDistribution,
  type FinancingRound,
  type FinancingSource,
} from '@/lib/api';

interface FinancingSectionProps {
  token: string | null;
  projectId: string;
  readOnly?: boolean;
}

const SOURCE_LABELS: Record<FinancingSource, string> = {
  ignitux: 'Ignitux',
  porteur: 'Apport personnel',
  pret: 'Prêt',
  subvention: 'Subvention',
  autre: 'Autre',
};

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)},${String(absolute % 100).padStart(2, '0')} €`;
}

/** 7000 points de base → « 70 % ». Entier partout, jamais de flottant intermédiaire. */
function formatBasisPoints(basisPoints: number): string {
  const whole = Math.floor(basisPoints / 100);
  const decimals = basisPoints % 100;
  return decimals === 0 ? `${whole} %` : `${whole},${String(decimals).padStart(2, '0')} %`;
}

/**
 * FINANCEMENT — suivi des apports reçus, de la répartition des parts et
 * des dividendes réellement versés.
 *
 * Cette section n'affiche aucun chiffre qui n'ait été saisi par un humain :
 * pas de valorisation, pas de dividende prévisionnel, pas de part « cible ».
 * Le modèle économique chiffré d'Ignitux n'existe pas à ce jour, et le
 * fabriquer ici engagerait le projet de l'utilisateur sur des montants
 * inventés.
 */
export function FinancingSection({ token, projectId, readOnly = false }: FinancingSectionProps) {
  const [rounds, setRounds] = useState<FinancingRound[]>([]);
  const [totalCents, setTotalCents] = useState(0);
  const [capTable, setCapTable] = useState<CapTable | null>(null);
  const [dividends, setDividends] = useState<DividendDistribution[]>([]);
  const [dividendTotalCents, setDividendTotalCents] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [source, setSource] = useState<FinancingSource>('ignitux');
  const [amountEuros, setAmountEuros] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  function load() {
    if (!token) return;
    setIsLoading(true);
    Promise.all([
      api.listFinancingRounds(token, projectId),
      api.getCapTable(token, projectId),
      api.listDividends(token, projectId),
    ])
      .then(([roundList, table, dividendList]) => {
        // Gardes défensives : une réponse tronquée (proxy, cache d'un
        // client plus ancien) ne doit pas faire disparaître la section
        // entière. Le piège s'est déjà produit une fois sur Compliance.
        setRounds(Array.isArray(roundList?.rounds) ? roundList.rounds : []);
        setTotalCents(roundList?.totalCents ?? 0);
        setCapTable(Array.isArray(table?.holders) ? table : null);
        setDividends(Array.isArray(dividendList?.dividends) ? dividendList.dividends : []);
        setDividendTotalCents(dividendList?.totalCents ?? 0);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, projectId]);

  async function handleRecordRound(e: FormEvent) {
    e.preventDefault();
    if (!token || !amountEuros.trim() || !occurredAt) return;
    setError(null);
    setIsSaving(true);
    try {
      const amountCents = Math.round(Number(amountEuros.replace(',', '.')) * 100);
      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        setError('Montant illisible ou nul.');
        return;
      }
      await api.recordFinancingRound(token, projectId, {
        source,
        amountCents,
        occurredAt: new Date(occurredAt).toISOString(),
      });
      setAmountEuros('');
      setOccurredAt('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'enregistrer cet apport.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Financement</h2>
      {capTable && (
        <p className="muted" style={{ marginTop: 0 }}>
          {capTable.notice}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {isLoading && <p className="loading">Chargement…</p>}

      <h3 style={{ marginBottom: '0.5rem' }}>Apports reçus</h3>
      {rounds.length === 0 ? (
        <p className="muted">Aucun financement enregistré.</p>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Total reçu : <strong>{formatCents(totalCents)}</strong>
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rounds.map((round) => (
              <li key={round.id} style={{ marginBottom: '0.25rem' }}>
                <span className="muted">
                  {new Date(round.occurred_at).toLocaleDateString('fr-FR')} —{' '}
                  {SOURCE_LABELS[round.source]}
                </span>{' '}
                {formatCents(round.amount_cents)}
              </li>
            ))}
          </ul>
        </>
      )}

      {!readOnly && (
        <form
          onSubmit={handleRecordRound}
          style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}
        >
          <select
            aria-label="Source du financement"
            value={source}
            onChange={(e) => setSource(e.target.value as FinancingSource)}
          >
            {(Object.keys(SOURCE_LABELS) as FinancingSource[]).map((value) => (
              <option key={value} value={value}>
                {SOURCE_LABELS[value]}
              </option>
            ))}
          </select>
          <input
            aria-label="Montant reçu en euros"
            placeholder="Montant (€)"
            value={amountEuros}
            onChange={(e) => setAmountEuros(e.target.value)}
          />
          <input
            aria-label="Date de l'apport"
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
          <button className="secondary" type="submit" disabled={isSaving}>
            {isSaving ? 'Enregistrement…' : 'Enregistrer cet apport'}
          </button>
        </form>
      )}

      <h3 style={{ marginBottom: '0.5rem' }}>Répartition des parts</h3>
      {!capTable || capTable.holders.length === 0 ? (
        <p className="muted">Aucun détenteur enregistré.</p>
      ) : (
        <>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {capTable.holders.map((holder) => (
              <li key={holder.holderId} style={{ marginBottom: '0.25rem' }}>
                <strong>{holder.name}</strong>
                {holder.isFounder && <span className="muted"> (porteur)</span>} —{' '}
                {holder.shareBasisPoints === null ? (
                  <span className="muted">part non renseignée</span>
                ) : (
                  formatBasisPoints(holder.shareBasisPoints)
                )}
              </li>
            ))}
          </ul>

          {capTable.discrepancyBasisPoints !== 0 && (
            <p className="error" style={{ marginBottom: 0 }}>
              La répartition saisie totalise {formatBasisPoints(capTable.totalBasisPoints)} au lieu
              de 100 %. Ignitux ne répartit pas l&apos;écart tout seul : ce serait décider à la
              place des personnes concernées.
            </p>
          )}

          <p className="muted" style={{ marginBottom: 0 }}>
            {capTable.founderHasMajority === null
              ? "Majorité du porteur : impossible à établir tant que la répartition ne totalise pas 100 %."
              : capTable.founderHasMajority
                ? 'Le porteur détient la majorité des parts.'
                : "Le porteur ne détient pas la majorité des parts."}
          </p>

          {capTable.founderTrajectory.length > 1 && (
            <p className="muted" style={{ marginBottom: 0 }}>
              Évolution de la part du porteur :{' '}
              {capTable.founderTrajectory
                .map(
                  (point) =>
                    `${new Date(point.occurredAt).toLocaleDateString('fr-FR')} : ${formatBasisPoints(point.shareBasisPoints)}`,
                )
                .join(' → ')}
            </p>
          )}
        </>
      )}

      <h3 style={{ marginBottom: '0.5rem' }}>Dividendes versés</h3>
      {dividends.length === 0 ? (
        <p className="muted" style={{ marginBottom: 0 }}>
          Aucun dividende versé. Ignitux n&apos;affiche pas de dividende prévisionnel : un
          dividende se constate après coup, le prédire reviendrait à promettre un revenu.
        </p>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Total versé : <strong>{formatCents(dividendTotalCents)}</strong>
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {dividends.map((dividend) => (
              <li key={dividend.id} style={{ marginBottom: '0.25rem' }}>
                <span className="muted">
                  {new Date(dividend.occurred_at).toLocaleDateString('fr-FR')} —{' '}
                  {dividend.holder?.name ?? 'Détenteur'}
                </span>{' '}
                {formatCents(dividend.amount_cents)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
