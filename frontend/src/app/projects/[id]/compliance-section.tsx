'use client';

import { useEffect, useRef, useState } from 'react';
import {
  api,
  ApiError,
  SECTEURS_PROJET,
  type ComplianceAiRun,
  type ComplianceAiState,
  type ComplianceGroupe,
  type ComplianceRequirement,
} from '@/lib/api';
import { executerEnSerie } from '@/lib/executer-en-serie';
import { ResultatIa } from './resultat-ia';

/**
 * Le code du référentiel vers un nom lisible.
 *
 * Court parce que la couverture l'est : un code inconnu s'affiche tel quel
 * plutôt que d'être traduit au hasard — mieux vaut « BE » qu'un pays faux.
 */
const NOMS_DE_PAYS: Record<string, string> = { FR: 'France' };

/** La ligne renvoyée par run/validate/refuse, réduite à l'état que la liste affiche. */
function etatIa(run: ComplianceAiRun): ComplianceAiState {
  return {
    status: run.status,
    result_kind: run.result_kind,
    result: run.result,
    refusal_reason: run.refusal_reason,
  };
}

interface ComplianceSectionProps {
  token: string | null;
  projectId: string;
  readOnly?: boolean;
}

/**
 * LA QUESTION DU SECTEUR, POSÉE ICI ET PAS AILLEURS.
 *
 * Pas à l'inscription, pas à la création du projet : ici, au moment où la
 * réponse change quelque chose de visible. Et elle dit ce qu'elle change,
 * parce qu'un champ qui demande sans expliquer transforme un produit en
 * formulaire.
 *
 * Le libellé insiste sur « ce projet » : le profil pose une question qui
 * lui ressemble — « dans quels secteurs as-tu déjà travaillé » — et la
 * confusion entre les deux ferait trier des obligations légales sur un
 * passé professionnel.
 */
function DemanderLeSecteur({
  onChoisir,
  enCours,
}: {
  onChoisir: (secteur: string) => void;
  enCours: boolean;
}) {
  return (
    <div className="field" style={{ marginBottom: '1rem' }}>
      <label htmlFor="secteur-projet">Dans quel secteur ce projet exerce-t-il ?</label>
      <select
        id="secteur-projet"
        defaultValue=""
        disabled={enCours}
        onChange={(e) => {
          if (e.target.value) onChoisir(e.target.value);
        }}
      >
        <option value="">— sans réponse —</option>
        {SECTEURS_PROJET.map((secteur) => (
          <option key={secteur} value={secteur}>
            {secteur}
          </option>
        ))}
      </select>
      <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
        Pour remonter les démarches qui visent ton activité. Rien ne sera masqué : la liste
        reste entière, elle change seulement d’ordre. Ce n’est pas la même question que ton
        expérience passée, dans ton profil.
      </p>
    </div>
  );
}

