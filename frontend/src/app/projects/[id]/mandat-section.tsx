'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Mandate } from '@/lib/api';

/**
 * MANDAT — n'est pas un résultat de générateur IGINI, et vit donc à part
 * de `engine-sections.tsx` : c'est une autorisation que la personne donne,
 * pas une recommandation qu'IGINI produit.
 */
export function MandatSection({ token, projectId }: { token: string; projectId: string }) {
  const [identiteValidee, setIdentiteValidee] = useState(false);
  const [mandat, setMandat] = useState<Mandate | null>(null);
  const [nomComplet, setNomComplet] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const charger = useCallback(async () => {
    setIsLoading(true);
    try {
      const [verifications, mandats] = await Promise.all([
        api.getMesVerifications(token),
        api.getMesMandats(token),
      ]);
      setIdentiteValidee(verifications.some((v) => v.status === 'validee'));
      setMandat(mandats.find((m) => m.projectId === projectId) ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger le mandat.');
    } finally {
      setIsLoading(false);
    }
  }, [token, projectId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const creerEtSigner = async () => {
    if (!nomComplet.trim()) return;
    try {
      const cree = await api.creerMandat(token, projectId, 'depot_creation_entreprise');
      const signe = await api.signerMandat(token, cree.id, nomComplet);
      setMandat(signe);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de signer le mandat.');
    }
  };

  const revoquer = async () => {
    if (!mandat) return;
    try {
      const revoque = await api.revoquerMandat(token, mandat.id);
      setMandat(revoque);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de révoquer le mandat.');
    }
  };

  if (isLoading) return null;

  return (
    <div className="card">
      <h2>Mandat</h2>
      {error && <p className="error">{error}</p>}

      {!identiteValidee && (
        <p className="muted">
          Il faut d&apos;abord{' '}
          <Link href="/identite">vérifier ton identité</Link> avant de pouvoir signer un mandat
          pour ce projet.
        </p>
      )}

      {identiteValidee && !mandat && (
        <>
          <p>
            Ce mandat autorise Ignitux à préparer et déposer les démarches de création de cette
            entreprise en ton nom.
          </p>
          <label>
            Nom complet
            <input
              aria-label="Nom complet"
              value={nomComplet}
              onChange={(e) => setNomComplet(e.target.value)}
            />
          </label>
          <button className="primary" type="button" onClick={creerEtSigner} disabled={!nomComplet.trim()}>
            Signer
          </button>
        </>
      )}

      {mandat && mandat.status === 'active' && (
        <>
          <p className="muted">
            Signé par {mandat.signedFullName} le {new Date(mandat.signedAt).toLocaleDateString('fr-FR')}.
          </p>
          <button type="button" onClick={revoquer}>
            Révoquer ce mandat
          </button>
        </>
      )}

      {mandat && mandat.status === 'revoquee' && <p className="muted">Ce mandat a été révoqué.</p>}
    </div>
  );
}
