'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  type ParticipationMilestone,
  type ParticipationMilestoneStatus,
  type ParticipationView,
} from '@/lib/api';
import {
  centimesDepuisEuros,
  euros,
  jour,
  pointsDeBaseDepuisPourcentage,
  pourcentage,
} from '@/lib/montants';

interface ParticipationSectionProps {
  token: string | null;
  projectId: string;
  readOnly?: boolean;
}

const STATUT_PALIER: Record<ParticipationMilestoneStatus, string> = {
  prevu: 'Prévu',
  valide: 'Validé par IGNITUX',
  execute: 'Exécuté',
  abandonne: 'Abandonné',
};

/**
 * PARTICIPATION IGNITUX — trois couches, affichées séparément.
 *
 *   1. Le capital : qui détient quelle part, et comment cela a évolué.
 *   2. Le droit économique : un pourcentage des dividendes distribués, qui ne
 *      commence qu'une fois le capital entièrement transmis. Jamais présenté
 *      comme une part de capital.
 *   3. L'accès à l'écosystème : défini par l'accord, indépendant des deux
 *      autres.
 *
 * Rien n'est calculé ici : ni échéance, ni durée, ni pourcentage « normal ».
 * Les valeurs viennent de l'accord du projet, et chaque geste d'écriture est
 * revérifié par le serveur — les boutons « côté IGNITUX » ne sont qu'un
 * affichage.
 */
