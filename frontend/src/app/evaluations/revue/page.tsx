'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Brand } from '@/components/ignitux-mark';
import {
  api,
  ApiError,
  VERDICT_EVALUATION_LABEL,
  type EvaluationDetailRevue,
  type EvaluationEnRevue,
  type RapportEvaluation,
  type SectionEvaluation,
  type VerdictEvaluation,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { listeEnTexte, texteEnListe, type SectionListe } from './edition';

/** L'ordre des sections, celui du rapport : c'est aussi l'ordre des corrections envoyées. */
const ORDRE: SectionEvaluation[] = [
  'verdict',
  'resume',
  'montantRecherche',
  'usageDesFonds',
  'audit',
  'faisabilite',
  'dossier',
  'risques',
  'pistes',
  'prochainesEtapes',
];

interface Formulaire {
  verdict: VerdictEvaluation;
  resume: string;
  montant: string;
  montantSource: string;
  usageDesFonds: string;
  connu: string;
  manques: string;
  marche: string;
  modeleEconomique: string;
  capacite: string;
  dossier: string;
  risques: string;
  pistes: string;
  prochainesEtapes: string;
  note: string;
}

function formulaireDepuis(r: RapportEvaluation, note: string | null): Formulaire {
  return {
    verdict: r.verdict,
    resume: r.resume,
    montant: r.montantRecherche.montantEuros === null ? '' : String(r.montantRecherche.montantEuros),
    montantSource: r.montantRecherche.source,
    usageDesFonds: r.usageDesFonds,
    connu: listeEnTexte('connu', r.audit.connu),
    manques: listeEnTexte('manques', r.audit.manques),
    marche: r.faisabilite.marche,
    modeleEconomique: r.faisabilite.modeleEconomique,
    capacite: r.faisabilite.capacite,
    dossier: listeEnTexte('dossier', r.dossier),
    risques: listeEnTexte('risques', r.risques),
    pistes: listeEnTexte('pistes', r.pistes),
    prochainesEtapes: listeEnTexte('prochainesEtapes', r.prochainesEtapes),
    note: note ?? '',
  };
}

/** Les champs du formulaire qui composent chaque section du rapport. */
const CHAMPS_DE_SECTION: Record<SectionEvaluation, (keyof Formulaire)[]> = {
  verdict: ['verdict'],
  resume: ['resume'],
  montantRecherche: ['montant', 'montantSource'],
  usageDesFonds: ['usageDesFonds'],
  audit: ['connu', 'manques'],
  faisabilite: ['marche', 'modeleEconomique', 'capacite'],
  dossier: ['dossier'],
  risques: ['risques'],
  pistes: ['pistes'],
  prochainesEtapes: ['prochainesEtapes'],
};

function liste(section: SectionListe, texte: string): unknown[] {
  const lu = texteEnListe(section, texte);
  if ('erreur' in lu) throw new Error(lu.erreur);
  return lu.valeur;
}

/** La valeur d'une section telle que le formulaire la décrit ; lève sur une saisie invalide. */
function valeurSection(section: SectionEvaluation, f: Formulaire): unknown {
  switch (section) {
    case 'montantRecherche': {
      const texte = f.montant.replace(/\s/g, '').replace(',', '.');
      const montant = texte === '' ? null : Number(texte);
      if (montant !== null && !Number.isFinite(montant)) {
        throw new Error('Le montant recherché doit être un nombre, ou vide.');
      }
      return { montantEuros: montant, source: f.montantSource };
    }
    case 'audit':
      return { connu: liste('connu', f.connu), manques: liste('manques', f.manques) };
    case 'faisabilite':
      return { marche: f.marche, modeleEconomique: f.modeleEconomique, capacite: f.capacite };
    case 'dossier':
    case 'risques':
    case 'pistes':
    case 'prochainesEtapes':
      return liste(section, f[section]);
    default:
      return f[section];
  }
}

/**
 * Les sections que l'administrateur a réellement modifiées : on compare le
 * TEXTE saisi au texte de départ, pas la valeur relue. Une section non
 * touchée n'est ni relue, ni renvoyée, ni tracée comme une correction
 * humaine — même si le texte d'IGINI contient un « | » ou un retour à la ligne.
 */
function changementsDepuis(
  f: Formulaire,
  depart: Formulaire,
): { section: SectionEvaluation; valeur: unknown }[] | { erreur: string } {
  try {
    return ORDRE.filter((section) => CHAMPS_DE_SECTION[section].some((cle) => f[cle] !== depart[cle])).map(
      (section) => ({ section, valeur: valeurSection(section, f) }),
    );
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Saisie invalide.' };
  }
}

function date(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
}

/**
 * LA REVUE DES ÉVALUATIONS DE FINANCEMENT — réservée aux administrateurs.
 *
 * Le serveur vérifie le rôle sur chaque route (RoleGuard) : cette page ne
 * fait qu'afficher. Rien n'atteint l'entrepreneur sans « Valider et envoyer ».
 */
export default function RevueEvaluationsPage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [file, setFile] = useState<EvaluationEnRevue[]>([]);
  const [detail, setDetail] = useState<EvaluationDetailRevue | null>(null);
  const [form, setForm] = useState<Formulaire | null>(null);
  const [consigne, setConsigne] = useState('');
  const [motif, setMotif] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [interdit, setInterdit] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  const charger = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      setFile(await api.getEvaluationsEnRevue(token));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setInterdit(true);
      else setError(err instanceof ApiError ? err.message : 'Impossible de charger la file de revue.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    void charger();
  }, [isReady, token, router, charger]);

  async function ouvrir(id: string) {
    if (!token) return;
    setError(null);
    try {
      const d = await api.getEvaluationRevue(token, id);
      setDetail(d);
      setForm(d.rapport ? formulaireDepuis(d.rapport, d.noteIgnitux) : null);
      setConsigne('');
      setMotif('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible d’ouvrir cette évaluation.');
    }
  }

  async function agir(action: () => Promise<unknown>) {
    setIsBusy(true);
    setError(null);
    try {
      await action();
      setDetail(null);
      setForm(null);
      await charger();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'L’action n’a pas pu être enregistrée.');
    } finally {
      setIsBusy(false);
    }
  }

  async function validerEtEnvoyer() {
    if (!token || !detail || !form || !detail.rapport) return;
    const changements = changementsDepuis(form, formulaireDepuis(detail.rapport, detail.noteIgnitux));
    if ('erreur' in changements) {
      setError(changements.erreur);
      return;
    }
    const note = form.note.trim() || null;
    const noteChangee = note !== (detail.noteIgnitux ?? null);

    await agir(async () => {
      if (changements.length > 0 || noteChangee) {
        await api.modifierEvaluation(token, detail.id, changements, noteChangee ? note : undefined);
      }
      await api.validerEvaluation(token, detail.id);
    });
  }

  if (!isReady || !token) return null;

  const champ = (cle: keyof Formulaire, libelle: string, lignes = 3, aide?: string): ReactNode =>
    form && (
      <label htmlFor={`revue-${cle}`} style={{ display: 'block', marginBottom: '0.75rem' }}>
        <strong>{libelle}</strong>
        {aide && <span className="muted"> — {aide}</span>}
        <textarea
          id={`revue-${cle}`}
          rows={lignes}
          value={form[cle]}
          onChange={(e) => setForm({ ...form, [cle]: e.target.value })}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
    );

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <Brand />
        <Link href="/administration">Administration</Link>
      </div>
      <h1>Évaluations de financement à revoir</h1>

      {interdit && <p className="error">Réservé aux administrateurs d’Ignitux.</p>}
      {error && <p className="error">{error}</p>}
      {isLoading && <p className="loading">Chargement…</p>}

      {!interdit && !isLoading && file.length === 0 && <p className="muted">Aucune évaluation en attente.</p>}

      {!detail && file.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {file.map((e) => (
            <li key={e.id} className="card" style={{ marginTop: '0.75rem' }}>
              <strong>{e.projetTitre}</strong> — {e.entrepreneurEmail}
              <br />
              <span className="muted">
                Demandée le {date(e.createdAt)} · verdict proposé :{' '}
                {e.verdict ? VERDICT_EVALUATION_LABEL[e.verdict] : '—'}
              </span>
              <br />
              <button type="button" onClick={() => void ouvrir(e.id)} style={{ marginTop: '0.5rem' }}>
                Ouvrir « {e.projetTitre} »
              </button>
            </li>
          ))}
        </ul>
      )}

      {detail && form && (
        <section className="card">
          <button type="button" onClick={() => setDetail(null)}>
            ← Retour à la file
          </button>
          <h2>
            {detail.projetTitre} <span className="muted">· {detail.entrepreneurEmail}</span>
          </h2>

          <label htmlFor="revue-verdict" style={{ display: 'block', marginBottom: '0.75rem' }}>
            <strong>Verdict</strong>
            <select
              id="revue-verdict"
              value={form.verdict}
              onChange={(e) => setForm({ ...form, verdict: e.target.value as VerdictEvaluation })}
              style={{ display: 'block' }}
            >
              {(Object.keys(VERDICT_EVALUATION_LABEL) as VerdictEvaluation[]).map((v) => (
                <option key={v} value={v}>
                  {VERDICT_EVALUATION_LABEL[v]}
                </option>
              ))}
            </select>
          </label>

          {champ('resume', 'Résumé', 4)}
          {champ('montant', 'Montant recherché (€)', 1, 'vide si non renseigné')}
          {champ('montantSource', 'Source du montant', 1)}
          {champ('usageDesFonds', 'Usage des fonds')}
          {champ('connu', 'Ce qui est connu', 4, 'une ligne par élément, écran seulement')}
          {champ('manques', 'Ce qui manque', 4, 'une ligne par élément, écran seulement')}
          {champ('marche', 'Marché')}
          {champ('modeleEconomique', 'Modèle économique')}
          {champ('capacite', 'Capacité de remboursement ou de rentabilité')}
          {champ('dossier', 'Dossier', 4, 'pièce | prête ou manquante')}
          {champ('risques', 'Risques', 5, 'risque | faible, moyenne ou forte | comment le réduire')}
          {champ('pistes', 'Pistes de financement', 4, 'type | pourquoi')}
          {champ('prochainesEtapes', 'Prochaines étapes', 4, 'une par ligne')}
          {champ('note', 'Note d’Ignitux', 3, 'optionnelle, visible par l’entrepreneur')}

          <button className="primary" type="button" disabled={isBusy} onClick={() => void validerEtEnvoyer()}>
            Valider et envoyer
          </button>

          <hr />
          <label htmlFor="revue-consigne" style={{ display: 'block', marginBottom: '0.5rem' }}>
            <strong>Consigne pour IGINI</strong>
            <textarea
              id="revue-consigne"
              rows={2}
              value={consigne}
              onChange={(e) => setConsigne(e.target.value)}
              style={{ display: 'block', width: '100%' }}
            />
          </label>
          <button
            type="button"
            disabled={isBusy || !consigne.trim()}
            onClick={() => void agir(() => api.refaireEvaluation(token, detail.id, consigne.trim()))}
          >
            Faire refaire
          </button>

          <hr />
          <label htmlFor="revue-motif" style={{ display: 'block', marginBottom: '0.5rem' }}>
            <strong>Motif du refus</strong> <span className="muted">— l’entrepreneur le lira</span>
            <textarea
              id="revue-motif"
              rows={2}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              style={{ display: 'block', width: '100%' }}
            />
          </label>
          <button
            type="button"
            disabled={isBusy || !motif.trim()}
            onClick={() => void agir(() => api.refuserEvaluation(token, detail.id, motif.trim()))}
          >
            Refuser
          </button>

          {detail.traces.length > 0 && (
            <details style={{ marginTop: '1rem' }}>
              <summary>Corrections déjà enregistrées ({detail.traces.length})</summary>
              <ul>
                {detail.traces.map((t) => (
                  <li key={t.id}>
                    {date(t.created_at)} — {t.section}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </main>
  );
}
