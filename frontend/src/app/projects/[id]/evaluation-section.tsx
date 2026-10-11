'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  VERDICT_EVALUATION_LABEL,
  type EvaluationVue,
  type RapportEvaluation,
} from '@/lib/api';

interface EvaluationSectionProps {
  token: string | null;
  projectId: string;
  readOnly?: boolean;
}

/** Tant qu'une évaluation se prépare, on relit son état à ce rythme. */
const INTERVALLE_SONDAGE_MS = 5000;

const GRAVITE: Record<RapportEvaluation['risques'][number]['gravite'], string> = {
  faible: 'Gravité faible',
  moyenne: 'Gravité moyenne',
  forte: 'Gravité forte',
};

function date(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
}

/**
 * ÉVALUATION DE FINANCEMENT — IGINI rédige, Ignitux relit, le porteur reçoit.
 *
 * Tant que l'évaluation n'est pas validée par Ignitux, le serveur n'en renvoie
 * pas le contenu : cette section n'affiche donc que l'état. Une fois validée,
 * le rapport s'affiche ici et le dossier se télécharge en PDF.
 */
export function EvaluationSection({ token, projectId, readOnly = false }: EvaluationSectionProps) {
  const [evaluations, setEvaluations] = useState<EvaluationVue[] | null>(null);
  const [incluse, setIncluse] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  /** Relit les évaluations ; c'est aussi ce que fait le sondage. */
  const charger = useCallback(async () => {
    if (!token) return;
    try {
      const liste = await api.getEvaluations(token, projectId);
      setEvaluations(Array.isArray(liste) ? liste : []);
      // Une lecture réussie efface l'erreur d'une lecture précédente.
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger l’évaluation de financement.');
    }
  }, [token, projectId]);

  useEffect(() => {
    if (!token) return;
    void charger();
    // Un membre ne demande pas : l'offre du propriétaire ne le concerne pas.
    if (readOnly) return;
    // L'offre ne change pas pendant qu'on regarde : lue une fois, pas à chaque sondage.
    api
      .getOffres(token)
      .then((offres) => {
        // Garde défensive : une réponse inattendue ne doit pas faire planter la fiche projet.
        const actuelle = Array.isArray(offres?.offres) ? offres.offres.find((o) => o.actuelle) : undefined;
        setIncluse(Boolean(actuelle?.capacites?.evaluationFinancement));
      })
      .catch(() => setIncluse(false));
  }, [charger, readOnly, token]);

  const enPreparation = evaluations?.[0]?.status === 'en_preparation';
  useEffect(() => {
    if (!enPreparation) return;
    const minuteur = setInterval(() => void charger(), INTERVALLE_SONDAGE_MS);
    return () => clearInterval(minuteur);
  }, [enPreparation, charger]);

  async function demander() {
    if (!token) return;
    setIsBusy(true);
    setError(null);
    try {
      const nouvelle = await api.demanderEvaluation(token, projectId);
      setEvaluations((avant) => [nouvelle, ...(avant ?? [])]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La demande n’a pas pu être envoyée.');
    } finally {
      setIsBusy(false);
    }
  }

  async function telecharger(evaluationId: string) {
    if (!token) return;
    setError(null);
    try {
      const blob = await api.telechargerEvaluationPdf(token, projectId, evaluationId);
      const url = URL.createObjectURL(blob);
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = 'dossier-de-financement.pdf';
      lien.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de télécharger le dossier.');
    }
  }

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Évaluation de financement</h2>
      <p className="muted">
        IGINI évalue si ton projet peut obtenir un financement ; Ignitux relit le rapport avant de te
        l’envoyer. Tu reçois un verdict, ce qu’il faut corriger, et un dossier PDF que tu envoies
        toi-même à une banque ou à des investisseurs.
      </p>

      {readOnly ? (
        <LectureSeule evaluations={evaluations} onTelecharger={telecharger} />
      ) : (
        <Contenu
          evaluations={evaluations}
          incluse={incluse}
          isBusy={isBusy}
          onDemander={demander}
          onTelecharger={telecharger}
        />
      )}

      {error && <p className="error">{error}</p>}
    </section>
  );
}