export function ParticipationSection({ token, projectId, readOnly = false }: ParticipationSectionProps) {
  const [view, setView] = useState<ParticipationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Création de l'accord (IGNITUX)
  const [founderName, setFounderName] = useState('');
  const [effectiveOn, setEffectiveOn] = useState('');
  const [founderPct, setFounderPct] = useState('');
  const [ignituxPct, setIgnituxPct] = useState('');
  const [rightPct, setRightPct] = useState('');
  const [offre, setOffre] = useState('');

  // Nouveau palier (IGNITUX)
  const [targetPct, setTargetPct] = useState('');
  const [milestoneLabel, setMilestoneLabel] = useState('');
  const [conditionsText, setConditionsText] = useState('');

  // Exécution et règlement : une date par ligne.
  const [executeDates, setExecuteDates] = useState<Record<string, string>>({});
  const [settleDates, setSettleDates] = useState<Record<string, string>>({});

  // Dividende distribué (porteur)
  const [dividendEuros, setDividendEuros] = useState('');
  const [dividendDate, setDividendDate] = useState('');

  async function load(activeToken: string) {
    try {
      const reponse = await api.getParticipation(activeToken, projectId);
      // Garde défensive : une réponse inattendue ne doit pas faire planter l'écran.
      setView(reponse && typeof reponse === 'object' && 'agreement' in reponse ? reponse : null);
    } catch {
      // Section secondaire : son échec ne doit pas masquer le reste du projet.
    }
  }

  useEffect(() => {
    if (!token) return;
    void load(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, projectId]);

  /** Exécute un geste d'écriture, recharge, et dit l'erreur du serveur telle quelle. */
  async function agir(action: () => Promise<unknown>, echec: string): Promise<boolean> {
    if (!token) return false;
    setError(null);
    setIsBusy(true);
    try {
      await action();
      await load(token);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : echec);
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  /** Vide → undefined (le serveur applique son défaut) ; illisible → null. */
  function lirePourcentage(saisie: string): number | undefined | null {
    if (!saisie.trim()) return undefined;
    return pointsDeBaseDepuisPourcentage(saisie);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const founder = lirePourcentage(founderPct);
    const ignitux = lirePourcentage(ignituxPct);
    const right = lirePourcentage(rightPct);
    if (founder === null || ignitux === null || right === null) {
      setError('Pourcentage illisible.');
      return;
    }
    // Seules les valeurs réellement saisies partent : l'écran ne code aucune
    // répartition, le serveur applique les siennes par défaut.
    const corps = {
      founderName: founderName.trim(),
      effectiveOn,
      ...(founder !== undefined && { founderBasisPoints: founder }),
      ...(ignitux !== undefined && { ignituxBasisPoints: ignitux }),
      ...(right !== undefined && { dividendRightBasisPoints: right }),
      ...(offre.trim() && { ecosystemOffre: offre.trim() }),
    };
    await agir(
      () => api.createParticipationAgreement(token, projectId, corps),
      "Impossible de créer l'accord.",
    );
  }

  async function handleAddMilestone(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const cible = pointsDeBaseDepuisPourcentage(targetPct);
    if (cible === null) {
      setError('Pourcentage illisible.');
      return;
    }
    const conditions = conditionsText
      .split('\n')
      .map((ligne) => ligne.trim())
      .filter((ligne) => ligne.length > 0);
    const ok = await agir(
      () =>
        api.addParticipationMilestone(token, projectId, {
          ...(milestoneLabel.trim() && { label: milestoneLabel.trim() }),
          targetIgnituxBasisPoints: cible,
          conditions,
        }),
      "Impossible d'ajouter ce palier.",
    );
    if (ok) {
      setTargetPct('');
      setMilestoneLabel('');
      setConditionsText('');
    }
  }

  async function handleRecordDividend(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const cents = centimesDepuisEuros(dividendEuros);
    if (cents === null || cents <= 0) {
      setError('Montant illisible ou nul.');
      return;
    }
    const ok = await agir(
      () =>
        api.recordParticipationDividend(token, projectId, {
          distributedCents: cents,
          occurredOn: dividendDate,
        }),
      "Impossible d'enregistrer ce dividende.",
    );
    if (ok) {
      setDividendEuros('');
      setDividendDate('');
    }
  }

  if (!view) return null;

  const isOperator = view.viewer?.isIgnituxOperator === true;

  // Sans accord : l'entrepreneur ne voit rien (le suivi manuel du capital
  // reste comme avant) ; IGNITUX peut en créer un.
  if (view.agreement === null) {
    if (!isOperator) return null;
    return (
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Participation IGNITUX</h2>
        <p className="muted">
          Ce projet n’a pas encore d’accord de participation. Les répartitions laissées vides
          prennent les valeurs par défaut du modèle actuel ; chaque accord porte ensuite les siennes.
        </p>
        {error && <p className="error">{error}</p>}
        <form onSubmit={handleCreate} style={{ display: 'grid', gap: '0.5rem', maxWidth: '28rem' }}>
          <label className="field">
            Nom du porteur
            <input aria-label="Nom du porteur" value={founderName} onChange={(e) => setFounderName(e.target.value)} required />
          </label>
          <label className="field">
            Date d’effet
            <input aria-label="Date d’effet" type="date" value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} required />
          </label>
          <label className="field">
            Part du porteur (%)
            <input aria-label="Part du porteur (%)" value={founderPct} onChange={(e) => setFounderPct(e.target.value)} placeholder="valeur par défaut" />
          </label>
          <label className="field">
            Part d’IGNITUX (%)
            <input aria-label="Part d’IGNITUX (%)" value={ignituxPct} onChange={(e) => setIgnituxPct(e.target.value)} placeholder="valeur par défaut" />
          </label>
          <label className="field">
            Droit sur les dividendes (%)
            <input aria-label="Droit sur les dividendes (%)" value={rightPct} onChange={(e) => setRightPct(e.target.value)} placeholder="valeur par défaut" />
          </label>
          <label className="field">
            Offre garantie (facultatif)
            <input aria-label="Offre garantie (facultatif)" value={offre} onChange={(e) => setOffre(e.target.value)} placeholder="valeur par défaut" />
          </label>
          <button className="secondary" type="submit" disabled={isBusy}>
            {isBusy ? 'Création…' : 'Créer l’accord'}
          </button>
        </form>
      </div>
    );
  }

  const { agreement } = view;
  const holders = Array.isArray(view.capital?.holders) ? view.capital.holders : [];
  const history = Array.isArray(view.history) ? view.history : [];
  const milestones: ParticipationMilestone[] = Array.isArray(view.milestones) ? view.milestones : [];
  const right = view.dividendRight;
  const peutEcrireIgnitux = isOperator && agreement.status !== 'clos';

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Participation IGNITUX</h2>
      {view.notice && (
        <p className="notice">
          <span>{view.notice}</span>
        </p>
      )}
      {error && <p className="error">{error}</p>}

      {/* COUCHE 1 — le capital. */}
      <section>
        <h3 style={{ marginBottom: '0.5rem' }}>Capital</h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {holders.map((holder) => (
            <li key={holder.holderId}>
              {`${holder.name} — ${holder.shareBasisPoints === null ? 'part non renseignée' : pourcentage(holder.shareBasisPoints)}`}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 style={{ marginBottom: '0.5rem' }}>Historique du capital</h3>
        {history.length === 0 ? (
          <p className="muted">Aucun changement enregistré.</p>
        ) : (
          <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
            {history.map((event, index) => (
              <li key={index}>
                {`${jour(event.occurredAt)} — ${event.holderName} : ${pourcentage(event.shareBasisPoints)} (${event.reason})`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 style={{ marginBottom: '0.5rem' }}>Paliers de transmission</h3>
        {milestones.length === 0 ? (
          <p className="muted">Aucun palier prévu pour le moment.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.75rem' }}>
            {milestones.map((m) => (
              <li key={m.id}>
                <strong>{`Palier ${m.position}${m.label ? ` — ${m.label}` : ''}`}</strong>
                <span className="muted">{` · ${STATUT_PALIER[m.status] ?? m.status}`}</span>
                <div>{`Part d’IGNITUX visée : ${pourcentage(m.target_ignitux_bps)}`}</div>
                {m.conditions.length > 0 ? (
                  <ul style={{ paddingLeft: '1.25rem', margin: '0.25rem 0' }}>
                    {m.conditions.map((condition, i) => (
                      <li key={i}>{condition}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted" style={{ margin: '0.25rem 0' }}>
                    Conditions à définir par IGNITUX.
                  </p>
                )}
                {m.status === 'execute' && m.effective_on && (
                  <div className="muted">{`Effectif le ${jour(m.effective_on)}`}</div>
                )}

                {/* Le porteur prend connaissance ; cela ne valide rien. */}
                {!readOnly && (m.status === 'prevu' || m.status === 'valide') && !m.founder_acknowledged_at && (
                  <button
                    className="secondary"
                    disabled={isBusy}
                    onClick={() =>
                      token &&
                      void agir(() => api.acknowledgeParticipationMilestone(token, m.id), 'Impossible de mettre à jour.')
                    }
                  >
                    Prendre connaissance
                  </button>
                )}
                {m.founder_acknowledged_at && (
                  <div className="muted">{`Porteur informé le ${jour(m.founder_acknowledged_at)}`}</div>
                )}

                {peutEcrireIgnitux && m.status === 'prevu' && m.conditions.length > 0 && (
                  <button
                    className="secondary"
                    disabled={isBusy}
                    onClick={() =>
                      token && void agir(() => api.validateParticipationMilestone(token, m.id), 'Impossible de valider.')
                    }
                  >
                    Valider ce palier
                  </button>
                )}
                {peutEcrireIgnitux && m.status === 'valide' && (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'end' }}>
                    <label className="field" style={{ marginBottom: 0 }}>
                      Date effective
                      <input aria-label="Date effective"
                        type="date"
                        value={executeDates[m.id] ?? ''}
                        onChange={(e) => setExecuteDates({ ...executeDates, [m.id]: e.target.value })}
                      />
                    </label>
                    <button
                      className="secondary"
                      disabled={isBusy || !executeDates[m.id]}
                      onClick={() =>
                        token &&
                        void agir(
                          () => api.executeParticipationMilestone(token, m.id, executeDates[m.id]),
                          "Impossible d'exécuter ce palier.",
                        )
                      }
                    >
                      Exécuter ce palier
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {peutEcrireIgnitux && (
          <form
            onSubmit={handleAddMilestone}
            style={{ display: 'grid', gap: '0.5rem', maxWidth: '28rem', marginTop: '0.75rem' }}
          >
            <label className="field">
              Intitulé (facultatif)
              <input aria-label="Intitulé (facultatif)" value={milestoneLabel} onChange={(e) => setMilestoneLabel(e.target.value)} />
            </label>
            <label className="field">
              Part d’IGNITUX visée (%)
              <input aria-label="Part d’IGNITUX visée (%)" value={targetPct} onChange={(e) => setTargetPct(e.target.value)} />
            </label>
            <label className="field">
              Conditions (une par ligne)
              <textarea aria-label="Conditions (une par ligne)" value={conditionsText} onChange={(e) => setConditionsText(e.target.value)} rows={3} />
            </label>
            <button className="secondary" type="submit" disabled={isBusy}>
              Ajouter un palier
            </button>
          </form>
        )}
      </section>

      {/* COUCHE 2 — le droit économique, séparé du capital. */}
      <section>
        <h3 style={{ marginBottom: '0.5rem' }}>Droit économique d’IGNITUX sur les dividendes</h3>
        {right?.active ? (
          <>
            <p style={{ marginTop: 0 }}>
              {`IGNITUX conserve ${pourcentage(right.rightBasisPoints)} des dividendes effectivement distribués. `}
              Ce n’est pas une part de capital : sans dividende distribué, rien n’est dû.
            </p>

            {right.entries.length > 0 && (
              <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
                {right.entries.map((entry) => (
                  <li key={entry.id}>
                    {`${jour(entry.occurred_on)} — distribué ${euros(entry.distributed_cents)}, dû ${euros(entry.due_cents)} (${entry.status === 'regle' ? `réglé le ${jour(entry.settled_on)}` : 'à régler'})`}
                    {peutEcrireIgnitux && entry.status === 'du' && (
                      <span style={{ display: 'inline-flex', gap: '0.5rem', marginLeft: '0.5rem', alignItems: 'end' }}>
                        <label className="field" style={{ marginBottom: 0 }}>
                          Date de règlement
                          <input aria-label="Date de règlement"
                            type="date"
                            value={settleDates[entry.id] ?? ''}
                            onChange={(e) => setSettleDates({ ...settleDates, [entry.id]: e.target.value })}
                          />
                        </label>
                        <button
                          className="secondary"
                          disabled={isBusy || !settleDates[entry.id]}
                          onClick={() =>
                            token &&
                            void agir(
                              () => api.settleParticipationDividendRight(token, entry.id, settleDates[entry.id]),
                              'Impossible de marquer cette ligne comme réglée.',
                            )
                          }
                        >
                          Marquer comme réglé
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="muted">
              {`Total dû : ${euros(right.totalDueCents)} · réglé : ${euros(right.totalSettledCents)}. `}
              Ignitux enregistre ce qui est dû, il n’émet aucun virement.
            </p>

            {!readOnly && (
              <form
                onSubmit={handleRecordDividend}
                style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'end' }}
              >
                <label className="field" style={{ marginBottom: 0 }}>
                  Dividende distribué (€)
                  <input aria-label="Dividende distribué (€)" value={dividendEuros} onChange={(e) => setDividendEuros(e.target.value)} />
                </label>
                <label className="field" style={{ marginBottom: 0 }}>
                  Date de distribution
                  <input aria-label="Date de distribution" type="date" value={dividendDate} onChange={(e) => setDividendDate(e.target.value)} required />
                </label>
                <button className="secondary" type="submit" disabled={isBusy}>
                  Constater un dividende distribué
                </button>
              </form>
            )}
          </>
        ) : (
          <p className="muted" style={{ marginTop: 0 }}>
            Ce droit ne commence qu’une fois le capital entièrement transmis (IGNITUX à 0 %). Avant, IGNITUX
            reçoit uniquement ce qui correspond à sa part de capital, sans droit supplémentaire.
          </p>
        )}
      </section>

      {/* COUCHE 3 — l'accès à l'écosystème, défini par l'accord. */}
      <section>
        <h3 style={{ marginBottom: '0.5rem' }}>Accès à l’écosystème IGNITUX</h3>
        {view.ecosystem && (
          <p style={{ marginTop: 0 }}>
            {`Offre garantie par l’accord : ${view.ecosystem.label}${view.ecosystem.active ? '' : ' (accord clos)'}. `}
            Cet accès est indépendant de ta part de capital : il continue après la transmission, selon les
            conditions de l’accord.
          </p>
        )}
      </section>
    </div>
  );
}
