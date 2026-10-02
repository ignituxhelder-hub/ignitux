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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const charger = useCallback(async () => {
    setIsLoading(true);
    try {
      const [verifications, mandats] = await Promise.all([
        api.getMesVerifications(token),
        api.getMesMandats(token),
      ]);
      setIdentiteValidee(verifications.some((v) => v.status === 'validee'));
      setMandat(mandats.find((m) => m.project_id === projectId) ?? null);
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

  // Un mandat existe en base dès sa création, avant toute signature : le
  // champ qui distingue « signé » de « pas encore signé » est `signed_at`,
  // pas `status` (qui ne distingue qu'actif de révoqué — voir Task 6).
  const mandatSigne = mandat !== null && mandat.status === 'active' && mandat.signed_at !== null;
  const mandatRevoque = mandat !== null && mandat.status === 'revoquee';
  const peutSigner = identiteValidee && !mandatSigne && !mandatRevoque;

  /**
   * Crée le mandat si besoin, puis le signe.
   *
   * Si un mandat non signé existe déjà pour ce projet (créé lors d'un essai
   * précédent dont la signature a échoué), on le réutilise au lieu d'en
   * recréer un — il n'y a pas de contrainte d'unicité côté serveur qui
   * empêcherait d'accumuler des mandats non signés à chaque nouvel essai.
   *
   * Le mandat créé est mis en état tout de suite, avant même l'appel à
   * `signerMandat` : si la signature échoue ensuite, l'écran garde trace du
   * mandat non signé (via `mandatSigne`/`peutSigner` ci-dessus) plutôt que de
   * perdre cette information et de tout retenter depuis zéro au prochain clic.
   */
  const signer = async () => {
    if (!nomComplet.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      let cible = mandat;
      if (!cible) {
        cible = await api.creerMandat(token, projectId, 'depot_creation_entreprise');
        setMandat(cible);
      }
      const signe = await api.signerMandat(token, cible.id, nomComplet);
      setMandat(signe);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de signer le mandat.');
    } finally {
      setIsSubmitting(false);
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

      {peutSigner && (
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
          <button
            className="primary"
            type="button"
            onClick={signer}
            disabled={!nomComplet.trim() || isSubmitting}
          >
            {isSubmitting ? 'Signature…' : 'Signer'}
          </button>
        </>
      )}

      {mandat && mandat.status === 'active' && mandat.signed_at && (
        <>
          <p className="muted">
            Signé par {mandat.signed_full_name} le{' '}
            {new Date(mandat.signed_at).toLocaleDateString('fr-FR')}.
          </p>
          <button type="button" onClick={revoquer}>
            Révoquer ce mandat
          </button>
        </>
      )}

      {mandatRevoque && <p className="muted">Ce mandat a été révoqué.</p>}
    </div>
  );
}
