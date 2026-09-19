'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  type BuybackProgress,
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

/**
 * LE RACHAT PROGRESSIF — les trois conditions du modèle économique.
 *
 * Ignitux n'évalue rien ici. Le modèle nomme « rentabilité », « autonomie »
 * et « stabilité » sans les chiffrer : c'est le porteur qui écrit ce que
 * chacune veut dire pour son projet, et lui qui déclare qu'elle est
 * atteinte. L'écran conserve, date et compte — rien de plus.
 *
 * Ce que ça change : une condition écrite noir sur blanc avant d'être
 * atteinte est beaucoup plus difficile à réinterpréter après coup, par le
 * porteur comme par Ignitux.
 */
export function BuybackSection({ token, projectId, readOnly = false }: FinancingSectionProps) {
  const [progress, setProgress] = useState<BuybackProgress | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function load(activeToken: string) {
    try {
      setProgress(await api.getBuybackProgress(activeToken, projectId));
    } catch {
      // Section secondaire : son échec ne doit pas masquer le financement.
    }
  }

  useEffect(() => {
    if (!token) return;
    void load(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, projectId]);

  async function saveDefinition(kind: string) {
    if (!token) return;
    setError(null);
    setIsBusy(true);
    try {
      await api.setBuybackObjective(token, projectId, kind, draft);
      setEditing(null);
      setDraft('');
      await load(token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'enregistrer la condition.");
    } finally {
      setIsBusy(false);
    }
  }

  async function toggleReached(kind: string, reached: boolean) {
    if (!token) return;
    setError(null);
    setIsBusy(true);
    try {
      await api.declareBuybackObjective(
        token,
        projectId,
        kind,
        reached ? new Date().toISOString() : null,
      );
      await load(token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de mettre à jour.');
    } finally {
      setIsBusy(false);
    }
  }

  // Le mock de test — et un serveur inattendu — peuvent renvoyer autre chose
  // qu'un objet de progression. On n'affiche que ce qui est exploitable,
  // plutôt que de planter sur .map d'un champ absent.
  if (!progress || !Array.isArray(progress.conditions)) return null;

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Rachat progressif des parts</h2>

      <p className="notice">
        <span>{progress.notice}</span>
      </p>

      <p className="muted">
        {progress.reachedCount} condition(s) sur {progress.totalCount} déclarée(s) atteinte(s)
        {progress.definedCount < progress.totalCount &&
          ` — ${progress.totalCount - progress.definedCount} reste(nt) à définir`}
        .
      </p>

      {/* On n'annonce « conditions réunies » que si les trois sont écrites
          ET déclarées atteintes. Sur une définition manquante le serveur
          renvoie null, et se prononcer serait une affirmation infondée. */}
      {progress.allReached === true && (
        <p className="notice">
          <span>
            <strong>Les trois conditions que tu as fixées sont atteintes.</strong> Le modèle
            prévoit qu&apos;à ce stade tu peux racheter progressivement les parts d&apos;Ignitux.
            Le prix, lui, reste à négocier : Ignitux ne le calcule pas.
          </span>
        </p>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {progress.conditions.map((condition) => (
          <li
            key={condition.kind}
            style={{ borderTop: '1px solid var(--border)', padding: '0.85rem 0' }}
          >
            <div className="top-bar" style={{ marginBottom: '0.35rem' }}>
              <strong>{condition.label}</strong>
              {condition.reachedAt ? (
                <span className="pill pill--fire">
                  Atteinte le {new Date(condition.reachedAt).toLocaleDateString('fr-FR')}
                </span>
              ) : (
                <span className="pill">{condition.definition ? 'Non atteinte' : 'À définir'}</span>
              )}
            </div>

            {condition.definition ? (
              <p className="muted" style={{ margin: 0 }}>
                {condition.definition}
              </p>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Tu n&apos;as pas encore écrit ce que « {condition.label.toLowerCase()} » veut dire
                pour ce projet. Ignitux ne le devinera pas à ta place.
              </p>
            )}

            {!readOnly && editing === condition.kind && (
              <div className="field" style={{ marginTop: '0.6rem', marginBottom: 0 }}>
                <label htmlFor={`def-${condition.kind}`}>
                  Ce que « {condition.label.toLowerCase()} » veut dire ici
                </label>
                <textarea
                  id={`def-${condition.kind}`}
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                  <button
                    className="secondary"
                    type="button"
                    disabled={isBusy}
                    onClick={() => void saveDefinition(condition.kind)}
                  >
                    Enregistrer
                  </button>
                  <button className="secondary" type="button" onClick={() => setEditing(null)}>
                    Annuler
                  </button>
                </div>
                {condition.definition && (
                  <p className="muted" style={{ marginTop: '0.4rem', marginBottom: 0 }}>
                    Réécrire cette condition la remettra à « non atteinte » : une déclaration ne
                    peut pas survivre au changement de ce qu&apos;elle déclarait.
                  </p>
                )}
              </div>
            )}

            {!readOnly && editing !== condition.kind && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    setEditing(condition.kind);
                    setDraft(condition.definition ?? '');
                  }}
                >
                  {condition.definition ? 'Réécrire' : 'Définir'}
                </button>
                {condition.definition && (
                  <button
                    className="secondary"
                    type="button"
                    disabled={isBusy}
                    onClick={() => void toggleReached(condition.kind, !condition.reachedAt)}
                  >
                    {condition.reachedAt
                      ? 'Revenir sur ma déclaration'
                      : 'Je déclare cette condition atteinte'}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <p className="error" style={{ marginTop: '1rem', marginBottom: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}
