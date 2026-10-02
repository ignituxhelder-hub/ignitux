'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Brand } from '@/components/ignitux-mark';
import { api, ApiError, type VerificationEnAttente } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DocumentApercu } from './document-apercu';

const LIBELLES_DOCUMENT: Record<string, string> = {
  carte_identite: "Carte d'identité",
  passeport: 'Passeport',
  titre_sejour: 'Titre de séjour',
};

/**
 * Les dates extraites sont des dates calendaires (`@db.Date`), sérialisées à
 * minuit UTC : les formater dans le fuseau local décalerait d'un jour à
 * l'ouest de Greenwich.
 */
function formaterDate(iso: string | null): string {
  if (!iso) return 'non lue';
  return new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'UTC' });
}

/**
 * REVUE — la décision humaine qui rend une identité vérifiée.
 *
 * Réservée à `administrateur` côté serveur (RoleGuard + @RequireRole) : un
 * autre rôle reçoit un 403, affiché ici tel quel plutôt que comme une erreur
 * générique.
 *
 * La spec en fait « le seul vrai rempart contre la fraude en v1 » : chaque
 * dossier montre donc la pièce elle-même, ce que la MRZ en a extrait, qui
 * l'a déposée, et — impossibles à manquer — les signaux automatiques. La
 * file arrive déjà triée du serveur (signalés d'abord, puis du plus ancien
 * au plus récent) ; l'écran respecte cet ordre.
 */
export default function RevuePage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [enAttente, setEnAttente] = useState<VerificationEnAttente[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const charger = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      setEnAttente(await api.getVerificationsEnAttente(token));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger la file de revue.');
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

  const trancher = async (id: string, decision: 'validee' | 'rejetee', motif?: string) => {
    if (!token) return;
    try {
      await api.revoirVerification(token, id, decision, motif);
      await charger();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible d’enregistrer la décision.');
    }
  };

  if (!isReady || !token) return null;

  return (
    <main className="page">
      <div className="top-bar">
        <Brand />
        <Link href="/projects" className="muted">
          ← Retour aux projets
        </Link>
      </div>

      <h1>Revue des vérifications d&apos;identité</h1>

      {error && <p className="error">{error}</p>}
      {isLoading && <p className="loading">Chargement…</p>}
      {!isLoading && enAttente.length === 0 && !error && (
        <p className="muted">Aucune vérification en attente.</p>
      )}

      {enAttente.map((v) => (
        <div key={v.id} className="card" data-testid={`verification-${v.id}`}>
          <strong>{LIBELLES_DOCUMENT[v.document_type] ?? v.document_type}</strong>
          <p>
            Déposée par {v.owner.display_name ?? '(nom de compte non renseigné)'} —{' '}
            <span className="muted">{v.owner.email}</span>
          </p>
          <p className="muted">Soumise le {new Date(v.created_at).toLocaleString('fr-FR')}</p>

          <Signaux verification={v} />

          <dl className="champs-extraits">
            <dt>Numéro de document</dt>
            <dd>{v.extracted_document_number ?? 'non lu'}</dd>
            <dt>Date de naissance</dt>
            <dd>{formaterDate(v.extracted_birth_date)}</dd>
            <dt>Date d&apos;expiration</dt>
            <dd>{formaterDate(v.extracted_expiry_date)}</dd>
          </dl>
          {v.mrz_checksum_valid === null && (
            <p className="muted">
              Aucune MRZ lue : le numéro n&apos;a pas pu être contrôlé automatiquement, à vérifier
              à l&apos;œil sur la pièce.
            </p>
          )}

          <div className="apercus-document">
            <DocumentApercu token={token} verificationId={v.id} face="front" libelle="Recto de la pièce" />
            {v.a_un_verso && (
              <DocumentApercu token={token} verificationId={v.id} face="back" libelle="Verso de la pièce" />
            )}
          </div>

          <button className="primary" type="button" onClick={() => trancher(v.id, 'validee')}>
            Valider
          </button>
          <button
            type="button"
            onClick={() => {
              const motif = window.prompt('Motif du rejet :');
              if (motif) void trancher(v.id, 'rejetee', motif);
            }}
          >
            Rejeter
          </button>
        </div>
      ))}
    </main>
  );
}

/**
 * Les signaux de fraude automatiques — tout l'intérêt de la page. Rendus
 * comme une alerte (rôle ARIA `alert`, couleur et icône de danger), jamais
 * comme une ligne de texte parmi d'autres. `null` n'est pas un signal :
 * seul un `false` explicite en est un.
 */
function Signaux({ verification: v }: { verification: VerificationEnAttente }) {
  const signaux: string[] = [];
  if (v.mrz_checksum_valid === false) {
    signaux.push(
      'Chiffre de contrôle MRZ invalide : le numéro ou les dates ont pu être altérés (ou mal lus).',
    );
  }
  if (v.name_matches_account === false) {
    signaux.push("Le nom du compte n'apparaît pas sur la pièce : vérifier qu'il s'agit bien de la même personne.");
  }
  if (signaux.length === 0) return null;

  return (
    <div className="alerte-revue" role="alert" data-testid={`signaux-${v.id}`}>
      <strong>
        <span aria-hidden="true">⚠ </span>Dossier signalé
      </strong>
      <ul>
        {signaux.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  );
}