export function ComplianceSection({ token, projectId, readOnly = false }: ComplianceSectionProps) {
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const [pays, setPays] = useState<{ code: string; declare: boolean } | null>(null);
  const [secteur, setSecteur] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<ComplianceRequirement[]>([]);
  const [groupes, setGroupes] = useState<ComplianceGroupe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [secteurEnCours, setSecteurEnCours] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<{ courant: number; total: number } | null>(null);
  const [limite, setLimite] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Garde de ré-entrée : un state ne bouge qu'au rendu suivant, un double clic passerait.
  const enCours = useRef(false);
  // Faux dès que l'écran est quitté : un lot qui coûte des appels IA doit s'arrêter.
  const actif = useRef(true);
  useEffect(() => {
    actif.current = true;
    return () => {
      actif.current = false;
    };
  }, []);

  function load() {
    if (!token) return;
    setIsLoading(true);
    api
      .getProjectCompliance(token, projectId)
      .then((checklist) => {
        setDisclaimer(checklist?.disclaimer ?? null);
        setPays(
          checklist?.country
            ? { code: checklist.country, declare: checklist.countryDeclared === true }
            : null,
        );
        setSecteur(checklist?.sector ?? null);
        setRequirements(Array.isArray(checklist?.requirements) ? checklist.requirements : []);
        setGroupes(Array.isArray(checklist?.groupes) ? checklist.groupes : []);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Impossible de charger la conformité.'))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, projectId]);

  async function choisirSecteur(valeur: string) {
    if (!token) return;
    setError(null);
    setSecteurEnCours(true);
    try {
      await api.updateProjectSector(token, projectId, valeur);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible d’enregistrer le secteur.');
    } finally {
      setSecteurEnCours(false);
    }
  }

  async function toggle(requirement: ComplianceRequirement) {
    if (!token || readOnly) return;
    setError(null);
    setPendingId(requirement.id);
    try {
      if (requirement.completed) {
        await api.unmarkComplianceChecked(token, projectId, requirement.id);
      } else {
        await api.markComplianceChecked(token, projectId, requirement.id);
      }
      setRequirements((prev) =>
        prev.map((r) => (r.id === requirement.id ? { ...r, completed: !r.completed } : r)),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de mettre à jour cette exigence.');
    } finally {
      setPendingId(null);
    }
  }

  function remplacerIa(requirementId: string, ai: ComplianceAiState, completed?: boolean) {
    setRequirements((prev) =>
      prev.map((r) =>
        r.id === requirementId ? { ...r, ai, completed: completed ?? r.completed } : r,
      ),
    );
  }

  function retirerDeLaSelection(requirementId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(requirementId);
      return next;
    });
  }

  function basculer(requirementId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(requirementId)) next.delete(requirementId);
      else next.add(requirementId);
      return next;
    });
  }

  async function lancerLot(ids: string[]) {
    if (!token || ids.length === 0 || enCours.current) return;
    enCours.current = true;
    setError(null);
    setLimite(null);
    setIsRunning(true);
    setProgress({ courant: 0, total: ids.length });
    let rang = 0;
    try {
      const bilan = await executerEnSerie(
        ids,
        (id) => api.runCompliance(token, projectId, id),
        (info) => {
          if (!actif.current) return;
          if (info.etat === 'en_cours') {
            rang += 1;
            setProgress({ courant: rang, total: ids.length });
          } else if (info.etat === 'ok' && info.resultat) {
            remplacerIa(info.id, etatIa(info.resultat));
            retirerDeLaSelection(info.id);
          } else if (info.etat === 'echec') {
            remplacerIa(info.id, { status: 'echec', result_kind: null, result: null, refusal_reason: null });
            retirerDeLaSelection(info.id);
          } else if (info.etat === 'arret' && info.message) {
            setError(info.message);
          }
        },
        () => !actif.current,
      );
      if (!actif.current) return;
      if (bilan.arretePourLimite) {
        const n = bilan.restants.length;
        setLimite(`Limite atteinte : ${n} élément${n > 1 ? 's' : ''} non traité${n > 1 ? 's' : ''}`);
      }
    } finally {
      enCours.current = false;
      if (actif.current) {
        setIsRunning(false);
        setProgress(null);
      }
    }
  }

  async function valider(requirementId: string) {
    if (!token || readOnly) return;
    setError(null);
    setBusyId(requirementId);
    try {
      const run = await api.validateCompliance(token, projectId, requirementId);
      // Valider côté serveur coche l'exigence : on le reflète sans recharger.
      if (actif.current) remplacerIa(requirementId, etatIa(run), true);
    } catch (err) {
      if (actif.current) setError(err instanceof ApiError ? err.message : 'Impossible de valider ce résultat.');
    } finally {
      if (actif.current) setBusyId(null);
    }
  }

  async function refuser(requirementId: string, motif?: string) {
    if (!token || readOnly) return;
    setError(null);
    setBusyId(requirementId);
    try {
      const run = await api.refuseCompliance(token, projectId, requirementId, motif);
      if (actif.current) remplacerIa(requirementId, etatIa(run));
    } catch (err) {
      if (actif.current) setError(err instanceof ApiError ? err.message : 'Impossible de refuser ce résultat.');
    } finally {
      if (actif.current) setBusyId(null);
    }
  }

  // Une démarche déjà cochée, ou dont le résultat attend/est validé, n'est pas relancée en lot.
  const lancable = (r: ComplianceRequirement) =>
    !r.completed && r.ai?.status !== 'a_valider' && r.ai?.status !== 'valide';
  const coches = requirements.filter((r) => selected.has(r.id) && lancable(r)).map((r) => r.id);

  const nomDuPays = pays ? (NOMS_DE_PAYS[pays.code] ?? pays.code) : null;
  const parId = new Map(requirements.map((r) => [r.id, r]));

  /**
   * Les sections à rendre.
   *
   * Sans groupes — serveur plus ancien, ou secteur inconnu — on retombe sur
   * le regroupement par catégorie d'origine. Dans les deux cas la liste est
   * entière : c'est l'ordre qui change, jamais le contenu.
   */
  const sections: Array<{ cle: string; titre: string; precision: string | null; items: ComplianceRequirement[] }> =
    groupes.length > 0
      ? groupes.map((g) => ({
          cle: g.cle,
          titre: g.titre,
          precision: g.precision,
          items: g.requirementIds
            .map((id) => parId.get(id))
            .filter((r): r is ComplianceRequirement => r !== undefined),
        }))
      : Object.entries(
          requirements.reduce<Record<string, ComplianceRequirement[]>>((acc, req) => {
            (acc[req.category] ??= []).push(req);
            return acc;
          }, {}),
        ).map(([category, items]) => ({ cle: category, titre: category, precision: null, items }));

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      {/* Le pays vit sous le titre, pas dedans : il arrive avec la réponse
          du serveur, et un titre qui change après le chargement clignote. */}
      <h2 style={{ marginTop: 0 }}>Conformité</h2>
      {pays &&
        (pays.declare ? (
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Démarches pour : {nomDuPays}.
          </p>
        ) : (
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Tu n’as pas indiqué où ton activité se déroulera : ces démarches sont celles de la
            France, par défaut. Renseigne le pays d’activité dans ton profil pour que cette
            liste soit la bonne.
          </p>
        ))}
      {disclaimer && (
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          ⚠️ {disclaimer}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {limite && <p className="error">{limite}</p>}
      {!isLoading && !readOnly && requirements.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <button type="button" disabled={coches.length === 0 || isRunning} onClick={() => lancerLot(coches)}>
            Faire faire par IGINI
          </button>{' '}
          {isRunning && progress ? (
            <span className="muted">
              {progress.courant} / {progress.total}
            </span>
          ) : (
            coches.length > 0 && (
              <span className="muted">
                {`${coches.length} élément${coches.length > 1 ? 's' : ''}, ~${coches.length} appel${coches.length > 1 ? 's' : ''} IA`}
              </span>
            )
          )}
          <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
            IGINI prépare, il ne dépose rien à ta place.
          </p>
        </div>
      )}
      {!isLoading && !readOnly && secteur === null && requirements.length > 0 && (
        <DemanderLeSecteur onChoisir={choisirSecteur} enCours={secteurEnCours} />
      )}
      {isLoading && <p className="loading">Chargement…</p>}
      {!isLoading &&
        sections.map((section) => (
          <div key={section.cle} style={{ marginBottom: '1rem' }}>
            <strong>{section.titre}</strong>
            {section.precision && (
              <p className="muted" style={{ margin: '0.15rem 0 0', fontSize: '0.8rem' }}>
                {section.precision}
              </p>
            )}
            <ul style={{ listStyle: 'none', margin: '0.5rem 0 0', padding: 0 }}>
              {section.items.map((requirement) => (
                <li
                  key={requirement.id}
                  className="project-item"
                  style={{ cursor: 'default', marginBottom: '0.5rem' }}
                >
                  <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', cursor: readOnly ? 'default' : 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={requirement.completed}
                      disabled={readOnly || pendingId === requirement.id}
                      onChange={() => toggle(requirement)}
                      aria-label={requirement.title}
                    />
                    <span>
                      <span style={{ fontWeight: 600 }}>{requirement.title}</span>
                      <p className="muted" style={{ margin: '0.25rem 0' }}>{requirement.description}</p>
                      <a
                        href={requirement.source_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="muted"
                        style={{ fontSize: '0.8rem' }}
                      >
                        Source : {requirement.source_name}
                      </a>
                    </span>
                  </label>
                  {!readOnly && lancable(requirement) && (
                    <label
                      className="muted"
                      style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem', fontSize: '0.85rem' }}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Faire faire : ${requirement.title}`}
                        checked={selected.has(requirement.id)}
                        disabled={isRunning}
                        onChange={() => basculer(requirement.id)}
                      />
                      <span>Faire préparer par IGINI</span>
                    </label>
                  )}
                  {!readOnly &&
                    requirement.ai?.status === 'a_valider' &&
                    requirement.ai.result &&
                    requirement.ai.result_kind && (
                      <ResultatIa
                        kind={requirement.ai.result_kind}
                        contenu={requirement.ai.result}
                        libelleValider="J'ai fait / J'ai déposé"
                        disabled={busyId === requirement.id}
                        onValider={() => valider(requirement.id)}
                        onRefuser={(motif) => refuser(requirement.id, motif)}
                      />
                    )}
                  {!readOnly && requirement.ai?.status === 'echec' && (
                    <p style={{ margin: '0.5rem 0 0' }}>
                      IGINI n&apos;a pas pu préparer cette démarche{' '}
                      <button
                        className="secondary"
                        type="button"
                        disabled={isRunning}
                        onClick={() => lancerLot([requirement.id])}
                      >
                        Réessayer
                      </button>
                    </p>
                  )}
                  {requirement.ai?.status === 'refuse' && (
                    <p className="muted" style={{ margin: '0.5rem 0 0' }}>
                      Refusé{requirement.ai.refusal_reason ? ` : ${requirement.ai.refusal_reason}` : ''}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}