/** Ce qu'un membre (associé, comptable, observateur) voit : les évaluations validées. */
function LectureSeule({
  evaluations,
  onTelecharger,
}: {
  evaluations: EvaluationVue[] | null;
  onTelecharger: (id: string) => void;
}) {
  if (evaluations === null) return <p className="loading">Chargement…</p>;
  const validees = evaluations.filter((e) => e.status === 'validee' && e.rapport);
  const [derniere, ...anciennes] = validees;
  if (!derniere?.rapport) {
    return <p className="muted">Aucune évaluation validée pour l’instant. Le propriétaire la demande.</p>;
  }
  return (
    <>
      <Rapport evaluation={derniere} rapport={derniere.rapport} />
      <button className="primary" type="button" onClick={() => onTelecharger(derniere.id)} style={{ marginTop: '1rem' }}>
        Télécharger le dossier (PDF)
      </button>
      {anciennes.length > 0 && (
        <details style={{ marginTop: '1rem' }}>
          <summary>Évaluations validées précédentes ({anciennes.length})</summary>
          <ul>
            {anciennes.map((a) => (
              <li key={a.id}>
                {date(a.createdAt)} — {a.verdict ? VERDICT_EVALUATION_LABEL[a.verdict] : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Contenu({
  evaluations,
  incluse,
  isBusy,
  onDemander,
  onTelecharger,
}: {
  evaluations: EvaluationVue[] | null;
  incluse: boolean | null;
  isBusy: boolean;
  onDemander: () => void;
  onTelecharger: (id: string) => void;
}) {
  if (evaluations === null || incluse === null) return <p className="loading">Chargement…</p>;

  if (!incluse) {
    return (
      <p className="notice">
        <span>
          Comprise dans l’offre Entrepreneur. <Link href="/offres">Voir les offres</Link>
        </span>
      </p>
    );
  }

  const [derniere, ...anciennes] = evaluations;
  const bouton = (libelle: string) => (
    <button className="primary" type="button" onClick={onDemander} disabled={isBusy}>
      {isBusy ? 'Envoi…' : libelle}
    </button>
  );

  return (
    <>
      {!derniere && bouton('Demander une évaluation')}

      {derniere?.status === 'en_preparation' && (
        <p className="loading">En préparation… IGINI rédige le rapport, cela prend environ une minute.</p>
      )}

      {(derniere?.status === 'en_revue' || derniere?.status === 'a_refaire') && (
        <p className="notice">
          <span>En cours de revue par Ignitux. Tu verras le rapport ici dès qu’il sera validé.</span>
        </p>
      )}

      {derniere?.status === 'echec' && (
        <>
          <p className="error">
            L’évaluation n’a pas pu être préparée.{derniere.motifEchec ? ` ${derniere.motifEchec}` : ''}
          </p>
          {bouton('Réessayer')}
        </>
      )}

      {derniere?.status === 'refusee' && (
        <>
          <p>
            <strong>Ignitux n’a pas validé cette évaluation.</strong>
            {derniere.motifRefus ? ` Motif : ${derniere.motifRefus}` : ''}
          </p>
          {bouton('Demander une nouvelle évaluation')}
        </>
      )}

      {derniere?.status === 'validee' && derniere.rapport && (
        <>
          <Rapport evaluation={derniere} rapport={derniere.rapport} />
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <button className="primary" type="button" onClick={() => onTelecharger(derniere.id)}>
              Télécharger le dossier (PDF)
            </button>
            <button type="button" onClick={onDemander} disabled={isBusy}>
              Demander une nouvelle évaluation
            </button>
          </div>
        </>
      )}

      {anciennes.length > 0 && (
        <details style={{ marginTop: '1rem' }}>
          <summary>Évaluations précédentes ({anciennes.length})</summary>
          <ul>
            {anciennes.map((a) => (
              <li key={a.id}>
                {date(a.createdAt)} — {a.verdict ? VERDICT_EVALUATION_LABEL[a.verdict] : libelleStatut(a)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function libelleStatut(e: EvaluationVue): string {
  switch (e.status) {
    case 'refusee':
      return 'non validée';
    case 'echec':
      return 'non préparée';
    default:
      return 'en cours';
  }
}

function Rapport({ evaluation, rapport }: { evaluation: EvaluationVue; rapport: RapportEvaluation }) {
  return (
    <div>
      <p style={{ fontSize: '1.15rem' }}>
        <strong>{VERDICT_EVALUATION_LABEL[rapport.verdict]}</strong>
      </p>
      {evaluation.reviewedAt && (
        <p className="muted">
          Établie le {date(evaluation.reviewedAt)} à partir des données du projet à cette date.
        </p>
      )}
      {evaluation.noteIgnitux && (
        <blockquote>
          {evaluation.noteIgnitux} <span className="muted">— Ignitux</span>
        </blockquote>
      )}

      <h3>Résumé</h3>
      <p>{rapport.resume}</p>
      <p>
        <strong>Montant recherché.</strong>{' '}
        {rapport.montantRecherche.montantEuros === null
          ? 'Non renseigné.'
          : `${new Intl.NumberFormat('fr-FR').format(rapport.montantRecherche.montantEuros)} € (source : ${rapport.montantRecherche.source})`}
      </p>
      <p>
        <strong>Usage des fonds.</strong> {rapport.usageDesFonds}
      </p>

      <h3>Ce qu’Ignitux sait de ton projet</h3>
      <ul>
        {rapport.audit.connu.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>

      <h3>Ce qui manque</h3>
      {rapport.audit.manques.length === 0 ? (
        <p className="muted">Rien de manquant relevé.</p>
      ) : (
        <ul>
          {rapport.audit.manques.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}

      <h3>Faisabilité</h3>
      <p>
        <strong>Marché.</strong> {rapport.faisabilite.marche}
      </p>
      <p>
        <strong>Modèle économique.</strong> {rapport.faisabilite.modeleEconomique}
      </p>
      <p>
        <strong>Capacité.</strong> {rapport.faisabilite.capacite}
      </p>

      <h3>Dossier</h3>
      <ul>
        {rapport.dossier.map((p, i) => (
          <li key={i}>
            {p.etat === 'prete' ? '✅' : '❌'} {p.piece}
          </li>
        ))}
      </ul>

      <h3>Risques</h3>
      <ul>
        {rapport.risques.map((r, i) => (
          <li key={i}>
            <strong>{r.risque}</strong> ({GRAVITE[r.gravite]}) — {r.reduction}
          </li>
        ))}
      </ul>

      <h3>Pistes de financement</h3>
      <p className="muted">À titre d’information, sans recommandation personnalisée.</p>
      <ul>
        {rapport.pistes.map((p, i) => (
          <li key={i}>
            <strong>{p.type}</strong> — {p.pourquoi}
          </li>
        ))}
      </ul>

      <h3>Prochaines étapes</h3>
      <ol>
        {rapport.prochainesEtapes.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ol>
    </div>
  );
}
