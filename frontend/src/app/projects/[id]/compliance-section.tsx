'use client';

import { useEffect, useState } from 'react';
import {
  api,
  ApiError,
  SECTEURS_PROJET,
  type ComplianceGroupe,
  type ComplianceRequirement,
} from '@/lib/api';

/**
 * Le code du référentiel vers un nom lisible.
 *
 * Court parce que la couverture l'est : un code inconnu s'affiche tel quel
 * plutôt que d'être traduit au hasard — mieux vaut « BE » qu'un pays faux.
 */
const NOMS_DE_PAYS: Record<string, string> = { FR: 'France' };

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
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}
