'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Mandate } from '@/lib/api';

/**
 * MANDAT — n'est pas un résultat de générateur IGINI, et vit donc à part
 * de `engine-sections.tsx` : c'est une autorisation que la personne donne,
 * pas une recommandation qu'IGINI produit.
 *
 * Signature électronique simple (spec) : la personne relit le texte figé
 * du mandat — celui-là même que le serveur enregistrera —, coche une case
 * de consentement, puis retape son nom complet. Le bouton « Signer » reste
 * désactivé tant que les deux ne sont pas faits.
 */
export function MandatSection({ token, projectId }: { token: string; projectId: string }) {
  const [identiteValidee, setIdentiteValidee] = useState(false);
  /** Le mandat en cours pour ce projet (actif, signé ou non) — jamais un mandat révoqué. */
  const [mandat, setMandat] = useState<Mandate | null>(null);
  /** Un mandat antérieur a été révoqué : on le dit en une ligne, sans bloquer une nouvelle signature. */
  const [revocationAnterieure, setRevocationAnterieure] = useState(false);
  const [texteMandat, setTexteMandat] = useState<string | null>(null);
  const [nomComplet, setNomComplet] = useState('');
  const [accepte, setAccepte] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const charger = useCallback(async () => {
    setIsLoading(true);
    try {
      const [verifications, mandats, { texte }] = await Promise.all([
        api.getMesVerifications(token),
        api.getMesMandats(token),
        api.getTexteMandat(token),
      ]);
      setIdentiteValidee(verifications.some((v) => v.status === 'validee'));
      // Un mandat révoqué ne bloque pas une nouvelle signature (le serveur
      // n'impose aucune unicité par projet) : le mandat « en cours » est le
      // plus récent qui n'est pas révoqué. La liste arrive déjà du plus
      // récent au plus ancien (listerMesMandats).
      const duProjet = mandats.filter((m) => m.project_id === projectId);
      setMandat(duProjet.find((m) => m.status !== 'revoquee') ?? null);
      setRevocationAnterieure(duProjet.some((m) => m.status === 'revoquee'));
      setTexteMandat(texte);
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
  const mandatSigne = mandat !== null && mandat.signed_at !== null;
  const peutSigner = identiteValidee && !mandatSigne && texteMandat !== null;

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
    if (!nomComplet.trim() || !accepte) return;
    setIsSubmitting(true);
    setError(null);
    try {
      let cible = mandat;
      if (!cible) {
        cible = await api.creerMandat(token, projectId, 'depot_creation_entreprise');
        setMandat(cible);
      }
      const signe = await api.signerMandat(token, cible.id, nomComplet, true);
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
      await api.revoquerMandat(token, mandat.id);
      // Le mandat révoqué cesse d'être « en cours » : le formulaire de
      // signature réapparaît, vierge, pour qui voudrait en donner un nouveau.
      setMandat(null);
      setRevocationAnterieure(true);
      setNomComplet('');
      setAccepte(false);
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

      {revocationAnterieure && !mandatSigne && (
        <p className="muted">Un mandat précédent pour ce projet a été révoqué.</p>
      )}

      {peutSigner && (
        <>
          <p>
            Lis le texte ci-dessous : c&apos;est exactement celui qui sera conservé avec ta
            signature.
          </p>
          <div className="texte-mandat">{texteMandat}</div>
          <div>
            <input
              id="mandat-consentement"
              type="checkbox"
              checked={accepte}
              onChange={(e) => setAccepte(e.target.checked)}
            />{' '}
            <label htmlFor="mandat-consentement">
              J’ai lu ce mandat et j’autorise Ignitux à agir en mon nom pour ce projet, dans ces
              termes.
            </label>
          </div>
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
            disabled={!nomComplet.trim() || !accepte || isSubmitting}
          >
            {isSubmitting ? 'Signature…' : 'Signer'}
          </button>
        </>
      )}

      {mandat && mandatSigne && mandat.signed_at && (
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
    </div>
  );
}
