'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, type ComplianceRequirement } from '@/lib/api';

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

export function ComplianceSection({ token, projectId, readOnly = false }: ComplianceSectionProps) {
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const [pays, setPays] = useState<{ code: string; declare: boolean } | null>(null);
  const [requirements, setRequirements] = useState<ComplianceRequirement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

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
        setRequirements(Array.isArray(checklist?.requirements) ? checklist.requirements : []);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Impossible de charger la conformité.'))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, projectId]);

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

  const grouped = requirements.reduce<Record<string, ComplianceRequirement[]>>((acc, req) => {
    (acc[req.category] ??= []).push(req);
    return acc;
  }, {});

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
      {isLoading && <p className="loading">Chargement…</p>}
      {!isLoading &&
        Object.entries(grouped).map(([category, items]) => (
          <div key={category} style={{ marginBottom: '1rem' }}>
            <strong>{category}</strong>
            <ul style={{ listStyle: 'none', margin: '0.5rem 0 0', padding: 0 }}>
              {items.map((requirement) => (
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
